// Nightfall Survivors server: static file hosting + WebSocket game rooms.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from './room.js';
import { TICK_RATE, POWERUPS, CHAR_BY_ID, CHARACTERS, STAGE_BY_ID } from '../shared/data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const SHARED = path.join(ROOT, 'shared');
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const SHARE = process.argv.includes('--share') || process.env.SHARE === '1';

// ------------------------------------------------------------------ static files
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req, res) {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); res.end(); return; }
  if (urlPath === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  if (urlPath === '/info') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
    res.end(JSON.stringify({ publicUrl, lan: lanUrls() }));
    return;
  }
  let base = PUBLIC, rel = urlPath;
  if (urlPath.startsWith('/shared/')) { base = SHARED; rel = urlPath.slice('/shared'.length); }
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer(serveStatic);
let publicUrl = process.env.PUBLIC_URL || null; // set when a tunnel is running, or configured by the host

function lanUrls() {
  const out = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${PORT}`);
  }
  return out;
}

// ------------------------------------------------------------------ rooms
const rooms = new Map();
const clients = new Set();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function makeCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
    if (!rooms.has(c)) return c;
  }
}

let roomsDirty = false;
const hub = {
  roomsChanged() { roomsDirty = true; },
  deleteRoom(room) { rooms.delete(room.code); roomsDirty = true; },
};

function roomList() {
  return [...rooms.values()].filter(r => !r.isPrivate && r.connectedCount > 0).map(r => {
    const host = r.memberBySlot(r.hostSlot);
    return { code: r.code, host: host ? host.name : '?', players: r.members.length, state: r.state, stage: r.settings.stage };
  });
}

function sanitizeName(n) {
  const s = String(n || '').replace(/[^\p{L}\p{N} _\-.!?']/gu, '').trim().slice(0, 14);
  return s || 'Survivor';
}
function sanitizePowerups(pu) {
  const out = {};
  if (pu && typeof pu === 'object') {
    for (const [k, v] of Object.entries(pu)) if (POWERUPS[k]) out[k] = Math.max(0, Math.min(POWERUPS[k].max, v | 0));
  }
  return out;
}
function memberInfo(msg) {
  return { name: sanitizeName(msg.name), char: CHAR_BY_ID[msg.char] ? msg.char : CHARACTERS[0].id, powerups: sanitizePowerups(msg.powerups) };
}

// ------------------------------------------------------------------ websockets
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 32 * 1024 });

wss.on('connection', (ws) => {
  const client = {
    ws, token: null, room: null, member: null, msgCount: 0, msgWindow: Date.now(),
    send(obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); },
    sendRaw(s) { if (ws.readyState === 1) ws.send(s); },
    sendBinary(buf) { if (ws.readyState === 1 && ws.bufferedAmount < 2_000_000) ws.send(new Uint8Array(buf), { binary: true }); },
  };
  clients.add(client);

  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    const t = Date.now();
    if (t - client.msgWindow > 1000) { client.msgWindow = t; client.msgCount = 0; }
    if (++client.msgCount > 120) return;
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    try { handle(client, msg); } catch (err) { console.error('message error', msg.t, err); }
  });

  ws.on('close', () => {
    clients.delete(client);
    if (client.room && client.member) client.room.disconnect(client.member);
  });
  ws.on('error', () => {});
});

function handle(client, msg) {
  switch (msg.t) {
    case 'hello': {
      client.token = typeof msg.token === 'string' && /^[a-f0-9]{16,64}$/.test(msg.token) ? msg.token : crypto.randomBytes(16).toString('hex');
      client.send({ t: 'welcome', token: client.token, rooms: roomList() });
      // resume a previous seat if this browser tab was in a room
      for (const room of rooms.values()) {
        const m = room.members.find(m => m.token === client.token);
        if (m && !m.connected) { room.reconnect(m, client); break; }
      }
      return;
    }
    case 'ping': client.send({ t: 'pong', c: msg.c }); return;
    case 'rooms': client.send({ t: 'rooms', rooms: roomList() }); return;
    case 'create': {
      if (!client.token) return;
      if (client.room) client.room.remove(client.member);
      const room = new Room(makeCode(), hub, !!msg.isPrivate);
      rooms.set(room.code, room);
      if (STAGE_BY_ID[msg.stage]) room.settings.stage = msg.stage;
      room.add(client, memberInfo(msg));
      return;
    }
    case 'join': {
      if (!client.token) return;
      const code = String(msg.code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) { client.send({ t: 'error', msg: `Room ${code || '?'} not found.` }); return; }
      if (client.room === room) return;
      const existing = room.members.find(m => m.token === client.token);
      if (existing) { room.reconnect(existing, client); return; }
      if (client.room) client.room.remove(client.member);
      if (!room.add(client, memberInfo(msg))) client.send({ t: 'error', msg: 'That room is full.' });
      return;
    }
    default:
      if (client.room && client.member) client.room.handle(client.member, msg);
  }
}

// ------------------------------------------------------------------ main loop
const STEP = 1000 / TICK_RATE;
let acc = 0, last = performance.now(), slowWarn = 0;
function loop() {
  const t = performance.now();
  acc += t - last;
  last = t;
  let n = 0;
  while (acc >= STEP && n < 4) {
    const t0 = performance.now();
    for (const room of rooms.values()) {
      try { room.tick(STEP / 1000); } catch (err) { console.error(`room ${room.code} tick error`, err); }
    }
    const took = performance.now() - t0;
    if (took > STEP * 0.8 && Date.now() - slowWarn > 10000) { slowWarn = Date.now(); console.warn(`slow tick: ${took.toFixed(1)}ms`); }
    acc -= STEP;
    n++;
  }
  if (acc > STEP * 4) acc = 0;
  if (roomsDirty) {
    roomsDirty = false;
    const s = JSON.stringify({ t: 'rooms', rooms: roomList() });
    for (const c of clients) if (!c.room) c.sendRaw(s);
  }
  setTimeout(loop, Math.max(0, STEP - acc - 1));
}

server.listen(PORT, HOST, () => {
  console.log('\n  🌙  Nightfall Survivors server running\n');
  console.log(`  Local:    http://localhost:${PORT}`);
  for (const url of lanUrls()) console.log(`  Network:  ${url}   (friends on the same Wi-Fi)`);
  if (SHARE) startTunnel();
  else console.log('\n  Playing with friends over the internet? Run with --share (needs cloudflared) or see README.md\n');
  loop();
});

// Optional: expose the server publicly through a free Cloudflare quick tunnel.
function startTunnel() {
  console.log('\n  Starting a Cloudflare quick tunnel...');
  let proc;
  try {
    proc = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    proc = null;
  }
  if (!proc) return tunnelMissing();
  let shown = false;
  const onData = (buf) => {
    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(buf.toString());
    if (m && !shown) {
      shown = true;
      publicUrl = m[0];
      console.log(`\n  ✅  Share this link with your friends:\n\n      ${m[0]}\n`);
    }
  };
  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);
  proc.on('error', tunnelMissing);
  proc.on('exit', (code) => { if (shown) console.log(`  Tunnel closed (code ${code}).`); });
  const kill = () => { try { proc.kill(); } catch {} process.exit(0); };
  process.on('SIGINT', kill);
  process.on('SIGTERM', kill);
}

function tunnelMissing() {
  console.log('\n  ⚠️  cloudflared was not found. Install it, then run again with --share:');
  console.log('      macOS:   brew install cloudflared');
  console.log('      Windows: winget install --id Cloudflare.cloudflared');
  console.log('      Linux:   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/\n');
}
