'use strict';

const $ = (id) => document.getElementById(id);
const canPublish = window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

setAdminLanguage(storageGet('adminLang') || browserLanguage(ADMIN_TEXTS));
translatePage();

let token = storageGet('adminToken');
let { socket, request } = connect({ token });
let state = null;
let device = null;
let inputs = [];
const cards = new Map();
const pubs = new Map();

// ---- connection & login ----
function bindSocket() {
  socket.on('connect', loadState);
  socket.on('admin:state', (data) => {
    state = data;
    render();
  });
  socket.on('admin:loggedOut', () => logout(false));
  socket.on('disconnect', () => {
    for (const pub of pubs.values()) releasePublishing(pub);
    renderChannels();
  });
}
bindSocket();

async function loadState() {
  try {
    state = await request('admin:state');
    showView('admin');
    render();
    if (!$('tab_stats').hidden) loadStats();
    for (const [channelId, pub] of pubs) if (pub.want) publish(channelId);
  } catch (err) {
    if (err.message === 'not_logged_in') showView('login');
    else toast(errorText(err));
  }
}

function reconnect() {
  socket.removeAllListeners();
  socket.close();
  ({ socket, request } = connect({ token }));
  bindSocket();
}

$('form_login').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const result = await request('admin:login', { password: $('login_password').value });
    token = result.token;
    storageSet('adminToken', token);
    $('login_password').value = '';
    await loadState();
  } catch (err) {
    toast(errorText(err));
  }
});

$('btn_logout').addEventListener('click', () => {
  $('dialog_settings').close();
  logout(true);
});

function logout(manual) {
  for (const channelId of pubs.keys()) stopPublishing(channelId);
  token = null;
  storageSet('adminToken', null);
  if (!manual) toast(at('loginAgain'));
  reconnect();
}

function showView(view) {
  $('view_login').hidden = view !== 'login';
  $('view_admin').hidden = view !== 'admin';
  $('tabs').hidden = view !== 'admin';
  $('btn_add').hidden = view !== 'admin';
  document.querySelectorAll('.admin-only').forEach((el) => { el.hidden = view !== 'admin'; });
  $('logout_section').hidden = view !== 'admin' || !state?.passwordSet;
}

// ---- tabs ----
document.querySelectorAll('[data-tab]').forEach((tab) => tab.addEventListener('click', () => selectTab(tab.dataset.tab)));
function selectTab(name) {
  document.querySelectorAll('[data-tab]').forEach((tab) => tab.setAttribute('aria-selected', tab.dataset.tab === name));
  for (const id of ['channels', 'stats']) $(`tab_${id}`).hidden = id !== name;
  history.replaceState(null, '', name === 'channels' ? location.pathname : `#${name}`);
  if (name === 'stats') loadStats();
}
selectTab(location.hash === '#stats' ? 'stats' : 'channels');

// ---- rendering ----
function render() {
  if (!state) return;
  $('title').textContent = state.title ? `${at('appTitle')} – ${state.title}` : at('appTitle');
  document.title = $('title').textContent;
  $('logout_section').hidden = $('view_admin').hidden || !state.passwordSet;
  $('insecure').hidden = canPublish;
  $('no_password').hidden = state.passwordSet;
  $('addresses').replaceChildren(...(state.addresses.length ? state.addresses : [at('noAddress')]).map((address) => {
    const line = document.createElement('p');
    line.className = 'address';
    line.textContent = address;
    return line;
  }));
  if (document.activeElement !== $('input_title')) $('input_title').value = state.title;
  $('password_state').textContent = at(state.passwordSet ? 'passwordSet' : 'passwordNotSet');
  $('btn_remove_password').hidden = !state.passwordSet;
  $('channel_input_language').replaceChildren(...state.languages.map((code) => new Option(languageLabel(code), code)));
  renderChannels();
}

function renderChannels() {
  if (!state) return;
  const ids = state.channels.map((c) => c.id);
  for (const [id, card] of cards) {
    if (!ids.includes(id)) {
      stopPublishing(id);
      card.remove();
      cards.delete(id);
    }
  }
  for (const channel of state.channels) {
    if (!cards.has(channel.id)) cards.set(channel.id, createCard(channel.id));
    const card = cards.get(channel.id);
    $('channel_cards').append(card);
    updateCard(card, channel);
  }
}

