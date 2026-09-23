// Entry point: screens, lobby, network message handling and the render loop.
import { Net } from './net.js';
import { Renderer } from './render.js';
import { initSprites, buildDigits, iconUrl, portraitUrl } from './sprites.js';
import { initInput, moveVector, padPressed, setInputEnabled } from './input.js';
import { initAudio, sfx, startMusic, stopMusic, loadAudioSettings, audioSettings, setVolume } from './audio.js';
import { ClientGame } from './state.js';
import {
  CHARACTERS, CHAR_BY_ID, WEAPONS, PASSIVES, STAGES, STAGE_BY_ID, RUN_LENGTHS, POWERUPS, powerupCost,
  SLOT_COLORS, describeUpgrade, EVOLUTIONS, weaponMaxLevel,
} from '/shared/data.js';
import { GF } from '/shared/protocol.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const isEnter = (e) => e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.keyCode === 13;
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ------------------------------------------------------------------ persistence
const store = {
  get(k, d) { try { const v = localStorage.getItem('nfs:' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('nfs:' + k, JSON.stringify(v)); } catch {} },
};
function sessionToken() {
  try { return sessionStorage.getItem('nfs:token') || ''; } catch { return ''; }
}
function saveToken(t) { try { sessionStorage.setItem('nfs:token', t); } catch {} }

const state = {
  screen: 'title',
  room: null,
  slot: -1,
  lobby: null,
  game: null,
  gameOver: false,
  offer: null,
  focus: 0,
  paused: false,
  pausedBy: '',
  waiting: [],
  name: store.get('name', ''),
  char: store.get('char', 'varek'),
  gold: store.get('gold', 0),
  powerups: store.get('powerups', {}),
  opts: store.get('opts', { numbers: true, shake: true }),
  rooms: [],
  settingsReturn: null,
  awaitingJoin: null,
};
if (!CHAR_BY_ID[state.char]) state.char = 'varek';
window.__nfs = state; // handy for debugging from the console
loadAudioSettings(store.get('audio', {}));

// ------------------------------------------------------------------ boot
const canvas = $('game');
const renderer = new Renderer(canvas);
const net = new Net();
window.__net = net;
const menuBats = Array.from({ length: 16 }, () => ({ x: (Math.random() - 0.5) * 1100, y: (Math.random() - 0.5) * 600, p: Math.random() * 10, vx: Math.random() < 0.5 ? -1 : 1 }));

initSprites();
document.fonts && document.fonts.ready.then(() => { buildDigits(); });
window.addEventListener('resize', () => renderer.resize());

initInput(canvas, { onKey });
document.addEventListener('pointerdown', () => initAudio(), { capture: true });
window.addEventListener('keydown', () => initAudio(), { capture: true });
canvas.addEventListener('click', () => { if (state.game && state.game.dead) state.game.cycleSpectate(); });

$('name-input').value = state.name;
$('lobby-chat-input').value = '';
$('chat-input').value = '';
const hashCode = (location.hash || '').replace('#', '').toUpperCase().slice(0, 4);
if (hashCode) $('code-input').value = hashCode;
updateTitleGold();
buildCharGrid();
buildHowTo();
bindUI();

net.on('open', () => {
  $('conn-status').textContent = 'Connected';
  $('reconnecting').classList.add('hidden');
  net.send({ t: 'hello', token: sessionToken() });
});
net.on('close', ({ was }) => {
  $('conn-status').textContent = 'Connecting…';
  if (was && state.room) $('reconnecting').classList.remove('hidden');
});
net.onBinary = (buf) => { if (state.game && !state.gameOver) state.game.onSnapshot(buf); };

net.on('welcome', (m) => {
  saveToken(m.token);
  renderRooms(m.rooms);
  // if we were in a room and the server did not resume us, fall back to the title screen
  if (state.room) {
    const was = state.room;
    setTimeout(() => {
      if (state.room === was && !state.resumed) { leaveToTitle(); toast(`Room ${was} is no longer available.`, '#ff8a95'); }
    }, 1500);
    state.resumed = false;
  } else if (hashCode && state.name && !state.autoJoined) {
    state.autoJoined = true;
    joinRoom(hashCode);
  }
});
net.on('rooms', (m) => renderRooms(m.rooms));
// Pasting an invite link into an already-open tab only changes the hash: join from there too.
window.addEventListener('hashchange', () => {
  const code = (location.hash || '').replace('#', '').toUpperCase().slice(0, 4);
  if (code.length !== 4 || code === state.room) return;
  $('code-input').value = code;
  if (!state.room && state.screen === 'title' && $('name-input').value.trim()) joinRoom(code);
});
net.on('error', (m) => { toast(m.msg, '#ff8a95'); state.awaitingJoin = null; });
net.on('joined', (m) => {
  state.room = m.code;
  state.slot = m.slot;
  state.resumed = true;
  state.awaitingJoin = null;
  history.replaceState(null, '', '#' + m.code);
  if (!state.game) showScreen('lobby');
  updateInviteLine();
});
net.on('left', () => leaveToTitle());
net.on('lobby', (m) => renderLobby(m));
net.on('start', (m) => startGame(m));
net.on('roster', (m) => { if (state.game) { state.game.onRoster(m); if (state.paused) renderPause(); } });
net.on('pos', (m) => { if (state.game) state.game.teleport(m); });
net.on('offer', (m) => showOffer(m));
net.on('offerDone', () => hideOffer());
net.on('waiting', (m) => { state.waiting = m.names; updateWaiting(); });
net.on('pause', (m) => { state.paused = m.paused; state.pausedBy = m.by; updatePause(); });
net.on('chest', (m) => showChest(m));
net.on('toast', (m) => { toast(m.text, m.color, m.big); if (m.big && /awoken/.test(m.text)) sfx.boss(); if (/evolved/.test(m.text)) sfx.evolve(); });
net.on('chat', (m) => addChat(m));
net.on('over', (m) => showResults(m.results));
net.connect();

// ------------------------------------------------------------------ screens
function showScreen(name) {
  state.screen = name;
  for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden');
  if (name) $('screen-' + name).classList.remove('hidden');
  setInputEnabled(!name);
}

function leaveToTitle() {
  state.room = null;
  state.slot = -1;
  state.lobby = null;
  endGameView();
  history.replaceState(null, '', location.pathname);
  $('results').classList.add('hidden');
  showScreen('title');
}

function ensureName() {
  let n = $('name-input').value.trim();
  if (!n) { n = 'Survivor' + Math.floor(Math.random() * 90 + 10); $('name-input').value = n; }
  state.name = n;
  store.set('name', n);
  return n;
}

function joinRoom(code) {
  code = String(code || '').toUpperCase().trim();
  if (code.length !== 4) { toast('Room codes are 4 letters.', '#ff8a95'); return; }
  state.awaitingJoin = code;
  net.send({ t: 'join', code, name: ensureName(), char: state.char, powerups: state.powerups });
}

function bindUI() {
  const click = (id, fn) => $(id).addEventListener('click', (e) => { initAudio(); sfx.click(); fn(e); });
  document.addEventListener('mouseover', (e) => { if (e.target.closest && e.target.closest('.btn, .card, .char-card')) sfx.hover(); });
  click('btn-create', () => net.send({ t: 'create', name: ensureName(), char: state.char, powerups: state.powerups }));
  click('btn-join', () => joinRoom($('code-input').value));
  $('code-input').addEventListener('keydown', (e) => { if (isEnter(e)) joinRoom($('code-input').value); });
  $('name-input').addEventListener('change', () => ensureName());
  click('btn-shop', () => { renderShop(); showScreen('shop'); });
  click('btn-shop-back', () => { updateTitleGold(); showScreen(state.room ? 'lobby' : 'title'); });
  click('btn-howto', () => showScreen('howto'));
  click('btn-howto-back', () => showScreen('title'));
  click('btn-settings', () => openSettings());
  click('btn-pause-settings', () => openSettings());
  click('btn-settings-close', () => closeSettings());
  click('btn-refund', () => refundAll());
  click('btn-leave', () => net.send({ t: 'leave' }));
  click('btn-copy', () => copyInvite());
  click('btn-ready', () => {
    const me = state.lobby && state.lobby.members.find(m => m.slot === state.slot);
    net.send({ t: 'ready', v: !(me && me.ready) });
  });
  click('btn-start', () => net.send({ t: 'start' }));
  click('btn-resume', () => net.send({ t: 'pause', v: false }));
  click('btn-quit', () => { if (confirm('Leave this run? Your friends can keep playing.')) net.send({ t: 'leave' }); });
  click('btn-reroll', () => net.send({ t: 'reroll' }));
  click('btn-results-continue', () => { $('results').classList.add('hidden'); endGameView(); showScreen(state.room ? 'lobby' : 'title'); });
  click('btn-pause-touch', () => togglePause());
  $('set-private').addEventListener('change', (e) => net.send({ t: 'settings', isPrivate: e.target.checked }));
  $('chest').addEventListener('click', () => $('chest').classList.add('hidden'));

  const chatSend = (input) => {
    const text = input.value.trim();
    if (text) net.send({ t: 'chat', text });
    input.value = '';
  };
  $('lobby-chat-input').addEventListener('keydown', (e) => { if (isEnter(e)) chatSend(e.target); e.stopPropagation(); });
  $('chat-input').addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (isEnter(e)) { chatSend(e.target); closeChat(); }
    else if (e.key === 'Escape') closeChat();
  });

  const a = audioSettings();
  $('vol-sfx').value = a.sfx; $('vol-music').value = a.music;
  $('vol-sfx').addEventListener('input', (e) => { setVolume('sfx', +e.target.value); store.set('audio', audioSettings()); sfx.coin(); });
  $('vol-music').addEventListener('input', (e) => { setVolume('music', +e.target.value); store.set('audio', audioSettings()); });
  $('opt-numbers').checked = state.opts.numbers;
  $('opt-shake').checked = state.opts.shake;
  $('opt-numbers').addEventListener('change', (e) => { state.opts.numbers = e.target.checked; store.set('opts', state.opts); });
  $('opt-shake').addEventListener('change', (e) => { state.opts.shake = e.target.checked; store.set('opts', state.opts); });

  if ('ontouchstart' in window) $('btn-pause-touch').dataset.touch = '1';
}

