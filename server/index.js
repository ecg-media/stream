'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { promisify } = require('util');
const express = require('express');
const mediasoup = require('mediasoup');
const { Server } = require('socket.io');

const scrypt = promisify(crypto.scrypt);

/** Languages a channel can be spoken in; the listener page shows its texts in this language. */
const LANGUAGES = ['de', 'en', 'ru', 'uk', 'fa', 'ar', 'he', 'tr', 'ro', 'pl', 'es', 'fr', 'hy', 'ka'];
const MAX_NAME_LENGTH = 60;
const STATS_KEEP_DAYS = 400;
const SESSION_DAYS = 30;
const LOGIN_ATTEMPTS = 5;
const MEDIA_CODECS = [{ kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 }];

function defaultConfig() {
  return {
    title: 'E.C.G. Bremen e.V.',
    channels: [{ id: newId(), name: 'Übersetzung', language: 'de' }],
    auth: null,
  };
}

function newId() {
  return crypto.randomBytes(4).toString('hex');
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`Could not read ${file}:`, err.message);
    return fallback;
  }
}

function writeJson(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

/** Returns the trimmed channel name and language, or throws an error with code invalid_name / invalid_language. */
function validateChannel({ name, language } = {}) {
  name = typeof name === 'string' ? name.trim() : '';
  if (!name || name.length > MAX_NAME_LENGTH) throw new Error('invalid_name');
  if (!LANGUAGES.includes(language)) throw new Error('invalid_language');
  return { name, language };
}

/** Returns the local calendar date as YYYY-MM-DD. */
function dayKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Adds one listener sample per live channel (and their total) to the stats of the given day.
 * n counts live minutes, m the minutes with at least one listener.
 */
function addStatsSample(stats, day, samples) {
  if (!samples.length) return;
  const entry = (stats.days[day] = stats.days[day] || {});
  const add = (key, name, count) => {
    const e = (entry[key] = entry[key] || { name, n: 0, m: 0, sum: 0, max: 0 });
    e.name = name;
    e.n += 1;
    if (count > 0) e.m = (e.m ?? 0) + 1;
    e.sum += count;
    e.max = Math.max(e.max, count);
  };
  let total = 0;
  for (const { id, name, count } of samples) {
    add(id, name, count);
    total += count;
  }
  add('*', '', total);
  const keep = Object.keys(stats.days).sort().slice(-STATS_KEEP_DAYS);
  for (const key of Object.keys(stats.days)) if (!keep.includes(key)) delete stats.days[key];
}

/**
 * Summarizes the stats of the last `days` days per date and per weekday (0 = Sunday) for one channel key.
 * Averages are whole listeners over the minutes in which anyone listened.
 */
function summarizeStats(stats, key = '*', days = 90, today = new Date()) {
  const from = new Date(today);
  from.setDate(from.getDate() - days + 1);
  const fromKey = dayKey(from);
  const perDay = [];
  const weekdays = Array.from({ length: 7 }, () => ({ sum: 0, days: 0, max: 0 }));
  for (const day of Object.keys(stats.days).sort()) {
    const e = stats.days[day][key];
    if (day < fromKey || !e || !e.n) continue;
    const heard = e.m ?? e.n;
    const avg = e.sum > 0 ? Math.max(1, Math.round(e.sum / heard)) : 0;
    perDay.push({ day, avg, max: e.max, minutes: e.n });
    const w = weekdays[new Date(`${day}T12:00:00`).getDay()];
    w.sum += avg;
    w.days += 1;
    w.max = Math.max(w.max, e.max);
  }
  const channels = {};
  for (const entry of Object.values(stats.days)) {
    for (const [id, e] of Object.entries(entry)) if (id !== '*') channels[id] = e.name;
  }
  return {
    perDay,
    perWeekday: weekdays.map((w, weekday) => ({ weekday, avg: w.days ? Math.round(w.sum / w.days) : 0, max: w.max, days: w.days })),
    channels,
  };
}

async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${(await scrypt(password, salt, 32)).toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash || typeof password !== 'string') return false;
  const actual = Buffer.from((await hashPassword(password, salt)).split(':')[1], 'hex');
  return crypto.timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}

function signToken(secret, expires) {
  return `${expires}.${crypto.createHmac('sha256', secret).update(String(expires)).digest('hex')}`;
}

