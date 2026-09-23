// Binary snapshot format (server -> client). Everything little-endian.
// Entities are culled to a box around the viewer and stored as int16 offsets from an origin.
//
// header: u8 type=1 | f64 serverMs | f32 gameTime | f32 ox | f32 oy | u16 level | f32 xp | f32 xpNext
//         | u32 kills | u32 gold | u8 flags | u8 nPlayers
// player: u8 slot | u8 flags | f32 x | f32 y | u16 hp | u16 maxHp | u8 revive(0..255)
// u16 nEnemies, enemy: u16 id | u8 type | u8 flags | i16 x | i16 y | u8 hpPct
// u16 nProj,    proj:  u16 id | u8 kind | u8 flags(bit0 attached, bits1-3 owner) | i16 x | i16 y | u8 angle | u8 size*16
// u16 nPick,    pick:  u16 id | u8 kind | i16 x | i16 y
// u16 nEvents,  event: u8 type | i16 x | i16 y | u16 a | u8 b

import { CULL_X, CULL_Y } from './data.js';

export const MSG_SNAPSHOT = 1;
const HEADER = 1 + 8 + 4 + 4 + 4 + 2 + 4 + 4 + 4 + 4 + 1 + 1;
const P_SIZE = 15, E_SIZE = 9, PR_SIZE = 10, PK_SIZE = 7, EV_SIZE = 8;
const MAX_EVENTS = 260;

export const PF = { DEAD: 1, INVULN: 2, LEFT: 4, MOVING: 8, CHOOSING: 16, HURT: 32 };
export const EF = { FLASH: 1, LEFT: 2, ELITE: 4, FROZEN: 8, BOSS: 16 };
export const GF = { PAUSED: 1, LEVELUP: 2, FROZEN: 4 };

const clamp16 = (v) => (v < -32767 ? -32767 : v > 32767 ? 32767 : Math.round(v));
const TAU = Math.PI * 2;

// Scratch index lists reused between calls
let enIdx = new Int32Array(4096), prIdx = new Int32Array(4096), pkIdx = new Int32Array(4096), evIdx = new Int32Array(1024);

function grow(arr, n) { return n <= arr.length ? arr : new Int32Array(Math.max(n, arr.length * 2)); }

/**
 * @param g   game-ish object: { now, time, level, xp, xpNext, kills, flags, players, enemies, projectiles, pickups, events }
 * @param viewer  player object of the receiving client (for gold)
 * @param cx,cy   culling center
 */
