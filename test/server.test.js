'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const server = require('../server/index.js');

const { io } = require(path.join(path.dirname(require.resolve('socket.io')), '..', 'client-dist', 'socket.io.js'));

test('validateChannel trims names and rejects invalid input', () => {
  assert.deepEqual(server.validateChannel({ name: '  Russisch ', language: 'ru' }), { name: 'Russisch', language: 'ru' });
  assert.throws(() => server.validateChannel({ name: ' ', language: 'ru' }));
  assert.throws(() => server.validateChannel({ name: 'x'.repeat(61), language: 'ru' }));
  assert.throws(() => server.validateChannel({ name: 'Test', language: 'xx' }));
  for (const code of ['he', 'hy', 'ka']) assert.ok(server.LANGUAGES.includes(code), code);
  assert.deepEqual(server.validateChannel({ name: 'Հայերեն', language: 'hy' }), { name: 'Հայերեն', language: 'hy' });
});

test('statistics average listeners per day and weekday over live minutes only', () => {
  const stats = { days: {} };
  server.addStatsSample(stats, '2026-11-15', [{ id: 'a', name: 'A', count: 10 }, { id: 'b', name: 'B', count: 2 }]);
  server.addStatsSample(stats, '2026-11-15', [{ id: 'a', name: 'A', count: 20 }]);
  server.addStatsSample(stats, '2026-11-22', [{ id: 'a', name: 'A neu', count: 40 }]);
  server.addStatsSample(stats, '2026-11-16', []);
  assert.equal(stats.days['2026-11-16'], undefined);

  const all = server.summarizeStats(stats, '*', 90, new Date('2026-11-22T12:00:00'));
  assert.deepEqual(all.perDay.map((d) => [d.day, d.avg, d.max, d.minutes]), [['2026-11-15', 16, 20, 2], ['2026-11-22', 40, 40, 1]]);
  const sunday = all.perWeekday[0];
  assert.deepEqual([sunday.avg, sunday.max, sunday.days], [28, 40, 2]);
  assert.equal(all.perWeekday[1].avg, 0);
  assert.deepEqual(all.channels, { a: 'A neu', b: 'B' });

  const a = server.summarizeStats(stats, 'a', 90, new Date('2026-11-22T12:00:00'));
  assert.deepEqual(a.perDay.map((d) => d.avg), [15, 40]);
  assert.equal(server.summarizeStats(stats, '*', 3, new Date('2026-11-22T12:00:00')).perDay.length, 1);
});

test('statistics count whole listeners over minutes with listeners only', () => {
  const stats = { days: {} };
  for (const count of [0, 0, 0, 1, 0, 1, 2]) server.addStatsSample(stats, '2026-11-19', [{ id: 'a', name: 'A', count }]);
  server.addStatsSample(stats, '2026-11-20', [{ id: 'a', name: 'A', count: 0 }]);
  stats.days['2026-11-18'] = { a: { name: 'A', n: 4, sum: 6, max: 3 } };
  stats.days['2026-11-17'] = { a: { name: 'A', n: 60, sum: 10, max: 1 } };
  const { perDay, perWeekday } = server.summarizeStats(stats, 'a', 90, new Date('2026-11-20T12:00:00'));
  assert.deepEqual(perDay.map((d) => [d.day, d.avg, d.max, d.minutes]), [
    ['2026-11-17', 1, 1, 60],
    ['2026-11-18', 2, 3, 4],
    ['2026-11-19', 1, 2, 7],
    ['2026-11-20', 0, 0, 1],
  ]);
  assert.equal(perWeekday[4].avg, 1);
});

test('statistics keep at most 400 days', () => {
  const stats = { days: {} };
  for (let i = 0; i < 405; i++) server.addStatsSample(stats, server.dayKey(new Date(2025, 0, 1 + i)), [{ id: 'a', name: 'A', count: 1 }]);
  assert.equal(Object.keys(stats.days).length, 400);
  assert.equal(Object.keys(stats.days).sort()[0], server.dayKey(new Date(2025, 0, 6)));
});

test('passwords and session tokens are verified', async () => {
  const hash = await server.hashPassword('geheim');
  assert.ok(await server.verifyPassword('geheim', hash));
  assert.ok(!(await server.verifyPassword('falsch', hash)));
  assert.ok(!(await server.verifyPassword(undefined, hash)));
  const auth = { hash, secret: 'secret' };
  const token = server.signToken(auth.secret, Date.now() + 60000);
  assert.ok(server.verifyToken(auth, token));
  assert.ok(!server.verifyToken(auth, server.signToken('other', Date.now() + 60000)));
  assert.ok(!server.verifyToken(auth, server.signToken(auth.secret, Date.now() - 1)));
  assert.ok(!server.verifyToken(auth, `${Date.now() + 60000}.abc`));
  assert.ok(!server.verifyToken(null, token));
});

