// Tiny WebAudio synth: all sound effects and the music loop are generated, no audio files.
let ctx = null, master, sfxBus, musicBus, noiseBuf;
const settings = { sfx: 0.6, music: 0.35, muted: false };
const lastPlay = {};

export function loadAudioSettings(s) { Object.assign(settings, s); applyVolumes(); }
export function audioSettings() { return { ...settings }; }

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 6;
  comp.connect(master);
  sfxBus = ctx.createGain(); sfxBus.connect(comp);
  musicBus = ctx.createGain(); musicBus.connect(comp);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  applyVolumes();
}

function applyVolumes() {
  if (!ctx) return;
  master.gain.value = settings.muted ? 0 : 1;
  sfxBus.gain.value = settings.sfx;
  musicBus.gain.value = settings.music * 0.5;
}
export function setVolume(kind, v) { settings[kind] = v; applyVolumes(); }
export function setMuted(m) { settings.muted = m; applyVolumes(); }

function throttle(name, ms) {
  const t = performance.now();
  if (lastPlay[name] && t - lastPlay[name] < ms) return false;
  lastPlay[name] = t;
  return true;
}

function tone(freq, dur, { type = 'square', vol = 0.2, slide = 0, delay = 0, attack = 0.005, bus = sfxBus } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(bus);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, { vol = 0.2, freq = 2000, q = 1, type = 'bandpass', slide = 0, delay = 0, bus = sfxBus } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (slide) f.frequency.exponentialRampToValueAtTime(slide, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(bus);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}

let gemCombo = 0, gemT = 0;
export const sfx = {
  hit() { if (throttle('hit', 45)) noise(0.05, { vol: 0.09, freq: 1800 + Math.random() * 800, q: 2 }); },
  kill() { if (throttle('kill', 40)) tone(420 + Math.random() * 80, 0.07, { type: 'square', vol: 0.05, slide: 140 }); },
  gem() {
    if (!throttle('gem', 28)) return;
    const t = performance.now();
    gemCombo = t - gemT < 400 ? Math.min(gemCombo + 1, 24) : 0;
    gemT = t;
    tone(880 * Math.pow(2, gemCombo / 24), 0.06, { type: 'triangle', vol: 0.09 });
  },
  coin() { tone(1320, 0.05, { type: 'square', vol: 0.06 }); tone(1760, 0.1, { type: 'square', vol: 0.06, delay: 0.05 }); },
  levelup() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.16, { type: 'square', vol: 0.09, delay: i * 0.07 }));
    tone(262, 0.5, { type: 'triangle', vol: 0.12 });
  },
  chest() {
    [392, 523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.14, { type: 'square', vol: 0.08, delay: i * 0.08 }));
    noise(0.9, { vol: 0.06, freq: 6000, type: 'highpass', delay: 0.3 });
  },
  evolve() {
    [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.25, { type: 'sawtooth', vol: 0.05, delay: i * 0.06 }));
    tone(131, 1.2, { type: 'triangle', vol: 0.15 });
  },
  hurt() { if (throttle('hurt', 120)) { tone(220, 0.14, { type: 'sawtooth', vol: 0.12, slide: 70 }); noise(0.1, { vol: 0.1, freq: 500, type: 'lowpass' }); } },
  whip() { if (throttle('whip', 60)) noise(0.13, { vol: 0.07, freq: 700, slide: 3500, q: 3 }); },
  shoot() { if (throttle('shoot', 70)) tone(900, 0.05, { type: 'triangle', vol: 0.035, slide: 500 }); },
  lightning() { if (throttle('zap', 80)) { noise(0.35, { vol: 0.14, freq: 3000, slide: 200, type: 'lowpass' }); tone(70, 0.25, { type: 'square', vol: 0.06 }); } },
  explode() { if (throttle('boom', 70)) { noise(0.4, { vol: 0.18, freq: 900, slide: 60, type: 'lowpass' }); } },
  heal() { tone(440, 0.12, { type: 'sine', vol: 0.12, slide: 880 }); tone(660, 0.18, { type: 'sine', vol: 0.1, delay: 0.08, slide: 1320 }); },
  revive() { [392, 494, 587, 784].forEach((f, i) => tone(f, 0.2, { type: 'triangle', vol: 0.12, delay: i * 0.09 })); },
  down() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.25, { type: 'sawtooth', vol: 0.07, delay: i * 0.12 })); },
  relic() { noise(1.0, { vol: 0.2, freq: 5000, slide: 200, type: 'lowpass' }); tone(1047, 0.6, { type: 'sine', vol: 0.12 }); },
  freeze() { [1568, 1319, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.2, { type: 'sine', vol: 0.07, delay: i * 0.05 })); },
  brazier() { noise(0.18, { vol: 0.08, freq: 1200, q: 1 }); },
  click() { tone(660, 0.04, { type: 'square', vol: 0.05 }); },
  hover() { if (throttle('hover', 40)) tone(990, 0.025, { type: 'square', vol: 0.025 }); },
  pick() { tone(784, 0.07, { type: 'square', vol: 0.08 }); tone(1175, 0.12, { type: 'square', vol: 0.08, delay: 0.06 }); },
  victory() { [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.3, { type: 'square', vol: 0.08, delay: i * 0.13 })); },
  defeat() { [440, 415, 392, 370, 262].forEach((f, i) => tone(f, 0.4, { type: 'triangle', vol: 0.12, delay: i * 0.22 })); },
  boss() { tone(55, 1.4, { type: 'sawtooth', vol: 0.12 }); tone(58, 1.4, { type: 'sawtooth', vol: 0.12 }); noise(1.2, { vol: 0.08, freq: 300, type: 'lowpass' }); },
};

