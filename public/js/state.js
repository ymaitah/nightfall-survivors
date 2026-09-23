// Client-side view of a running game: snapshot buffer + interpolation, local prediction, events.
import { decodeSnapshot, PF, GF } from '/shared/protocol.js';
import { BASE_SPEED, EV, PICKUP_KINDS, TICK_RATE, SNAP_EVERY } from '/shared/data.js';
import { sfx, setIntensity } from './audio.js';
import { Effects } from './effects.js';

const SNAP_MS = 1000 / TICK_RATE * SNAP_EVERY;
const INTERP = SNAP_MS * 1.6 + 12;
const SEND_MS = 1000 / 30;

function ensure(buf, n, Type) { return buf && buf.length >= n ? buf : new Type(Math.max(n, 64) * 2); }
function mapOf(set) {
  if (!set.map) { set.map = new Map(); for (let i = 0; i < set.n; i++) set.map.set(set.id[i], i); }
  return set.map;
}

export class ClientGame {
  constructor(start, net) {
    this.net = net;
    this.slot = start.slot;
    this.stageId = start.stage;
    this.length = start.length;
    this.me = { x: start.x, y: start.y, tp: start.tp, fx: 1, fy: 0, faceLeft: false, moving: false, walk: 0 };
    this.snaps = [];
    this.offset = null;
    this.roster = new Map();
    this.fx = new Effects();
    this.pending = [];
    this.sendT = 0;
    this.spec = -1;
    this.latest = null;
    this.shake = 0;
    this.hurtFlash = 0;
    this.whiteFlash = 0;
    this.levelSoundT = 0;
    this.lastGold = 0;
    this.fr = { en: { n: 0 }, pr: { n: 0 }, pk: { n: 0 }, players: [] };
    this.cam = { x: start.x, y: start.y };
    this.blocked = false; // UI overlay open (e.g. chat)
  }

  onRoster(msg) {
    this.roster.clear();
    for (const p of msg.players) this.roster.set(p.slot, p);
  }
  get myInfo() { return this.roster.get(this.slot); }

  teleport(msg) { this.me.x = msg.x; this.me.y = msg.y; this.me.tp = msg.tp; }

  onSnapshot(buf) {
    const s = decodeSnapshot(buf);
    if (!s) return;
    const sample = s.st - performance.now();
    if (this.offset === null || sample > this.offset) this.offset = sample;
    else this.offset += (sample - this.offset) * 0.005;
    this.snaps.push(s);
    if (this.snaps.length > 40) this.snaps.shift();
    this.latest = s;
    for (const ev of s.ev) this.pending.push(s.st, ev);
    // a backgrounded tab stops rendering but keeps receiving: don't let queued effects pile up
    if (this.pending.length > 4000) this.pending.splice(0, this.pending.length - 2000);
  }

  mySnap(s = this.latest) { return s ? s.players.find(p => p.slot === this.slot) : null; }
  get dead() { const m = this.mySnap(); return !!(m && (m.flags & PF.DEAD)); }
  get pausedFlags() { return this.latest ? this.latest.flags : 0; }

