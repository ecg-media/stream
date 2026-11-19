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