function createCard(channelId) {
  const card = $('tpl_channel').content.firstElementChild.cloneNode(true);
  renderIcons(card);
  translatePage(card);
  const meter = card.querySelector('.meter');
  card.level = new Level((value) => meter.style.setProperty('--level', value.toFixed(3)));
  const select = card.querySelector('.device');
  select.addEventListener('change', () => storageSet(`device:${channelId}`, select.value));
  const raw = card.querySelector('.raw');
  raw.checked = storageGet(`raw:${channelId}`) === '1';
  raw.addEventListener('change', () => storageSet(`raw:${channelId}`, raw.checked ? '1' : null));
  card.querySelector('.publish').addEventListener('click', () => (pubs.get(channelId)?.want ? stopPublishing(channelId) : publish(channelId)));
  card.querySelector('.edit').addEventListener('click', () => editChannel(state.channels.find((c) => c.id === channelId)));
  card.querySelector('.reload').addEventListener('click', async () => {
    if (!confirm(at('confirmReload'))) return;
    await request('admin:reload', { channelId }).catch((err) => toast(errorText(err)));
  });
  card.querySelector('.delete').addEventListener('click', async () => {
    const channel = state.channels.find((c) => c.id === channelId);
    if (!confirm(at('confirmDelete', { name: channel.name }))) return;
    await request('admin:deleteChannel', { id: channelId }).catch((err) => toast(errorText(err)));
  });
  fillDevices(select, channelId);
  return card;
}

function updateCard(card, channel) {
  const pub = pubs.get(channel.id);
  const mine = channel.live && channel.publisher === socket.id;
  const elsewhere = channel.live && !mine;
  card.querySelector('.name').textContent = channel.name;
  card.querySelector('.language').textContent = languageLabel(channel.language);
  card.querySelector('.listeners').textContent = channel.listeners;
  const badge = card.querySelector('.state');
  badge.className = `badge state ${channel.live ? 'live' : ''}`;
  badge.textContent = at(mine ? 'sending' : elsewhere ? 'sendingElsewhere' : pub?.want ? 'connecting' : 'off');
  const btn = card.querySelector('.publish');
  btn.disabled = !canPublish || elsewhere;
  btn.classList.toggle('danger', !!pub?.want);
  card.querySelector('.publish-icon').replaceChildren(icon(pub?.want ? 'stop' : 'mic'));
  card.querySelector('.publish-text').textContent = at(pub?.want ? 'stopSending' : 'startSending');
  card.querySelector('.device').disabled = !canPublish || !!pub?.want;
  card.querySelector('.raw').disabled = !canPublish || !!pub?.want;
}

// ---- audio inputs ----
async function loadInputs() {
  if (!canPublish) return;
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
    probe.getTracks().forEach((t) => t.stop());
    inputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
  } catch (err) {
    toast(at('noAudioAccess'));
  }
  for (const [channelId, card] of cards) fillDevices(card.querySelector('.device'), channelId);
}
navigator.mediaDevices?.addEventListener?.('devicechange', loadInputs);
loadInputs();

function fillDevices(select, channelId) {
  const stored = storageGet(`device:${channelId}`);
  select.replaceChildren(...inputs.map((d, i) => new Option(d.label || at('audioInput', { n: i + 1 }), d.deviceId)));
  if (inputs.some((d) => d.deviceId === stored)) select.value = stored;
}

// ---- publishing ----
async function publish(channelId) {
  const card = cards.get(channelId);
  const pub = pubs.get(channelId) || { deviceId: card.querySelector('.device').value, raw: card.querySelector('.raw').checked };
  pubs.set(channelId, pub);
  pub.want = true;
  renderChannels();
  try {
    if (!pub.stream) {
      const audio = pub.deviceId ? { deviceId: { exact: pub.deviceId } } : {};
      if (pub.raw) Object.assign(audio, { echoCancellation: false, noiseSuppression: false, autoGainControl: false });
      pub.stream = await navigator.mediaDevices.getUserMedia({ audio });
      const track = pub.stream.getAudioTracks()[0];
      track.addEventListener('ended', () => {
        toast(at('deviceGone'));
        stopPublishing(channelId);
      });
      card.level.attach(pub.stream);
    }
    if (!device) {
      device = new MediasoupClient.Device();
      await device.load({ routerRtpCapabilities: await request('getRouterRtpCapabilities') });
    }
    if (!socket.connected || !pub.want) return;
    const params = await request('admin:publish', { channelId });
    const transport = device.createSendTransport(params);
    pub.transport = transport;
    transport.on('connect', ({ dtlsParameters }, callback, errback) => {
      request('connectTransport', { transportId: transport.id, dtlsParameters }).then(callback, errback);
    });
    transport.on('produce', ({ kind, rtpParameters }, callback, errback) => {
      request('admin:produce', { transportId: transport.id, kind, rtpParameters }).then(({ id }) => callback({ id }), errback);
    });
    transport.on('connectionstatechange', (connection) => {
      if (connection === 'failed' && pub.transport === transport) {
        releasePublishing(pub);
        setTimeout(() => pub.want && publish(channelId), 2000);
      }
    });
    pub.producer = await transport.produce({ track: pub.stream.getAudioTracks()[0], stopTracks: false });
  } catch (err) {
    console.error('publish failed:', err);
    toast(err.name === 'NotAllowedError' ? at('micDenied') : errorText(err));
    stopPublishing(channelId);
  }
  renderChannels();
}