test('detectIp prefers physical adapters', () => {
  const nic = (address, internal = false) => [{ address, family: 'IPv4', internal }];
  assert.equal(server.detectIp({ lo: nic('127.0.0.1', true), 'vEthernet (WSL)': nic('172.18.0.1'), Ethernet: nic('192.168.1.20') }), '192.168.1.20');
  assert.equal(server.detectIp({ docker0: nic('172.17.0.1') }), '172.17.0.1');
  assert.equal(server.detectIp({ lo: nic('127.0.0.1', true) }), undefined);
});

test('capture devices are parsed from ALSA, DirectShow and AVFoundation output', () => {
  const cards = ' 0 [PCH            ]: HDA-Intel - HDA Intel PCH\n                      HDA Intel PCH at 0xf7f10000 irq 31\n'
    + ' 1 [U192k          ]: USB-Audio - UMC1820\n                      BEHRINGER UMC1820 at usb-0000:00:14.0-2, high speed\n';
  const pcm = '00-00: ALC892 Analog : ALC892 Analog : playback 1 : capture 1\n00-01: ALC892 Digital : ALC892 Digital : playback 1\n'
    + '01-00: USB Audio : USB Audio : playback 1 : capture 1\n';
  const stream = 'Playback:\n  Status: Stop\n    Channels: 10\nCapture:\n  Status: Stop\n    Channels: 8\n';
  assert.deepEqual(server.parseAlsaDevices(cards, pcm, (card, dev) => (card === 1 && dev === 0 ? stream : '')), [
    { id: 'plughw:CARD=PCH,DEV=0', name: 'HDA Intel PCH – ALC892 Analog', inputs: 2 },
    { id: 'plughw:CARD=U192k,DEV=0', name: 'UMC1820 – USB Audio', inputs: 8 },
  ]);
  assert.deepEqual(server.parseAlsaDevices('', ''), []);

  const dshow = '[dshow @ 0] "Mic in at rear panel (Pink) (Realtek(R) Audio)" (audio)\n[dshow @ 0]   Alternative name "@device_cm_{X}"\n[dshow @ 0] "CABLE Output" (audio)\n';
  assert.deepEqual(server.parseDeviceNames(dshow), ['Mic in at rear panel (Pink) (Realtek(R) Audio)', 'CABLE Output']);
  const avf = '[AVFoundation indev @ 0] AVFoundation video devices:\n[AVFoundation indev @ 0] [0] FaceTime HD Camera\n'
    + '[AVFoundation indev @ 0] AVFoundation audio devices:\n[AVFoundation indev @ 0] [0] MacBook Pro Microphone\n[AVFoundation indev @ 0] [1] Scarlett 18i20 USB\n';
  assert.deepEqual(server.parseDeviceNames(avf), ['MacBook Pro Microphone', 'Scarlett 18i20 USB']);

  assert.equal(server.parseChannelCount('  ch= 2, bits=16, rate= 44100\n  ch= 1, bits=16, rate= 44100\n'), 2);
  assert.equal(server.parseChannelCount('Stream #0:0: Audio: pcm_f32le, 48000 Hz, 18 channels, flt'), 18);
  assert.equal(server.parseChannelCount('Stream #0:0: Audio: pcm_f32le, 48000 Hz, mono, flt'), 1);
  assert.equal(server.parseChannelCount('nothing'), 2);
});

test('captureArgs splits one device into one low-latency Opus RTP stream per channel', () => {
  const args = server.captureArgs('plughw:CARD=U192k,DEV=0', 8, [
    { input: 3, port: 40000, rtpPort: 40010, rtcpPort: 40011, ssrc: 1234 },
    { input: 0, port: 40001, rtpPort: 40012, rtcpPort: 40013, ssrc: 5678 },
  ], ['-f', 'alsa', '-i', 'plughw:CARD=U192k,DEV=0']);
  assert.equal(args[args.indexOf('-filter_complex') + 1], '[0:a]aresample=48000,asetpts=N/SR/TB,asplit=3[s0][s1][meter];[s0]pan=mono|c0=c2[o0];[s1]pan=stereo|c0=c0|c1=c1[o1];'
    + '[meter]asetnsamples=n=4800,astats=metadata=1:reset=1:measure_perchannel=Peak_level:measure_overall=none,ametadata=mode=print:file=-:direct=1,anullsink');
  assert.deepEqual(args.filter((a) => a.startsWith('rtp://')), [
    'rtp://127.0.0.1:40000?localrtpport=40010&localrtcpport=40011&pkt_size=1200',
    'rtp://127.0.0.1:40001?localrtpport=40012&localrtcpport=40013&pkt_size=1200',
  ]);
  assert.deepEqual(args.filter((a, i) => args[i - 1] === '-frame_duration'), ['10', '10']);
  assert.deepEqual(args.filter((a, i) => args[i - 1] === '-application'), ['lowdelay', 'lowdelay']);
  assert.deepEqual(args.filter((a, i) => args[i - 1] === '-ssrc'), ['1234', '5678']);
});

