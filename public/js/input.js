// Keyboard, mouse-hold, gamepad and touch-joystick movement input.
const keys = new Set();
let mouseDown = false, mouseX = 0, mouseY = 0;
const touch = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
let enabled = true;
export const pad = { connected: false, prevButtons: [] };

// Physical key code, falling back to the character when `code` is empty (virtual keyboards, synthetic events)
export function keyName(e) {
  if (e.code) return e.code;
  const k = e.key || '';
  if (k.length === 1) {
    if (/[a-z]/i.test(k)) return 'Key' + k.toUpperCase();
    if (/[0-9]/.test(k)) return 'Digit' + k;
    if (k === ' ') return 'Space';
  }
  if (k === 'Esc') return 'Escape';
  if (k === 'Up' || k === 'Down' || k === 'Left' || k === 'Right') return 'Arrow' + k;
  return k;
}

export function setInputEnabled(v) {
  enabled = v;
  if (!v) { keys.clear(); mouseDown = false; touch.id = null; }
}

export function initInput(canvas, handlers) {
  window.addEventListener('keydown', (e) => {
    const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    if (typing) return;
    const code = keyName(e);
    keys.add(code);
    if (handlers.onKey && handlers.onKey(e, code)) e.preventDefault();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(keyName(e)));
  window.addEventListener('blur', () => { keys.clear(); mouseDown = false; });

  canvas.addEventListener('mousedown', (e) => { if (e.button === 0) { mouseDown = true; mouseX = e.clientX; mouseY = e.clientY; } });
  window.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });
  window.addEventListener('mouseup', () => { mouseDown = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      if (touch.id === null) { touch.id = t.identifier; touch.ox = touch.x = t.clientX; touch.oy = touch.y = t.clientY; }
    }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) if (t.identifier === touch.id) { touch.x = t.clientX; touch.y = t.clientY; }
    e.preventDefault();
  }, { passive: false });
  const end = (e) => { for (const t of e.changedTouches) if (t.identifier === touch.id) touch.id = null; };
  canvas.addEventListener('touchend', end);
  canvas.addEventListener('touchcancel', end);
}

export function touchState() { return touch.id !== null ? touch : null; }

// Returns a movement vector with length <= 1
export function moveVector() {
  if (!enabled) return [0, 0];
  let x = 0, y = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
  if (x || y) { const l = Math.hypot(x, y); return [x / l, y / l]; }

  const gp = readPad();
  if (gp) {
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const l = Math.hypot(ax, ay);
    if (l > 0.2) { const k = Math.min(1, (l - 0.2) / 0.7) / l; return [ax * k, ay * k]; }
    const b = gp.buttons;
    let dx = 0, dy = 0;
    if (b[14] && b[14].pressed) dx -= 1;
    if (b[15] && b[15].pressed) dx += 1;
    if (b[12] && b[12].pressed) dy -= 1;
    if (b[13] && b[13].pressed) dy += 1;
    if (dx || dy) { const k = Math.hypot(dx, dy); return [dx / k, dy / k]; }
  }

  if (touch.id !== null) {
    const dx = touch.x - touch.ox, dy = touch.y - touch.oy, l = Math.hypot(dx, dy);
    if (l > 8) { const k = Math.min(1, l / 50) / l; return [dx * k, dy * k]; }
    return [0, 0];
  }

  if (mouseDown) {
    const dx = mouseX - window.innerWidth / 2, dy = mouseY - window.innerHeight / 2, l = Math.hypot(dx, dy);
    if (l > 16) { const k = Math.min(1, l / 80) / l; return [dx * k, dy * k]; }
  }
  return [0, 0];
}

function readPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) if (p && p.connected) { pad.connected = true; return p; }
  pad.connected = false;
  return null;
}

// Edge-triggered gamepad buttons for menus: returns list of newly pressed button indices
export function padPressed() {
  const gp = readPad();
  if (!gp) return [];
  const out = [];
  gp.buttons.forEach((b, i) => {
    const was = pad.prevButtons[i];
    if (b.pressed && !was) out.push(i);
    pad.prevButtons[i] = b.pressed;
  });
  // treat stick flicks as d-pad presses
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  const dir = Math.abs(ax) > 0.6 ? (ax < 0 ? 14 : 15) : Math.abs(ay) > 0.6 ? (ay < 0 ? 12 : 13) : -1;
  if (dir >= 0 && pad.prevStick !== dir) out.push(dir);
  pad.prevStick = dir;
  return out;
}