function openSettings() { $('settings').classList.remove('hidden'); }
function closeSettings() { $('settings').classList.add('hidden'); }

function updateTitleGold() { $('title-gold').textContent = state.gold ? `· ${state.gold}g` : ''; }

function renderRooms(rooms) {
  state.rooms = rooms || [];
  const list = $('room-list');
  list.innerHTML = '';
  $('room-list-wrap').classList.toggle('hidden', !state.rooms.length);
  for (const r of state.rooms) {
    const it = el('div', 'room-item', `<code>${esc(r.code)}</code><span class="grow">${esc(r.host)}'s room · ${esc(STAGE_BY_ID[r.stage] ? STAGE_BY_ID[r.stage].name : r.stage)}</span>` +
      `<span class="muted">${r.players}/6 ${r.state === 'game' ? '· in run' : ''}</span>`);
    it.addEventListener('click', () => { sfx.click(); joinRoom(r.code); });
    list.appendChild(it);
  }
}

// If the host is browsing via localhost, a localhost link is useless to friends:
// prefer the server's public tunnel URL, then its LAN address.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
let serverInfo = null;
async function inviteBase() {
  if (!LOCAL_HOSTS.has(location.hostname)) return { base: location.origin, kind: 'public' };
  try { serverInfo = await (await fetch('/info', { cache: 'no-store' })).json(); } catch { serverInfo = null; }
  if (serverInfo && serverInfo.publicUrl) return { base: serverInfo.publicUrl, kind: 'public' };
  if (serverInfo && serverInfo.lan && serverInfo.lan.length) return { base: serverInfo.lan[0], kind: 'lan' };
  return { base: location.origin, kind: 'local' };
}

