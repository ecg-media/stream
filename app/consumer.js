'use strict';

const $ = (id) => document.getElementById(id);
const audio = $('audio');
const rings = new Rings($('rings'));
const level = new Level((value, bands) => rings.draw(bands, !!consumer), 4);
const mediaStream = new MediaStream();
const { socket, request } = connect();

let title = '';
let channels = null;
let channelId = null;
let choosing = false;
let wantPlay = false;
let starting = false;
let consuming = false;
let failed = false;
let device = null;
let transport = null;
let consumer = null;
let retryTimer = null;

const currentChannel = () => channels?.find((c) => c.id === channelId) || null;

socket.on('channels', (data) => {
  title = data.title;
  channels = data.channels;
  const ids = channels.map((c) => c.id);
  if (channelId && !ids.includes(channelId)) {
    stop();
    channelId = null;
  }
  if (!channelId && !choosing) {
    const stored = storageGet('channel');
    if (channels.length === 1) channelId = channels[0].id;
    else if (ids.includes(stored)) channelId = stored;
  }
  if (wantPlay && transport && !consumer && currentChannel()?.live) consume();
  render();
});
socket.on('consumerClosed', () => {
  closeConsumer();
  render();
});
socket.on('reloadPage', () => location.reload());
socket.on('connect', () => {
  if (wantPlay) startListening();
});
socket.on('disconnect', () => {
  dropMedia();
  render();
});

$('btn_stream').addEventListener('click', () => (wantPlay ? stop() : play()));
$('btn_change').addEventListener('click', () => {
  stop();
  choosing = true;
  channelId = null;
  render();
});

function selectChannel(id) {
  channelId = id;
  choosing = false;
  storageSet('channel', id);
  render();
}

function play() {
  wantPlay = true;
  failed = false;
  // Starting playback inside the click keeps mobile browsers from blocking the audio that arrives later.
  Level.unlock();
  audio.srcObject = mediaStream;
  audio.play().catch(() => {});
  keepAwake(true);
  startListening();
}

function stop() {
  wantPlay = false;
  keepAwake(false);
  clearTimeout(retryTimer);
  dropMedia();
  if (socket.connected) request('stopListening').catch(() => {});
  render();
}

async function startListening() {
  if (starting || !socket.connected || !wantPlay) return;
  starting = true;
  render();
  try {
    if (!device) {
      device = new MediasoupClient.Device();
      await device.load({ routerRtpCapabilities: await request('getRouterRtpCapabilities') });
    }
    dropMedia();
    const params = await request('listen', { channelId });
    const recv = device.createRecvTransport(params);
    transport = recv;
    recv.on('connect', ({ dtlsParameters }, callback, errback) => {
      request('connectTransport', { transportId: recv.id, dtlsParameters }).then(callback, errback);
    });
    recv.on('connectionstatechange', (state) => {
      if (state === 'failed' && transport === recv) retry();
    });
    failed = false;
    if (currentChannel()?.live) await consume();
  } catch (err) {
    console.error('listen failed:', err);
    if (err.name === 'UnsupportedError') {
      wantPlay = false;
      keepAwake(false);
      failed = 'unsupported';
    } else {
      retry();
    }
  } finally {
    starting = false;
    render();
  }
}

async function consume() {
  if (consuming || !transport) return;
  consuming = true;
  try {
    const data = await request('consume', { rtpCapabilities: device.rtpCapabilities });
    if (!data.producerId || !transport) return;
    closeConsumer();
    consumer = await transport.consume(data);
    mediaStream.addTrack(consumer.track);
    if (audio.srcObject !== mediaStream) audio.srcObject = mediaStream;
    audio.play().catch((err) => console.warn('autoplay blocked:', err));
    level.attach(mediaStream);
    updateMediaSession();
  } catch (err) {
    console.error('consume failed:', err);
    retry();
  } finally {
    consuming = false;
    render();
  }
}

function retry() {
  if (!wantPlay) return;
  failed = true;
  dropMedia();
  clearTimeout(retryTimer);
  retryTimer = setTimeout(startListening, 2000);
  render();
}

function closeConsumer() {
  if (!consumer) return;
  mediaStream.removeTrack(consumer.track);
  consumer.close();
  consumer = null;
  level.detach();
}

function dropMedia() {
  closeConsumer();
  transport?.close();
  transport = null;
}

