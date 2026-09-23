// Client-only visual effects: particles, damage numbers, rings, lightning, whip slashes.
import { ENEMY_LIST } from '/shared/data.js';
import { DIGITS, PROJ_SPR } from './sprites.js';

const rand = (a, b) => a + Math.random() * (b - a);
const ENEMY_COLORS = {
  bat: ['#8a5ca8', '#3c2350'], zombie: ['#7a9a5a', '#5a4a6a'], skeleton: ['#e8e0d0', '#8a8070'], ghost: ['#dfe8f8', '#9ab0d0'],
  slime: ['#3cc050', '#a8f0a8'], eye: ['#c8243c', '#f4ece4'], werewolf: ['#6a4a3a', '#a08060'], mummy: ['#d8cca0', '#a89870'],
  knight: ['#8a94a0', '#c0a040'], wraith: ['#8a4aaa', '#ff50ff'], mudman: ['#7a5a3a', '#b09070'], icebat: ['#8ac0e8', '#e0ffff'],
  frostslime: ['#6ac8e8', '#e0faff'], yeti: ['#e8f0f8', '#a8b8c8'], icewraith: ['#80f0ff', '#5a7a9a'], batlord: ['#b03040', '#ffe040'],
  colossus: ['#d8ccb8', '#ff3020'], nightlord: ['#c02040', '#ffe040'], frostgiant: ['#a8c8e8', '#ffffff'], brazier: ['#ffb040', '#ff6020'],
};

export class Effects {
  constructor() {
    this.parts = [];
    this.nums = [];
    this.rings = [];
    this.bolts = [];
    this.whips = [];
    this.pillars = [];
    this.showNumbers = true;
  }