async function updateInviteLine() {
  const line = $('invite-line');
  if (!state.room) return;
  const { base, kind } = await inviteBase();
  const url = `${base}/#${state.room}`;
  line.dataset.url = url;
  line.innerHTML = kind === 'public' ? `Invite link: <code>${esc(url)}</code>`
    : kind === 'lan' ? `Same Wi-Fi link: <code>${esc(url)}</code>. For internet play, start the server with <code>npm run share</code>.`
    : 'Friends can’t reach localhost. See README for how to share your server.';
}

async function copyInvite() {
  const { base, kind } = await inviteBase();
  const url = `${base}/#${state.room}`;
  const msg = kind === 'lan' ? 'Copied your same-Wi-Fi link. For internet play run "npm run share".' : 'Invite link copied! Send it to your friends.';
  const done = () => toast(msg, '#7dffa0');
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(done, () => prompt('Copy this link:', url));
  else prompt('Copy this link:', url);
}

// ------------------------------------------------------------------ lobby
function buildCharGrid() {
  const grid = $('char-grid');
  grid.innerHTML = '';
  for (const c of CHARACTERS) {
    const card = el('button', 'char-card', `<img alt="" src="${portraitUrl(c.id, 3)}"><span>${esc(c.name.split(' ').pop())}</span>`);
    card.dataset.id = c.id;
    card.addEventListener('click', () => {
      sfx.click();
      state.char = c.id;
      store.set('char', c.id);
      net.send({ t: 'char', char: c.id });
      updateCharSelection();
    });
    grid.appendChild(card);
  }
  updateCharSelection();
}