function verifyToken(auth, token) {
  if (!auth || typeof token !== 'string') return false;
  const expires = Number(token.split('.')[0]);
  if (!(expires > Date.now())) return false;
  const expected = Buffer.from(signToken(auth.secret, expires));
  const given = Buffer.from(token);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/** Returns the first external IPv4 address of this machine, preferring physical over virtual network adapters. */
function detectIp(interfaces = os.networkInterfaces()) {
  const virtual = /vethernet|virtual|vmnet|vbox|docker|veth|br-|virbr|wsl|hyper-v|tailscale|zerotier|utun|tun|tap/i;
  const candidates = Object.entries(interfaces).flatMap(([name, list]) => (list || [])
    .filter((x) => !x.internal && x.family === 'IPv4' && !x.address.startsWith('169.254.'))
    .map((x) => ({ name, address: x.address })));
  return (candidates.find((c) => !virtual.test(c.name)) || candidates[0])?.address;
}

/**
 * Starts the streaming server and resolves with { server, close } once it listens.
 * Options: port, host, rtcPort, announcedIp, dataDir.
 */
async function start({
  port = Number(process.env.PORT) || 80,
  host = process.env.HOST || '0.0.0.0',
  rtcPort = Number(process.env.RTC_PORT) || 10000,
  announcedIp = process.env.IP,
  dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
} = {}) {
  // At boot the service may start before the network has an address.
  for (let i = 0; !announcedIp && i < 30; i++) {
    announcedIp = detectIp();
    if (!announcedIp) await new Promise((r) => setTimeout(r, 2000));
  }
  fs.mkdirSync(dataDir, { recursive: true });
  const configFile = path.join(dataDir, 'config.json');
  const statsFile = path.join(dataDir, 'stats.json');
  const config = { ...defaultConfig(), ...readJson(configFile, {}) };
  const stats = readJson(statsFile, { days: {} });
  const saveConfig = () => writeJson(configFile, config);
  if (!fs.existsSync(configFile)) saveConfig();
  if (!announcedIp) console.warn('No network address found; listeners on other devices cannot connect. Start with IP=<address of this computer>.');

  // ---- mediasoup ----
  const worker = await mediasoup.createWorker({ logLevel: 'warn' });
  worker.on('died', () => {
    console.error('mediasoup worker died, exiting.');
    process.exit(1);
  });
  const listenInfo = { ip: '0.0.0.0', announcedAddress: announcedIp || '127.0.0.1', port: rtcPort };
  const webRtcServer = await worker.createWebRtcServer({
    listenInfos: [{ ...listenInfo, protocol: 'udp' }, { ...listenInfo, protocol: 'tcp' }],
  });
  const router = await worker.createRouter({ mediaCodecs: MEDIA_CODECS });

  async function createTransport(socket) {
    const transport = await router.createWebRtcTransport({
      webRtcServer,
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1000000,
    });
    socket.data.transports.set(transport.id, transport);
    transport.observer.on('close', () => socket.data.transports.delete(transport.id));
    return {
      transport,
      params: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      },
    };
  }

  const live = new Map();
  const listeners = new Map();
  const findChannel = (id) => config.channels.find((c) => c.id === id);
  const listenerCount = (id) => listeners.get(id)?.size || 0;
  const loginFailures = new Map();

  // ---- HTTP ----
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:",
    });
    next();
  });
  app.get('/stats.html', (req, res) => res.redirect('/publish.html#stats'));
  app.get('/admin', (req, res) => res.redirect('/publish.html'));
  app.use(express.static(path.join(__dirname, '..', 'app')));
  app.use('/scripts/socket.io/client-dist', express.static(path.join(require.resolve('socket.io/package.json'), '..', 'client-dist')));

  const server = http.createServer(app);
  const io = new Server(server, { serveClient: false });

  const publicChannels = () => config.channels.map((c) => ({ ...c, live: live.has(c.id) }));
  const adminState = () => ({
    title: config.title,
    passwordSet: !!config.auth,
    languages: LANGUAGES,
    addresses: announcedIp && !announcedIp.startsWith('127.') ? [`http://${announcedIp}${port === 80 ? '' : `:${port}`}`] : [],
    channels: config.channels.map((c) => ({ ...c, live: live.has(c.id), publisher: live.get(c.id)?.socketId || null, listeners: listenerCount(c.id) })),
  });
  const broadcastChannels = () => {
    io.emit('channels', { title: config.title, channels: publicChannels() });
    pushAdminState();
  };
  let adminTimer = null;
  function pushAdminState() {
    adminTimer = adminTimer || setTimeout(() => {
      adminTimer = null;
      io.to('admins').emit('admin:state', adminState());
    }, 300);
  }

  function stopPublishing(channelId) {
    const entry = live.get(channelId);
    if (!entry) return;
    live.delete(channelId);
    entry.transport.close();
    broadcastChannels();
  }

  function stopListening(socket) {
    const { channelId, recvTransport } = socket.data;
    if (recvTransport) recvTransport.close();
    socket.data.recvTransport = null;
    socket.data.channelId = null;
    if (channelId && listeners.get(channelId)?.delete(socket.id)) {
      socket.leave(`ch:${channelId}`);
      pushAdminState();
    }
  }

  async function consume(socket, rtpCapabilities) {
    const transport = socket.data.recvTransport;
    const producer = live.get(socket.data.channelId)?.producer;
    if (!transport || !producer) return { producerId: null };
    if (!router.canConsume({ producerId: producer.id, rtpCapabilities })) throw new Error('cannot_consume');
    socket.data.consumer?.close();
    const consumer = socket.data.consumer = await transport.consume({ producerId: producer.id, rtpCapabilities });
    consumer.on('producerclose', () => socket.emit('consumerClosed', { channelId: socket.data.channelId }));
    return { producerId: producer.id, id: consumer.id, kind: consumer.kind, rtpParameters: consumer.rtpParameters };
  }

  io.on('connection', (socket) => {
    socket.data.transports = new Map();
    socket.data.admin = !config.auth || verifyToken(config.auth, socket.handshake.auth?.token);
    socket.emit('channels', { title: config.title, channels: publicChannels() });

    const on = (event, handler, { admin = false } = {}) => {
      socket.on(event, async (data, callback) => {
        const reply = typeof callback === 'function' ? callback : () => {};
        try {
          if (admin && !socket.data.admin) throw new Error('not_logged_in');
          reply(null, await handler(data || {}));
        } catch (err) {
          console.error(`${event} failed:`, err.message);
          reply(err.message || 'error');
        }
      });
    };

    on('getRouterRtpCapabilities', () => router.rtpCapabilities);

    on('connectTransport', async ({ transportId, dtlsParameters }) => {
      const transport = socket.data.transports.get(transportId);
      if (!transport) throw new Error('unknown_transport');
      await transport.connect({ dtlsParameters });
      return {};
    });

    // ---- listener ----
    on('listen', async ({ channelId }) => {
      if (!findChannel(channelId)) throw new Error('channel_not_found');
      stopListening(socket);
      const { transport, params } = await createTransport(socket);
      socket.data.recvTransport = transport;
      socket.data.channelId = channelId;
      if (!listeners.has(channelId)) listeners.set(channelId, new Set());
      listeners.get(channelId).add(socket.id);
      socket.join(`ch:${channelId}`);
      pushAdminState();
      return params;
    });
    on('consume', ({ rtpCapabilities }) => consume(socket, rtpCapabilities));
    on('stopListening', () => stopListening(socket));

    // ---- admin ----
    on('admin:login', async ({ password }) => {
      if (!config.auth) return { token: null };
      const client = socket.handshake.address;
      const now = Date.now();
      for (const [key, entry] of loginFailures) if (entry.until <= now) loginFailures.delete(key);
      const attempts = loginFailures.get(client) || { count: 0, until: now + 60000 };
      if (attempts.count >= LOGIN_ATTEMPTS) throw new Error('too_many_attempts');
      attempts.count += 1;
      loginFailures.set(client, attempts);
      if (!(await verifyPassword(password, config.auth.hash))) {
        await new Promise((r) => setTimeout(r, 1000));
        throw new Error('wrong_password');
      }
      loginFailures.delete(client);
      socket.data.admin = true;
      socket.join('admins');
      socket.emit('admin:state', adminState());
      return { token: signToken(config.auth.secret, Date.now() + SESSION_DAYS * 86400000) };
    });
    on('admin:state', () => {
      socket.join('admins');
      return adminState();
    }, { admin: true });
    on('admin:saveChannel', ({ id, ...data }) => {
      const values = validateChannel(data);
      const channel = id ? findChannel(id) : { id: newId() };
      if (!channel) throw new Error('channel_not_found');
      Object.assign(channel, values);
      if (!id) config.channels.push(channel);
      saveConfig();
      broadcastChannels();
      return channel;
    }, { admin: true });
    on('admin:deleteChannel', ({ id }) => {
      if (!findChannel(id)) throw new Error('channel_not_found');
      stopPublishing(id);
      config.channels = config.channels.filter((c) => c.id !== id);
      saveConfig();
      for (const socketId of listeners.get(id) || []) {
        const s = io.sockets.sockets.get(socketId);
        if (s) stopListening(s);
      }
      listeners.delete(id);
      broadcastChannels();
      return {};
    }, { admin: true });
    on('admin:setTitle', ({ title }) => {
      title = typeof title === 'string' ? title.trim() : '';
      if (title.length > MAX_NAME_LENGTH) throw new Error('invalid_title');
      config.title = title;
      saveConfig();
      broadcastChannels();
      return {};
    }, { admin: true });
    on('admin:setPassword', async ({ password }) => {
      if (password && (typeof password !== 'string' || password.length < 4)) throw new Error('password_too_short');
      config.auth = password ? { hash: await hashPassword(password), secret: crypto.randomBytes(32).toString('hex') } : null;
      saveConfig();
      if (config.auth) {
        for (const other of io.sockets.sockets.values()) {
          if (other === socket) continue;
          other.data.admin = false;
          other.leave('admins');
          other.emit('admin:loggedOut');
        }
      }
      pushAdminState();
      return { token: config.auth ? signToken(config.auth.secret, Date.now() + SESSION_DAYS * 86400000) : null };
    }, { admin: true });
    on('admin:publish', async ({ channelId }) => {
      if (!findChannel(channelId)) throw new Error('channel_not_found');
      if (live.has(channelId)) throw new Error('already_live');
      for (const old of socket.data.transports.values()) if (old.appData.channelId === channelId) old.close();
      const { transport, params } = await createTransport(socket);
      transport.appData.channelId = channelId;
      return params;
    }, { admin: true });
    on('admin:produce', async ({ transportId, kind, rtpParameters }) => {
      const transport = socket.data.transports.get(transportId);
      const channelId = transport?.appData.channelId;
      if (!channelId || !findChannel(channelId)) throw new Error('unknown_transport');
      if (kind !== 'audio') throw new Error('audio_only');
      if (live.has(channelId)) throw new Error('already_live');
      const producer = await transport.produce({ kind, rtpParameters });
      live.set(channelId, { producer, transport, socketId: socket.id });
      transport.observer.on('close', () => {
        if (live.get(channelId)?.producer === producer) stopPublishing(channelId);
      });
      broadcastChannels();
      return { id: producer.id };
    }, { admin: true });
    on('admin:stopPublish', ({ channelId }) => {
      if (live.get(channelId)?.socketId !== socket.id) throw new Error('not_publisher');
      stopPublishing(channelId);
      return {};
    }, { admin: true });
    on('admin:reload', ({ channelId }) => {
      io.to(`ch:${channelId}`).emit('reloadPage');
      return {};
    }, { admin: true });
    on('admin:stats', ({ channelId, days }) => summarizeStats(stats, channelId || '*', Math.min(Math.max(Number(days) || 90, 1), STATS_KEEP_DAYS)), { admin: true });

    socket.on('disconnect', () => {
      stopListening(socket);
      for (const transport of socket.data.transports.values()) transport.close();
    });
  });

  // ---- statistics: one sample per minute for every live channel ----
  let statsDirty = false;
  const sampleTimer = setInterval(() => {
    const samples = config.channels.filter((c) => live.has(c.id)).map((c) => ({ id: c.id, name: c.name, count: listenerCount(c.id) }));
    if (!samples.length) return;
    addStatsSample(stats, dayKey(), samples);
    statsDirty = true;
  }, 60000);
  const saveStats = () => {
    if (!statsDirty) return;
    statsDirty = false;
    fs.promises.writeFile(`${statsFile}.tmp`, JSON.stringify(stats))
      .then(() => fs.promises.rename(`${statsFile}.tmp`, statsFile))
      .catch((err) => console.error('Could not save statistics:', err.message));
  };
  const saveTimer = setInterval(saveStats, 5 * 60000);

  await new Promise((resolve) => server.listen(port, host, resolve));
  console.log(`Listening on http://${host}:${server.address().port}, media on ${announcedIp}:${rtcPort} (UDP/TCP)`);

  async function close() {
    clearInterval(sampleTimer);
    clearInterval(saveTimer);
    clearTimeout(adminTimer);
    if (statsDirty) writeJson(statsFile, stats);
    io.close();
    worker.close();
    await new Promise((resolve) => server.close(resolve));
  }
  return { server, close };
}

/** Prompts for a new admin password on the command line and stores it (empty input removes it). */
async function setPasswordCli(dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data')) {
  const readline = require('readline/promises');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const password = (await rl.question('Neues Admin-Passwort (leer lassen = kein Passwort): ')).trim();
  rl.close();
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'config.json');
  const config = { ...defaultConfig(), ...readJson(file, {}) };
  config.auth = password ? { hash: await hashPassword(password), secret: crypto.randomBytes(32).toString('hex') } : null;
  writeJson(file, config);
  console.log(password ? 'Passwort gespeichert. Bitte den Dienst neu starten.' : 'Passwort entfernt. Bitte den Dienst neu starten.');
}

module.exports = { start, detectIp, validateChannel, addStatsSample, summarizeStats, dayKey, hashPassword, verifyPassword, signToken, verifyToken, LANGUAGES };

if (require.main === module) {
  if (process.argv.includes('--set-password')) {
    setPasswordCli().catch((err) => { console.error(err); process.exit(1); });
  } else {
    start().then(({ close }) => {
      const shutdown = () => close().finally(() => process.exit(0));
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    }).catch((err) => {
      console.error('Server start failed:', err);
      process.exit(1);
    });
  }
}
