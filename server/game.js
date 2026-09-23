// Authoritative game simulation for one room.
import {
  TICK_RATE, VIEW_W, VIEW_H, SPAWN_PAD, DESPAWN_DIST, MAX_WEAPONS, MAX_PASSIVES, PLAYER_R, BASE_SPEED,
  BASE_MAGNET, REVIVE_R, REVIVE_TIME, MAX_GEMS, CHARACTERS, CHAR_BY_ID, PASSIVES, WEAPONS, BASE_WEAPONS,
  EVOLUTIONS, ENEMIES, ENEMY_ID, STAGES, STAGE_BY_ID, PROJ_ID, PICKUP_ID, EV,
  weaponStats, weaponMaxLevel, computeStats, xpForLevel,
} from '../shared/data.js';
import { encodeSnapshot, GF } from '../shared/protocol.js';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pickOne = (arr) => arr[(Math.random() * arr.length) | 0];
const now = () => performance.now();

export const DIFFICULTY = {
  easy:   { hp: 0.6,  dmg: 0.55, count: 0.8 },
  normal: { hp: 0.8,  dmg: 0.8,  count: 0.95 },
  hard:   { hp: 1.15, dmg: 1.1,  count: 1.15 },
};
const SWARM_TYPE = { forest: 'bat', crypt: 'ghost', tundra: 'icebat' };
const GROUP_FIRE = new Set(['fireball', 'lightning', 'orbit', 'spiral']);
const OFFER_TIMEOUT = 30000;
// Rune tracers bounce inside this box around their owner (fits the smallest supported view)
const RUNE_BOX_X = 440, RUNE_BOX_Y = 250;

// ------------------------------------------------------------------------------------------
// Uniform spatial hash for enemies
class Grid {
  constructor(size) { this.s = size; this.cells = new Map(); this.pool = []; }
  clear() {
    for (const a of this.cells.values()) { a.length = 0; this.pool.push(a); }
    this.cells.clear();
  }
  insert(e) {
    const k = (Math.floor(e.x / this.s) + 32768) * 65536 + (Math.floor(e.y / this.s) + 32768);
    let a = this.cells.get(k);
    if (!a) { a = this.pool.pop() || []; this.cells.set(k, a); }
    a.push(e);
  }
  // Collect candidates within the square [x-r, x+r] x [y-r, y+r] into `out`
  query(x, y, r, out) {
    out.length = 0;
    const s = this.s;
    const cx0 = Math.floor((x - r) / s), cx1 = Math.floor((x + r) / s);
    const cy0 = Math.floor((y - r) / s), cy1 = Math.floor((y + r) / s);
    for (let cx = cx0; cx <= cx1; cx++) {
      const base = (cx + 32768) * 65536 + 32768;
      for (let cy = cy0; cy <= cy1; cy++) {
        const a = this.cells.get(base + cy);
        if (a) for (let i = 0; i < a.length; i++) out.push(a[i]);
      }
    }
    return out;
  }
}

// Remove dead entries from an array in place
function compact(arr) {
  let j = 0;
  for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[j++] = arr[i];
  arr.length = j;
}

export class Game {
  /**
   * @param room  { sendTo(slot, msg), broadcast(msg), sendBinary(slot, buf), onGameOver(results) }
   * @param opts  { stage, length (minutes) }
   * @param members [{ slot, name, char, powerups }]
   */
  constructor(room, opts, members) {
    this.room = room;
    this.stage = STAGE_BY_ID[opts.stage] || STAGES[0];
    this.lengthMin = opts.length || 20;
    this.length = this.lengthMin * 60;
    this.lenMult = Math.pow(30 / this.lengthMin, 0.5);
    this.diff = DIFFICULTY[opts.difficulty] || DIFFICULTY.normal;
    this.time = 0;
    this.now = now();
    this.flags = 0;
    this.players = [];
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.events = [];
    this.delayed = [];
    this.idc = 0;
    this.level = 1;
    this.xp = 0;
    this.kills = 0;
    this.grid = new Grid(64);
    this.minute = -1;
    this.spawnT = 1;
    this.brazierT = 4;
    this.freezeT = 0;
    this.manualPause = null;
    this.over = false;
    this.rosterDirty = true;
    this.gemCount = 0;
    this._q1 = []; this._q2 = []; this._q3 = [];

    members.forEach((m, i) => {
      const a = (i / Math.max(1, members.length)) * TAU;
      const r = members.length > 1 ? 40 : 0;
      this.addPlayer(m, Math.cos(a) * r, Math.sin(a) * r);
    });
    this.xpNext = this.calcXpNext();
  }

  // ---------------------------------------------------------------- players
  addPlayer(m, x, y) {
    const ch = CHAR_BY_ID[m.char] || CHARACTERS[0];
    const p = {
      slot: m.slot, name: m.name, char: ch.id, powerups: m.powerups || {},
      x, y, fx: 1, fy: 0, faceLeft: false, moving: false,
      weapons: [], passives: [], stats: null,
      hp: 1, dead: false, invuln: 2, hurtFlash: 0, revive: 0, revivals: 0,
      gold: 0, kills: 0, connected: true,
      pauseQueue: 0, freeQueue: 0, offer: null, offerT: 0, rerolls: 0,
      moveBudget: 60, tp: 0, spec: -1, healAcc: 0,
    };
    this.addWeapon(p, ch.weapon);
    this.recalc(p);
    p.hp = p.stats.maxHp;
    p.revivals = p.stats.revival;
    p.rerolls = p.stats.reroll;
    this.players.push(p);
    this.rosterDirty = true;
    return p;
  }

  // A player joining a run already in progress spawns next to a living teammate and gets catch-up picks.
  lateJoin(m) {
    const anchor = this.players.find(p => p.connected && !p.dead) || this.players[0];
    const p = this.addPlayer(m, (anchor ? anchor.x : 0) + rand(-40, 40), (anchor ? anchor.y : 0) + rand(-40, 40));
    p.freeQueue = Math.min(30, Math.max(0, this.level - 1));
    p.invuln = 3;
    this.xpNext = this.calcXpNext();
    return p;
  }

  getPlayer(slot) { return this.players.find(p => p.slot === slot); }

  addWeapon(p, id) {
    p.weapons.push({ id, def: WEAPONS[id], level: 1, s: weaponStats(id, 1), cd: 0.3, burst: 0, burstN: 0, burstIdx: 0, burstT: 0, dmg: 0, phase: 0 });
  }

  recalc(p) {
    const oldMax = p.stats ? p.stats.maxHp : 0;
    p.stats = computeStats(p.char, p.passives.map(s => [s.id, s.level]), p.powerups);
    for (const w of p.weapons) w.s = weaponStats(w.id, w.level);
    if (oldMax && p.stats.maxHp > oldMax) p.hp += p.stats.maxHp - oldMax;
    p.hp = Math.min(p.hp, p.stats.maxHp);
    this.rosterDirty = true;
  }

  connectedPlayers() { return this.players.filter(p => p.connected); }
  alivePlayers() { return this.players.filter(p => p.connected && !p.dead); }

