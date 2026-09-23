// Headless balance/performance simulation: bots play a full run as fast as possible.
// usage: node tools/sim.js [players=2] [minutes=20] [stage=forest]
import { Game } from '../server/game.js';
import { TICK_RATE, SNAP_EVERY, CHARACTERS, WEAPONS } from '../shared/data.js';
import { encodeSnapshot, decodeSnapshot } from '../shared/protocol.js';

const N = parseInt(process.argv[2] || '2', 10);
const MIN = parseInt(process.argv[3] || '20', 10);
const STAGE = process.argv[4] || 'forest';
const dt = 1 / TICK_RATE;

const pendingPicks = [];
const room = {
  sendTo(slot, msg) { if (msg.t === 'offer') pendingPicks.push(slot); },
  broadcast(msg) { if (msg.t === 'toast') console.log(`   [toast] ${msg.text}`); },
  sendBinary() {},
  onGameOver(r) { results = r; },
};
let results = null;

const chars = CHARACTERS.map(c => c.id);
const members = Array.from({ length: N }, (_, i) => ({ slot: i, name: `Bot${i}`, char: chars[(i * 3 + 1) % chars.length], powerups: {} }));
const DIFF = process.argv[5] || 'normal';
const g = new Game(room, { stage: STAGE, length: MIN, difficulty: DIFF }, members);
// DMGLOG: attribute damage taken to enemy types (debug aid)
const dmgBy = {};
if (process.env.DMGLOG) {
  const orig = g.damagePlayer.bind(g);
  g.damagePlayer = (p, dmg) => {
    const hp = p.hp; orig(p, dmg);
    let best = null, bd = 1e9;
    for (const e of g.enemies) { if (e.dead || e.prop) continue; const d = Math.hypot(e.x - p.x, e.y - p.y) - e.r; if (d < bd) { bd = d; best = e; } }
    const k = best ? best.type + (best.elite ? '*' : '') + (best.move === 'fixed' ? '~' : '') : '?';
    dmgBy[k] = Math.round((dmgBy[k] || 0) + hp - Math.max(0, p.hp));
  };
}

// Bot: pick the least crowded of 16 directions, bias toward gems when safe, revive friends.
const DIRS = Array.from({ length: 16 }, (_, i) => [Math.cos(i / 16 * Math.PI * 2), Math.sin(i / 16 * Math.PI * 2)]);
function botInput(p, t) {
  if (p.dead) return;
  const near = [];
  for (const e of g.enemies) {
    if (e.dead || e.prop) continue;
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
    if (d < 260) near.push([dx / d, dy / d, d, e.r]);
  }
  let gx = 0, gy = 0, gd = 420;
  for (const k of g.pickups) {
    if (k.dead || k.target) continue;
    const d = Math.hypot(k.x - p.x, k.y - p.y);
    if (d < gd) { gd = d; gx = (k.x - p.x) / d; gy = (k.y - p.y) / d; }
  }
  const down = g.players.find(q => q.dead && q.connected);
  let tx = Math.cos(t * 0.3 + p.slot * 2) * 0.3, ty = Math.sin(t * 0.3 + p.slot * 2) * 0.3;
  if (down) { const dx = down.x - p.x, dy = down.y - p.y, d = Math.hypot(dx, dy) || 1; tx += dx / d * 2; ty += dy / d * 2; }
  else if (gx || gy) { tx += gx; ty += gy; }
  let best = null, bc = Infinity;
  for (const [cx, cy] of DIRS) {
    let cost = -(cx * tx + cy * ty) * 0.6;
    for (const [nx, ny, d, r] of near) {
      const dot = cx * nx + cy * ny;
      if (dot > 0) cost += dot * dot * (60 + r) / Math.max(20, d - r);
    }
    if (cost < bc) { bc = cost; best = [cx, cy]; }
  }
  const [mx, my] = best;
  const sp = 135 * p.stats.moveSpeed * dt;
  g.input(p.slot, { x: p.x + mx * sp, y: p.y + my * sp, dx: mx, dy: my, tp: p.tp });
}

// Prefer upgrading what we have, then new weapons, then passives that evolve something we own.
function botPick(slot) {
  const p = g.getPlayer(slot);
  if (!p || !p.offer) return;
  let best = 0, bs = -1;
  p.offer.forEach((o, i) => {
    let sc = Math.random();
    if (o.type === 'weapon') sc += o.level > 1 ? 2.4 : (p.weapons.length < 4 ? 2.2 : 0.8);
    if (o.type === 'passive') sc += p.weapons.some(w => w.def.evolve && w.def.evolve.with === o.id) ? 2.6 : 1.7;
    if (sc > bs) { bs = sc; best = i; }
  });
  g.choose(slot, best);
}

let tickMs = 0, tickMax = 0, ticks = 0, snapBytes = 0, snapN = 0, lastMin = -1;
const t0 = performance.now();
while (!g.over && ticks < MIN * 60 * TICK_RATE + 100) {
  while (pendingPicks.length) botPick(pendingPicks.shift());
  for (const p of g.players) botInput(p, g.time);
  const a = performance.now();
  g.tick(dt);
  const took = performance.now() - a;
  tickMs += took; tickMax = Math.max(tickMax, took);
  ticks++;
  if (ticks % SNAP_EVERY === 0) {
    const buf = encodeSnapshot(g, g.players[0], g.players[0].x, g.players[0].y);
    snapBytes += buf.byteLength; snapN++;
    if (ticks % (TICK_RATE * 60) === 0) {
      const s = decodeSnapshot(buf);
      if (s.en.n > 0 && Math.abs(s.en.x[0] - g.enemies.find(e => e.id === s.en.id[0]).x) > 1) console.log('!! decode mismatch');
    }
    g.events.length = 0;
  }
  const m = Math.floor(g.time / 60);
  if (m !== lastMin) {
    lastMin = m;
    const en = g.enemies.filter(e => !e.prop).length;
    const hp = g.players.map(p => `${p.dead ? 'DEAD' : Math.round(p.hp) + '/' + p.stats.maxHp}`).join(' ');
    const wl = g.players.map(p => p.weapons.map(w => `${w.id}${w.def.evolved ? '*' : w.level}`).join(',') + ' +' + p.passives.map(s => s.id + s.level).join(',')).join(' | ');
    console.log(`t=${m}m lvl=${g.level} kills=${g.kills} enemies=${en} proj=${g.projectiles.length} picks=${g.pickups.length} ` +
      `avgTick=${(tickMs / ticks).toFixed(2)}ms max=${tickMax.toFixed(1)}ms snap=${snapN ? Math.round(snapBytes / snapN) : 0}B hp=[${hp}]`);
    console.log(`      weapons: ${wl}`);
    if (process.env.DMGLOG) { console.log('      dmg taken:', JSON.stringify(dmgBy)); for (const k in dmgBy) delete dmgBy[k]; }
    tickMax = 0;
  }
}
console.log(`\nDone in ${((performance.now() - t0) / 1000).toFixed(1)}s. Result: ${results ? (results.victory ? 'VICTORY' : 'DEFEAT') : 'none'} at ${(g.time / 60).toFixed(1)}m, level ${g.level}, kills ${g.kills}`);
if (results) for (const p of results.players) {
  console.log(`  ${p.name} (${p.char}) kills=${p.kills} gold=${p.gold}`);
  for (const w of p.weapons) console.log(`     ${WEAPONS[w.id].name.padEnd(16)} L${w.level}  dmg=${w.dmg}`);
}