  // ------------------------------------------------------------------ per-frame update
  update(dt, mv) {
    const me = this.me;
    const snapMe = this.mySnap();
    const flags = this.pausedFlags;
    const frozen = (flags & (GF.PAUSED | GF.LEVELUP)) || (snapMe && (snapMe.flags & PF.CHOOSING));
    const dead = snapMe && (snapMe.flags & PF.DEAD);
    const info = this.myInfo;
    if (dead) {
      me.x = snapMe.x; me.y = snapMe.y; me.moving = false;
    } else if (!frozen && !this.blocked) {
      const speed = BASE_SPEED * (info ? info.stats.moveSpeed : 1);
      me.x += mv[0] * speed * dt;
      me.y += mv[1] * speed * dt;
    }
    const ml = Math.hypot(mv[0], mv[1]);
    me.moving = !dead && !frozen && ml > 0.1;
    if (ml > 0.1) { me.fx = mv[0] / ml; me.fy = mv[1] / ml; if (Math.abs(mv[0]) > 0.05) me.faceLeft = mv[0] < 0; }
    if (me.moving) me.walk += dt * 8; else me.walk = 0;
    // safety net: if prediction drifted far from the server, snap back
    if (snapMe && !dead && Math.hypot(snapMe.x - me.x, snapMe.y - me.y) > 260) { me.x = snapMe.x; me.y = snapMe.y; }

    this.sendT -= dt * 1000;
    if (this.sendT <= 0) {
      this.sendT = SEND_MS;
      if (dead) this.net.send({ t: 'in', spec: this.specTarget() });
      else this.net.send({ t: 'in', x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10, dx: frozen ? 0 : mv[0], dy: frozen ? 0 : mv[1], tp: me.tp });
    }
    this.fx.update(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 3);
    if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.5);
    if (this.whiteFlash > 0) this.whiteFlash = Math.max(0, this.whiteFlash - dt * 1.5);
  }

  specTarget() {
    const s = this.latest;
    if (!s) return -1;
    const alive = s.players.filter(p => !(p.flags & PF.DEAD));
    if (!alive.length) return -1;
    if (!alive.some(p => p.slot === this.spec)) this.spec = alive[0].slot;
    return this.spec;
  }
  cycleSpectate() {
    const s = this.latest;
    if (!s) return;
    const alive = s.players.filter(p => !(p.flags & PF.DEAD)).map(p => p.slot);
    if (!alive.length) return;
    const i = alive.indexOf(this.spec);
    this.spec = alive[(i + 1) % alive.length];
  }

  // ------------------------------------------------------------------ interpolation
  buildFrame(now) {
    const snaps = this.snaps;
    if (!snaps.length) return null;
    const rt = now + this.offset - INTERP;
    let a = snaps[0], b = snaps[0];
    for (let i = snaps.length - 1; i >= 0; i--) {
      if (snaps[i].st <= rt) { a = snaps[i]; b = snaps[i + 1] || snaps[i]; break; }
    }
    const t = b === a ? 0 : Math.max(0, Math.min(1, (rt - a.st) / (b.st - a.st)));
    // fire events that belong to snapshots we are now displaying
    const pend = this.pending;
    let k = 0;
    while (k < pend.length && pend[k] <= rt + SNAP_MS) {
      if (pend[k] > rt - 600) this.handleEvent(pend[k + 1]); // skip stale effects (e.g. after the tab was hidden)
      k += 2;
    }
    if (k) pend.splice(0, k);

    const fr = this.fr;
    fr.a = a; fr.b = b; fr.t = t; fr.flags = b.flags;
    // players
    fr.players.length = 0;
    for (const pb of b.players) {
      const pa = a.players.find(p => p.slot === pb.slot) || pb;
      const p = { slot: pb.slot, flags: pb.flags, hp: pb.hp, maxHp: pb.maxHp, revive: pb.revive,
        x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t, local: false };
      if (pb.slot === this.slot) {
        p.local = true;
        if (!(pb.flags & PF.DEAD)) { p.x = this.me.x; p.y = this.me.y; }
        p.moving = this.me.moving; p.faceLeft = this.me.faceLeft; p.walk = this.me.walk;
      } else {
        p.moving = !!(pb.flags & PF.MOVING); p.faceLeft = !!(pb.flags & PF.LEFT);
        p.walk = p.moving ? now / 125 + pb.slot : 0;
      }
      fr.players.push(p);
    }
    const bySlot = fr.bySlot || (fr.bySlot = new Map());
    bySlot.clear();
    for (const p of fr.players) bySlot.set(p.slot, p);

    // enemies
    const en = fr.en, be = b.en, ae = a.en, am = mapOf(ae);
    en.n = be.n;
    en.x = ensure(en.x, be.n, Float32Array); en.y = ensure(en.y, be.n, Float32Array);
    en.id = be.id; en.type = be.type; en.flags = be.flags; en.hp = be.hp;
    for (let i = 0; i < be.n; i++) {
      const j = am.get(be.id[i]);
      if (j !== undefined && Math.abs(ae.x[j] - be.x[i]) < 200) {
        en.x[i] = ae.x[j] + (be.x[i] - ae.x[j]) * t;
        en.y[i] = ae.y[j] + (be.y[i] - ae.y[j]) * t;
      } else { en.x[i] = be.x[i]; en.y[i] = be.y[i]; }
    }
    // projectiles
    const pr = fr.pr, bp = b.pr, ap = a.pr, apm = mapOf(ap);
    pr.n = bp.n;
    pr.x = ensure(pr.x, bp.n, Float32Array); pr.y = ensure(pr.y, bp.n, Float32Array);
    pr.id = bp.id; pr.kind = bp.kind; pr.flags = bp.flags; pr.ang = bp.ang; pr.size = bp.size;
    for (let i = 0; i < bp.n; i++) {
      const j = apm.get(bp.id[i]);
      let x = bp.x[i], y = bp.y[i];
      if (j !== undefined && (ap.flags[j] & 1) === (bp.flags[i] & 1)) { x = ap.x[j] + (x - ap.x[j]) * t; y = ap.y[j] + (y - ap.y[j]) * t; }
      if (bp.flags[i] & 1) {
        const owner = bySlot.get((bp.flags[i] >> 1) & 7);
        if (owner) { x += owner.x; y += owner.y; } else { x = -1e6; }
      }
      pr.x[i] = x; pr.y[i] = y;
    }
    // pickups
    const pk = fr.pk, bk = b.pk, ak = a.pk, akm = mapOf(ak);
    pk.n = bk.n;
    pk.x = ensure(pk.x, bk.n, Float32Array); pk.y = ensure(pk.y, bk.n, Float32Array);
    pk.id = bk.id; pk.kind = bk.kind;
    for (let i = 0; i < bk.n; i++) {
      const j = akm.get(bk.id[i]);
      if (j !== undefined) { pk.x[i] = ak.x[j] + (bk.x[i] - ak.x[j]) * t; pk.y[i] = ak.y[j] + (bk.y[i] - ak.y[j]) * t; }
      else { pk.x[i] = bk.x[i]; pk.y[i] = bk.y[i]; }
    }

    // camera
    let target = bySlot.get(this.slot);
    if (target && (target.flags & PF.DEAD)) {
      const s = bySlot.get(this.specTarget());
      if (s) target = s;
    }
    if (target) {
      this.cam.x += (target.x - this.cam.x) * (target.local ? 1 : 0.2);
      this.cam.y += (target.y - this.cam.y) * (target.local ? 1 : 0.2);
    }
    setIntensity(Math.min(1, be.n / 220));
    return fr;
  }

  playerPos(slot) {
    const p = this.fr.bySlot && this.fr.bySlot.get(slot);
    return p ? p : null;
  }

  // ------------------------------------------------------------------ events -> effects & sounds
  handleEvent(ev) {
    const fx = this.fx, mine = ev.b === this.slot;
    switch (ev.type) {
      case EV.DMG: fx.damage(ev.x, ev.y, ev.a, ev.b === 1); sfx.hit(); break;
      case EV.DEATH: fx.death(ev.x, ev.y, ev.a, ev.b); sfx.kill(); break;
      case EV.HURT:
        if (mine) { sfx.hurt(); this.hurtFlash = 1; this.shake = Math.min(1, this.shake + 0.35); }
        fx.number(ev.x, ev.y - 30, ev.a, 'red');
        break;
      case EV.WHIP: {
        const a = ev.a;
        fx.whip(ev.b, a & 4095, (a >> 12) & 3, !!(a & 0x4000), (a & 0x8000) ? -1 : 1);
        if (mine) sfx.whip();
        break;
      }
      case EV.LIGHTNING: fx.lightning(ev.x, ev.y, ev.a, ev.b); sfx.lightning(); break;
      case EV.EXPLODE: fx.explosion(ev.x, ev.y, ev.a, ev.b); if (ev.b !== 2) sfx.explode(); break;
      case EV.PICKUP: {
        const kind = PICKUP_KINDS[ev.a];
        if (mine) {
          if (kind.startsWith('gem')) sfx.gem();
          else if (kind === 'coin' || kind === 'bag') sfx.coin();
          else if (kind === 'magnet') sfx.pick();
          else if (kind === 'clock') sfx.freeze();
        }
        if (!kind.startsWith('gem')) fx.sparkle(ev.x, ev.y, kind === 'coin' || kind === 'bag' ? '#ffd84a' : '#ffffff');
        break;
      }
      case EV.RELIC:
        fx.ring(ev.x, ev.y, 10, 700, 0.8, '#fff6c0', 10);
        if (mine) { this.whiteFlash = 1; sfx.relic(); }
        break;
      case EV.CHEST: fx.pillar(ev.x, ev.y); break;
      case EV.REVIVE: fx.ring(ev.x, ev.y, 10, 180, 0.6, '#7dffa0', 6); fx.burst(ev.x, ev.y, '#b0ffc0', 30); sfx.revive(); break;
      case EV.HEAL: if (ev.a > 0) fx.number(ev.x, ev.y - 30, ev.a, 'green'); if (mine) sfx.heal(); break;
      case EV.DOWN: fx.burst(ev.x, ev.y, '#ff5a5a', 40); sfx.down(); break;
      case EV.BRAZIER: fx.burst(ev.x, ev.y - 12, '#ffb040', 16); sfx.brazier(); break;
      case EV.LEVELUP: {
        const t = performance.now();
        if (t - this.levelSoundT > 400) { this.levelSoundT = t; sfx.levelup(); }
        for (const p of this.fr.players) fx.ring(p.x, p.y, 8, 90, 0.5, '#8ad8ff', 4);
        break;
      }
    }
  }
}