  calcXpNext() {
    const n = Math.max(1, this.connectedPlayers().length);
    return Math.round(xpForLevel(this.level) * (1 + 0.45 * (n - 1)));
  }

  setConnected(slot, connected) {
    const p = this.getPlayer(slot);
    if (!p) return;
    p.connected = connected;
    if (!connected) {
      if (this.manualPause && this.manualPause.slot === slot) this.manualPause = null;
      // Remove orbiting projectiles etc.
      for (const pr of this.projectiles) if (pr.owner === p) pr.dead = true;
      p.offer = null;
    } else {
      p.invuln = Math.max(p.invuln, 2);
      this.sendPos(p);
    }
    this.rosterDirty = true;
  }

  removePlayer(slot) {
    const p = this.getPlayer(slot);
    if (!p) return;
    this.setConnected(slot, false);
    p.left = true;
  }

  sendPos(p) {
    p.tp++;
    this.room.sendTo(p.slot, { t: 'pos', x: p.x, y: p.y, tp: p.tp });
  }

  // Client-authoritative movement, limited by a speed budget
  input(slot, m) {
    const p = this.getPlayer(slot);
    if (!p || !p.connected) return;
    if (typeof m.spec === 'number') p.spec = m.spec | 0;
    if (p.dead || (m.tp | 0) !== p.tp) return;
    const x = +m.x, y = +m.y;
    let ix = +m.dx || 0, iy = +m.dy || 0;
    if (!isFinite(x) || !isFinite(y) || !isFinite(ix) || !isFinite(iy)) return;
    const il = Math.hypot(ix, iy);
    if (il > 1) { ix /= il; iy /= il; }
    if (il > 0.1) {
      p.fx = ix / il; p.fy = iy / il; p.moving = true;
      if (Math.abs(ix) > 0.05) p.faceLeft = ix < 0;
    } else p.moving = false;
    if (this.flags & (GF.PAUSED | GF.LEVELUP)) return;
    if (p.offer && p.freeQueue > 0 && p.pauseQueue === 0) return;
    let dx = x - p.x, dy = y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > p.moveBudget) {
      const k = p.moveBudget / d;
      dx *= k; dy *= k;
      if (d - p.moveBudget > 80) { p.x += dx; p.y += dy; p.moveBudget = 0; this.sendPos(p); return; }
    }
    p.x += dx; p.y += dy;
    p.moveBudget -= Math.hypot(dx, dy);
  }

  togglePause(slot, want) {
    const p = this.getPlayer(slot);
    if (!p) return;
    if (want && !this.manualPause) this.manualPause = { slot, name: p.name };
    else if (!want && this.manualPause) this.manualPause = null;
    this.room.broadcast({ t: 'pause', paused: !!this.manualPause, by: this.manualPause ? this.manualPause.name : p.name });
  }

  // ---------------------------------------------------------------- main loop
  tick(dt) {
    if (this.over) return;
    this.now = now();
    this.updateOffers();
    const levelPause = this.players.some(p => p.connected && p.pauseQueue > 0);
    this.flags = (this.manualPause ? GF.PAUSED : 0) | (levelPause ? GF.LEVELUP : 0) | (this.freezeT > 0 ? GF.FROZEN : 0);
    if (this.manualPause || levelPause) return;

    this.time += dt;
    if (this.freezeT > 0) this.freezeT -= dt;

    for (let i = this.delayed.length - 1; i >= 0; i--) {
      if (this.time >= this.delayed[i].t) { const d = this.delayed[i]; this.delayed.splice(i, 1); d.fn(); }
    }

    this.updatePlayers(dt);
    this.director(dt);
    this.updateEnemies(dt);
    // rebuild the grid after movement for accurate hits
    this.grid.clear();
    for (const e of this.enemies) if (!e.dead) this.grid.insert(e);
    this.updateWeapons(dt);
    this.updateProjectiles(dt);
    this.updatePickups(dt);
    this.updateRevives(dt);

    compact(this.enemies);
    compact(this.projectiles);
    compact(this.pickups);

    const conn = this.connectedPlayers();
    if (conn.length && conn.every(p => p.dead)) this.end(false);
    else if (this.time >= this.length) this.end(true);
  }

  updatePlayers(dt) {
    for (const p of this.players) {
      if (!p.connected) continue;
      const speed = BASE_SPEED * p.stats.moveSpeed;
      p.moveBudget = Math.min(p.moveBudget + speed * dt * 1.35, speed * 0.7 + 40);
      if (p.dead) continue;
      if (p.invuln > 0) p.invuln -= dt;
      if (p.hurtFlash > 0) p.hurtFlash--;
      if (p.stats.recovery > 0 && p.hp < p.stats.maxHp) p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.recovery * dt);
    }
  }

  // ---------------------------------------------------------------- spawning
  playerFactor() { return Math.max(1, this.connectedPlayers().length); }
  maxEnemies() { return 420 + 140 * (this.playerFactor() - 1); }
  hpScale() {
    const m = Math.max(0, this.minute);
    return (1 + 0.06 * m + 0.0035 * m * m) * (1 + 0.15 * (this.playerFactor() - 1));
  }

  director(dt) {
    const m = Math.min(29, Math.floor(this.time / this.length * 30));
    if (m !== this.minute) { this.minute = m; this.onMinute(m); }
    const wave = this.stage.waves[m];
    const alive = this.alivePlayers();
    if (!alive.length) return;
    const n = this.playerFactor();
    const target = Math.min(this.maxEnemies(), Math.round(wave.min * (1 + 0.6 * (n - 1)) * this.diff.count));
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = wave.every;
      let count = 0;
      for (const e of this.enemies) if (!e.prop && !e.dead) count++;
      // steady trickle while below 1.3x the wave's minimum, fast refill while below the minimum
      let k = count < target * 1.3 ? Math.max(1, Math.round(target * 0.06)) : 0;
      if (count < target) k = Math.max(k, Math.ceil((target - count) * 0.5));
      k = Math.min(k, this.maxEnemies() - count);
      for (let i = 0; i < k; i++) this.spawnEnemy(pickOne(wave.types), pickOne(alive));
    }
    this.brazierT -= dt;
    if (this.brazierT <= 0) {
      this.brazierT = 10;
      for (const p of alive) {
        let near = 0;
        for (const e of this.enemies) if (e.prop && !e.dead && Math.abs(e.x - p.x) < 900 && Math.abs(e.y - p.y) < 700) near++;
        if (near < 2) {
          const a = Math.random() * TAU, r = rand(260, 520);
          this.spawnEnemy('brazier', p, { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r * 0.7 });
        }
      }
    }
  }

  onMinute(m) {
    const wave = this.stage.waves[m];
    const alive = this.alivePlayers();
    if (!alive.length) return;
    if (wave.elite) {
      this.spawnEnemy(wave.elite, pickOne(alive), { elite: true });
      this.room.broadcast({ t: 'toast', text: 'A powerful foe approaches...', color: '#ffb040' });
    }
    if (wave.boss) {
      this.spawnEnemy(wave.boss, pickOne(alive), {});
      const def = ENEMIES[wave.boss];
      const names = { batlord: 'The Bat Lord', colossus: 'The Bone Colossus', nightlord: 'The Night Lord', frostgiant: 'The Frost Giant' };
      this.room.broadcast({ t: 'toast', text: `${names[wave.boss] || 'A boss'} has awoken!`, color: '#ff4a5a', big: true });
      void def;
    }
    if (wave.event === 'swarm') for (const p of alive) this.swarm(p);
    if (wave.event === 'ring') for (const p of alive) this.ring(p, wave.types[0]);
  }

  spawnPoint(p) {
    const hx = VIEW_W / 2 + SPAWN_PAD, hy = VIEW_H / 2 + SPAWN_PAD;
    const a = (p.moving && Math.random() < 0.5) ? Math.atan2(p.fy, p.fx) + rand(-1.1, 1.1) : Math.random() * TAU;
    const c = Math.cos(a), s = Math.sin(a);
    const t = Math.min(hx / Math.max(1e-4, Math.abs(c)), hy / Math.max(1e-4, Math.abs(s)));
    return [p.x + c * t + rand(-24, 24), p.y + s * t + rand(-24, 24)];
  }

  spawnEnemy(type, p, o = {}) {
    const def = ENEMIES[type];
    let x = o.x, y = o.y;
    if (x === undefined) [x, y] = this.spawnPoint(p);
    const m = Math.max(0, this.minute);
    let hp = def.hp, r = def.r, dmg = def.dmg * (1 + 0.025 * m), xp = def.xp, kb = def.kb;
    if (def.boss) hp *= 1 + 0.5 * (this.playerFactor() - 1);
    else if (!def.prop) hp *= this.hpScale();
    if (o.elite) { hp *= 14; r *= 1.5; dmg *= 1.4; xp *= 10; kb *= 0.15; }
    if (!def.prop) { hp *= this.diff.hp; dmg *= this.diff.dmg; }
    if (o.weak) hp *= 0.6;
    hp = Math.max(1, Math.round(hp));
    const e = {
      id: this.newId(), type, tid: ENEMY_ID[type], x, y, kx: 0, ky: 0,
      hp, maxHp: hp, speed: def.speed * rand(0.9, 1.1), dmg, r, xp, kb,
      elite: !!o.elite, boss: !!def.boss, prop: !!def.prop, move: o.move || def.move || 'walk',
      atkCd: 0, flash: 0, faceLeft: false, frozen: false, aura: null, phase: Math.random() * TAU,
      dirX: o.dirX || 0, dirY: o.dirY || 0, life: o.life || 0, dead: false,
    };
    this.enemies.push(e);
    return e;
  }

  swarm(p) {
    const type = SWARM_TYPE[this.stage.id] || 'bat';
    const fromLeft = Math.random() < 0.5;
    const dirX = fromLeft ? 1 : -1;
    const dirY = rand(-0.25, 0.25);
    const sx = p.x - dirX * (VIEW_W / 2 + SPAWN_PAD + 40);
    const count = 18;
    for (let i = 0; i < count; i++) {
      const y = p.y + (i - count / 2) * 22 + rand(-8, 8);
      const e = this.spawnEnemy(type, p, { x: sx + rand(-40, 40) - dirX * (i % 3) * 20, y, move: 'fixed', dirX, dirY, life: 14 });
      e.speed = 150;
      e.hp = e.maxHp = Math.round(e.maxHp * 0.6);
    }
  }

  // A closing circle of weaker enemies, starting just off-screen
  ring(p, type) {
    const n = 22;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU;
      this.spawnEnemy(type, p, { x: p.x + Math.cos(a) * (VIEW_W / 2 + 30), y: p.y + Math.sin(a) * (VIEW_H / 2 + 50), weak: true });
    }
  }

  newId() {
    this.idc = (this.idc % 65535) + 1;
    return this.idc;
  }

  // ---------------------------------------------------------------- enemies
  updateEnemies(dt) {
    const grid = this.grid;
    grid.clear();
    for (const e of this.enemies) if (!e.dead) grid.insert(e);
    const targets = this.alivePlayers();
    const frozen = this.freezeT > 0;
    const kd = Math.pow(0.0015, dt);
    const t = this.time;

    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.flash > 0) e.flash--;
      if (e.atkCd > 0) e.atkCd -= dt;
      if (e.prop) continue;

      let tp = null, best = Infinity;
      for (const p of targets) {
        const d = (p.x - e.x) ** 2 + (p.y - e.y) ** 2;
        if (d < best) { best = d; tp = p; }
      }
      if (!tp) continue;
      if (e.move === 'fixed') {
        e.life -= dt;
        if (e.life <= 0 || best > (DESPAWN_DIST * 1.3) ** 2) { e.dead = true; continue; }
      } else if (best > DESPAWN_DIST * DESPAWN_DIST) {
        [e.x, e.y] = this.spawnPoint(tp);
        continue;
      }
      e.frozen = frozen && !e.boss;
      if (e.frozen) { e.kx *= kd; e.ky *= kd; continue; }

      let mx, my;
      if (e.move === 'fixed') { mx = e.dirX; my = e.dirY; }
      else {
        const d = Math.sqrt(best) || 1;
        mx = (tp.x - e.x) / d; my = (tp.y - e.y) / d;
        if (e.move === 'flutter') {
          const w = Math.sin(t * 5 + e.phase) * 0.7;
          const c = Math.cos(w), s = Math.sin(w);
          const nx = mx * c - my * s; my = mx * s + my * c; mx = nx;
        } else if (e.move === 'wave') {
          const w = Math.sin(t * 3 + e.phase) * 0.9;
          mx += -my * w; my += mx * w;
          const l = Math.hypot(mx, my) || 1; mx /= l; my /= l;
        }
      }
      const kbm = Math.abs(e.kx) + Math.abs(e.ky);
      const sp = e.speed * (kbm > 60 ? 0.15 : 1);
      e.x += (mx * sp + e.kx) * dt;
      e.y += (my * sp + e.ky) * dt;
      e.kx *= kd; e.ky *= kd;
      if (Math.abs(mx) > 0.15) e.faceLeft = mx < 0;
    }

    // soft separation so crowds spread out instead of stacking
    const q = this._q1;
    for (const e of this.enemies) {
      if (e.dead || e.prop || e.boss || e.move === 'fixed') continue;
      grid.query(e.x, e.y, e.r + 16, q);
      for (let i = 0; i < q.length; i++) {
        const o = q[i];
        if (o === e || o.dead || o.prop) continue;
        const dx = e.x - o.x, dy = e.y - o.y;
        const rr = (e.r + o.r) * 0.8;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        if (d2 < 0.01) { e.x += rand(-1, 1); e.y += rand(-1, 1); continue; }
        const d = Math.sqrt(d2);
        const push = (rr - d) * (o.boss ? 0.6 : 0.25);
        e.x += dx / d * push; e.y += dy / d * push;
      }
    }

    // contact damage
    for (const p of targets) {
      if (p.invuln > 0 || (p.offer && p.freeQueue > 0 && p.pauseQueue === 0)) continue;
      grid.query(p.x, p.y, PLAYER_R + 60, q);
      for (let i = 0; i < q.length; i++) {
        const e = q[i];
        if (e.dead || e.prop || e.frozen || e.atkCd > 0) continue;
        const rr = e.r + PLAYER_R - 3;
        if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < rr * rr) {
          e.atkCd = 1;
          this.damagePlayer(p, e.dmg);
          if (p.dead) break;
        }
      }
    }
  }

  damagePlayer(p, dmg) {
    if (p.dead || p.invuln > 0) return;
    const d = Math.max(1, dmg - p.stats.armor);
    p.hp -= d;
    p.hurtFlash = 4;
    this.events.push({ type: EV.HURT, x: p.x, y: p.y, a: d, slot: p.slot });
    if (p.hp <= 0) this.downPlayer(p);
  }

  downPlayer(p) {
    if (p.revivals > 0) {
      p.revivals--;
      p.hp = p.stats.maxHp * 0.5;
      p.invuln = 3;
      this.events.push({ type: EV.REVIVE, x: p.x, y: p.y, slot: p.slot });
      this.shockwave(p.x, p.y, 220);
      this.room.broadcast({ t: 'toast', text: `${p.name} refused to die!`, color: '#ffe070' });
      return;
    }
    p.dead = true;
    p.hp = 0;
    p.revive = 0;
    p.moving = false;
    for (const pr of this.projectiles) if (pr.owner === p && pr.attached) pr.dead = true;
    this.events.push({ type: EV.DOWN, x: p.x, y: p.y, slot: p.slot });
    const others = this.alivePlayers().length;
    this.room.broadcast({ t: 'toast', text: others ? `${p.name} is down! Stand next to them to revive.` : `${p.name} has fallen.`, color: '#ff5a5a' });
    this.rosterDirty = true;
  }

  shockwave(x, y, r) {
    for (const e of this.enemies) {
      if (e.dead || e.prop) continue;
      const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy);
      if (d < r && d > 0) { e.kx += dx / d * 600 * Math.max(0.1, e.kb); e.ky += dy / d * 600 * Math.max(0.1, e.kb); }
    }
    this.events.push({ type: EV.EXPLODE, x, y, a: r, b: 2 });
  }

  updateRevives(dt) {
    const alive = this.alivePlayers();
    for (const d of this.players) {
      if (!d.connected || !d.dead) continue;
      let helping = false;
      for (const p of alive) if ((p.x - d.x) ** 2 + (p.y - d.y) ** 2 < REVIVE_R * REVIVE_R) { helping = true; break; }
      if (helping) d.revive += dt / REVIVE_TIME;
      else d.revive = Math.max(0, d.revive - dt / (REVIVE_TIME * 2));
      if (d.revive >= 1) {
        d.dead = false;
        d.revive = 0;
        d.hp = d.stats.maxHp * 0.5;
        d.invuln = 3;
        this.events.push({ type: EV.REVIVE, x: d.x, y: d.y, slot: d.slot });
        this.shockwave(d.x, d.y, 180);
        this.room.broadcast({ t: 'toast', text: `${d.name} is back in the fight!`, color: '#7dffa0' });
        this.rosterDirty = true;
      }
    }
  }

  // ---------------------------------------------------------------- combat
  hitEnemy(e, p, w, dmg, kx, ky) {
    if (e.dead) return;
    let d = dmg, crit = 0;
    if (w && w.s.crit && Math.random() < w.s.crit * (p ? p.stats.luck : 1)) { d *= 2; crit = 1; }
    e.hp -= d;
    e.flash = 3;
    if (w) w.dmg += Math.min(d, e.hp + d);
    this.events.push({ type: EV.DMG, x: e.x, y: e.y - e.r, a: d, b: crit });
    if (w && w.s.knock > 0 && e.kb > 0) {
      const k = 190 * w.s.knock * e.kb;
      e.kx += kx * k; e.ky += ky * k;
    }
    if (p && w && w.s.lifesteal && !e.prop && !p.dead) {
      p.healAcc += w.s.lifesteal;
      if (p.healAcc >= 1) {
        const h = Math.floor(p.healAcc);
        p.healAcc -= h;
        if (p.hp < p.stats.maxHp) p.hp = Math.min(p.stats.maxHp, p.hp + h);
      }
    }
    if (e.hp <= 0) this.killEnemy(e, p);
  }

  killEnemy(e, killer) {
    if (e.dead) return;
    e.dead = true;
    const luck = killer ? killer.stats.luck : 1;
    if (e.prop) {
      this.events.push({ type: EV.BRAZIER, x: e.x, y: e.y });
      const r = Math.random() * 100;
      const kind = r < 34 ? 'coin' : r < 46 ? 'bag' : r < 70 ? 'chicken' : r < 82 ? 'magnet' : r < 91 ? 'clock' : 'relic';
      this.addPickup(kind, e.x, e.y);
      return;
    }
    this.kills++;
    if (killer) killer.kills++;
    this.events.push({ type: EV.DEATH, x: e.x, y: e.y, a: e.tid, b: (e.elite ? 1 : 0) | (e.boss ? 2 : 0) | (e.faceLeft ? 4 : 0) });
    if (e.xp > 0) this.dropGem(e.x, e.y, e.xp);
    if (e.elite || e.boss) {
      this.addPickup('chest', e.x, e.y);
      if (e.boss) for (let i = 0; i < 4; i++) this.addPickup('bag', e.x + rand(-40, 40), e.y + rand(-40, 40));
    } else {
      const r = Math.random();
      if (r < 0.012 * luck) this.addPickup('coin', e.x + rand(-6, 6), e.y + rand(-6, 6));
      else if (r < 0.015 * luck) this.addPickup('chicken', e.x, e.y);
    }
  }

  // ---------------------------------------------------------------- weapons
  updateWeapons(dt) {
    for (const p of this.players) {
      if (!p.connected || p.dead) continue;
      if (p.offer && p.freeQueue > 0 && p.pauseQueue === 0) continue;
      for (const w of p.weapons) this.updateWeapon(p, w, dt);
    }
  }

  updateWeapon(p, w, dt) {
    const s = w.s, kind = w.def.kind;
    if (kind === 'aura') { this.aura(p, w); return; }
    if (w.burst > 0) {
      w.burstT -= dt;
      while (w.burst > 0 && w.burstT <= 0) {
        this.fireOne(p, w, w.burstIdx, w.burstN);
        w.burstIdx++; w.burst--;
        w.burstT += Math.max(0.001, s.interval);
      }
      return;
    }
    w.cd -= dt;
    if (w.cd > 0) return;
    const n = Math.max(1, s.amount + p.stats.amount);
    w.cd = s.cooldown * p.stats.cooldown;
    if (GROUP_FIRE.has(kind)) this.fireGroup(p, w, n);
    else { w.burst = n; w.burstN = n; w.burstIdx = 0; w.burstT = 0; }
  }

  nearestEnemy(x, y, maxD = 720) {
    let best = null, bd = maxD * maxD;
    for (const e of this.enemies) {
      if (e.dead || e.prop) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  enemiesInView(p, out) {
    out.length = 0;
    const hx = VIEW_W / 2 - 20, hy = VIEW_H / 2 - 10;
    for (const e of this.enemies) {
      if (e.dead || e.prop) continue;
      if (Math.abs(e.x - p.x) < hx && Math.abs(e.y - p.y) < hy) out.push(e);
    }
    return out;
  }

  addProj(p, w, o) {
    const pr = {
      id: this.newId(), pk: PROJ_ID[o.kind], owner: p, w,
      x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0, ang: o.ang || 0, size: o.size || 1,
      r: o.r, dmg: o.dmg, pierce: o.pierce ?? 999, life: o.life, age: 0, rehit: o.rehit ?? 0,
      mode: o.mode || 'straight', attached: !!o.attached, hits: new Map(), dead: false, noHit: !!o.noHit,
    };
    if (o.extra) Object.assign(pr, o.extra);
    this.projectiles.push(pr);
    return pr;
  }

  fireOne(p, w, idx, n) {
    const s = w.s, ps = p.stats, kind = w.def.kind;
    const area = s.area * ps.area, spd = s.speed * ps.speed, dmg = s.damage * ps.might;
    const evolved = !!w.def.evolved;
    switch (kind) {
      case 'whip': {
        const face = p.faceLeft ? -1 : 1;
        const side = idx % 2 === 0 ? face : -face;
        const row = Math.floor(idx / 2);
        const hw = 60 * area, hh = 15 * area;
        const cx = p.x + side * (hw + 6), cy = p.y - 8 + (row % 2 ? 1 : -1) * Math.ceil(row / 2) * 18 * area + (row ? 8 : 0);
        const q = this.grid.query(cx, cy, hw + 40, this._q2);
        for (let i = 0; i < q.length; i++) {
          const e = q[i];
          if (e.dead) continue;
          if (Math.abs(e.x - cx) < hw + e.r && Math.abs(e.y - cy) < hh + e.r) this.hitEnemy(e, p, w, dmg, side, 0);
        }
        const packed = (Math.min(4095, Math.round(area * 100))) | ((row & 3) << 12) | (evolved ? 0x4000 : 0) | (side < 0 ? 0x8000 : 0);
        this.events.push({ type: EV.WHIP, x: p.x, y: cy, a: packed, slot: p.slot });
        break;
      }
      case 'wand': {
        const t = this.nearestEnemy(p.x, p.y);
        if (!t) break;
        const a = Math.atan2(t.y - p.y, t.x - p.x) + (idx ? rand(-0.12, 0.12) : 0);
        const v = 360 * spd;
        this.addProj(p, w, { kind: evolved ? 'torrent' : 'bolt', x: p.x, y: p.y - 6, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ang: a,
          r: 7 * area, size: area, dmg, pierce: s.pierce, life: 2.2 });
        break;
      }
      case 'knife': {
        const a0 = Math.atan2(p.fy, p.fx);
        const a = a0 + rand(-1, 1) * (evolved ? 0.1 : 0.04);
        const off = (idx - (n - 1) / 2) * 7;
        const v = 560 * spd;
        this.addProj(p, w, { kind: evolved ? 'blade' : 'knife', x: p.x - Math.sin(a0) * off, y: p.y - 4 + Math.cos(a0) * off,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v, ang: a, r: 7 * area, size: area, dmg, pierce: s.pierce, life: 1.3 });
        break;
      }
      case 'axe': {
        const face = p.faceLeft ? -1 : 1;
        const spread = (idx - (n - 1) / 2) * 50 + face * 25 + rand(-30, 30);
        this.addProj(p, w, { kind: 'axe', x: p.x, y: p.y - 10, vx: spread * spd, vy: -540 * spd, mode: 'axe',
          r: 14 * area, size: area, dmg, pierce: s.pierce, life: 3, extra: { g: 1050 * spd } });
        break;
      }
      case 'boomerang': {
        const t = this.nearestEnemy(p.x, p.y, 600);
        let a = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.fy, p.fx);
        if (idx) a += rand(-0.35, 0.35);
        this.addProj(p, w, { kind: evolved ? 'heaven' : 'cross', x: p.x, y: p.y - 6, ang: a, mode: 'boom',
          r: 13 * area, size: area, dmg, pierce: 999, life: 2.8, rehit: 0,
          extra: { dx: Math.cos(a), dy: Math.sin(a), v0: 520 * spd, acc: 700 * spd, returned: false } });
        break;
      }
      case 'water': {
        const q = this.enemiesInView(p, this._q3);
        let tx, ty;
        if (q.length) { const e = pickOne(q); tx = e.x + rand(-20, 20); ty = e.y + rand(-20, 20); }
        else { const a = Math.random() * TAU, r = rand(80, 240); tx = p.x + Math.cos(a) * r; ty = p.y + Math.sin(a) * r; }
        const flight = 0.45;
        this.addProj(p, w, { kind: evolved ? 'fflask' : 'flask', x: p.x, y: p.y - 10, vx: (tx - p.x) / flight, vy: (ty - p.y + 10) / flight,
          mode: 'flask', r: 0, size: 1, dmg, life: flight, noHit: true, extra: { tx, ty, area, grow: !!s.grow, evolved } });
        break;
      }
      case 'rune': {
        const a = Math.random() * TAU;
        const v = 390 * spd;
        this.addProj(p, w, { kind: evolved ? 'srune' : 'rune', x: p.x, y: p.y - 6, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ang: a,
          mode: 'rune', r: 10 * area, size: area, dmg, pierce: 999, life: s.duration * ps.duration, rehit: 0.4,
          extra: { explode: !!s.explode, area } });
        break;
      }
    }
  }

  fireGroup(p, w, n) {
    const s = w.s, ps = p.stats, kind = w.def.kind;
    const area = s.area * ps.area, spd = s.speed * ps.speed, dmg = s.damage * ps.might;
    const evolved = !!w.def.evolved;
    switch (kind) {
      case 'fireball': {
        const q = this.enemiesInView(p, this._q3);
        const t = q.length ? pickOne(q) : null;
        const base = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.random() * TAU;
        const v = 250 * spd;
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * 0.2 + rand(-0.05, 0.05);
          this.addProj(p, w, { kind: evolved ? 'inferno' : 'fireball', x: p.x, y: p.y - 6, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ang: a,
            r: 9 * area, size: area, dmg, pierce: s.pierce, life: 3.2, rehit: evolved ? 0 : 0 });
        }
        break;
      }
      case 'lightning': {
        const q = this.enemiesInView(p, this._q3);
        const R = 34 * area;
        for (let i = 0; i < n && q.length; i++) {
          const j = (Math.random() * q.length) | 0;
          const e = q[j];
          q[j] = q[q.length - 1]; q.length--;
          const x = e.x, y = e.y;
          this.strike(p, w, x, y, R, dmg);
          if (s.double) this.delayed.push({ t: this.time + 0.3, fn: () => { if (p.connected && !p.dead) this.strike(p, w, x + rand(-10, 10), y + rand(-10, 10), R, dmg); } });
        }
        break;
      }
      case 'orbit': {
        const permanent = s.duration >= 999;
        const mine = this.projectiles.filter(pr => pr.w === w && !pr.dead);
        if (permanent && mine.length === n) break;
        for (const pr of mine) pr.dead = true;
        const R = 78 * area;
        const omega = 3.1 * spd;
        w.phase = (w.phase || 0) + 0.7;
        for (let i = 0; i < n; i++) {
          const oa = w.phase + i / n * TAU;
          this.addProj(p, w, { kind: evolved ? 'ebook' : 'book', x: p.x + Math.cos(oa) * R, y: p.y + Math.sin(oa) * R, mode: 'orbit', attached: true,
            r: 12 * area, size: area, dmg, pierce: 999, life: permanent ? Infinity : s.duration * ps.duration, rehit: 0.55,
            extra: { oa, ow: omega, R } });
        }
        break;
      }
      case 'spiral': {
        const base = Math.random() * TAU;
        for (let i = 0; i < n; i++) {
          const oa = base + i / n * TAU;
          this.addProj(p, w, { kind: 'spiral', x: p.x, y: p.y, mode: 'spiral', r: 16 * area, size: area, dmg, pierce: 999,
            life: s.duration * ps.duration, rehit: 0.5, extra: { cx: p.x, cy: p.y, oa, rad: 10, vr: 170 * spd, ow: 1.9 } });
        }
        break;
      }
    }
  }

  strike(p, w, x, y, R, dmg) {
    const q = this.grid.query(x, y, R + 40, this._q2);
    for (let i = 0; i < q.length; i++) {
      const e = q[i];
      if (e.dead) continue;
      const rr = R + e.r;
      if ((e.x - x) ** 2 + (e.y - y) ** 2 < rr * rr) this.hitEnemy(e, p, w, dmg, 0, 0);
    }
    this.events.push({ type: EV.LIGHTNING, x, y, a: R, b: w.def.evolved ? 1 : 0 });
  }

  explode(p, w, x, y, R, dmg) {
    const q = this.grid.query(x, y, R + 40, this._q2);
    for (let i = 0; i < q.length; i++) {
      const e = q[i];
      if (e.dead) continue;
      const dx = e.x - x, dy = e.y - y, rr = R + e.r;
      if (dx * dx + dy * dy < rr * rr) { const d = Math.hypot(dx, dy) || 1; this.hitEnemy(e, p, w, dmg, dx / d, dy / d); }
    }
    this.events.push({ type: EV.EXPLODE, x, y, a: R, b: 1 });
  }

  aura(p, w) {
    const s = w.s;
    const R = 46 * s.area * p.stats.area;
    const dmg = s.damage * p.stats.might;
    const q = this.grid.query(p.x, p.y, R + 40, this._q2);
    const slot = p.slot;
    for (let i = 0; i < q.length; i++) {
      const e = q[i];
      if (e.dead) continue;
      const dx = e.x - p.x, dy = e.y - p.y, rr = R + e.r * 0.6;
      const d2 = dx * dx + dy * dy;
      if (d2 > rr * rr) continue;
      if (!e.aura) e.aura = new Float32Array(8);
      if (this.time < e.aura[slot]) continue;
      e.aura[slot] = this.time + s.cooldown;
      const d = Math.sqrt(d2) || 1;
      this.hitEnemy(e, p, w, dmg, dx / d, dy / d);
    }
  }

  updateProjectiles(dt) {
    const q = this._q1;
    for (const pr of this.projectiles) {
      if (pr.dead) continue;
      const o = pr.owner;
      pr.age += dt;
      if (pr.age >= pr.life) {
        pr.dead = true;
        if (pr.mode === 'flask') this.spawnPool(pr);
        continue;
      }
      switch (pr.mode) {
        case 'straight':
          pr.x += pr.vx * dt; pr.y += pr.vy * dt;
          break;
        case 'axe':
          pr.vy += pr.g * dt;
          pr.x += pr.vx * dt; pr.y += pr.vy * dt;
          pr.ang = Math.atan2(pr.vy, pr.vx);
          break;
        case 'boom': {
          const v = pr.v0 - pr.acc * pr.age;
          if (v < 0 && !pr.returned) { pr.returned = true; pr.hits.clear(); }
          pr.x += pr.dx * v * dt; pr.y += pr.dy * v * dt;
          break;
        }
        case 'orbit':
          if (!o.connected || o.dead) { pr.dead = true; continue; }
          pr.oa += pr.ow * dt;
          pr.x = o.x + Math.cos(pr.oa) * pr.R;
          pr.y = o.y - 4 + Math.sin(pr.oa) * pr.R;
          if (pr.hits.size > 400) pr.hits.clear();
          break;
        case 'spiral':
          pr.rad += pr.vr * dt; pr.oa += pr.ow * dt;
          pr.x = pr.cx + Math.cos(pr.oa) * pr.rad;
          pr.y = pr.cy + Math.sin(pr.oa) * pr.rad;
          pr.ang = pr.oa;
          break;
        case 'rune': {
          pr.x += pr.vx * dt; pr.y += pr.vy * dt;
          let bounced = false;
          if (pr.x < o.x - RUNE_BOX_X && pr.vx < 0) { pr.vx = -pr.vx; bounced = true; }
          if (pr.x > o.x + RUNE_BOX_X && pr.vx > 0) { pr.vx = -pr.vx; bounced = true; }
          if (pr.y < o.y - RUNE_BOX_Y && pr.vy < 0) { pr.vy = -pr.vy; bounced = true; }
          if (pr.y > o.y + RUNE_BOX_Y && pr.vy > 0) { pr.vy = -pr.vy; bounced = true; }
          pr.ang = Math.atan2(pr.vy, pr.vx);
          if (bounced && pr.explode) this.explode(o, pr.w, pr.x, pr.y, 60 * pr.area, pr.dmg * 0.8);
          break;
        }
        case 'flask':
          pr.x += pr.vx * dt; pr.y += pr.vy * dt;
          pr.ang += 10 * dt;
          continue;
        case 'pool': {
          if (pr.grow) {
            pr.r = pr.r0 * Math.min(1.9, 1 + 0.3 * pr.age);
            const t = this.nearestEnemy(pr.x, pr.y, 400);
            if (t) { const dx = t.x - pr.x, dy = t.y - pr.y, d = Math.hypot(dx, dy) || 1; pr.x += dx / d * 55 * dt; pr.y += dy / d * 55 * dt; }
          }
          pr.size = pr.r / 38;
          break;
        }
      }
      if (pr.noHit) continue;
      this.grid.query(pr.x, pr.y, pr.r + 40, q);
      const rehit = pr.rehit;
      for (let i = 0; i < q.length; i++) {
        const e = q[i];
        if (e.dead) continue;
        const dx = e.x - pr.x, dy = e.y - pr.y, rr = pr.r + e.r;
        if (dx * dx + dy * dy > rr * rr) continue;
        const last = pr.hits.get(e.id);
        if (last !== undefined && (rehit <= 0 || this.time < last)) continue;
        pr.hits.set(e.id, this.time + rehit);
        let kx, ky;
        if (pr.mode === 'orbit' || pr.mode === 'pool' || pr.mode === 'spiral') {
          const cx = pr.mode === 'orbit' ? o.x : pr.mode === 'spiral' ? pr.cx : pr.x;
          const cy = pr.mode === 'orbit' ? o.y : pr.mode === 'spiral' ? pr.cy : pr.y;
          const ddx = e.x - cx, ddy = e.y - cy, d = Math.hypot(ddx, ddy) || 1;
          kx = ddx / d; ky = ddy / d;
        } else if (pr.mode === 'boom') {
          const v = pr.v0 - pr.acc * pr.age;
          kx = pr.dx * Math.sign(v || 1); ky = pr.dy * Math.sign(v || 1);
        } else {
          const vl = Math.hypot(pr.vx, pr.vy) || 1;
          kx = pr.vx / vl; ky = pr.vy / vl;
        }
        this.hitEnemy(e, o, pr.w, pr.dmg, kx, ky);
        if (pr.pierce < 999) {
          pr.pierce--;
          if (pr.pierce <= 0) { pr.dead = true; break; }
        }
      }
    }
  }

  spawnPool(fl) {
    const w = fl.w, o = fl.owner;
    const s = w.s;
    const r0 = 38 * fl.area;
    const pr = this.addProj(o, w, { kind: fl.evolved ? 'fpool' : 'pool', x: fl.tx, y: fl.ty, mode: 'pool', r: r0, size: r0 / 38,
      dmg: fl.dmg, pierce: 999, life: s.duration * o.stats.duration, rehit: s.interval + 0.1 });
    pr.r0 = r0;
    pr.grow = fl.grow;
  }

  // ---------------------------------------------------------------- pickups
  addPickup(kind, x, y, value = 0) {
    const k = { id: this.newId(), kind, pk: PICKUP_ID[kind], x, y, value, target: null, spd: 0, age: 0, dead: false,
      magnetic: kind === 'gem1' || kind === 'gem2' || kind === 'gem3' || kind === 'coin' };
    this.pickups.push(k);
    return k;
  }

  gemKind(v) { return v < 2 ? 'gem1' : v < 10 ? 'gem2' : 'gem3'; }

  dropGem(x, y, v) {
    if (this.gemCount >= MAX_GEMS) {
      // merge into a nearby gem to keep counts sane
      let best = null, bd = 160 * 160;
      for (const k of this.pickups) {
        if (k.dead || k.target || !(k.kind === 'gem1' || k.kind === 'gem2' || k.kind === 'gem3')) continue;
        const d = (k.x - x) ** 2 + (k.y - y) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
      if (best) { best.value += v; best.kind = this.gemKind(best.value); best.pk = PICKUP_ID[best.kind]; return; }
    }
    this.gemCount++;
    this.addPickup(this.gemKind(v), x + rand(-4, 4), y + rand(-4, 4), v);
  }

  updatePickups(dt) {
    const alive = this.alivePlayers();
    for (const k of this.pickups) {
      if (k.dead) continue;
      k.age += dt;
      if (k.target) {
        const p = k.target;
        if (!p.connected || p.dead) { k.target = null; continue; }
        k.spd = Math.min(1100, k.spd + 1500 * dt);
        const dx = p.x - k.x, dy = p.y - k.y, d = Math.hypot(dx, dy) || 1;
        // negative speed first makes the gem hop away briefly, then it zooms in
        const step = Math.min(d, k.spd * dt);
        k.x += dx / d * step; k.y += dy / d * step;
        if (d < 16) this.collect(k, p);
        continue;
      }
      for (const p of alive) {
        const d2 = (p.x - k.x) ** 2 + (p.y - k.y) ** 2;
        if (k.magnetic) {
          const mr = BASE_MAGNET * p.stats.magnet;
          if (d2 < mr * mr) { k.target = p; k.spd = -160; break; }
        } else if (d2 < 26 * 26) { this.collect(k, p); break; }
      }
    }
  }

  collect(k, p) {
    k.dead = true;
    this.events.push({ type: EV.PICKUP, x: p.x, y: p.y, a: k.pk, slot: p.slot });
    switch (k.kind) {
      case 'gem1': case 'gem2': case 'gem3':
        this.gemCount--;
        this.gainXp(k.value, p);
        break;
      case 'coin': p.gold += 5 * p.stats.greed; break;
      case 'bag': p.gold += 25 * p.stats.greed; break;
      case 'chicken': {
        const h = Math.min(30, p.stats.maxHp - p.hp);
        p.hp += h;
        this.events.push({ type: EV.HEAL, x: p.x, y: p.y, a: Math.round(Math.max(0, h)), slot: p.slot });
        break;
      }
      case 'magnet':
        for (const g of this.pickups) if (!g.dead && g.magnetic && !g.target) { g.target = p; g.spd = 200; }
        break;
      case 'relic': {
        const hx = VIEW_W / 2, hy = VIEW_H / 2;
        for (const e of this.enemies) {
          if (e.dead || e.prop || e.boss) continue;
          if (Math.abs(e.x - p.x) < hx && Math.abs(e.y - p.y) < hy) this.killEnemy(e, p);
        }
        this.events.push({ type: EV.RELIC, x: p.x, y: p.y, slot: p.slot });
        break;
      }
      case 'clock':
        this.freezeT = 8;
        this.room.broadcast({ t: 'toast', text: 'Time stands still!', color: '#8ad8ff' });
        break;
      case 'chest':
        this.openChest(p);
        break;
    }
  }

  gainXp(v, p) {
    this.xp += v * p.stats.growth * this.lenMult;
    let ups = 0;
    while (this.xp >= this.xpNext && ups < 50) {
      this.xp -= this.xpNext;
      this.level++;
      ups++;
      this.xpNext = this.calcXpNext();
      for (const q of this.players) {
        if (!q.connected) continue;
        // fully built characters don't hold up the team: they just get gold
        if (this.hasUpgrades(q)) q.pauseQueue++;
        else q.gold += 10 * q.stats.greed;
      }
      this.events.push({ type: EV.LEVELUP, x: p.x, y: p.y, slot: p.slot, a: this.level });
    }
  }

  // ---------------------------------------------------------------- level-up offers
  updateOffers() {
    for (const p of this.players) {
      if (!p.connected) continue;
      if (!p.offer && (p.pauseQueue > 0 || p.freeQueue > 0)) this.makeOffer(p);
      else if (p.offer && p.pauseQueue > 0 && this.now - p.offerT > OFFER_TIMEOUT) this.choose(p.slot, 0);
    }
  }

  hasUpgrades(p) {
    if (p.weapons.some(w => !w.def.evolved && w.level < weaponMaxLevel(w.id))) return true;
    if (p.passives.some(s => s.level < PASSIVES[s.id].max)) return true;
    return p.weapons.length < MAX_WEAPONS || p.passives.length < MAX_PASSIVES;
  }

  ownsWeaponLine(p, id) {
    return p.weapons.some(w => w.id === id || w.def.from === id);
  }

  rollOptions(p) {
    const cand = [];
    for (const w of p.weapons) if (!w.def.evolved && w.level < weaponMaxLevel(w.id)) cand.push({ type: 'weapon', id: w.id, level: w.level + 1, wt: 1.3 });
    for (const s of p.passives) if (s.level < PASSIVES[s.id].max) cand.push({ type: 'passive', id: s.id, level: s.level + 1, wt: 1.0 });
    if (p.weapons.length < MAX_WEAPONS) for (const id of BASE_WEAPONS) if (!this.ownsWeaponLine(p, id)) cand.push({ type: 'weapon', id, level: 1, wt: 0.9 });
    if (p.passives.length < MAX_PASSIVES) for (const id of Object.keys(PASSIVES)) if (!p.passives.some(s => s.id === id)) cand.push({ type: 'passive', id, level: 1, wt: 0.75 });
    if (!cand.length) return [{ type: 'gold' }, { type: 'heal' }];
    const n = Math.random() < Math.min(0.6, 0.05 + (p.stats.luck - 1) * 0.8) ? 4 : 3;
    const out = [];
    while (out.length < n && cand.length) {
      let tot = 0;
      for (const c of cand) tot += c.wt;
      let r = Math.random() * tot, i = 0;
      for (; i < cand.length - 1; i++) { r -= cand[i].wt; if (r <= 0) break; }
      const c = cand.splice(i, 1)[0];
      out.push({ type: c.type, id: c.id, level: c.level });
    }
    return out;
  }

  makeOffer(p) {
    p.offer = this.rollOptions(p);
    p.offerT = this.now;
    this.room.sendTo(p.slot, { t: 'offer', options: p.offer, rerolls: p.rerolls, pausing: p.pauseQueue > 0,
      remaining: p.pauseQueue + p.freeQueue, level: this.level });
    this.sendWaiting();
  }

  sendWaiting() {
    const waiting = this.players.filter(q => q.connected && q.pauseQueue > 0).map(q => q.name);
    this.room.broadcast({ t: 'waiting', names: waiting });
  }

  choose(slot, i) {
    const p = this.getPlayer(slot);
    if (!p || !p.offer) return;
    const o = p.offer[i | 0] || p.offer[0];
    if (o.type === 'weapon') {
      const w = p.weapons.find(w => w.id === o.id);
      if (w) { if (w.level < weaponMaxLevel(w.id)) w.level++; }
      else if (p.weapons.length < MAX_WEAPONS) this.addWeapon(p, o.id);
    } else if (o.type === 'passive') {
      const s = p.passives.find(s => s.id === o.id);
      if (s) { if (s.level < PASSIVES[s.id].max) s.level++; }
      else if (p.passives.length < MAX_PASSIVES) p.passives.push({ id: o.id, level: 1 });
    } else if (o.type === 'gold') p.gold += 25 * p.stats.greed;
    else if (o.type === 'heal') p.hp = Math.min(p.stats.maxHp, p.hp + 30);
    this.recalc(p);
    if (p.pauseQueue > 0) p.pauseQueue--;
    else if (p.freeQueue > 0) p.freeQueue--;
    p.offer = null;
    this.room.sendTo(p.slot, { t: 'offerDone' });
    if (p.pauseQueue === 0 && p.freeQueue === 0) p.invuln = Math.max(p.invuln, 0.5);
    this.sendWaiting();
  }

  reroll(slot) {
    const p = this.getPlayer(slot);
    if (!p || !p.offer || p.rerolls <= 0) return;
    p.rerolls--;
    this.makeOffer(p);
  }

  // ---------------------------------------------------------------- chests
  openChest(p) {
    const items = [];
    for (const w of p.weapons) {
      const ev = EVOLUTIONS[w.id];
      if (ev && w.level >= weaponMaxLevel(w.id) && p.passives.some(s => s.id === ev.with)) {
        for (const pr of this.projectiles) if (pr.w === w) pr.dead = true;
        w.id = ev.into; w.def = WEAPONS[ev.into]; w.level = 1; w.cd = 0.2; w.burst = 0;
        items.push({ type: 'weapon', id: ev.into, level: 1, evolved: true });
        this.room.broadcast({ t: 'toast', text: `${p.name} evolved ${WEAPONS[ev.into].name}!`, color: '#ffd84a', big: true });
        break;
      }
    }
    if (!items.length) {
      const r = Math.random(), luck = p.stats.luck;
      const count = r < 0.04 * luck ? 5 : r < 0.15 * luck ? 3 : 1;
      for (let i = 0; i < count; i++) {
        const up = [];
        for (const w of p.weapons) if (!w.def.evolved && w.level < weaponMaxLevel(w.id)) up.push(w);
        for (const s of p.passives) if (s.level < PASSIVES[s.id].max) up.push(s);
        if (!up.length) break;
        const it = pickOne(up);
        it.level++;
        items.push({ type: it.def ? 'weapon' : 'passive', id: it.id, level: it.level });
      }
    }
    const gold = Math.round((items.length ? 20 + Math.random() * 30 : 120) * p.stats.greed);
    p.gold += gold;
    this.recalc(p);
    this.events.push({ type: EV.CHEST, x: p.x, y: p.y, slot: p.slot });
    this.room.sendTo(p.slot, { t: 'chest', items, gold });
  }

  // ---------------------------------------------------------------- end
  end(victory) {
    if (this.over) return;
    this.over = true;
    if (victory) {
      for (const e of this.enemies) if (!e.dead && !e.prop) {
        this.events.push({ type: EV.DEATH, x: e.x, y: e.y, a: e.tid, b: 0 });
        e.dead = true;
      }
      compact(this.enemies);
    }
    const minutes = this.time / 60;
    const results = {
      victory, time: this.time, kills: this.kills, level: this.level, stage: this.stage.id, length: this.lengthMin,
      players: this.players.filter(p => !p.left).map(p => {
        const bonus = Math.round((minutes * 8 + p.kills * 0.05 + (victory ? 150 : 0)) * p.stats.greed);
        return {
          slot: p.slot, name: p.name, char: p.char, kills: p.kills, gold: Math.floor(p.gold) + bonus,
          weapons: p.weapons.map(w => ({ id: w.id, level: w.level, dmg: Math.round(w.dmg) })),
          passives: p.passives.map(s => ({ id: s.id, level: s.level })),
        };
      }),
    };
    this.room.onGameOver(results);
  }

  // ---------------------------------------------------------------- networking
  roster() {
    return {
      t: 'roster',
      players: this.players.filter(p => !p.left).map(p => ({
        slot: p.slot, name: p.name, char: p.char, connected: p.connected, dead: p.dead,
        weapons: p.weapons.map(w => [w.id, w.level]),
        passives: p.passives.map(s => [s.id, s.level]),
        stats: p.stats, rerolls: p.rerolls, revivals: p.revivals,
      })),
    };
  }

  sendSnapshots() {
    this.now = now();
    for (const p of this.players) {
      if (!p.connected) continue;
      let c = p;
      if (p.dead) {
        const t = this.getPlayer(p.spec);
        c = (t && t.connected && !t.dead) ? t : (this.alivePlayers()[0] || p);
      }
      this.room.sendBinary(p.slot, encodeSnapshot(this, p, c.x, c.y));
    }
    this.events.length = 0;
  }
}