function updateCharSelection() {
  for (const card of document.querySelectorAll('.char-card')) card.classList.toggle('sel', card.dataset.id === state.char);
  const c = CHAR_BY_ID[state.char];
  const w = WEAPONS[c.weapon];
  $('char-detail').innerHTML = `<img class="big" alt="" src="${portraitUrl(c.id, 5)}">
    <div><div class="nm">${esc(c.name)}</div><div class="ttl">${esc(c.title)}</div>
    <div class="wpn"><img alt="" src="${iconUrl(c.weapon)}"><div><b>${esc(w.name)}</b><div class="muted">${esc(w.desc)}</div></div></div>
    <div class="bonus">${esc(c.bonus)}</div></div>`;
}

function segButtons(container, items, current, isHost, onPick) {
  container.innerHTML = '';
  for (const [value, label] of items) {
    const b = el('button', value === current ? 'sel' : '', esc(label));
    b.disabled = !isHost;
    b.addEventListener('click', () => { sfx.click(); onPick(value); });
    container.appendChild(b);
  }
}

function renderLobby(l) {
  state.lobby = l;
  const isHost = l.host === state.slot;
  $('lobby-code').textContent = l.code;
  $('lobby-count').textContent = `${l.members.length}/6`;
  const ul = $('lobby-players');
  ul.innerHTML = '';
  for (const m of [...l.members].sort((a, b) => a.slot - b.slot)) {
    const li = el('li', 'lp' + (m.connected ? '' : ' off'));
    li.style.borderLeftColor = SLOT_COLORS[m.slot];
    const c = CHAR_BY_ID[m.char];
    li.innerHTML = `<img alt="" src="${portraitUrl(m.char, 2)}"><span class="nm">${esc(m.name)}${m.slot === state.slot ? ' <span class="muted">(you)</span>' : ''}<br><span class="muted" style="font-size:12px">${esc(c ? c.name : '')}</span></span>` +
      (m.slot === l.host ? '<span class="tag host">HOST</span>' : '') +
      (!m.connected ? '<span class="tag">offline</span>' : m.slot !== l.host ? `<span class="tag ${m.ready ? 'ready' : ''}">${m.ready ? 'READY' : 'not ready'}</span>` : '');
    ul.appendChild(li);
  }
  const send = (patch) => net.send({ t: 'settings', ...l.settings, ...patch });
  segButtons($('set-stage'), STAGES.map(s => [s.id, s.name]), l.settings.stage, isHost, (v) => send({ stage: v }));
  segButtons($('set-length'), RUN_LENGTHS.map(n => [n, `${n} min`]), l.settings.length, isHost, (v) => send({ length: v }));
  segButtons($('set-diff'), [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], l.settings.difficulty, isHost, (v) => send({ difficulty: v }));
  $('set-private').checked = !!l.isPrivate;
  $('set-private').disabled = !isHost;
  $('host-note').textContent = isHost ? '' : '(host picks)';

  const me = l.members.find(m => m.slot === state.slot);
  if (me && me.char !== state.char) net.send({ t: 'char', char: state.char });
  $('btn-start').classList.toggle('hidden', !isHost);
  $('btn-ready').classList.toggle('hidden', isHost);
  $('btn-ready').classList.toggle('on', !!(me && me.ready));
  $('btn-ready').textContent = me && me.ready ? 'Ready ✓' : 'Ready';
  const others = l.members.filter(m => m.slot !== l.host && m.connected);
  const notReady = others.filter(m => !m.ready).length;
  let hint = '';
  if (l.state === 'game') hint = 'A run is in progress. You will join it shortly.';
  else if (isHost) hint = !others.length ? 'Share the code or invite link, or start solo.' : notReady ? `${notReady} not ready yet (you can start anyway)` : 'Everyone is ready!';
  else hint = 'Waiting for the host to start the run.';
  $('lobby-hint').textContent = hint;
}

// ------------------------------------------------------------------ game lifecycle
function startGame(m) {
  $('results').classList.add('hidden');
  state.game = new ClientGame(m, net);
  state.game.fx.showNumbers = state.opts.numbers;
  state.gameOver = false;
  state.paused = !!m.paused;
  state.pausedBy = m.pausedBy || '';
  state.offer = null;
  state.waiting = [];
  hideOffer();
  updatePause();
  showScreen(null);
  document.body.classList.add('ingame');
  if ($('btn-pause-touch').dataset.touch) $('btn-pause-touch').classList.remove('hidden');
  initAudio();
  startMusic();
}