// Mobile browsers pause WebRTC audio once the screen locks, so the screen is kept on while listening. Without HTTPS
// there is no Wake Lock API; a muted, practically invisible looping video (10 s, black, 64 px) does the same.
const KEEP_AWAKE_VIDEO = 'data:video/mp4;base64,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';
const awake = { lock: null, video: null };

async function keepAwake(on) {
  if (!on) {
    awake.lock?.release().catch(() => {});
    awake.lock = null;
    awake.video?.pause();
    return;
  }
  try {
    if (window.isSecureContext && navigator.wakeLock && (!awake.lock || awake.lock.released)) awake.lock = await navigator.wakeLock.request('screen');
    if (awake.lock && !awake.lock.released) return;
  } catch {
    awake.lock = null;
  }
  if (!awake.video) {
    awake.video = document.createElement('video');
    for (const attr of ['muted', 'loop', 'playsinline']) awake.video.setAttribute(attr, '');
    awake.video.muted = true;
    awake.video.className = 'keep-awake';
    awake.video.setAttribute('aria-hidden', 'true');
    awake.video.src = KEEP_AWAKE_VIDEO;
    document.body.append(awake.video);
  }
  awake.video.play().catch(() => {});
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wantPlay) keepAwake(true);
});

function updateMediaSession() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title: currentChannel()?.name || '', artist: title });
  navigator.mediaSession.setActionHandler('pause', stop);
  navigator.mediaSession.setActionHandler('stop', stop);
}

function setLanguage(language) {
  const t = texts(language);
  document.documentElement.lang = language;
  document.documentElement.dir = t.rtl ? 'rtl' : 'ltr';
  $('btn_theme').setAttribute('aria-label', t.theme);
  return t;
}

function render() {
  if (title) $('title').textContent = title;
  const channel = currentChannel();
  $('view_chooser').hidden = !channels || !!channel;
  $('view_channel').hidden = !channel;
  if (!channels) return;
  if (!channel) return renderChooser();

  const t = setLanguage(channel.language);
  const playing = !!consumer;
  let hint = t.tap;
  if (failed === 'unsupported') hint = t.unsupported;
  else if (wantPlay && failed) hint = t.error;
  else if (wantPlay && !channel.live) hint = t.waiting;
  else if (wantPlay && !playing) hint = t.connecting;
  else if (playing) hint = t.playing;
  if (wantPlay && failed !== 'unsupported') hint = `${hint} ${t.screen}`;

  document.title = title ? `${channel.name} – ${title}` : channel.name;
  $('channel_name').textContent = channel.name;
  $('hint').textContent = hint;
  const btn = $('btn_stream');
  btn.classList.toggle('busy', wantPlay && !playing);
  btn.setAttribute('aria-label', wantPlay ? t.stop : t.listen);
  btn.replaceChildren(icon(wantPlay ? 'stop' : 'play_arrow'));
  const status = $('status');
  status.className = `status ${channel.live ? 'live' : wantPlay ? 'waiting' : ''}`;
  $('status_text').textContent = channel.live ? t.live : t.offline;
  $('btn_change').hidden = channels.length < 2;
  $('btn_change').setAttribute('aria-label', t.change);
  $('change_text').textContent = t.change;
}

function renderChooser() {
  const t = setLanguage(browserLanguage());
  $('btn_change').hidden = true;
  document.title = title || document.title;
  $('choose_title').textContent = t.choose;
  $('no_channels').hidden = channels.length > 0;
  $('no_channels').textContent = t.noChannels;
  $('channel_list').replaceChildren(...channels.map((channel) => {
    const ct = texts(channel.language);
    const card = document.createElement('button');
    card.className = 'channel-card';
    card.lang = channel.language;
    card.dir = ct.rtl ? 'rtl' : 'ltr';
    card.innerHTML = '<span class="avatar"></span><span class="text"><strong></strong><small></small></span><span class="chevron"></span>';
    card.querySelector('.avatar').append(icon('headphones'));
    card.querySelector('.chevron').append(icon('chevron_right'));
    card.querySelector('strong').textContent = channel.name;
    card.querySelector('small').textContent = `${ct.name} · ${ct.listen}`;
    if (channel.live) {
      const badge = document.createElement('span');
      badge.className = 'badge live';
      badge.textContent = ct.live;
      card.querySelector('strong').append(badge);
    }
    card.addEventListener('click', () => selectChannel(channel.id));
    return card;
  }));
}