function releasePublishing(pub) {
  pub.producer?.close();
  pub.transport?.close();
  pub.producer = null;
  pub.transport = null;
}

function stopPublishing(channelId) {
  const pub = pubs.get(channelId);
  if (!pub) return;
  pubs.delete(channelId);
  pub.want = false;
  if (pub.producer && socket.connected) request('admin:stopPublish', { channelId }).catch(() => {});
  releasePublishing(pub);
  pub.stream?.getTracks().forEach((t) => t.stop());
  cards.get(channelId)?.level.detach();
  renderChannels();
}

window.addEventListener('beforeunload', (e) => {
  if ([...pubs.values()].some((p) => p.want)) e.preventDefault();
});

// ---- channel dialog ----
$('btn_add').addEventListener('click', () => editChannel(null));
$('btn_cancel_channel').addEventListener('click', () => $('dialog_channel').close('cancel'));

function editChannel(channel) {
  $('dialog_title').textContent = at(channel ? 'editChannel' : 'newChannel');
  $('channel_input_name').value = channel?.name || '';
  $('channel_input_language').value = channel?.language || 'de';
  const dialog = $('dialog_channel');
  dialog.onclose = async () => {
    if (dialog.returnValue !== 'save') return;
    try {
      await request('admin:saveChannel', { id: channel?.id, name: $('channel_input_name').value, language: $('channel_input_language').value });
    } catch (err) {
      toast(errorText(err));
    }
  };
  dialog.returnValue = '';
  dialog.showModal();
}

// ---- settings ----
function languageLabel(code) {
  return `${at('languages')[code]} – ${texts(code).name}`;
}

function renderLanguageButtons() {
  $('ui_languages').replaceChildren(...ADMIN_LANGUAGES.map(({ code, label }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.lang = code;
    btn.setAttribute('aria-pressed', code === adminLanguage);
    btn.addEventListener('click', () => {
      setAdminLanguage(code);
      storageSet('adminLang', code);
      translatePage();
      renderLanguageButtons();
      render();
      renderChannels();
      if (!$('tab_stats').hidden) loadStats();
    });
    return btn;
  }));
}
renderLanguageButtons();

$('btn_settings').addEventListener('click', () => $('dialog_settings').showModal());
$('btn_close_settings').addEventListener('click', () => $('dialog_settings').close());
function renderThemeButtons() {
  document.querySelectorAll('[data-set-theme]').forEach((btn) => btn.setAttribute('aria-pressed', btn.dataset.setTheme === currentTheme()));
}
document.querySelectorAll('[data-set-theme]').forEach((btn) => btn.addEventListener('click', () => {
  setTheme(btn.dataset.setTheme);
  renderThemeButtons();
}));
renderThemeButtons();
$('form_title').addEventListener('submit', async (e) => {
  e.preventDefault();
  await request('admin:setTitle', { title: $('input_title').value }).then(() => toast(at('saved')), (err) => toast(errorText(err)));
});

$('form_password').addEventListener('submit', (e) => {
  e.preventDefault();
  setPassword($('input_password').value);
});
$('btn_remove_password').addEventListener('click', () => {
  if (confirm(at('confirmRemovePassword'))) setPassword('');
});

async function setPassword(password) {
  try {
    const result = await request('admin:setPassword', { password });
    token = result.token;
    storageSet('adminToken', token);
    $('input_password').value = '';
    toast(at(password ? 'passwordSaved' : 'passwordRemoved'));
  } catch (err) {
    toast(errorText(err));
  }
}