function endGameView() {
  state.game = null;
  state.gameOver = false;
  state.offer = null;
  state.paused = false;
  hideOffer();
  $('pause').classList.add('hidden');
  $('waiting').classList.add('hidden');
  $('btn-pause-touch').classList.add('hidden');
  document.body.classList.remove('ingame');
  $('chest').classList.add('hidden');
  closeChat();
  stopMusic();
}

function togglePause() {
  if (!state.game || state.gameOver) return;
  net.send({ t: 'pause', v: !state.paused });
}

function updatePause() {
  const show = state.paused && state.game && !state.gameOver;
  $('pause').classList.toggle('hidden', !show);
  if (show) renderPause();
  updateWaiting();
}

function fmtStat(k, v) {
  switch (k) {
    case 'maxHp': return String(Math.round(v));
    case 'recovery': return v.toFixed(1) + '/s';
    case 'armor': case 'amount': case 'revival': return (v >= 0 ? '+' : '') + v;
    case 'cooldown': return Math.abs(1 - v) < 0.005 ? '+0%' : (v < 1 ? '-' : '+') + Math.round(Math.abs(1 - v) * 100) + '%';
    default: return Math.abs(v - 1) < 0.005 ? '+0%' : (v > 1 ? '+' : '-') + Math.round(Math.abs(v - 1) * 100) + '%';
  }
}

function renderPause() {
  const g = state.game;
  $('pause-by').textContent = state.pausedBy ? `Paused by ${state.pausedBy}` : '';
  const info = g && g.myInfo;
  const build = $('pause-build');
  build.innerHTML = '';
  const stats = $('pause-stats');
  stats.innerHTML = '';
  if (!info) return;
  for (const [id, lvl] of info.weapons) {
    const evo = WEAPONS[id].evolved;
    build.appendChild(el('div', 'inv' + (evo ? ' evo' : ''), `<img alt="" src="${iconUrl(id)}"><span>${evo ? 'EVO' : 'Lv ' + lvl}</span>`));
  }
  for (const [id, lvl] of info.passives) build.appendChild(el('div', 'inv', `<img alt="" src="${iconUrl(id)}"><span>Lv ${lvl}</span>`));
  const labels = { maxHp: 'Max Health', recovery: 'Recovery', armor: 'Armor', moveSpeed: 'Move Speed', might: 'Might', area: 'Area',
    speed: 'Speed', duration: 'Duration', amount: 'Amount', cooldown: 'Cooldown', luck: 'Luck', growth: 'Growth', greed: 'Greed', magnet: 'Magnet' };
  for (const [k, label] of Object.entries(labels)) stats.appendChild(el('div', '', `<span>${label}</span><b>${fmtStat(k, info.stats[k])}</b>`));
}

// ------------------------------------------------------------------ level up
function optionView(o, info) {
  const owned = (id) => info && info.weapons.some(w => w[0] === id);
  const ownedP = (id) => info && info.passives.some(p => p[0] === id);
  if (o.type === 'weapon') {
    const w = WEAPONS[o.id];
    let hint = '';
    if (w.evolve) hint = `${ownedP(w.evolve.with) ? '✓ ' : ''}Evolves with ${PASSIVES[w.evolve.with].name}`;
    return { icon: iconUrl(o.id), name: w.name, lv: o.level === 1 ? '' : `Lv ${o.level}`, isNew: o.level === 1, desc: describeUpgrade('weapon', o.id, o.level), hint };
  }
  if (o.type === 'passive') {
    const p = PASSIVES[o.id];
    const pairs = Object.entries(EVOLUTIONS).filter(([, e]) => e.with === o.id).map(([wid]) => wid);
    const mine = pairs.filter(owned);
    const hint = mine.length ? `✓ Evolves your ${WEAPONS[mine[0]].name}` : pairs.length ? `Pairs with ${WEAPONS[pairs[0]].name}` : '';
    return { icon: iconUrl(o.id), name: p.name, lv: o.level === 1 ? '' : `Lv ${o.level}`, isNew: o.level === 1, desc: describeUpgrade('passive', o.id, o.level), hint };
  }
  if (o.type === 'gold') return { icon: iconUrl('gold'), name: 'Gold Pouch', lv: '', desc: 'Take 25 gold instead.', hint: '' };
  return { icon: iconUrl('heal'), name: 'Roast Chicken', lv: '', desc: 'Restore 30 health.', hint: '' };
}

