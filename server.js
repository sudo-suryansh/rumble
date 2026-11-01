// Rumble Arena PvP server. No npm install needed.  Run:  node server.js   (PORT env var optional, default 8000)
// Serves the game files from this folder AND handles the multiplayer WebSocket on the same port.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 8000, ROOT = __dirname;
const MAXP = 8, WIN_KILLS = 20, RESPAWN_MS = 3000, DS = 8.5; // DS = damage scale (client weapon dmg * DS = HP lost, players have 100 HP)
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.obj': 'text/plain', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };

/* ---------- static files ---------- */
const server = http.createServer((req, res) => {
  let u;
  try { u = decodeURIComponent(req.url.split('?')[0]); }
  catch (e) { res.writeHead(400); return res.end('bad request'); }
  if (u === '/') u = '/Rumble_Arena.html';
  const f = path.resolve(ROOT, '.' + u), rel = path.relative(ROOT, f);
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel) || rel.toLowerCase() === 'server.js') { res.writeHead(404); return res.end('not found'); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d);
  });
});

/* ---------- minimal WebSocket (text frames) ---------- */
function frame(sock, op, data) {
  const n = data.length; let h;
  if (n < 126) h = Buffer.from([128 | op, n]);
  else if (n < 65536) { h = Buffer.alloc(4); h[0] = 128 | op; h[1] = 126; h.writeUInt16BE(n, 2); }
  else { h = Buffer.alloc(10); h[0] = 128 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
  sock.write(Buffer.concat([h, data]));
}
function parse(c) {
  for (;;) {
    const b = c.buf; if (b.length < 2) return;
    const op = b[0] & 15, masked = b[1] & 128; let len = b[1] & 127, off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
    if (len > 65536) { c.sock.destroy(); return; }
    const ml = masked ? 4 : 0; if (b.length < off + ml + len) return;
    const data = Buffer.from(b.subarray(off + ml, off + ml + len));
    if (masked) { const m = b.subarray(off, off + 4); for (let i = 0; i < data.length; i++) data[i] ^= m[i & 3]; }
    c.buf = b.subarray(off + ml + len);
    if (op === 8) { c.sock.end(); return; }
    if (op === 9) frame(c.sock, 10, data);
    else if (op === 1) onMsg(c, data.toString());
  }
}
server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket') { sock.destroy(); return; }
  const acc = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
  const c = { sock, buf: Buffer.alloc(0), p: null };
  sock.on('data', d => { c.buf = Buffer.concat([c.buf, d]); parse(c); });
  sock.on('close', () => leave(c)); sock.on('error', () => { sock.destroy(); });
});

/* ---------- world (must match the boxes in Rumble_Arena.html) ---------- */
const toBox = ([x, z, w, h, d]) => [x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2]; // [x0,y0,z0,x1,y1,z1]
const BOX = [[0, 0, 6, 5, 6], [-14, -10, 4, 2, 4], [14, -12, 4, 3, 4], [-16, 12, 6, 2, 3], [16, 14, 3, 2, 6], [0, -20, 10, 2, 2], [0, 20, 10, 2, 2], [-26, 0, 3, 4, 3], [26, 0, 3, 4, 3], [8, 8, 2, 1.2, 2], [-8, -8, 2, 1.2, 2], [-6, 14, 2, 1.5, 2], [7, -8, 2, 1.5, 2],
  [0, -40, 80, 6, 1], [0, 40, 80, 6, 1], [-40, 0, 1, 6, 80], [40, 0, 1, 6, 80]].map(toBox);
// per weapon (same order as client): [damage, pellets, min seconds between shots]
const WP = [[2, 1, .224], [1, 1, .072], [1, 8, .68], [1, 1, .052], [6, 1, .88], [0, 1, .4]];

function rayBox(o, d, b) {
  let t0 = 0, t1 = 1e9;
  for (let i = 0; i < 3; i++) {
    const lo = b[i], hi = b[i + 3];
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo || o[i] > hi) return -1; }
    else { let a = (lo - o[i]) / d[i], c = (hi - o[i]) / d[i]; if (a > c) [a, c] = [c, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) return -1; }
  }
  return t0;
}

/* ---------- game state ---------- */
const players = new Map(); let nextId = 1, over = false;
const now = () => Date.now() / 1000, r2 = v => Math.round(v * 100) / 100;
const num = (v, lo, hi) => Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : 0;
const send = (p, o) => { if (p.c && !p.c.sock.destroyed) frame(p.c.sock, 1, Buffer.from(JSON.stringify(o))); };
const all = (o, except) => players.forEach(p => { if (p !== except) send(p, o); });

