// End-to-end multiplayer test: spawns a dev server and drives several headless clients through a full session.
// usage: node tools/nettest.js
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocket } from 'ws';
import { decodeSnapshot, GF, PF } from '../shared/protocol.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3100 + Math.floor(Math.random() * 500);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) failures++; };

class Client {
  constructor(name) {
    this.name = name;
    this.msgs = [];
    this.snap = null;
    this.snaps = 0;
    this.token = null;
    this.x = 0; this.y = 0; this.tp = 0;
  }
  connect(token) {
    return new Promise((resolve) => {
      this.ws = new WebSocket(`ws://localhost:${PORT}/ws`);
      this.ws.binaryType = 'arraybuffer';
      this.ws.on('open', () => { this.send({ t: 'hello', token: token || '' }); });
      this.ws.on('message', (data, isBinary) => {
        if (isBinary) {
          const buf = data instanceof ArrayBuffer ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
          this.snap = decodeSnapshot(buf);
          this.snaps++;
          return;
        }
        const m = JSON.parse(typeof data === 'string' ? data : Buffer.from(data).toString('utf8'));
        this.msgs.push(m);
        if (m.t === 'welcome') { this.token = m.token; resolve(); }
        if (m.t === 'start') { this.x = m.x; this.y = m.y; this.tp = m.tp; this.slot = m.slot; }
        if (m.t === 'pos') { this.x = m.x; this.y = m.y; this.tp = m.tp; }
        if (m.t === 'joined') this.slot = m.slot;
      });
    });
  }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  last(t) { for (let i = this.msgs.length - 1; i >= 0; i--) if (this.msgs[i].t === t) return this.msgs[i]; return null; }
  count(t) { return this.msgs.filter(m => m.t === t).length; }
  async waitFor(t, pred = () => true, timeout = 5000) {
    const start = Date.now();
    let seen = 0;
    while (Date.now() - start < timeout) {
      for (let i = seen; i < this.msgs.length; i++) {
        let hit = false;
        try { hit = this.msgs[i].t === t && pred(this.msgs[i]); } catch { hit = false; }
        if (hit) return this.msgs[i];
      }
      await sleep(20);
    }
    return null;
  }
  move(dx, dy, dt = 1 / 30) {
    this.x += dx * 135 * dt; this.y += dy * 135 * dt;
    this.send({ t: 'in', x: this.x, y: this.y, dx, dy, tp: this.tp });
  }
  close() { this.ws.close(); }
}

async function autoPick(clients, ms) {
  const end = Date.now() + ms;
  const done = new Map();
  while (Date.now() < end) {
    for (const c of clients) {
      const offers = c.msgs.filter(m => m.t === 'offer').length;
      if (offers > (done.get(c) || 0)) { done.set(c, offers); c.send({ t: 'pick', i: 0 }); }
    }
    await sleep(50);
  }
}