function showOffer(m) {
  state.offer = m;
  state.focus = 0;
  const info = state.game && state.game.myInfo;
  $('levelup-title').textContent = m.pausing ? 'LEVEL UP!' : 'CATCH UP!';
  $('levelup-sub').textContent = m.pausing
    ? (m.remaining > 1 ? `Level ${m.level} · ${m.remaining} picks queued` : `Level ${m.level}`)
    : `You joined mid-run. ${m.remaining} upgrade${m.remaining > 1 ? 's' : ''} to pick (you're protected while choosing).`;
  const box = $('levelup-cards');
  box.innerHTML = '';
  m.options.forEach((o, i) => {
    const v = optionView(o, info);
    const card = el('button', 'card', `<div class="ic"><img alt="" src="${v.icon}"></div>
      <div class="grow"><div class="top"><span class="nm">${esc(v.name)}</span>${v.isNew ? '<span class="new">NEW!</span>' : `<span class="lv">${esc(v.lv)}</span>`}</div>
      <div class="ds">${esc(v.desc)}</div>${v.hint ? `<div class="evo-hint">${esc(v.hint)}</div>` : ''}</div><span class="key">${i + 1}</span>`);
    card.addEventListener('click', () => choose(i));
    card.addEventListener('mouseenter', () => { state.focus = i; focusCard(); });
    box.appendChild(card);
  });
  $('btn-reroll').classList.toggle('hidden', !(m.rerolls > 0));
  $('reroll-n').textContent = m.rerolls;
  $('levelup').classList.remove('hidden');
  focusCard();
  updateWaiting();
}

function focusCard() {
  [...$('levelup-cards').children].forEach((c, i) => c.classList.toggle('focus', i === state.focus));
}

function choose(i) {
  if (!state.offer) return;
  sfx.pick();
  for (const c of $('levelup-cards').children) c.classList.add('disabled');
  net.send({ t: 'pick', i });
  state.offer = null;
}

function hideOffer() {
  $('levelup').classList.add('hidden');
  updateWaiting();
}

function updateWaiting() {
  const g = state.game;
  const levelPause = g && g.latest && (g.latest.flags & GF.LEVELUP);
  const others = state.waiting.filter(n => !(g && g.myInfo && n === g.myInfo.name));
  const show = g && !state.gameOver && !state.offer && $('levelup').classList.contains('hidden') && levelPause && others.length && !state.paused;
  $('waiting').classList.toggle('hidden', !show);
  if (show) $('waiting').textContent = `Waiting for ${others.join(', ')} to choose an upgrade…`;
}

// ------------------------------------------------------------------ chest, toasts, chat
let chestTimer = 0;
function showChest(m) {
  const box = $('chest');
  const evolved = m.items.some(i => i.evolved);
  let html = `<h3>${evolved ? '✦ EVOLUTION ✦' : 'Treasure!'}</h3>`;
  for (const it of m.items) {
    const name = it.type === 'weapon' ? WEAPONS[it.id].name : PASSIVES[it.id].name;
    html += `<div class="chest-item"><img alt="" src="${iconUrl(it.id)}"><span class="${it.evolved ? 'evolved' : ''}">${esc(name)}</span>` +
      `<span class="muted">${it.evolved ? '' : 'Lv ' + it.level}</span></div>`;
  }
  html += `<div class="chest-item gold">+${m.gold} gold</div>`;
  box.innerHTML = html;
  box.classList.remove('hidden');
  box.style.animation = 'none'; void box.offsetWidth; box.style.animation = '';
  if (evolved) sfx.evolve(); else sfx.chest();
  clearTimeout(chestTimer);
  chestTimer = setTimeout(() => box.classList.add('hidden'), evolved ? 4500 : 3200);
}

function toast(text, color = '#ffffff', big = false) {
  const t = el('div', 'toast' + (big ? ' big' : ''));
  t.textContent = text;
  t.style.color = color;
  t.style.borderColor = color;
  $('toasts').appendChild(t);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  setTimeout(() => t.remove(), 3800);
}

function addChat(m) {
  const line = `<b style="color:${SLOT_COLORS[m.slot] || '#fff'}">${esc(m.name)}</b>${esc(m.text)}`;
  const log = $('lobby-chat-log');
  log.appendChild(el('div', '', line));
  log.scrollTop = log.scrollHeight;
  while (log.children.length > 60) log.firstChild.remove();
  if (state.game) {
    const c = $('chat-log');
    const lineEl = el('div', 'chat-line', line);
    c.appendChild(lineEl);
    while (c.children.length > 6) c.firstChild.remove();
    setTimeout(() => lineEl.remove(), 10500);
  }
  if (m.slot !== state.slot) sfx.click();
}

