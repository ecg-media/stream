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
  startListening();
}

function stop() {
  wantPlay = false;
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