test('server: capture from a server audio device', { skip: !hasFfmpeg() && 'ffmpeg is not installed' }, async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-test-'));
  const sine = { id: 'sine', name: 'Test tone', inputs: 2 };
  const broken = { id: 'broken', name: 'Unplugged', inputs: 1 };
  const { server: http, close } = await server.start({
    port: 0, host: '127.0.0.1', rtcPort: 10901, announcedIp: '127.0.0.1', dataDir,
    listDevices: async () => [sine, broken],
    // input 2 is 20 dB quieter than input 1
    captureSource: (device) => (device === 'sine' ? ['-re', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000,pan=stereo|c0=c0|c1=0.1*c0'] : ['-f', 'lavfi', '-i', 'nosuchfilter']),
  });
  const socket = io(`http://127.0.0.1:${http.address().port}`, { transports: ['websocket'], forceNew: true });
  t.after(async () => {
    socket.close();
    await close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const request = (event, data = {}) => new Promise((resolve, reject) => {
    socket.emit(event, data, (err, result) => (err ? reject(new Error(err)) : resolve(result)));
  });
  const channel = async (id) => (await request('admin:state')).channels.find((c) => c.id === id);

  assert.deepEqual((await request('admin:devices')).devices, [sine, broken]);
  const first = (await request('admin:state')).channels[0];
  const second = await request('admin:saveChannel', { name: 'English', language: 'en' });
  const third = await request('admin:saveChannel', { name: 'Broken', language: 'en' });
  await assert.rejects(request('admin:startCapture', { channelId: first.id, device: 'missing', input: 1 }), /device_not_found/);
  await assert.rejects(request('admin:startCapture', { channelId: first.id, device: 'sine', input: 3 }), /device_not_found/);
  await assert.rejects(request('admin:startCapture', { channelId: third.id, device: 'broken', input: 0 }), /device_not_found/);

  // two channels share one device; any admin can stop them; the choice is remembered
  await request('admin:startCapture', { channelId: first.id, device: 'sine', input: 2 });
  await request('admin:startCapture', { channelId: second.id, device: 'sine', input: 0 });
  await assert.rejects(request('admin:startCapture', { channelId: first.id, device: 'sine', input: 1 }), /already_live/);
  await assert.rejects(request('admin:publish', { channelId: first.id }), /already_live/);
  await new Promise((r) => setTimeout(r, 1500));
  assert.deepEqual((await channel(first.id)).capture, { device: 'sine', input: 2, error: null });
  assert.equal((await channel(second.id)).live, true);

  // level meters: about 10 updates per second with the peak of the chosen input (-18 dBFS / -38 dBFS)
  const updates = [];
  const collect = (levels) => updates.push(levels);
  socket.on('admin:levels', collect);
  await new Promise((r) => setTimeout(r, 1000));
  socket.off('admin:levels', collect);
  assert.ok(updates.length >= 8, `${updates.length} level updates`);
  const last = updates.at(-1);
  assert.ok(Math.abs(last[first.id] - 0.24) < 0.05, `input 2 level ${last[first.id]}`);
  assert.ok(Math.abs(last[second.id] - 0.64) < 0.05, `stereo level ${last[second.id]}`);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8')).channels[1].source, { device: 'sine', input: 0, inputs: 2, live: true });

  // a failing device reports its error and keeps the channel live for listeners
  await request('admin:startCapture', { channelId: third.id, device: 'broken', input: 1 });
  await new Promise((r) => setTimeout(r, 800));
  assert.match((await channel(third.id)).capture.error, /not found/i);

  await request('admin:stopPublish', { channelId: first.id });
  await request('admin:stopPublish', { channelId: third.id });
  assert.equal((await channel(first.id)).live, false);
  assert.equal((await channel(first.id)).capture, null);
  assert.equal((await channel(second.id)).live, true);

  // a source port taken by another program before ffmpeg binds it does not stop the capture
  const dgram = require('dgram');
  const blocker = dgram.createSocket('udp4');
  await new Promise((resolve) => blocker.bind(0, '127.0.0.1', resolve));
  const taken = blocker.address().port;
  const address = dgram.Socket.prototype.address;
  dgram.Socket.prototype.address = function patched() {
    dgram.Socket.prototype.address = address;
    return { ...address.call(this), port: taken };
  };
  try {
    await request('admin:startCapture', { channelId: first.id, device: 'sine', input: 1 });
  } finally {
    dgram.Socket.prototype.address = address;
  }
  await new Promise((r) => setTimeout(r, 4500));
  assert.deepEqual((await channel(first.id)).capture, { device: 'sine', input: 1, error: null });
  blocker.close();
});

test('server: captures that were sending continue after a restart', { skip: !hasFfmpeg() && 'ffmpeg is not installed' }, async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-test-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const run = async (steps) => {
    const { server: http, close } = await server.start({
      port: 0, host: '127.0.0.1', rtcPort: 10902, announcedIp: '127.0.0.1', dataDir,
      listDevices: async () => [{ id: 'sine', name: 'Test tone', inputs: 2 }],
      captureSource: () => ['-re', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000,aformat=channel_layouts=stereo'],
    });
    const socket = io(`http://127.0.0.1:${http.address().port}`, { transports: ['websocket'], forceNew: true });
    const request = (event, data = {}) => new Promise((resolve, reject) => {
      socket.emit(event, data, (err, result) => (err ? reject(new Error(err)) : resolve(result)));
    });
    try {
      await new Promise((r) => setTimeout(r, 1000));
      return await steps(request, (await request('admin:state')).channels);
    } finally {
      socket.close();
      await close();
    }
  };

  const channelId = await run(async (request, [channel]) => {
    await request('admin:startCapture', { channelId: channel.id, device: 'sine', input: 2 });
    return channel.id;
  });
  // the service was stopped while sending: the channel is live again with the same input, without an admin
  await run(async (request, [channel]) => {
    assert.equal(channel.id, channelId);
    assert.equal(channel.live, true);
    assert.deepEqual(channel.capture, { device: 'sine', input: 2, error: null });
    await request('admin:stopPublish', { channelId });
  });
  // a channel stopped by an admin stays off
  await run(async (request, [channel]) => {
    assert.equal(channel.live, false);
    assert.deepEqual(channel.source, { device: 'sine', input: 2, inputs: 2, live: false });
  });
});

test('capture RTP timestamps follow the sample count even when device timestamps jitter', { skip: !hasFfmpeg() && 'ffmpeg is not installed' }, async () => {
  const dgram = require('dgram');
  const socket = dgram.createSocket('udp4');
  await new Promise((resolve) => socket.bind(0, '127.0.0.1', resolve));
  const { port } = socket.address();
  const timestamps = [];
  socket.on('message', (packet) => timestamps.push(packet.readUInt32BE(4)));
  // 10 ms blocks at 44.1 kHz whose timestamps are off by up to 3 ms, like DirectShow devices deliver them
  const source = ['-re', '-f', 'lavfi', '-i', "sine=sample_rate=44100,asetnsamples=n=441,asetpts='PTS+0.003*random(0)/TB'"];
  const ffmpeg = require('child_process').spawn('ffmpeg', server.captureArgs('test', 1, [{ input: 1, port, rtpPort: port + 1, rtcpPort: port + 2, ssrc: 1 }], source));
  await new Promise((r) => setTimeout(r, 2000));
  ffmpeg.kill();
  socket.close();
  const steps = new Set(timestamps.slice(1).map((ts, i) => (ts - timestamps[i]) >>> 0));
  assert.ok(timestamps.length > 50, `${timestamps.length} packets`);
  assert.deepEqual([...steps], [480]);
});

function hasFfmpeg() {
  try {
    require('child_process').execFileSync(process.env.FFMPEG || 'ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

test('server: channels, auth guard, listening and statistics', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-test-'));
  const { server: http, close } = await server.start({ port: 0, host: '127.0.0.1', rtcPort: 10900, announcedIp: '127.0.0.1', dataDir });
  const url = `http://127.0.0.1:${http.address().port}`;
  const sockets = [];
  t.after(async () => {
    sockets.forEach((s) => s.close());
    await close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  const open = (auth) => new Promise((resolve, reject) => {
    const socket = io(url, { transports: ['websocket'], auth, forceNew: true });
    sockets.push(socket);
    socket.once('channels', (data) => resolve({ socket, data }));
    socket.once('connect_error', reject);
  });
  const request = (socket, event, data = {}) => new Promise((resolve, reject) => {
    socket.emit(event, data, (err, result) => (err ? reject(new Error(err)) : resolve(result)));
  });

  // static files and redirects
  assert.equal((await fetch(`${url}/`)).status, 200);
  assert.equal((await fetch(`${url}/scripts/socket.io/client-dist/socket.io.min.js`)).status, 200);
  assert.equal((await fetch(`${url}/scripts/express/package.json`)).status, 404);
  const redirect = await fetch(`${url}/stats.html`, { redirect: 'manual' });
  assert.equal(redirect.headers.get('location'), '/publish.html#stats');
  assert.match((await fetch(`${url}/`)).headers.get('content-security-policy'), /default-src 'self'/);

  // a fresh installation has one default channel and no password
  const admin = await open();
  assert.equal(admin.data.channels.length, 1);
  assert.equal(admin.data.channels[0].live, false);
  const state = await request(admin.socket, 'admin:state');
  assert.equal(state.passwordSet, false);
  assert.deepEqual(state.addresses, [], 'a loopback address is never shown to listeners');

  // channel management is broadcast to listeners
  const listener = await open();
  const update = new Promise((resolve) => listener.socket.once('channels', resolve));
  const created = await request(admin.socket, 'admin:saveChannel', { name: 'Русский', language: 'ru' });
  assert.equal((await update).channels.length, 2);
  await assert.rejects(request(admin.socket, 'admin:saveChannel', { id: 'missing', name: 'X', language: 'de' }), /channel_not_found/);

  // listening creates a transport; without a sender there is nothing to consume
  const params = await request(listener.socket, 'listen', { channelId: created.id });
  assert.ok(params.id && params.iceCandidates.length && params.dtlsParameters);
  assert.equal(params.iceCandidates[0].port, 10900);
  const caps = await request(listener.socket, 'getRouterRtpCapabilities');
  assert.deepEqual(await request(listener.socket, 'consume', { rtpCapabilities: caps }), { producerId: null });
  await assert.rejects(request(listener.socket, 'listen', { channelId: 'missing' }), /channel_not_found/);
  await assert.rejects(request(listener.socket, 'connectTransport', { transportId: 'missing', dtlsParameters: {} }), /unknown_transport/);
  await new Promise((r) => setTimeout(r, 400));
  const counted = await request(admin.socket, 'admin:state');
  assert.equal(counted.channels.find((c) => c.id === created.id).listeners, 1);

  // setting a password logs out every other session, including listeners that had admin rights before
  const loggedOut = new Promise((resolve) => listener.socket.once('admin:loggedOut', resolve));
  const { token } = await request(admin.socket, 'admin:setPassword', { password: 'geheim' });
  await loggedOut;
  await assert.rejects(request(listener.socket, 'admin:state'), /not_logged_in/);
  await assert.rejects(request(listener.socket, 'admin:deleteChannel', { id: created.id }), /not_logged_in/);
  await assert.rejects(request(listener.socket, 'admin:publish', { channelId: created.id }), /not_logged_in/);
  await assert.rejects(request(listener.socket, 'admin:login', { password: 'falsch' }), /wrong_password/);
  assert.ok(JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8')).auth.hash);

  // a saved token and a correct password both grant access
  const withToken = await open({ token });
  assert.equal((await request(withToken.socket, 'admin:state')).passwordSet, true);
  const login = await request(listener.socket, 'admin:login', { password: 'geheim' });

  // after 5 failed attempts within a minute even the correct password is refused (parallel guesses included)
  const guesses = await Promise.allSettled(Array.from({ length: 6 }, () => request(withToken.socket, 'admin:login', { password: 'falsch' })));
  assert.equal(guesses.filter((g) => /too_many_attempts/.test(g.reason?.message)).length, 1);
  await assert.rejects(request(withToken.socket, 'admin:login', { password: 'geheim' }), /too_many_attempts/);
  assert.ok(login.token);
  assert.equal((await request(listener.socket, 'admin:state')).channels.length, 2);

  // publishing requires an existing channel; statistics are empty without live minutes
  await assert.rejects(request(withToken.socket, 'admin:publish', { channelId: 'missing' }), /channel_not_found/);
  assert.ok((await request(withToken.socket, 'admin:publish', { channelId: created.id })).id);
  await assert.rejects(request(withToken.socket, 'admin:produce', { transportId: 'missing', kind: 'audio', rtpParameters: {} }), /unknown_transport/);
  assert.deepEqual((await request(withToken.socket, 'admin:stats', {})).perDay, []);

  // deleting a channel is persisted
  await request(withToken.socket, 'admin:deleteChannel', { id: created.id });
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8')).channels.length, 1);
});
