// A room = lobby + (optionally) a running game. Members keep their slot across reconnects.
import { Game } from './game.js';
import { CHAR_BY_ID, CHARACTERS, STAGE_BY_ID, RUN_LENGTHS, MAX_PLAYERS, SNAP_EVERY, WEAPONS, PASSIVES, weaponMaxLevel } from '../shared/data.js';

const DEV = process.argv.includes('--dev') || process.env.NFS_DEV === '1';

const RECONNECT_GRACE = 90_000;

export class Room {
  constructor(code, hub, isPrivate = false) {
    this.code = code;
    this.hub = hub;
    this.isPrivate = isPrivate;
    this.members = [];
    this.hostSlot = 0;
    this.state = 'lobby';
    this.settings = { stage: 'forest', length: 20, difficulty: 'normal' };
    this.game = null;
    this.tickN = 0;
    this.createdAt = Date.now();
  }

  get connectedCount() { return this.members.filter(m => m.connected).length; }
  memberBySlot(slot) { return this.members.find(m => m.slot === slot); }

  freeSlot() {
    for (let s = 0; s < MAX_PLAYERS; s++) if (!this.members.some(m => m.slot === s)) return s;
    return -1;
  }

  // ------------------------------------------------------------ membership
  add(client, info) {
    const slot = this.freeSlot();
    if (slot < 0) return null;
    const m = {
      slot, token: client.token, client, name: info.name, char: CHAR_BY_ID[info.char] ? info.char : CHARACTERS[0].id,
      powerups: info.powerups || {}, ready: false, connected: true, goneAt: 0,
    };
    if (!this.members.length) this.hostSlot = slot;
    this.members.push(m);
    client.room = this;
    client.member = m;
    client.send({ t: 'joined', code: this.code, slot, host: this.hostSlot === slot });
    if (this.game) this.joinRunningGame(m, true);
    else this.broadcastLobby();
    this.hub.roomsChanged();
    return m;
  }

  joinRunningGame(m, fresh) {
    const g = this.game;
    let p = g.getPlayer(m.slot);
    if (!p || p.left) {
      if (p && p.left) g.players.splice(g.players.indexOf(p), 1);
      p = g.lateJoin({ slot: m.slot, name: m.name, char: m.char, powerups: m.powerups });
      this.broadcast({ t: 'toast', text: `${m.name} joined the fight!`, color: '#7dd8ff' }, m);
    } else {
      g.setConnected(m.slot, true);
      if (!fresh) this.broadcast({ t: 'toast', text: `${m.name} reconnected.`, color: '#7dd8ff' }, m);
    }
    this.sendStart(m, p);
    this.broadcastLobby();
    g.rosterDirty = true;
  }

  sendStart(m, p) {
    const g = this.game;
    m.client.send({ t: 'start', stage: g.stage.id, length: g.lengthMin, slot: m.slot, x: p.x, y: p.y, tp: p.tp,
      paused: !!g.manualPause, pausedBy: g.manualPause ? g.manualPause.name : '' });
    m.client.send(g.roster());
  }

  reconnect(m, client) {
    if (m.client && m.client !== client) { try { m.client.room = null; m.client.member = null; m.client.ws.close(); } catch {} }
    m.client = client;
    m.connected = true;
    m.goneAt = 0;
    client.room = this;
    client.member = m;
    client.send({ t: 'joined', code: this.code, slot: m.slot, host: this.hostSlot === m.slot, reconnect: true });
    if (this.game) this.joinRunningGame(m, false);
    else this.broadcastLobby();
  }

  disconnect(m) {
    m.connected = false;
    m.client = null;
    m.goneAt = Date.now();
    if (this.game) this.game.setConnected(m.slot, false);
    if (this.hostSlot === m.slot) this.pickHost();
    this.broadcastLobby();
    this.hub.roomsChanged();
  }

  remove(m) {
    const i = this.members.indexOf(m);
    if (i < 0) return;
    this.members.splice(i, 1);
    if (m.client) { m.client.room = null; m.client.member = null; }
    if (this.game) {
      this.game.removePlayer(m.slot);
      this.broadcast({ t: 'toast', text: `${m.name} left the run.`, color: '#aaaaaa' });
    }
    if (!this.members.length) { this.hub.deleteRoom(this); return; }
    if (this.hostSlot === m.slot) this.pickHost();
    this.broadcastLobby();
    this.hub.roomsChanged();
  }

  pickHost() {
    const next = this.members.find(m => m.connected) || this.members[0];
    if (next) this.hostSlot = next.slot;
  }

  // ------------------------------------------------------------ messaging
  send(m, msg) { if (m && m.connected && m.client) m.client.send(msg); }
  sendTo(slot, msg) { this.send(this.memberBySlot(slot), msg); }
  sendBinary(slot, buf) {
    const m = this.memberBySlot(slot);
    if (m && m.connected && m.client) m.client.sendBinary(buf);
  }
  broadcast(msg, except) {
    const s = JSON.stringify(msg);
    for (const m of this.members) if (m !== except && m.connected && m.client) m.client.sendRaw(s);
  }

  lobbyState() {
    return {
      t: 'lobby', code: this.code, host: this.hostSlot, state: this.state, settings: this.settings, isPrivate: this.isPrivate,
      members: this.members.map(m => ({ slot: m.slot, name: m.name, char: m.char, ready: m.ready, connected: m.connected })),
    };
  }
  broadcastLobby() { this.broadcast(this.lobbyState()); }