// ---- statistics ----
$('stats_channel').addEventListener('change', loadStats);
$('stats_days').addEventListener('change', loadStats);

async function loadStats() {
  if (!state) return;
  let data;
  try {
    data = await request('admin:stats', { channelId: $('stats_channel').value || '*', days: $('stats_days').value });
  } catch (err) {
    return toast(errorText(err));
  }
  const select = $('stats_channel');
  const selected = select.value;
  const names = { ...data.channels };
  for (const c of state.channels) names[c.id] = c.name;
  select.replaceChildren(new Option(at('allChannels'), '*'), ...Object.entries(names).map(([id, name]) => new Option(name, id)));
  select.value = names[selected] ? selected : '*';

  $('stats_empty').hidden = data.perDay.length > 0;
  const byDay = Object.fromEntries(data.perDay.map((d) => [d.day, d]));
  const timeline = [];
  for (let i = Number($('stats_days').value) - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const day = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    timeline.push({ label: formatDay(day, true), value: byDay[day]?.avg || 0, max: byDay[day]?.max || 0 });
  }
  $('chart_days').replaceChildren(barChart(timeline, false, $('chart_days').clientWidth));
  const order = [1, 2, 3, 4, 5, 6, 0];
  $('chart_weekdays').replaceChildren(barChart(order.map((w) => data.perWeekday[w]).map((w) => ({ label: at('weekdaysShort')[w.weekday], value: w.avg, max: w.max })), true, $('chart_weekdays').clientWidth));
  $('stats_table').replaceChildren(...data.perDay.slice().reverse().map((d) => {
    const row = document.createElement('tr');
    const minutes = `${Math.floor(d.minutes / 60)}:${String(d.minutes % 60).padStart(2, '0')} h`;
    for (const [text, cls] of [[formatDay(d.day), ''], [at('weekdays')[new Date(`${d.day}T12:00:00`).getDay()], ''], [d.avg, 'num'], [d.max, 'num'], [minutes, 'num']]) {
      const cell = document.createElement('td');
      cell.textContent = text;
      cell.className = cls;
      row.append(cell);
    }
    return row;
  }));
}

function formatDay(day, short = false) {
  const [y, m, d] = day.split('-');
  return short ? `${d}.${m}.` : `${d}.${m}.${y}`;
}

function barChart(items, showValues = false, width = 640) {
  const ns = 'http://www.w3.org/2000/svg';
  width = Math.max(280, width || 640);
  const height = 200;
  const bottom = 22;
  const top = 18;
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'chart');
  if (!items.length) return svg;
  const peak = Math.max(1, ...items.map((i) => i.max || i.value));
  const slot = width / items.length;
  const barWidth = Math.max(2, Math.min(40, slot * 0.7));
  const y = (v) => height - bottom - (v / peak) * (height - bottom - top);
  const add = (tag, attrs, text) => {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (text != null) el.textContent = text;
    svg.append(el);
    return el;
  };
  add('line', { x1: 0, x2: width, y1: y(peak), y2: y(peak), class: 'grid' });
  add('text', { x: 0, y: y(peak) - 4 }, `max ${peak}`);
  const labelEvery = Math.ceil(items.length / Math.max(4, Math.floor(width / 56)));
  items.forEach((item, i) => {
    const x = i * slot + (slot - barWidth) / 2;
    if (item.max) add('rect', { x, y: y(item.max), width: barWidth, height: Math.max(0, height - bottom - y(item.max)), rx: 3, class: 'bar-max' });
    add('rect', { x, y: y(item.value), width: barWidth, height: Math.max(0, height - bottom - y(item.value)), rx: 3, class: 'bar' })
      .append(Object.assign(document.createElementNS(ns, 'title'), { textContent: `${item.label}: ${at('average')} ${item.value}, ${at('maximum')} ${item.max}` }));
    if (showValues && item.value) add('text', { x: x + barWidth / 2, y: y(item.value) - 4, 'text-anchor': 'middle', class: 'value' }, item.value);
    if (i % labelEvery === 0) add('text', { x: x + barWidth / 2, y: height - 6, 'text-anchor': 'middle' }, item.label);
  });
  return svg;
}

// ---- misc ----
let toastTimer = null;
function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
}