function pickSpawn(q) {
  let best = null, bs = -1;
  for (let i = 0; i < 14; i++) {
    const x = (Math.random() - .5) * 68, z = (Math.random() - .5) * 68;
    if (BOX.some(b => x > b[0] - 1.2 && x < b[3] + 1.2 && z > b[2] - 1.2 && z < b[5] + 1.2)) continue;
    let s = 1e9; for (const o of players.values()) if (o !== q && o.alive) s = Math.min(s, Math.hypot(o.x - x, o.z - z));
    if (s > bs) { bs = s; best = [x, z]; }
  }
  return best || [0, 30];
}
function resolveMove(x, z) {
  for (const b of BOX) {
    const cx = Math.max(b[0], Math.min(b[3], x)), cz = Math.max(b[2], Math.min(b[5], z));
    const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
    if (d < .45) {
      if (d > 1e-4) { x += dx / d * (.45 - d); z += dz / d * (.45 - d); }
      else x += .45;
    }
  }
  return [Math.max(-38, Math.min(38, x)), Math.max(-38, Math.min(38, z))];
}
function respawn(q) {
  if (!players.has(q.id)) return;
  const [x, z] = pickSpawn(q); Object.assign(q, { x, y: 0, z, hp: 100, alive: true, dash: false, inv: now() + 2, rk: 0 });
  send(q, { t: 'rs', x, z });
}
function hurt(q, p, v, hd, w, pt) {
  if (!q.alive || v <= 0) return;
  q.hp -= v; send(q, { t: 'dmg', hp: Math.max(0, q.hp), ax: p.x, az: p.z });
  const kill = q.hp <= 0;
  if (p !== q) send(p, { t: 'h', v, hd, k: kill, p: pt || [q.x, q.y + 1.2, q.z] });
  if (!kill) return;
  q.alive = false; q.hp = 0; q.d++;
  if (p !== q) { p.k++; p.hp = Math.min(100, p.hp + 20); send(p, { t: 'hp', hp: p.hp }); }
  all({ t: 'k', a: p.id, an: p.n, v: q.id, vn: q.n, w, hd, x: q.x, y: q.y, z: q.z });
  send(q, { t: 'die', by: p === q ? 'yourself' : p.n });
  setTimeout(() => respawn(q), RESPAWN_MS);
  if (p.k >= WIN_KILLS && !over) {
    over = true; all({ t: 'win', n: p.n });
    setTimeout(() => { over = false; players.forEach(o => { o.k = o.d = 0; respawn(o); }); }, 5000);
  }
}
function shoot(p, m) {
  const w = WP[m.w | 0], t = now();
  if (!w || !p.alive || over || !Array.isArray(m.d) || t - p.lf < w[2] * .7) return;
  p.lf = t;
  if ((m.w | 0) === 5) { p.rk = Math.min(p.rk + 1, 3); all({ t: 'fx', id: p.id, w: 5, e: [] }, p); return; }
  const o = [p.x, p.y + 1.7, p.z], ends = [], hits = new Map();
  for (const dd of m.d.slice(0, w[1])) {
    if (!Array.isArray(dd)) continue;
    let dx = +dd[0], dy = +dd[1], dz = +dd[2]; const l = Math.hypot(dx, dy, dz); if (!(l > .5)) continue;
    dx /= l; dy /= l; dz /= l; const d = [dx, dy, dz];
    let tw = 120; for (const b of BOX) { const r = rayBox(o, d, b); if (r >= 0 && r < tw) tw = r; }
    let th = tw, hit = null;
    for (const q of players.values()) {
      if (q === p || !q.alive || q.dash || q.inv > t) continue;
      const r = rayBox(o, d, [q.x - .45, q.y, q.z - .45, q.x + .45, q.y + 1.95, q.z + .45]);
      if (r >= 0 && r < th) { th = r; hit = q; }
    }
    const end = [r2(o[0] + dx * th), r2(o[1] + dy * th), r2(o[2] + dz * th)]; ends.push(end);
    if (hit) {
      const head = end[1] > hit.y + 1.45, e = hits.get(hit) || { v: 0, hd: false };
      e.v += Math.round(w[0] * DS * (head ? 2 : 1)); e.hd = e.hd || head; e.pt = end; hits.set(hit, e);
    }
  }
  all({ t: 'fx', id: p.id, w: m.w | 0, e: ends.slice(0, 4) }, p);
  for (const [q, e] of hits) hurt(q, p, e.v, e.hd, m.w | 0, e.pt);
}
function explosion(p, m) {
  if (!p.alive || p.rk <= 0 || !Array.isArray(m.p) || over) return;
  p.rk--;
  const ex = num(m.p[0], -60, 60), ey = num(m.p[1], -5, 40), ez = num(m.p[2], -60, 60), t = now();
  all({ t: 'ex', p: [ex, ey, ez] }, p);
  for (const q of [...players.values()]) {
    const d = Math.hypot(q.x - ex, q.y + 1 - ey, q.z - ez);
    if (d >= 8 || !q.alive || q.dash || q.inv > t) continue;
    hurt(q, p, q === p ? Math.round(22 * (1 - d / 8)) : Math.round((14 * (1 - d / 8) + 1) * 6), false, 5);
  }
}