  update(dt) {
    const P = this.parts;
    let j = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += p.grav * dt;
      p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
      P[j++] = p;
    }
    P.length = j;
    for (const arr of [this.nums, this.rings, this.bolts, this.whips, this.pillars]) {
      let k = 0;
      for (let i = 0; i < arr.length; i++) {
        const e = arr[i];
        e.life -= dt;
        if (e.vy) e.y += e.vy * dt;
        if (e.life > 0) arr[k++] = e;
      }
      arr.length = k;
    }
  }

  part(x, y, vx, vy, life, size, color, grav = 0, drag = 0.96) {
    if (this.parts.length > 900) return;
    this.parts.push({ x, y, vx, vy, life, max: life, size, color, grav, drag });
  }

  damage(x, y, v, crit) {
    if (!this.showNumbers || this.nums.length > 140) return;
    this.nums.push({ x: x + rand(-6, 6), y: y - 4, v: Math.max(1, Math.round(v)), life: 0.65, max: 0.65, col: crit ? 'gold' : 'white', vy: -38, big: crit });
  }
  number(x, y, v, col) {
    if (this.nums.length > 160) return;
    this.nums.push({ x, y, v: Math.max(1, Math.round(v)), life: 0.9, max: 0.9, col, vy: -30, big: true });
  }

  death(x, y, tid, flags) {
    const type = ENEMY_LIST[tid];
    const [c1, c2] = ENEMY_COLORS[type] || ['#ffffff', '#888888'];
    const big = flags & 3;
    const n = big ? 40 : 7;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = rand(40, big ? 260 : 130);
      this.part(x, y - 10, Math.cos(a) * s, Math.sin(a) * s - 40, rand(0.3, big ? 1.2 : 0.55), rand(2, big ? 6 : 4), i % 3 ? c1 : c2, 300, 0.93);
    }
    if (big) this.ring(x, y, 10, 160, 0.5, c1, 6);
  }

  burst(x, y, color, n = 20) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = rand(60, 220);
      this.part(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.3, 0.8), rand(2, 5), color, 0, 0.92);
    }
  }

  sparkle(x, y, color) {
    for (let i = 0; i < 8; i++) this.part(x + rand(-10, 10), y + rand(-16, 4), rand(-20, 20), rand(-90, -30), rand(0.3, 0.6), 3, color, 0, 0.95);
  }

  ring(x, y, r0, r1, life, color, width = 3) { this.rings.push({ x, y, r0, r1, life, max: life, color, width }); }

  whip(slot, area100, row, evolved, side) {
    this.whips.push({ slot, area: area100 / 100, row, evolved, side, life: 0.24, max: 0.24 });
  }

  lightning(x, y, r, kind) {
    const pts = [];
    let px = x + rand(-60, 60), py = y - 420;
    const steps = 9;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push([px + (x - px) * t + (i && i < steps ? rand(-18, 18) : 0), py + (y - py) * t]);
    }
    this.bolts.push({ pts, x, y, r, life: 0.28, max: 0.28, kind });
    for (let i = 0; i < 8; i++) this.part(x, y, rand(-120, 120), rand(-160, -20), rand(0.2, 0.45), 3, kind ? '#e0ffff' : '#fff6a0', 400, 0.95);
  }

  explosion(x, y, r, kind) {
    if (kind === 2) { this.ring(x, y, 10, r, 0.45, '#ffffff', 5); return; }
    this.ring(x, y, r * 0.3, r, 0.35, '#ffb040', 5);
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, s = rand(60, 200);
      this.part(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.2, 0.5), rand(3, 6), i % 2 ? '#ff7a20' : '#ffd060', 0, 0.9);
    }
  }

  pillar(x, y) {
    this.pillars.push({ x, y, life: 1.2, max: 1.2 });
    for (let i = 0; i < 30; i++) this.part(x + rand(-14, 14), y, rand(-30, 30), rand(-320, -80), rand(0.5, 1.2), rand(2, 4), i % 2 ? '#ffd84a' : '#ffffff', 0, 0.97);
  }

  // World-space pass (context already transformed to world coordinates)
  drawWorld(ctx, playerPos) {
    // pillars of light
    for (const p of this.pillars) {
      const a = p.life / p.max;
      const g = ctx.createLinearGradient(p.x, p.y - 400, p.x, p.y);
      g.addColorStop(0, 'rgba(255,230,120,0)');
      g.addColorStop(1, `rgba(255,230,120,${0.55 * a})`);
      ctx.fillStyle = g;
      ctx.fillRect(p.x - 22, p.y - 400, 44, 400);
    }
    // rings
    ctx.lineCap = 'round';
    for (const r of this.rings) {
      const t = 1 - r.life / r.max;
      ctx.globalAlpha = Math.max(0, r.life / r.max);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - t * 0.6);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * (1 - (1 - t) * (1 - t)), 0, Math.PI * 2);
      ctx.stroke();
    }
    // whip slashes, anchored to the owner's current position
    for (const w of this.whips) {
      const o = playerPos(w.slot);
      if (!o) continue;
      const t = 1 - w.life / w.max;
      const hw = 60 * w.area, hh = 15 * w.area;
      const row = w.row;
      const cy = o.y - 8 + (row % 2 ? 1 : -1) * Math.ceil(row / 2) * 18 * w.area + (row ? 8 : 0) - 4;
      const cx = o.x + w.side * (hw + 6);
      const reveal = Math.min(1, t * 3.5);
      ctx.save();
      ctx.globalAlpha = Math.min(1, (w.life / w.max) * 1.6);
      ctx.beginPath();
      const x0 = w.side > 0 ? cx - hw : cx + hw;
      ctx.rect(w.side > 0 ? x0 : x0 - hw * 2 * reveal, cy - hh * 2, hw * 2 * reveal, hh * 4);
      ctx.clip();
      ctx.beginPath();
      ctx.ellipse(cx, cy, hw, hh, 0, Math.PI, Math.PI * 2);
      ctx.ellipse(cx, cy + hh * 0.35, hw * 0.94, hh * 0.55, 0, Math.PI * 2, Math.PI, true);
      ctx.closePath();
      ctx.fillStyle = w.evolved ? '#ff2848' : '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = w.evolved ? '#5a0010' : '#6a7a9a';
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    // lightning
    for (const b of this.bolts) {
      const a = b.life / b.max;
      ctx.globalAlpha = a * 0.8;
      ctx.globalCompositeOperation = 'lighter';
      const gr = b.r * (1.5 - a * 0.4);
      ctx.drawImage(b.kind ? PROJ_SPR.glowWhite : PROJ_SPR.glowGold, b.x - gr, b.y - gr * 0.8, gr * 2, gr * 1.6);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = a;
      for (const [w, col] of [[7, b.kind ? '#40a0ff' : '#6080ff'], [3, '#ffffff']]) {
        ctx.lineWidth = w * a + 1;
        ctx.strokeStyle = col;
        ctx.beginPath();
        ctx.moveTo(b.pts[0][0], b.pts[0][1]);
        for (let i = 1; i < b.pts.length; i++) ctx.lineTo(b.pts[i][0], b.pts[i][1]);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    // particles
    for (const p of this.parts) {
      ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5);
      ctx.fillStyle = p.color;
      const s = p.size;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  // Screen-space pass for crisp damage numbers. toScreen(x,y) -> [sx, sy]
  drawNumbers(ctx, toScreen, scale) {
    for (const n of this.nums) {
      const [sx, sy] = toScreen(n.x, n.y);
      const a = Math.min(1, n.life / n.max * 2.5);
      const pop = n.life > n.max - 0.08 ? 1.35 : 1;
      const s = scale * (n.big ? 1 : 0.8) * pop;
      const str = String(n.v);
      const set = DIGITS[n.col] || DIGITS.white;
      const dw = 10 * s, dh = 18 * s;
      let x = sx - (str.length * dw) / 2;
      ctx.globalAlpha = a;
      for (let i = 0; i < str.length; i++) {
        const d = set[str.charCodeAt(i) - 48];
        if (d) ctx.drawImage(d, x - 2 * s, sy - dh / 2, 14 * s, dh);
        x += dw;
      }
    }
    ctx.globalAlpha = 1;
  }
}