// ------------------------------------------------------------------ music: a small gothic sequencer
const BPM = 128;
const STEP = 60 / BPM / 4; // 16th notes
const n = (s) => 440 * Math.pow(2, (s - 69) / 12); // midi -> Hz
// chord roots per bar (A minor, F, C, E)
const PROG = [[45, [57, 60, 64]], [41, [57, 60, 65]], [48, [55, 60, 64]], [40, [56, 59, 64]],
  [45, [57, 60, 64]], [43, [55, 59, 62]], [41, [57, 60, 65]], [40, [56, 59, 64]]];
const ARP = [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1, 2, 1, 0, 1];
const LEAD = [
  [76, 0, 0, 74, 72, 0, 71, 0, 72, 0, 74, 0, 76, 0, 0, 0],
  [77, 0, 0, 76, 74, 0, 72, 0, 74, 0, 0, 0, 72, 0, 0, 0],
  [72, 0, 0, 71, 72, 0, 74, 0, 76, 0, 79, 0, 76, 0, 0, 0],
  [75, 0, 0, 0, 71, 0, 0, 0, 68, 0, 71, 0, 76, 0, 0, 0],
];
let musicOn = false, nextT = 0, step = 0, timer = null, intensity = 0;
export function setIntensity(v) { intensity = v; }

export function startMusic() {
  if (!ctx || musicOn) return;
  musicOn = true;
  nextT = ctx.currentTime + 0.1;
  step = 0;
  timer = setInterval(schedule, 25);
}
export function stopMusic() {
  musicOn = false;
  if (timer) clearInterval(timer);
  timer = null;
}

function schedule() {
  if (!ctx) return;
  while (nextT < ctx.currentTime + 0.12) {
    const bar = Math.floor(step / 16) % PROG.length;
    const s = step % 16;
    const [root, chord] = PROG[bar];
    const d = nextT - ctx.currentTime;
    if (s % 4 === 0) tone(n(root), STEP * 3.5, { type: 'triangle', vol: 0.22, delay: d, bus: musicBus });
    if (s % 8 === 6) tone(n(root + 12), STEP * 1.5, { type: 'triangle', vol: 0.12, delay: d, bus: musicBus });
    tone(n(chord[ARP[s]] + 12), STEP * 0.9, { type: 'square', vol: 0.035, delay: d, bus: musicBus });
    if (s % 4 === 2) noise(0.04, { vol: 0.05, freq: 8000, type: 'highpass', delay: d, bus: musicBus });
    if (s % 8 === 4) noise(0.12, { vol: 0.08 + intensity * 0.05, freq: 1400, q: 1, delay: d, bus: musicBus });
    if (intensity > 0.3 && s % 8 === 0) tone(60, 0.12, { type: 'sine', vol: 0.25, slide: 35, delay: d, bus: musicBus });
    const phrase = Math.floor(step / 32) % 4;
    const ln = (step / 16 | 0) % 2 === 1 || intensity > 0.5 ? LEAD[phrase][s] : 0;
    if (ln) tone(n(ln), STEP * 2.6, { type: 'sawtooth', vol: 0.03, delay: d, bus: musicBus, attack: 0.02 });
    nextT += STEP;
    step++;
  }
}