function onMsg(c, raw) {
  let m; try { m = JSON.parse(raw); } catch (e) { return; }
  if (m.t === 'join' && !c.p) {
    if (players.size >= MAXP) { frame(c.sock, 1, Buffer.from('{"t":"full"}')); c.sock.end(); return; }
    const id = nextId++, n = String(m.name || '').replace(/[^\w \-]/g, '').trim().slice(0, 12) || 'Player' + id;
    const p = c.p = { id, n, c, x: 0, y: 0, z: 30, yw: 0, pt: 0, w: 0, hp: 100, k: 0, d: 0, alive: true, dash: false, dashUntil: 0, dashCd: 0, stateAt: now(), inv: 0, lf: 0, rk: 0 };
    const [x, z] = pickSpawn(p); p.x = x; p.z = z; p.inv = now() + 2;
    const others = [...players.values()].map(q => ({ id: q.id, n: q.n, x: q.x, y: q.y, z: q.z, yw: q.yw, pt: q.pt, k: q.k, d: q.d }));
    players.set(id, p);
    send(p, { t: 'w', id, x, z, players: others });
    all({ t: 'j', p: { id, n, k: 0, d: 0 } }, p);
    console.log('+ ' + n + ' joined (' + players.size + ' online)');
    return;
  }
  const p = c.p; if (!p) return;
  if (m.t === 's' && p.alive) {
    const t = now(), dt = Math.max(.001, Math.min(.25, t - p.stateAt));
    const nx = num(m.x, -38, 38), ny = num(m.y, 0, 30), nz = num(m.z, -38, 38);
    let dx = nx - p.x, dz = nz - p.z, dy = ny - p.y;
    const requestedDash = !!m.d;
    if (requestedDash && !p.dash && t >= p.dashCd) { p.dashUntil = t + .22; p.dashCd = t + 2.2; }
    const dashActive = t < p.dashUntil;
    const maxHorizontal = (dashActive ? 42 : 16) * dt + .35;
    const distance = Math.hypot(dx, dz);
    if (distance > maxHorizontal) { dx *= maxHorizontal / distance; dz *= maxHorizontal / distance; }
    const maxVertical = 10 * dt + .35;
    dy = Math.max(-maxVertical, Math.min(maxVertical, dy));
    [p.x, p.z] = resolveMove(p.x + dx, p.z + dz);
    p.y = Math.max(0, Math.min(30, p.y + dy));
    p.yw = num(m.yw, -1e4, 1e4); p.pt = num(m.pt, -1.6, 1.6); p.w = m.w | 0;
    p.dash = dashActive; p.stateAt = t;
  } else if (m.t === 'f') shoot(p, m);
  else if (m.t === 'x') explosion(p, m);
}
function leave(c) {
  const p = c.p; if (!p) return; c.p = null; players.delete(p.id);
  all({ t: 'l', id: p.id }); console.log('- ' + p.n + ' left (' + players.size + ' online)');
}

setInterval(() => {
  if (!players.size) return;
  const list = [...players.values()].map(q => ({ id: q.id, x: r2(q.x), y: r2(q.y), z: r2(q.z), yw: Math.round(q.yw * 1e3) / 1e3, pt: Math.round(q.pt * 1e3) / 1e3, w: q.w, hp: q.hp, k: q.k, d: q.d, a: q.alive ? 1 : 0 }));
  all({ t: 'u', p: list });
}, 50);

server.listen(PORT, () => console.log('Rumble Arena PvP on http://localhost:' + PORT + '  (share http://<your-LAN-ip>:' + PORT + ' with friends)'));