  handle(m, msg) {
    const isHost = m.slot === this.hostSlot;
    switch (msg.t) {
      case 'leave': this.remove(m); m.client && m.client.send({ t: 'left' }); break;
      case 'char':
        if (!this.game && CHAR_BY_ID[msg.char]) { m.char = msg.char; this.broadcastLobby(); }
        break;
      case 'ready':
        if (!this.game) { m.ready = !!msg.v; this.broadcastLobby(); }
        break;
      case 'settings':
        if (isHost && !this.game) {
          if (STAGE_BY_ID[msg.stage]) this.settings.stage = msg.stage;
          if (RUN_LENGTHS.includes(msg.length)) this.settings.length = msg.length;
          if (['easy', 'normal', 'hard'].includes(msg.difficulty)) this.settings.difficulty = msg.difficulty;
          if (typeof msg.isPrivate === 'boolean') { this.isPrivate = msg.isPrivate; this.hub.roomsChanged(); }
          this.broadcastLobby();
        }
        break;
      case 'start':
        if (isHost && !this.game) this.start();
        break;
      case 'in': if (this.game) this.game.input(m.slot, msg); break;
      case 'pick': if (this.game) this.game.choose(m.slot, msg.i | 0); break;
      case 'reroll': if (this.game) this.game.reroll(m.slot); break;
      case 'pause': if (this.game) this.game.togglePause(m.slot, !!msg.v); break;
      case 'chat': {
        const text = String(msg.text || '').replace(/[\u0000-\u001f]/g, '').slice(0, 140).trim();
        if (DEV && text.startsWith('/') && this.game) { this.devCommand(m, text); break; }
        if (text) this.broadcast({ t: 'chat', slot: m.slot, name: m.name, text });
        break;
      }
    }
  }

  // Testing helpers, only enabled when the server runs with --dev
  devCommand(m, text) {
    const g = this.game, p = g.getPlayer(m.slot);
    if (!p) return;
    const [cmd, a, b] = text.slice(1).split(/\s+/);
    const say = (t) => this.sendTo(m.slot, { t: 'toast', text: t, color: '#8af' });
    switch (cmd) {
      case 'xp': g.gainXp(+a || 100, p); break;
      case 'god': p.invuln = p.invuln > 1000 ? 0 : 1e9; say(p.invuln ? 'god mode on' : 'god mode off'); break;
      case 'time': g.time = Math.max(0, (+a || 0) * 60); say(`time -> ${a}m`); break;
      case 'spawn': for (let i = 0; i < (+b || 1); i++) g.spawnEnemy(a, p, a === 'brazier' ? { x: p.x + 80, y: p.y } : {}); break;
      case 'elite': g.spawnEnemy(a || 'werewolf', p, { elite: true }); break;
      case 'chest': g.addPickup('chest', p.x + 40, p.y); break;
      case 'give': {
        if (WEAPONS[a]) {
          const w = p.weapons.find(w => w.id === a);
          if (w) w.level = weaponMaxLevel(a); else if (p.weapons.length < 6) { g.addWeapon(p, a); p.weapons[p.weapons.length - 1].level = +b || 1; }
        } else if (PASSIVES[a]) {
          const s = p.passives.find(s => s.id === a);
          if (s) s.level = PASSIVES[a].max; else if (p.passives.length < 6) p.passives.push({ id: a, level: +b || 1 });
        } else { say('unknown id'); return; }
        g.recalc(p);
        break;
      }
      case 'max': {
        for (const w of p.weapons) if (!w.def.evolved) w.level = weaponMaxLevel(w.id);
        for (const w of p.weapons) { const e = w.def.evolve; if (e && !p.passives.some(s => s.id === e.with) && p.passives.length < 6) p.passives.push({ id: e.with, level: 1 }); }
        g.recalc(p);
        break;
      }
      default: say('commands: /xp n, /god, /time m, /spawn type n, /elite type, /chest, /give id [lvl], /max');
    }
  }

  // ------------------------------------------------------------ game lifecycle
  start() {
    const players = this.members.filter(m => m.connected);
    if (!players.length) return;
    this.state = 'game';
    this.tickN = 0;
    this.game = new Game(this, { ...this.settings }, players.map(m => ({ slot: m.slot, name: m.name, char: m.char, powerups: m.powerups })));
    for (const m of players) this.sendStart(m, this.game.getPlayer(m.slot));
    this.broadcastLobby();
    this.hub.roomsChanged();
  }

  onGameOver(results) {
    const g = this.game;
    g.sendSnapshots();
    this.broadcast({ t: 'over', results });
    this.game = null;
    this.state = 'lobby';
    for (const m of this.members) m.ready = false;
    this.broadcastLobby();
    this.hub.roomsChanged();
  }

  tick(dt) {
    const g = this.game;
    if (g) {
      g.tick(dt);
      if (this.game === g) {
        this.tickN++;
        if (this.tickN % SNAP_EVERY === 0) g.sendSnapshots();
        if (g.rosterDirty) { g.rosterDirty = false; this.broadcast(g.roster()); }
      }
    }
    const t = Date.now();
    for (const m of [...this.members]) if (!m.connected && t - m.goneAt > RECONNECT_GRACE) this.remove(m);
  }
}