function openChat() {
  const inp = $('chat-input');
  inp.classList.remove('hidden');
  inp.focus();
  if (state.game) state.game.blocked = true;
  setInputEnabled(false);
}
function closeChat() {
  const inp = $('chat-input');
  inp.classList.add('hidden');
  inp.blur();
  if (state.game) state.game.blocked = false;
  setInputEnabled(!state.screen);
}

// ------------------------------------------------------------------ results
function showResults(r) {
  state.gameOver = true;
  hideOffer();
  $('pause').classList.add('hidden');
  $('waiting').classList.add('hidden');
  stopMusic();
  const title = $('results-title');
  title.textContent = r.victory ? 'Dawn Breaks!' : 'The Night Wins';
  title.className = r.victory ? 'win' : 'lose';
  const mm = Math.floor(r.time / 60), ss = String(Math.floor(r.time % 60)).padStart(2, '0');
  $('results-sub').textContent = `${STAGE_BY_ID[r.stage].name} · survived ${mm}:${ss} of ${r.length}:00 · team level ${r.level} · ${r.kills.toLocaleString()} kills`;
  const box = $('results-players');
  box.innerHTML = '';
  for (const p of r.players) {
    const card = el('div', 'rp');
    card.style.borderTopColor = SLOT_COLORS[p.slot];
    const maxD = Math.max(1, ...p.weapons.map(w => w.dmg));
    let rows = '';
    for (const w of [...p.weapons].sort((a, b) => b.dmg - a.dmg)) {
      rows += `<div class="rp-row"><img alt="" src="${iconUrl(w.id)}"><div class="grow">${esc(WEAPONS[w.id].name)} <span class="muted">${WEAPONS[w.id].evolved ? 'EVO' : 'Lv ' + w.level}</span>` +
        `<div class="bar" style="width:${Math.max(2, w.dmg / maxD * 100)}%"></div></div><span>${w.dmg.toLocaleString()}</span></div>`;
    }
    const c = CHAR_BY_ID[p.char];
    card.innerHTML = `<div class="rp-head"><img alt="" src="${portraitUrl(p.char, 3)}"><div><div class="nm">${esc(p.name)}</div>` +
      `<div class="sub">${esc(c ? c.name : '')} · ${p.kills.toLocaleString()} kills</div></div></div>${rows}` +
      `<div class="rp-gold">+${p.gold.toLocaleString()} gold</div>`;
    box.appendChild(card);
  }
  const mine = r.players.find(p => p.slot === state.slot);
  if (mine) {
    state.gold += mine.gold;
    store.set('gold', state.gold);
    updateTitleGold();
  }
  $('results').classList.remove('hidden');
  if (r.victory) sfx.victory(); else sfx.defeat();
}

// ------------------------------------------------------------------ shop
const PU_ICON = { might: 'whetstone', armor: 'plate', maxhp: 'heart', recovery: 'herb', cooldown: 'tome', area: 'candelabra', speed: 'bracer',
  duration: 'hourglass', amount: 'mirror', move: 'boots', magnet: 'lodestone', luck: 'clover', growth: 'crown', greed: 'gold', revival: 'heal', reroll: 'wand' };
function renderShop() {
  $('shop-gold').textContent = state.gold.toLocaleString();
  const grid = $('shop-grid');
  grid.innerHTML = '';
  for (const [id, pu] of Object.entries(POWERUPS)) {
    const rank = state.powerups[id] || 0;
    const maxed = rank >= pu.max;
    const cost = maxed ? 0 : powerupCost(id, rank);
    const pips = Array.from({ length: pu.max }, (_, i) => `<i class="${i < rank ? 'on' : ''}"></i>`).join('');
    const card = el('div', 'pu', `<img alt="" src="${iconUrl(PU_ICON[id] || 'gold')}"><div class="grow"><div class="nm">${esc(pu.name)}</div>` +
      `<div class="pips">${pips}</div><div class="ds">${esc(pu.desc)}</div></div>`);
    const b = el('button', 'btn small' + (maxed ? ' ghost' : ''), maxed ? 'MAX' : `${cost.toLocaleString()}g`);
    b.disabled = maxed || state.gold < cost;
    b.addEventListener('click', () => {
      if (state.gold < cost || maxed) return;
      state.gold -= cost;
      state.powerups[id] = rank + 1;
      store.set('gold', state.gold);
      store.set('powerups', state.powerups);
      sfx.coin();
      renderShop();
    });
    card.appendChild(b);
    grid.appendChild(card);
  }
}
function refundAll() {
  let back = 0;
  for (const [id, rank] of Object.entries(state.powerups)) for (let r = 0; r < rank; r++) back += powerupCost(id, r);
  if (!back) return;
  state.gold += back;
  state.powerups = {};
  store.set('gold', state.gold);
  store.set('powerups', state.powerups);
  toast(`Refunded ${back.toLocaleString()} gold.`, '#ffd84a');
  renderShop();
}