export function encodeSnapshot(g, viewer, cx, cy) {
  const ox = Math.round(cx), oy = Math.round(cy);
  const x0 = cx - CULL_X, x1 = cx + CULL_X, y0 = cy - CULL_Y, y1 = cy + CULL_Y;

  const players = g.players.filter(p => p.connected);
  const enemies = g.enemies, projs = g.projectiles, picks = g.pickups, events = g.events;

  enIdx = grow(enIdx, enemies.length); prIdx = grow(prIdx, projs.length);
  pkIdx = grow(pkIdx, picks.length); evIdx = grow(evIdx, events.length);

  let ne = 0, np = 0, nk = 0, nv = 0;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.dead) continue;
    const pad = e.r;
    if (e.x > x0 - pad && e.x < x1 + pad && e.y > y0 - pad && e.y < y1 + pad) enIdx[ne++] = i;
  }
  if (ne > 65000) ne = 65000;
  for (let i = 0; i < projs.length; i++) {
    const p = projs[i];
    if (p.dead || p.hidden) continue;
    if (p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1) prIdx[np++] = i;
  }
  for (let i = 0; i < picks.length; i++) {
    const k = picks[i];
    if (k.dead) continue;
    if (k.x > x0 && k.x < x1 && k.y > y0 && k.y < y1) pkIdx[nk++] = i;
  }
  // Two passes: important events first, then damage numbers until the cap is reached.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < events.length && nv < MAX_EVENTS; i++) {
      const v = events[i];
      if ((v.type === 1) !== (pass === 1)) continue; // type 1 = damage number
      // player-bound events always go to their player; world events are culled
      if ((v.slot !== undefined && v.slot === viewer.slot) ||
          (v.x > x0 && v.x < x1 && v.y > y0 && v.y < y1)) evIdx[nv++] = i;
    }
  }

  const size = HEADER + players.length * P_SIZE + 2 + ne * E_SIZE + 2 + np * PR_SIZE + 2 + nk * PK_SIZE + 2 + nv * EV_SIZE;
  const buf = new ArrayBuffer(size);
  const dv = new DataView(buf);
  let o = 0;
  dv.setUint8(o, MSG_SNAPSHOT); o += 1;
  dv.setFloat64(o, g.now, true); o += 8;
  dv.setFloat32(o, g.time, true); o += 4;
  dv.setFloat32(o, ox, true); o += 4;
  dv.setFloat32(o, oy, true); o += 4;
  dv.setUint16(o, g.level, true); o += 2;
  dv.setFloat32(o, g.xp, true); o += 4;
  dv.setFloat32(o, g.xpNext, true); o += 4;
  dv.setUint32(o, g.kills, true); o += 4;
  dv.setUint32(o, Math.floor(viewer.gold || 0), true); o += 4;
  dv.setUint8(o, g.flags); o += 1;
  dv.setUint8(o, players.length); o += 1;

  for (const p of players) {
    let f = 0;
    if (p.dead) f |= PF.DEAD;
    if (p.invuln > 0) f |= PF.INVULN;
    if (p.faceLeft) f |= PF.LEFT;
    if (p.moving) f |= PF.MOVING;
    if (p.offer && p.freeQueue > 0 && p.pauseQueue === 0) f |= PF.CHOOSING;
    if (p.hurtFlash > 0) f |= PF.HURT;
    dv.setUint8(o, p.slot); o += 1;
    dv.setUint8(o, f); o += 1;
    dv.setFloat32(o, p.x, true); o += 4;
    dv.setFloat32(o, p.y, true); o += 4;
    dv.setUint16(o, Math.max(0, Math.min(65535, Math.ceil(p.hp))), true); o += 2;
    dv.setUint16(o, Math.min(65535, Math.round(p.stats.maxHp)), true); o += 2;
    dv.setUint8(o, Math.max(0, Math.min(255, Math.floor(p.revive * 255)))); o += 1;
  }

  dv.setUint16(o, ne, true); o += 2;
  for (let j = 0; j < ne; j++) {
    const e = enemies[enIdx[j]];
    let f = 0;
    if (e.flash > 0) f |= EF.FLASH;
    if (e.faceLeft) f |= EF.LEFT;
    if (e.elite) f |= EF.ELITE;
    if (e.frozen) f |= EF.FROZEN;
    if (e.boss) f |= EF.BOSS;
    dv.setUint16(o, e.id, true); o += 2;
    dv.setUint8(o, e.tid); o += 1;
    dv.setUint8(o, f); o += 1;
    dv.setInt16(o, clamp16(e.x - ox), true); o += 2;
    dv.setInt16(o, clamp16(e.y - oy), true); o += 2;
    dv.setUint8(o, Math.max(0, Math.min(255, Math.ceil(e.hp / e.maxHp * 255)))); o += 1;
  }

  dv.setUint16(o, np, true); o += 2;
  for (let j = 0; j < np; j++) {
    const p = projs[prIdx[j]];
    let f = 0, px = p.x - ox, py = p.y - oy;
    if (p.attached) { f = 1 | ((p.owner.slot & 7) << 1); px = p.x - p.owner.x; py = p.y - p.owner.y; }
    let a = p.ang % TAU; if (a < 0) a += TAU;
    dv.setUint16(o, p.id, true); o += 2;
    dv.setUint8(o, p.pk); o += 1;
    dv.setUint8(o, f); o += 1;
    dv.setInt16(o, clamp16(px), true); o += 2;
    dv.setInt16(o, clamp16(py), true); o += 2;
    dv.setUint8(o, Math.round(a / TAU * 256) & 255); o += 1;
    dv.setUint8(o, Math.max(1, Math.min(255, Math.round(p.size * 16)))); o += 1;
  }

  dv.setUint16(o, nk, true); o += 2;
  for (let j = 0; j < nk; j++) {
    const k = picks[pkIdx[j]];
    dv.setUint16(o, k.id, true); o += 2;
    dv.setUint8(o, k.pk); o += 1;
    dv.setInt16(o, clamp16(k.x - ox), true); o += 2;
    dv.setInt16(o, clamp16(k.y - oy), true); o += 2;
  }

  dv.setUint16(o, nv, true); o += 2;
  for (let j = 0; j < nv; j++) {
    const v = events[evIdx[j]];
    dv.setUint8(o, v.type); o += 1;
    dv.setInt16(o, clamp16((v.x || 0) - ox), true); o += 2;
    dv.setInt16(o, clamp16((v.y || 0) - oy), true); o += 2;
    dv.setUint16(o, Math.max(0, Math.min(65535, Math.round(v.a || 0))), true); o += 2;
    dv.setUint8(o, (v.b ?? v.slot ?? 0) & 255); o += 1;
  }
  return buf;
}

