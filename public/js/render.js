// Canvas renderer: world (ground, entities, projectiles, effects) + HUD.
import { PX, ENEMY_SPR, CHAR_SPR, PICKUP_SPR, PROJ_SPR, GROUND, DECOR, ICONS } from './sprites.js';
import {
  ENEMIES, ENEMY_LIST, PROJ_KINDS, PICKUP_KINDS, SLOT_COLORS, VIEW_W, VIEW_H, WEAPONS, PASSIVES,
  weaponStats, weaponMaxLevel, STAGE_BY_ID, CHAR_BY_ID,
} from '/shared/data.js';
import { PF, EF, GF } from '/shared/protocol.js';
import { touchState } from './input.js';

const TAU = Math.PI * 2;
const FONT = '"Pixelify Sans", "Trebuchet MS", sans-serif';
const TITLE_FONT = '"Silkscreen", "Pixelify Sans", monospace';
const GLOWS = new Set(['bolt', 'torrent', 'fireball', 'inferno']);
const SPIN = { axe: 14, spiral: 16, cross: 12, heaven: 14, flask: 10, fflask: 10, rune: 8, srune: 10 };
const FLYERS = new Set(['bat', 'icebat', 'batlord', 'ghost', 'eye', 'wraith', 'icewraith', 'nightlord']);
const GHOSTLY = new Set(['ghost', 'wraith', 'icewraith', 'nightlord']);
const BOSS_NAMES = { batlord: 'The Bat Lord', colossus: 'The Bone Colossus', nightlord: 'The Night Lord', frostgiant: 'The Frost Giant' };