function buildHowTo() {
  const t = $('evo-table');
  t.innerHTML = '';
  for (const [wid, e] of Object.entries(EVOLUTIONS)) {
    t.appendChild(el('div', 'evo', `<img alt="" src="${iconUrl(wid)}"><span>${esc(WEAPONS[wid].name)}</span><span class="arrow">+</span>` +
      `<img alt="" src="${iconUrl(e.with)}"><span>${esc(PASSIVES[e.with].name)}</span><span class="arrow">→</span>` +
      `<img alt="" src="${iconUrl(e.into)}"><span class="res">${esc(WEAPONS[e.into].name)}</span>`));
  }
}

// ------------------------------------------------------------------ keyboard / gamepad
function onKey(e, code) {
  if (!$('settings').classList.contains('hidden')) { if (code === 'Escape') { closeSettings(); return true; } return false; }
  if (!state.game || state.gameOver) {
    if (state.gameOver && (isEnter(e) || code === 'Space')) { $('btn-results-continue').click(); return true; }
    return false;
  }
  if (state.offer) {
    const n = state.offer.options.length;
    const digit = /^(Digit|Numpad)[1-4]$/.test(code) ? +code.slice(-1) : 0;
    if (digit) { if (digit - 1 < n) choose(digit - 1); return true; }
    if (code === 'ArrowUp' || code === 'KeyW') { state.focus = (state.focus + n - 1) % n; focusCard(); sfx.hover(); return true; }
    if (code === 'ArrowDown' || code === 'KeyS') { state.focus = (state.focus + 1) % n; focusCard(); sfx.hover(); return true; }
    if (isEnter(e) || code === 'Space') { choose(state.focus); return true; }
    if (code === 'KeyR' && state.offer.rerolls > 0) { net.send({ t: 'reroll' }); return true; }
    return false;
  }
  if (code === 'Escape' || code === 'KeyP') { togglePause(); return true; }
  if (isEnter(e)) { openChat(); return true; }
  if (code === 'Tab') { state.game.cycleSpectate(); return true; }
  return false;
}

function handlePad() {
  const pressed = padPressed();
  if (!pressed.length) return;
  if (state.offer) {
    const n = state.offer.options.length;
    for (const b of pressed) {
      if (b === 12) { state.focus = (state.focus + n - 1) % n; focusCard(); }
      else if (b === 13) { state.focus = (state.focus + 1) % n; focusCard(); }
      else if (b === 0) { choose(state.focus); return; }
      else if (b === 2 && state.offer.rerolls > 0) net.send({ t: 'reroll' });
    }
    return;
  }
  if (state.game && !state.gameOver) {
    if (pressed.includes(9)) togglePause();
    if (pressed.includes(0) && state.game.dead) state.game.cycleSpectate();
  } else if (state.gameOver && pressed.includes(0)) $('btn-results-continue').click();
}

// ------------------------------------------------------------------ loop
let last = performance.now();
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  renderer.fps += ((dt > 0 ? 1 / dt : 60) - renderer.fps) * 0.05;
  handlePad();
  const g = state.game;
  if (g) {
    if (!state.gameOver) g.update(dt, moveVector());
    if (!state.opts.shake) g.shake = 0;
    g.fx.showNumbers = state.opts.numbers;
    const fr = g.buildFrame(performance.now());
    if (fr) renderer.drawGame(g, fr, t);
    else renderer.drawMenu(t, menuBats);
    if (g.latest && !state.offer) updateWaitingThrottled(t);
  } else {
    for (const b of menuBats) { b.x += b.vx * dt * 40; if (b.x > 700) b.x = -700; if (b.x < -700) b.x = 700; }
    renderer.drawMenu(t, menuBats);
  }
  requestAnimationFrame(frame);
}
let lastWaitUpd = 0;
function updateWaitingThrottled(t) { if (t - lastWaitUpd > 250) { lastWaitUpd = t; updateWaiting(); } }
requestAnimationFrame(frame);