export function decodeSnapshot(buf) {
  const dv = new DataView(buf);
  let o = 0;
  const type = dv.getUint8(o); o += 1;
  if (type !== MSG_SNAPSHOT) return null;
  const s = {};
  s.st = dv.getFloat64(o, true); o += 8;
  s.time = dv.getFloat32(o, true); o += 4;
  const ox = dv.getFloat32(o, true); o += 4;
  const oy = dv.getFloat32(o, true); o += 4;
  s.ox = ox; s.oy = oy;
  s.level = dv.getUint16(o, true); o += 2;
  s.xp = dv.getFloat32(o, true); o += 4;
  s.xpNext = dv.getFloat32(o, true); o += 4;
  s.kills = dv.getUint32(o, true); o += 4;
  s.gold = dv.getUint32(o, true); o += 4;
  s.flags = dv.getUint8(o); o += 1;
  const npl = dv.getUint8(o); o += 1;
  s.players = [];
  for (let i = 0; i < npl; i++) {
    const p = {};
    p.slot = dv.getUint8(o); o += 1;
    p.flags = dv.getUint8(o); o += 1;
    p.x = dv.getFloat32(o, true); o += 4;
    p.y = dv.getFloat32(o, true); o += 4;
    p.hp = dv.getUint16(o, true); o += 2;
    p.maxHp = dv.getUint16(o, true); o += 2;
    p.revive = dv.getUint8(o) / 255; o += 1;
    s.players.push(p);
  }

  const ne = dv.getUint16(o, true); o += 2;
  const en = { n: ne, id: new Uint16Array(ne), type: new Uint8Array(ne), flags: new Uint8Array(ne),
    x: new Float32Array(ne), y: new Float32Array(ne), hp: new Uint8Array(ne), map: null };
  for (let i = 0; i < ne; i++) {
    en.id[i] = dv.getUint16(o, true); o += 2;
    en.type[i] = dv.getUint8(o); o += 1;
    en.flags[i] = dv.getUint8(o); o += 1;
    en.x[i] = dv.getInt16(o, true) + ox; o += 2;
    en.y[i] = dv.getInt16(o, true) + oy; o += 2;
    en.hp[i] = dv.getUint8(o); o += 1;
  }
  s.en = en;

  const np = dv.getUint16(o, true); o += 2;
  const pr = { n: np, id: new Uint16Array(np), kind: new Uint8Array(np), flags: new Uint8Array(np),
    x: new Float32Array(np), y: new Float32Array(np), ang: new Float32Array(np), size: new Float32Array(np), map: null };
  for (let i = 0; i < np; i++) {
    pr.id[i] = dv.getUint16(o, true); o += 2;
    pr.kind[i] = dv.getUint8(o); o += 1;
    const f = dv.getUint8(o); o += 1;
    pr.flags[i] = f;
    const px = dv.getInt16(o, true); o += 2;
    const py = dv.getInt16(o, true); o += 2;
    pr.x[i] = (f & 1) ? px : px + ox;
    pr.y[i] = (f & 1) ? py : py + oy;
    pr.ang[i] = dv.getUint8(o) / 256 * TAU; o += 1;
    pr.size[i] = dv.getUint8(o) / 16; o += 1;
  }
  s.pr = pr;

  const nk = dv.getUint16(o, true); o += 2;
  const pk = { n: nk, id: new Uint16Array(nk), kind: new Uint8Array(nk), x: new Float32Array(nk), y: new Float32Array(nk), map: null };
  for (let i = 0; i < nk; i++) {
    pk.id[i] = dv.getUint16(o, true); o += 2;
    pk.kind[i] = dv.getUint8(o); o += 1;
    pk.x[i] = dv.getInt16(o, true) + ox; o += 2;
    pk.y[i] = dv.getInt16(o, true) + oy; o += 2;
  }
  s.pk = pk;

  const nv = dv.getUint16(o, true); o += 2;
  s.ev = [];
  for (let i = 0; i < nv; i++) {
    const t = dv.getUint8(o); o += 1;
    const x = dv.getInt16(o, true) + ox; o += 2;
    const y = dv.getInt16(o, true) + oy; o += 2;
    const a = dv.getUint16(o, true); o += 2;
    const b = dv.getUint8(o); o += 1;
    s.ev.push({ type: t, x, y, a, b });
  }
  return s;
}