function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class Renderer {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.patterns = {};
    this.order = [];
    this.fps = 60;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = window.innerWidth, h = window.innerHeight;
    this.c.width = Math.round(w * dpr);
    this.c.height = Math.round(h * dpr);
    this.c.style.width = w + 'px';
    this.c.style.height = h + 'px';
    this.W = this.c.width; this.H = this.c.height; this.dpr = dpr;
    this.zoom = Math.max(0.5, Math.ceil(2 * Math.max(this.W / VIEW_W, this.H / VIEW_H)) / 2);
    this.u = dpr * Math.min(1.3, Math.max(0.7, Math.min(w / 1280, h / 720) * 1.15));
    this.vignette = null;
  }

  pattern(ground) {
    if (!this.patterns[ground]) this.patterns[ground] = this.ctx.createPattern(GROUND[ground], 'repeat');
    return this.patterns[ground];
  }

  makeVignette(strength) {
    const c = document.createElement('canvas');
    c.width = this.W; c.height = this.H;
    const x = c.getContext('2d');
    const r = Math.hypot(this.W, this.H) / 2;
    const g = x.createRadialGradient(this.W / 2, this.H / 2, r * 0.35, this.W / 2, this.H / 2, r);
    g.addColorStop(0, 'rgba(4,2,12,0)');
    g.addColorStop(1, `rgba(4,2,12,${strength})`);
    x.fillStyle = g;
    x.fillRect(0, 0, this.W, this.H);
    return c;
  }

  // ------------------------------------------------------------------ ground
  drawGround(ground, camX, camY) {
    const ctx = this.ctx, z = this.zoom;
    const vw = this.W / z, vh = this.H / z;
    const x0 = camX - vw / 2, y0 = camY - vh / 2;
    ctx.fillStyle = this.pattern(ground);
    ctx.fillRect(x0 - 2, y0 - 2, vw + 4, vh + 4);
    const decor = DECOR[ground];
    const C = 84;
    const cx0 = Math.floor(x0 / C) - 1, cx1 = Math.ceil((x0 + vw) / C);
    const cy0 = Math.floor(y0 / C) - 1, cy1 = Math.ceil((y0 + vh) / C);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const h = hash(cx, cy, 7);
        if (h > 0.32) continue;
        const spr = decor[Math.floor(hash(cx, cy, 3) * decor.length)];
        const x = cx * C + hash(cx, cy, 11) * (C - 20), y = cy * C + hash(cx, cy, 13) * (C - 20);
        ctx.drawImage(spr, Math.round(x), Math.round(y), spr.width * PX, spr.height * PX);
      }
    }
  }

  // ------------------------------------------------------------------ main game frame
  drawGame(game, fr, now) {
    const ctx = this.ctx, z = this.zoom;
    const stage = STAGE_BY_ID[game.stageId];
    const sh = game.shake * 6;
    const camX = game.cam.x + (sh ? (Math.random() - 0.5) * sh : 0);
    const camY = game.cam.y + (sh ? (Math.random() - 0.5) * sh : 0);
    const tx = Math.round(this.W / 2 - camX * z), ty = Math.round(this.H / 2 - camY * z);
    ctx.setTransform(z, 0, 0, z, tx, ty);
    ctx.imageSmoothingEnabled = false;
    this.camX = camX; this.camY = camY; this.tx = tx; this.ty = ty;

    this.drawGround(stage.ground, camX, camY);

    const en = fr.en, pr = fr.pr, pk = fr.pk;
    const tsec = now / 1000;

    // pools of holy water under everything
    for (let i = 0; i < pr.n; i++) {
      const kind = PROJ_KINDS[pr.kind[i]];
      if (kind !== 'pool' && kind !== 'fpool') continue;
      const r = 38 * pr.size[i], x = pr.x[i], y = pr.y[i];
      const gold = kind === 'fpool';
      ctx.fillStyle = gold ? 'rgba(255,210,90,0.28)' : 'rgba(90,170,255,0.3)';
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.75, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = gold ? 'rgba(255,240,170,0.7)' : 'rgba(170,220,255,0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = gold ? 'rgba(255,250,210,0.8)' : 'rgba(220,240,255,0.8)';
      for (let k = 0; k < 4; k++) {
        const a = hash(pr.id[i], k, 5) * TAU + tsec * 0.8, rr = r * 0.6 * hash(pr.id[i], k, 9);
        const bob = (tsec * 2 + k) % 1;
        ctx.fillRect(x + Math.cos(a) * rr - 1.5, y + Math.sin(a) * rr * 0.75 - bob * 6, 3, 3);
      }
    }

    // auras (garlic / soul siphon)
    for (const p of fr.players) {
      if (p.flags & PF.DEAD) continue;
      const info = game.roster.get(p.slot);
      if (!info) continue;
      for (const [id, lvl] of info.weapons) {
        if (WEAPONS[id].kind !== 'aura') continue;
        const R = 46 * weaponStats(id, lvl).area * info.stats.area;
        const evo = WEAPONS[id].evolved;
        const pulse = 0.85 + Math.sin(tsec * 4) * 0.08;
        const g = ctx.createRadialGradient(p.x, p.y - 4, R * 0.2, p.x, p.y - 4, R * pulse);
        g.addColorStop(0, evo ? 'rgba(200,120,255,0.05)' : 'rgba(255,240,230,0.04)');
        g.addColorStop(0.8, evo ? 'rgba(200,120,255,0.22)' : 'rgba(255,220,220,0.2)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y - 4, R * pulse, 0, TAU); ctx.fill();
      }
    }

    // shadows
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    for (let i = 0; i < en.n; i++) {
      const def = ENEMIES[ENEMY_LIST[en.type[i]]];
      const s = (def.scale || 1) * ((en.flags[i] & EF.ELITE) ? 1.5 : 1);
      const rw = 9 * s, x = en.x[i], y = en.y[i] + def.r * 0.55;
      ctx.moveTo(x + rw, y); ctx.ellipse(x, y, rw, rw * 0.4, 0, 0, TAU);
    }
    for (const p of fr.players) { ctx.moveTo(p.x + 10, p.y + 8); ctx.ellipse(p.x, p.y + 8, 10, 4, 0, 0, TAU); }
    ctx.fill();

    // player colour rings
    for (const p of fr.players) {
      if (p.flags & PF.DEAD) continue;
      ctx.strokeStyle = SLOT_COLORS[p.slot];
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 8, 13, 5, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // pickups
    for (let i = 0; i < pk.n; i++) {
      const kind = PICKUP_KINDS[pk.kind[i]];
      const spr = PICKUP_SPR[kind];
      const x = pk.x[i], y = pk.y[i];
      const gem = kind.startsWith('gem');
      const bob = gem ? 0 : Math.sin(tsec * 3 + pk.id[i]) * 2;
      if (!gem) {
        const glowSpr = kind === 'chest' ? PROJ_SPR.glowGold : kind === 'chicken' ? PROJ_SPR.glowRed : PROJ_SPR.glowWhite;
        const gr = kind === 'chest' ? 30 : 16;
        ctx.globalAlpha = 0.5 + Math.sin(tsec * 4) * 0.2;
        ctx.drawImage(glowSpr, x - gr, y - gr - 4, gr * 2, gr * 2);
        ctx.globalAlpha = 1;
      }
      const s = kind === 'chest' ? PX * 1.2 : PX;
      ctx.drawImage(spr, Math.round(x - spr.width * s / 2), Math.round(y - spr.height * s / 2 + bob), spr.width * s, spr.height * s);
    }

    // depth-sorted enemies + players
    const order = this.order;
    order.length = 0;
    for (let i = 0; i < en.n; i++) order.push(i);
    for (let j = 0; j < fr.players.length; j++) order.push(-1 - j);
    const ys = (k) => k >= 0 ? en.y[k] : fr.players[-1 - k].y;
    order.sort((a, b) => ys(a) - ys(b));
    const bosses = [];
    for (const k of order) {
      if (k >= 0) this.drawEnemy(en, k, now, bosses);
      else this.drawPlayer(game, fr.players[-1 - k], now);
    }

    // projectiles
    for (let i = 0; i < pr.n; i++) {
      const kind = PROJ_KINDS[pr.kind[i]];
      if (kind === 'pool' || kind === 'fpool') continue;
      const x = pr.x[i], y = pr.y[i], size = pr.size[i];
      if (x < -1e5) continue;
      if (GLOWS.has(kind)) continue;
      const spr = PROJ_SPR[kind];
      if (!spr) continue;
      let ang = pr.ang[i];
      if (SPIN[kind]) ang = tsec * SPIN[kind] + pr.id[i];
      if (kind === 'book' || kind === 'ebook') ang = 0;
      const s = PX * size * (kind === 'spiral' ? 0.8 : 1);
      const w = spr.width * s, h = spr.height * s;
      if (kind === 'rune' || kind === 'srune' || kind === 'heaven' || kind === 'ebook') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5;
        const g = kind === 'srune' ? PROJ_SPR.glowRed : PROJ_SPR.glowWhite;
        ctx.drawImage(g, x - w, y - h, w * 2, h * 2);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      if (ang) {
        const c = Math.cos(ang), sn = Math.sin(ang);
        ctx.setTransform(z * c, z * sn, -z * sn, z * c, tx + x * z, ty + y * z);
        ctx.drawImage(spr, -w / 2, -h / 2, w, h);
        ctx.setTransform(z, 0, 0, z, tx, ty);
      } else ctx.drawImage(spr, x - w / 2, y - h / 2, w, h);
    }
    // glowing projectiles, additive
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < pr.n; i++) {
      const kind = PROJ_KINDS[pr.kind[i]];
      if (!GLOWS.has(kind)) continue;
      const x = pr.x[i], y = pr.y[i], size = pr.size[i];
      const base = kind === 'fireball' ? 15 : kind === 'inferno' ? 13 : 11;
      const r = base * size;
      const spr = PROJ_SPR[kind];
      // short trail behind the projectile
      const ang = pr.ang[i];
      for (let k = 2; k >= 0; k--) {
        const off = k * r * 0.55;
        ctx.globalAlpha = k ? 0.3 / k : 1;
        const rr = r * (1 - k * 0.2);
        ctx.drawImage(spr, x - Math.cos(ang) * off - rr, y - Math.sin(ang) * off - rr, rr * 2, rr * 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    game.fx.drawWorld(ctx, (slot) => game.playerPos(slot));

    // ---------------------------------------------------------- screen-space overlays
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const lightStage = stage.ground === 'snow';
    if (!this.vignette || this.vignetteKey !== stage.ground) {
      this.vignette = this.makeVignette(lightStage ? 0.45 : 0.7);
      this.vignetteKey = stage.ground;
    }
    ctx.drawImage(this.vignette, 0, 0);
    if (fr.flags & GF.FROZEN) { ctx.fillStyle = 'rgba(120,200,255,0.12)'; ctx.fillRect(0, 0, this.W, this.H); }
    if (game.hurtFlash > 0) {
      ctx.globalAlpha = game.hurtFlash * 0.5;
      ctx.drawImage(this.redVignette || (this.redVignette = this.makeRedVignette()), 0, 0);
      ctx.globalAlpha = 1;
    }
    if (game.whiteFlash > 0) { ctx.fillStyle = `rgba(255,255,240,${game.whiteFlash * 0.7})`; ctx.fillRect(0, 0, this.W, this.H); }

    const toScreen = (x, y) => [x * z + tx, y * z + ty];
    game.fx.drawNumbers(ctx, toScreen, this.u);
    this.drawNameTags(game, fr, toScreen);
    this.drawArrows(game, fr, toScreen);
    this.drawHUD(game, fr, bosses, now);
  }

  makeRedVignette() {
    const c = document.createElement('canvas');
    c.width = this.W; c.height = this.H;
    const x = c.getContext('2d');
    const r = Math.hypot(this.W, this.H) / 2;
    const g = x.createRadialGradient(this.W / 2, this.H / 2, r * 0.3, this.W / 2, this.H / 2, r);
    g.addColorStop(0, 'rgba(255,0,20,0)');
    g.addColorStop(1, 'rgba(255,0,20,0.9)');
    x.fillStyle = g;
    x.fillRect(0, 0, this.W, this.H);
    return c;
  }

  drawEnemy(en, i, now, bosses) {
    const ctx = this.ctx;
    const tid = en.type[i];
    const type = ENEMY_LIST[tid];
    const def = ENEMIES[type];
    const frames = ENEMY_SPR[tid];
    const flags = en.flags[i];
    const id = en.id[i];
    const x = en.x[i], y = en.y[i];
    if (type === 'brazier') { this.drawBrazier(x, y, now, id); return; }
    const frozen = flags & EF.FROZEN;
    const fi = frozen ? 0 : Math.floor(now / (def.speed > 90 ? 110 : 170) + id * 0.37) % frames.length;
    const f = frames[fi];
    const left = flags & EF.LEFT;
    const img = (flags & EF.FLASH) ? (left ? f.fl : f.fr) : frozen ? (left ? f.il : f.ir) : (left ? f.l : f.r);
    const elite = flags & EF.ELITE;
    const s = (def.scale || 1) * PX * (elite ? 1.5 : 1);
    const w = img.width * s, h = img.height * s;
    const bob = FLYERS.has(type) && !frozen ? Math.sin(now / 180 + id) * 3 : 0;
    const top = y + def.r * 0.55 * (def.scale || 1) * (elite ? 1.5 : 1) - h - (FLYERS.has(type) ? 8 : 0) + bob;
    if (elite || (flags & EF.BOSS)) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 + Math.sin(now / 150) * 0.1;
      ctx.drawImage(PROJ_SPR.glowRed, x - w * 0.7, top + h * 0.2, w * 1.4, h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    if (GHOSTLY.has(type)) ctx.globalAlpha = 0.85;
    ctx.drawImage(img, x - w / 2, top, w, h);
    ctx.globalAlpha = 1;
    if (flags & EF.BOSS) bosses.push({ type, hp: en.hp[i] / 255 });
    else if (elite && en.hp[i] < 255) {
      const bw = 34;
      ctx.fillStyle = '#000';
      ctx.fillRect(x - bw / 2 - 1, top - 6, bw + 2, 4);
      ctx.fillStyle = '#ff4050';
      ctx.fillRect(x - bw / 2, top - 5, bw * en.hp[i] / 255, 2);
    }
  }

  drawBrazier(x, y, now, id) {
    const ctx = this.ctx;
    const spr = ENEMY_SPR[ENEMY_LIST.indexOf('brazier')][0].r;
    const w = spr.width * PX, h = spr.height * PX;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 + Math.sin(now / 90 + id) * 0.08;
    ctx.drawImage(PROJ_SPR.glowFire, x - 40, y - h - 36, 80, 80);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(spr, x - w / 2, y - h + 6, w, h);
    const t = now / 1000;
    const fy = y - h + 6;
    const cols = ['#ff5a10', '#ffa020', '#ffe070'];
    for (let k = 0; k < 3; k++) {
      const fl = Math.sin(t * 13 + k * 2 + id) * 1.5;
      const r = 6 - k * 1.6;
      ctx.fillStyle = cols[k];
      ctx.fillRect(x - r + fl, fy - 4 - k * 4 - r, r * 2, r * 2 + 2);
    }
  }

  drawPlayer(game, p, now) {
    const ctx = this.ctx;
    const info = game.roster.get(p.slot);
    if (!info) return;
    if (p.flags & PF.DEAD) {
      // tombstone + revive progress
      ctx.fillStyle = '#1a1a22';
      ctx.fillRect(p.x - 9, p.y - 20, 18, 26);
      ctx.fillStyle = '#6a6a78';
      ctx.fillRect(p.x - 8, p.y - 19, 16, 24);
      ctx.fillStyle = '#8a8a98';
      ctx.fillRect(p.x - 8, p.y - 19, 16, 3);
      ctx.fillStyle = '#2a2a34';
      ctx.fillRect(p.x - 1, p.y - 15, 2, 10);
      ctx.fillRect(p.x - 4, p.y - 12, 8, 2);
      ctx.strokeStyle = 'rgba(125,255,160,0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(p.x, p.y - 4, 64, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      if (p.revive > 0) {
        ctx.strokeStyle = '#7dffa0';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(p.x, p.y - 7, 22, -Math.PI / 2, -Math.PI / 2 + TAU * p.revive); ctx.stroke();
      }
      return;
    }
    const frames = CHAR_SPR[info.char] || CHAR_SPR.varek;
    const fi = p.moving ? Math.floor(p.walk) % 4 : 0;
    const f = frames[fi];
    const left = p.faceLeft;
    let img = left ? f.l : f.r;
    if (p.flags & PF.HURT) img = left ? f.hl : f.hr;
    const w = img.width * PX, h = img.height * PX;
    if ((p.flags & PF.INVULN) && Math.floor(now / 90) % 2) ctx.globalAlpha = 0.45;
    if (p.flags & PF.CHOOSING) ctx.globalAlpha = 0.6;
    const bob = p.moving ? (Math.floor(p.walk) % 2) * -1 : 0;
    ctx.drawImage(img, p.x - w / 2, p.y - h + 9 + bob, w, h);
    ctx.globalAlpha = 1;
    // HP bar
    const bw = 30, frac = Math.max(0, Math.min(1, p.hp / p.maxHp));
    ctx.fillStyle = '#000000';
    ctx.fillRect(p.x - bw / 2 - 1, p.y + 12, bw + 2, 5);
    ctx.fillStyle = '#3a0a10';
    ctx.fillRect(p.x - bw / 2, p.y + 13, bw, 3);
    ctx.fillStyle = frac > 0.3 ? '#e8303c' : (Math.floor(now / 200) % 2 ? '#ff6070' : '#e8303c');
    ctx.fillRect(p.x - bw / 2, p.y + 13, bw * frac, 3);
  }

  drawNameTags(game, fr, toScreen) {
    const ctx = this.ctx, u = this.u;
    if (fr.players.length < 2) return;
    ctx.font = `600 ${Math.round(11 * u)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const placed = [];
    const lineH = 13 * u;
    for (const p of fr.players) {
      const info = game.roster.get(p.slot);
      if (!info) continue;
      let [sx, sy] = toScreen(p.x, p.y - 34);
      // stack tags of players standing close together instead of overlapping them
      const w = ctx.measureText(info.name).width + 6 * u;
      for (let moved = true; moved;) {
        moved = false;
        for (const q of placed) {
          if (Math.abs(q.x - sx) < (q.w + w) / 2 && Math.abs(q.y - sy) < lineH) { sy = q.y - lineH; moved = true; }
        }
      }
      placed.push({ x: sx, y: sy, w });
      ctx.lineWidth = 3 * u;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(info.name, sx, sy);
      ctx.fillStyle = SLOT_COLORS[p.slot];
      ctx.fillText(info.name, sx, sy);
      if ((p.flags & PF.DEAD) && p.slot !== game.slot) {
        ctx.fillStyle = '#7dffa0';
        ctx.strokeText('REVIVE ME', sx, sy - 14 * u);
        ctx.fillText('REVIVE ME', sx, sy - 14 * u);
      }
    }
  }

  // Arrows at the screen edge pointing to off-screen teammates
  drawArrows(game, fr, toScreen) {
    const ctx = this.ctx, u = this.u;
    const m = 34 * u;
    for (const p of fr.players) {
      if (p.slot === game.slot) continue;
      const [sx, sy] = toScreen(p.x, p.y);
      if (sx > 0 && sx < this.W && sy > 0 && sy < this.H) continue;
      const cx = this.W / 2, cy = this.H / 2;
      const dx = sx - cx, dy = sy - cy;
      const k = Math.min((cx - m) / Math.abs(dx || 1e-3), (cy - m) / Math.abs(dy || 1e-3));
      const ax = cx + dx * k, ay = cy + dy * k;
      const a = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(a);
      ctx.fillStyle = (p.flags & PF.DEAD) ? '#7dffa0' : SLOT_COLORS[p.slot];
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.moveTo(14 * u, 0); ctx.lineTo(-8 * u, -10 * u); ctx.lineTo(-4 * u, 0); ctx.lineTo(-8 * u, 10 * u); ctx.closePath();
      ctx.stroke(); ctx.fill();
      ctx.restore();
      const info = game.roster.get(p.slot);
      if (info) {
        ctx.font = `600 ${Math.round(10 * u)}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const d = Math.round(Math.hypot(p.x - game.cam.x, p.y - game.cam.y) / 10);
        const label = `${info.name} ${d}m`;
        const lx = ax - Math.cos(a) * 26 * u, ly = ay - Math.sin(a) * 22 * u;
        ctx.lineWidth = 3 * u; ctx.strokeStyle = '#000';
        ctx.strokeText(label, lx, ly);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, lx, ly);
      }
    }
  }

  // ------------------------------------------------------------------ HUD
  drawHUD(game, fr, bosses, now) {
    const ctx = this.ctx, u = this.u, W = this.W, H = this.H;
    const s = game.latest;
    if (!s) return;
    ctx.textBaseline = 'middle';

    // XP bar
    const bh = Math.round(16 * u);
    ctx.fillStyle = '#07060e';
    ctx.fillRect(0, 0, W, bh + 2 * u);
    const frac = Math.max(0, Math.min(1, s.xp / Math.max(1, s.xpNext)));
    const g = ctx.createLinearGradient(0, 0, 0, bh);
    g.addColorStop(0, '#7fd4ff'); g.addColorStop(0.5, '#3a86ff'); g.addColorStop(1, '#2458c8');
    ctx.fillStyle = '#141a2e';
    ctx.fillRect(2 * u, 2 * u, W - 4 * u, bh - 2 * u);
    ctx.fillStyle = g;
    ctx.fillRect(2 * u, 2 * u, (W - 4 * u) * frac, bh - 2 * u);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(2 * u, 2 * u, (W - 4 * u) * frac, 2 * u);
    this.text(`LV ${s.level}`, W - 10 * u, bh / 2 + u, 12, '#ffffff', 'right', 700);

    // timer
    const remain = Math.max(0, game.length * 60 - s.time);
    const shown = s.time;
    const mm = String(Math.floor(shown / 60)).padStart(2, '0'), ss = String(Math.floor(shown % 60)).padStart(2, '0');
    ctx.font = `${Math.round(26 * u)}px ${TITLE_FONT}`;
    this.text(`${mm}:${ss}`, W / 2, bh + 22 * u, 26, remain < 60 ? '#ffd84a' : '#ffffff', 'center', 400, TITLE_FONT);
    if (remain < 60 && remain > 0) this.text(`Survive ${Math.ceil(remain)}s more!`, W / 2, bh + 44 * u, 11, '#ffd84a', 'center', 600);

    // kills + gold
    const iy = bh + 18 * u, is = 18 * u;
    ctx.imageSmoothingEnabled = false;
    this.text(String(s.kills), W - 34 * u, iy, 14, '#ffffff', 'right', 700);
    ctx.drawImage(ICONS.skull, W - 28 * u, iy - is / 2, is * 0.9, is);
    this.text(String(s.gold), W - 34 * u, iy + 22 * u, 14, '#ffd84a', 'right', 700);
    ctx.drawImage(PICKUP_SPR.coin, W - 27 * u, iy + 22 * u - 8 * u, 16 * u, 16 * u);

    // inventory
    const info = game.myInfo;
    const slotS = Math.round(24 * u), gap = Math.round(3 * u);
    let x0 = 8 * u, y0 = bh + 8 * u;
    if (info) {
      for (let row = 0; row < 2; row++) {
        const list = row === 0 ? info.weapons : info.passives;
        for (let k = 0; k < 6; k++) {
          const x = x0 + k * (slotS + gap), y = y0 + row * (slotS + gap);
          ctx.fillStyle = 'rgba(8,6,16,0.75)';
          ctx.fillRect(x, y, slotS, slotS);
          const it = list[k];
          const evolved = it && row === 0 && WEAPONS[it[0]].evolved;
          ctx.strokeStyle = evolved ? '#ffd84a' : 'rgba(255,255,255,0.18)';
          ctx.lineWidth = Math.max(1, u * (evolved ? 2 : 1));
          ctx.strokeRect(x + 0.5, y + 0.5, slotS - 1, slotS - 1);
          if (!it) continue;
          const icon = ICONS[it[0]];
          if (icon) {
            const sc = Math.min((slotS - 6 * u) / icon.width, (slotS - 6 * u) / icon.height);
            const iw = icon.width * sc, ih = icon.height * sc;
            ctx.drawImage(icon, x + (slotS - iw) / 2, y + (slotS - ih) / 2, iw, ih);
          }
          const max = row === 0 ? weaponMaxLevel(it[0]) : PASSIVES[it[0]].max;
          if (!evolved) this.text(it[1] >= max ? 'MAX' : String(it[1]), x + slotS - 2 * u, y + slotS - 5 * u, it[1] >= max ? 7 : 9, it[1] >= max ? '#ffd84a' : '#ffffff', 'right', 700);
        }
      }
    }

    // team panel
    const team = [...game.roster.values()].filter(p => p.connected || p.dead);
    if (team.length > 1) {
      let ty = y0 + 2 * (slotS + gap) + 8 * u;
      for (const p of team) {
        const sp = fr.players.find(q => q.slot === p.slot);
        const hp = sp ? sp.hp / Math.max(1, sp.maxHp) : 0;
        const dead = sp && (sp.flags & PF.DEAD);
        ctx.fillStyle = 'rgba(8,6,16,0.6)';
        ctx.fillRect(x0, ty, 150 * u, 20 * u);
        ctx.fillStyle = SLOT_COLORS[p.slot];
        ctx.fillRect(x0, ty, 3 * u, 20 * u);
        this.text(p.name + (p.slot === game.slot ? ' (you)' : ''), x0 + 8 * u, ty + 7 * u, 10, '#ffffff', 'left', 600);
        ctx.fillStyle = '#300a10';
        ctx.fillRect(x0 + 8 * u, ty + 13 * u, 100 * u, 4 * u);
        ctx.fillStyle = dead ? '#555' : '#e8303c';
        ctx.fillRect(x0 + 8 * u, ty + 13 * u, 100 * u * (dead ? 1 : hp), 4 * u);
        if (dead) this.text('DOWN', x0 + 144 * u, ty + 10 * u, 9, '#ff6a6a', 'right', 700);
        else if (!p.connected) this.text('OFFLINE', x0 + 144 * u, ty + 10 * u, 9, '#aaaaaa', 'right', 700);
        else { const c = CHAR_BY_ID[p.char]; if (c) this.text(c.name.split(' ').pop(), x0 + 144 * u, ty + 10 * u, 8, '#8a8aa0', 'right', 600); }
        ty += 23 * u;
      }
    }

    // boss bar
    if (bosses.length) {
      const b = bosses[0];
      const bw = Math.min(W * 0.6, 420 * u), bx = (W - bw) / 2, by = bh + 60 * u;
      ctx.fillStyle = '#000';
      ctx.fillRect(bx - 2 * u, by - 2 * u, bw + 4 * u, 14 * u);
      ctx.fillStyle = '#3a0a10';
      ctx.fillRect(bx, by, bw, 10 * u);
      ctx.fillStyle = '#e02040';
      ctx.fillRect(bx, by, bw * b.hp, 10 * u);
      this.text(BOSS_NAMES[b.type] || 'Boss', W / 2, by + 22 * u, 12, '#ffb0b8', 'center', 700);
    }

    // downed message
    const me = fr.players.find(p => p.slot === game.slot);
    if (me && (me.flags & PF.DEAD)) {
      const alive = fr.players.filter(p => !(p.flags & PF.DEAD));
      this.text('YOU ARE DOWN', W / 2, H * 0.72, 28, '#ff5a5a', 'center', 400, TITLE_FONT);
      if (alive.length) {
        this.text('A teammate can revive you by standing next to your grave.', W / 2, H * 0.72 + 30 * u, 13, '#ffffff', 'center', 600);
        const sp = game.roster.get(game.spec);
        if (sp) this.text(`Spectating ${sp.name}  ·  Tab / click to switch`, W / 2, H * 0.72 + 50 * u, 11, '#b0b0c8', 'center', 600);
      }
    }

    // touch joystick
    const t = touchState();
    if (t) {
      const d = this.dpr;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 3 * d;
      ctx.beginPath(); ctx.arc(t.ox * d, t.oy * d, 50 * d, 0, TAU); ctx.stroke();
      const dx = t.x - t.ox, dy = t.y - t.oy, l = Math.hypot(dx, dy), k = l > 50 ? 50 / l : 1;
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.arc((t.ox + dx * k) * d, (t.oy + dy * k) * d, 22 * d, 0, TAU); ctx.fill();
    }

    // netstats
    this.text(`${Math.round(this.fps)} fps · ${game.net.ping} ms`, W - 8 * u, H - 10 * u, 9, 'rgba(255,255,255,0.4)', 'right', 500);
  }

  text(str, x, y, size, color, align = 'left', weight = 600, font = FONT) {
    const ctx = this.ctx, u = this.u;
    ctx.font = `${weight} ${Math.round(size * u)}px ${font}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, 3 * u);
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.lineJoin = 'round';
    ctx.strokeText(str, x, y);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  // ------------------------------------------------------------------ menu background
  drawMenu(now, bats) {
    const ctx = this.ctx, z = this.zoom;
    const camX = now / 1000 * 18, camY = now / 1000 * 9;
    const tx = Math.round(this.W / 2 - camX * z), ty = Math.round(this.H / 2 - camY * z);
    ctx.setTransform(z, 0, 0, z, tx, ty);
    ctx.imageSmoothingEnabled = false;
    this.drawGround('grass', camX, camY);
    const frames = ENEMY_SPR[ENEMY_LIST.indexOf('bat')];
    for (const b of bats) {
      const x = camX + b.x, y = camY + b.y + Math.sin(now / 300 + b.p) * 6;
      const f = frames[Math.floor(now / 110 + b.p) % 2];
      const img = b.vx < 0 ? f.l : f.r;
      ctx.drawImage(img, x - img.width, y - img.height, img.width * PX, img.height * PX);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!this.vignette || this.vignetteKey !== 'menu') { this.vignette = this.makeVignette(0.85); this.vignetteKey = 'menu'; }
    ctx.drawImage(this.vignette, 0, 0);
    ctx.fillStyle = 'rgba(6,4,16,0.35)';
    ctx.fillRect(0, 0, this.W, this.H);
  }
}