async function main() {
  const server = spawn(process.execPath, [path.join(ROOT, 'server/index.js'), '--dev'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverErr = '';
  server.stderr.on('data', (d) => { serverErr += d; });
  await new Promise((resolve) => server.stdout.on('data', (d) => { if (/running/.test(d)) resolve(); }));
  try {
    console.log('\n[lobby]');
    const A = new Client('Alice'), B = new Client('Bob'), C = new Client('Cara');
    await A.connect(); await B.connect(); await C.connect();
    ok(A.token && B.token && A.token !== B.token, 'clients get distinct session tokens');
    A.send({ t: 'create', name: 'Alice', char: 'lysa', powerups: { might: 2, amount: 9 } });
    const joinedA = await A.waitFor('joined');
    ok(joinedA && joinedA.code.length === 4 && joinedA.host, `Alice created room ${joinedA && joinedA.code}`);
    const code = joinedA.code;
    const rooms = await C.waitFor('rooms', m => m.rooms.some(r => r.code === code));
    ok(!!rooms, 'room appears in the public room list');
    B.send({ t: 'join', code, name: 'Bob<script>', char: 'brom' });
    const joinedB = await B.waitFor('joined');
    ok(joinedB && joinedB.slot === 1 && !joinedB.host, 'Bob joined as slot 1');
    const lob = await A.waitFor('lobby', m => m.members.length === 2);
    ok(!!lob, 'lobby shows two members');
    ok(lob && lob.members[1].name === 'Bobscript', `names are sanitized (${lob && lob.members[1].name})`);
    B.send({ t: 'join', code: 'ZZZZ', name: 'x' });
    ok(!!(await B.waitFor('error')), 'joining a bad code returns an error');
    B.send({ t: 'ready', v: true });
    ok(!!(await A.waitFor('lobby', m => m.members[1].ready)), 'ready state syncs');
    B.send({ t: 'settings', stage: 'crypt' });
    await sleep(100);
    ok(A.last('lobby').settings.stage === 'forest', 'non-host cannot change settings');
    A.send({ t: 'settings', stage: 'tundra', length: 10, difficulty: 'easy' });
    ok(!!(await B.waitFor('lobby', m => m.settings.stage === 'tundra' && m.settings.length === 10)), 'host settings sync');
    B.send({ t: 'chat', text: 'hello there' });
    ok(!!(await A.waitFor('chat', m => m.text === 'hello there' && m.name === 'Bobscript')), 'chat relays');

    console.log('\n[game start]');
    B.send({ t: 'start' });
    await sleep(150);
    ok(!A.last('start'), 'non-host cannot start');
    A.send({ t: 'start' });
    const sA = await A.waitFor('start'), sB = await B.waitFor('start');
    ok(sA && sB && sA.stage === 'tundra', 'both clients receive start');
    const roster = await A.waitFor('roster');
    ok(roster && roster.players.length === 2, 'roster lists both players');
    const alice = roster.players.find(p => p.slot === 0);
    ok(alice.weapons[0][0] === 'wand', 'Alice starts with her character weapon');
    ok(Math.abs(alice.stats.might - 1.1) < 1e-6 && alice.stats.amount === 1, `powerups are clamped (might ${alice.stats.might}, amount ${alice.stats.amount})`);
    await sleep(500);
    ok(A.snaps > 3 && B.snaps > 3, `snapshots stream (${A.snaps}, ${B.snaps})`);
    ok(A.snap && A.snap.players.length === 2, 'snapshot contains both players');

    console.log('\n[movement]');
    const startX = A.x;
    for (let i = 0; i < 45; i++) { A.move(1, 0); B.move(0, 1); await sleep(33); }
    await sleep(200);
    const pa = A.snap.players.find(p => p.slot === 0), pb = A.snap.players.find(p => p.slot === 1);
    ok(Math.abs(pa.x - A.x) < 25 && pa.x > startX + 150, `server accepted Alice's movement (${Math.round(pa.x)} vs ${Math.round(A.x)})`);
    ok(Math.abs(pb.y - B.y) < 25, `server accepted Bob's movement (${Math.round(pb.y)} vs ${Math.round(B.y)})`);
    const tpBefore = A.tp;
    A.send({ t: 'in', x: A.x + 5000, y: A.y, dx: 1, dy: 0, tp: A.tp });
    const pos = await A.waitFor('pos', m => m.tp > tpBefore);
    ok(!!pos, 'teleport attempt is rejected and corrected');

    console.log('\n[level up + pause]');
    A.send({ t: 'chat', text: '/xp 12' });
    const offerA = await A.waitFor('offer'), offerB = await B.waitFor('offer');
    ok(offerA && offerB && offerA.pausing, 'level-up sends offers to both players');
    await sleep(150);
    ok((A.snap.flags & GF.LEVELUP) !== 0, 'game is paused during level-up');
    const tFrozen = A.snap.time;
    A.send({ t: 'pick', i: 0 });
    const w = await A.waitFor('waiting', m => m.names.length === 1 && m.names[0] === 'Bobscript');
    ok(!!w, 'others see who is still choosing');
    await sleep(200);
    ok(A.snap.time === tFrozen, 'game time frozen while someone is choosing');
    B.send({ t: 'pick', i: 1 });
    await B.waitFor('offerDone');
    await autoPick([A, B], 600);
    ok((A.snap.flags & GF.LEVELUP) === 0 && A.snap.time > tFrozen, 'game resumes after everyone picks');
    const r2 = A.last('roster');
    ok(r2.players.every(p => p.weapons.length + p.passives.length >= 2), 'picks were applied');

    A.send({ t: 'pause', v: true });
    const pm = await B.waitFor('pause', m => m.paused);
    ok(pm && pm.by === 'Alice', 'pause is broadcast with who paused');
    await sleep(150);
    const tp1 = A.snap.time;
    await sleep(300);
    ok(A.snap.time === tp1 && (A.snap.flags & GF.PAUSED), 'time stops while paused');
    B.send({ t: 'pause', v: false });
    ok(!!(await A.waitFor('pause', m => !m.paused)), 'anyone can resume');

    console.log('\n[late join]');
    C.send({ t: 'join', code, name: 'Cara', char: 'mira' });
    const sC = await C.waitFor('start');
    ok(!!sC, 'Cara joins the running game');
    const offerC = await C.waitFor('offer');
    ok(offerC && !offerC.pausing && offerC.remaining >= 1, `late joiner gets non-pausing catch-up picks (${offerC && offerC.remaining})`);
    ok(!!(await A.waitFor('toast', m => /Cara joined/.test(m.text))), 'others are told Cara joined');
    await sleep(200);
    ok((A.snap.flags & GF.LEVELUP) === 0, 'catch-up picks do not pause the team');
    const cSnap = A.snap.players.find(p => p.slot === 2);
    ok(cSnap && (cSnap.flags & PF.CHOOSING), 'late joiner is marked as choosing (protected)');
    await autoPick([C], 1500);

    console.log('\n[disconnect + reconnect]');
    const bobToken = B.token;
    B.close();
    ok(!!(await A.waitFor('roster', m => m.players.some(p => p.slot === 1 && !p.connected))), 'disconnect shows Bob offline');
    await sleep(300);
    ok(!A.snap.players.some(p => p.slot === 1), 'offline players are not simulated');
    const B2 = new Client('Bob2');
    await B2.connect(bobToken);
    const j2 = await B2.waitFor('joined');
    ok(j2 && j2.reconnect && j2.slot === 1, 'Bob resumes his seat with his token');
    ok(!!(await B2.waitFor('start')), 'reconnected client is put back into the game');
    const r3 = await A.waitFor('roster', m => m.players.some(p => p.slot === 1 && p.connected));
    ok(r3 && r3.players.find(p => p.slot === 1).weapons.length >= 1, 'Bob keeps his build');

    console.log('\n[victory + results]');
    for (const c of [A, B2, C]) c.send({ t: 'chat', text: '/god' });
    A.send({ t: 'chat', text: '/time 9.97' });
    const pickLoop = autoPick([A, B2, C], 5000);
    const over = await A.waitFor('over', () => true, 6000);
    await pickLoop;
    ok(over && over.results.victory, 'reaching the end of the timer wins the run');
    ok(over && over.results.players.length === 3 && over.results.players.every(p => p.gold > 0), 'results include gold for each player');
    ok(!!(await B2.waitFor('over')), 'all players get the results');
    ok(!!(await A.waitFor('lobby', m => m.state === 'lobby')), 'room returns to the lobby');

    console.log('\n[second run + leave]');
    A.send({ t: 'start' });
    ok(!!(await C.waitFor('start', (m) => m !== sC, 3000)), 'host can start another run');
    C.send({ t: 'leave' });
    ok(!!(await C.waitFor('left')), 'leave acknowledged');
    ok(!!(await A.waitFor('toast', m => /Cara left/.test(m.text))), 'others see Cara left');
    A.send({ t: 'leave' });
    ok(!!(await B2.waitFor('lobby', m => m.host === 1)), 'host migrates when the host leaves');
    for (const c of [A, B2, C]) c.close();
  } finally {
    server.kill();
  }
  if (serverErr.trim()) { console.log('\nserver stderr:\n' + serverErr); failures++; }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
