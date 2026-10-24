// Servidor do Vizinhos 3D: arquivos estáticos + WebSocket multiplayer autoritativo + persistência.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createStorage } from './storage.js';
import { createWorld, newWorldCode, applyOp, publicWorld, sanitizeAvatar, LOT_PRESETS, TERRAIN_PRESETS, GRID_N } from '../shared/world.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.PORT || 3000;
const SAVE_DELAY = 400;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary', '.webp': 'image/webp' };

function serveStatic(req, res) {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  let base = path.join(ROOT, 'public');
  if (url.startsWith('/shared/')) { base = path.join(ROOT, 'shared'); url = url.slice(7); }
  if (url === '/') url = '/index.html';
  const file = path.normalize(path.join(base, url));
  if (!file.startsWith(base)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('404'); }
    const ext = path.extname(file);
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': url.startsWith('/vendor/') ? 'public, max-age=86400' : 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

const storage = await createStorage();
const server = http.createServer(serveStatic);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 6 * 1024 * 1024 });
const rooms = new Map(); // worldId -> room

const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };

function broadcast(room, msg, except) {
  const data = JSON.stringify(msg);
  for (const c of room.clients) if (c !== except && c.readyState === 1) c.send(data);
}

async function loadRoom(id) {
  if (rooms.has(id)) return rooms.get(id);
  const world = await storage.get(id);
  if (!world) return null;
  if (rooms.has(id)) return rooms.get(id); // corrida
  const room = { id, world, clients: new Set(), recentOps: new Map(), dirty: false, saving: false, timer: null, savedSeq: world.seq, chat: [], unloadTimer: null };
  rooms.set(id, room);
  return room;
}

function scheduleSave(room) {
  room.dirty = true;
  if (room.timer || room.saving) return;
  room.timer = setTimeout(() => doSave(room), SAVE_DELAY);
}
async function doSave(room) {
  room.timer = null;
  if (room.saving) return;
  room.saving = true; room.dirty = false;
  const seq = room.world.seq;
  room.world.updatedAt = Date.now();
  try {
    await storage.put(room.id, room.world);
    room.savedSeq = seq;
    broadcast(room, { t: 'saved', seq });
  } catch (e) {
    console.error('[save] erro', room.id, e.message);
    room.dirty = true;
    broadcast(room, { t: 'saveError', msg: 'Falha ao salvar no servidor — nova tentativa em instantes' });
  }
  room.saving = false;
  if (room.dirty) room.timer = setTimeout(() => doSave(room), room.savedSeq === seq ? SAVE_DELAY : 3000);
  else if (room.clients.size === 0) scheduleUnload(room);
}
function scheduleUnload(room) {
  clearTimeout(room.unloadTimer);
  room.unloadTimer = setTimeout(() => {
    if (room.clients.size === 0 && !room.dirty && !room.saving) rooms.delete(room.id);
  }, 60000);
}

function onlineList(room) {
  return [...room.clients].map(c => c.pid);
}

function attach(ws, room, pid) {
  ws.room = room; ws.pid = pid;
  // fecha conexão anterior do mesmo jogador (reconexão)
  for (const c of room.clients) if (c.pid === pid && c !== ws) { c.replaced = true; c.close(4000, 'Conectado em outra aba'); room.clients.delete(c); }
  room.clients.add(ws);
  clearTimeout(room.unloadTimer);
  const p = room.world.players[pid];
  send(ws, { t: 'welcome', you: pid, world: publicWorld(room.world), online: onlineList(room), chat: room.chat.slice(-40), savedSeq: room.savedSeq, storage: storage.kind });
  broadcast(room, { t: 'joined', pid, player: { name: p.name, avatar: p.avatar, plot: p.plot, pos: p.pos } }, ws);
}

async function handleJoin(ws, m, creating) {
  const pid = String(m.pid || ''), secret = String(m.secret || '');
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(pid) || secret.length < 16) return send(ws, { t: 'error', code: 'auth', msg: 'Identidade inválida' });
  const name = String(m.name || 'Jogador').replace(/[<>]/g, '').trim().slice(0, 24) || 'Jogador';
  const avatar = sanitizeAvatar(m.avatar);
  let room;
  if (creating) {
    let id; do { id = newWorldCode(); } while (rooms.has(id) || await storage.exists(id));
    const world = createWorld({ id, name: m.worldName, lot: LOT_PRESETS[m.lot] ? m.lot : 'medio', terrain: TERRAIN_PRESETS[m.terrain] ? m.terrain : 'plano' });
    await storage.put(id, world);
    room = await loadRoom(id);
  } else if (m.restore) {
    // restaura um mundo a partir da cópia de segurança local de um dos jogadores (só se o código não existir no servidor)
    const w = m.restore;
    const id = String(w?.id || '').toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(id) || !w.terrain || w.terrain.heights?.length !== GRID_N * GRID_N) return send(ws, { t: 'error', code: 'restore', msg: 'Cópia de segurança inválida' });
    if (rooms.has(id) || await storage.exists(id)) return send(ws, { t: 'error', code: 'restore', msg: 'Esse mundo já existe no servidor' });
    if (!w.players?.[pid]) return send(ws, { t: 'error', code: 'restore', msg: 'Você não participa desse mundo' });
    const fresh = createWorld({ id, name: w.name, lot: w.lot, terrain: w.terrainPreset, seed: w.seed });
    fresh.terrain.heights = w.terrain.heights.map(v => +v || 0); fresh.terrain.soil = (w.terrain.soil || []).map(v => v | 0);
    fresh.plots = fresh.plots.map((p, i) => ({ ...p, owner: w.plots?.[i]?.owner || null, editors: Array.isArray(w.plots?.[i]?.editors) ? w.plots[i].editors.slice(0, 4) : [] }));
    for (const [id2, p] of Object.entries(w.players)) fresh.players[id2] = { name: String(p.name || 'Jogador').slice(0, 24), avatar: sanitizeAvatar(p.avatar), plot: p.plot || null, secretHash: null, pos: p.pos };
    // objetos: paredes primeiro (aberturas dependem delas)
    const list = Object.values(w.objects || {}).sort((a, b) => (a.type === 'opening') - (b.type === 'opening'));
    for (const o of list) { try { applyOp(fresh, { k: 'add', obj: o }, null, false); } catch {} }
    fresh.seq = 1;
    await storage.put(id, fresh);
    room = await loadRoom(id);
  } else {
    const id = String(m.world || '').toUpperCase().trim();
    room = /^[A-Z0-9]{6}$/.test(id) ? await loadRoom(id) : null;
    if (!room) return send(ws, { t: 'error', code: 'notfound', msg: 'Mundo não encontrado. Confira o código do convite.' });
  }
  const world = room.world;
  let p = world.players[pid];
  if (p) {
    if (p.secretHash && p.secretHash !== sha(secret)) return send(ws, { t: 'error', code: 'auth', msg: 'Esta identidade pertence a outro navegador.' });
    if (!p.secretHash) p.secretHash = sha(secret);
    p.name = name; p.avatar = avatar;
  } else {
    const free = world.plots.find(pl => !pl.owner);
    p = world.players[pid] = { name, avatar, plot: free ? free.id : null, secretHash: sha(secret), pos: null };
    if (free) free.owner = pid;
  }
  world.seq++;
  scheduleSave(room);
  attach(ws, room, pid);
}

function handleOp(ws, m) {
  const room = ws.room; if (!room) return;
  const opId = String(m.opId || '').slice(0, 60);
  if (opId && room.recentOps.has(opId)) return send(ws, { t: 'ack', opId, seq: room.recentOps.get(opId) }); // reenvio idempotente
  const op = m.op;
  const world = room.world;
  let backupObjs = null, backupTerrain = null;
  if (op?.k === 'batch') {
    backupObjs = JSON.stringify(world.objects);
    if (op.ops?.some?.(o => o.k === 'terrain')) backupTerrain = world.terrain.heights.slice();
  }
  try {
    applyOp(world, op, ws.pid, true);
  } catch (e) {
    if (backupObjs) world.objects = JSON.parse(backupObjs);
    if (backupTerrain) world.terrain.heights = backupTerrain;
    return send(ws, { t: 'reject', opId, msg: e.message });
  }
  const seq = ++world.seq;
  if (opId) { room.recentOps.set(opId, seq); if (room.recentOps.size > 800) room.recentOps.delete(room.recentOps.keys().next().value); }
  send(ws, { t: 'ack', opId, seq });
  broadcast(room, { t: 'op', op, by: ws.pid, seq }, ws);
  scheduleSave(room);
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  let opsWindow = 0, windowStart = Date.now();
  ws.on('message', async (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (Date.now() - windowStart > 1000) { windowStart = Date.now(); opsWindow = 0; }
    if (++opsWindow > 120) return; // limite simples de taxa
    try {
      switch (m.t) {
        case 'create': return await handleJoin(ws, m, true);
        case 'join': return await handleJoin(ws, m, false);
        case 'op': return handleOp(ws, m);
        case 'move': {
          const room = ws.room; if (!room) return;
          const p = room.world.players[ws.pid];
          if (Array.isArray(m.p) && m.p.length === 3 && m.p.every(Number.isFinite)) p.pos = [m.p[0], m.p[1], m.p[2], +m.r || 0];
          broadcast(room, { t: 'move', pid: ws.pid, p: m.p, r: m.r, s: m.s, a: m.a }, ws);
          return;
        }
        case 'avatar': {
          const room = ws.room; if (!room) return;
          const p = room.world.players[ws.pid];
          p.avatar = sanitizeAvatar(m.avatar);
          if (typeof m.name === 'string' && m.name.trim()) p.name = m.name.replace(/[<>]/g, '').trim().slice(0, 24);
          room.world.seq++;
          broadcast(room, { t: 'avatar', pid: ws.pid, avatar: p.avatar, name: p.name });
          send(ws, { t: 'ack', opId: m.opId, seq: room.world.seq });
          scheduleSave(room);
          return;
        }
        case 'perm': {
          const room = ws.room; if (!room) return;
          const plot = room.world.plots.find(pl => pl.owner === ws.pid);
          if (!plot) return send(ws, { t: 'reject', msg: 'Você não é dono de um terreno' });
          const target = String(m.pid || '');
          if (!room.world.players[target] || target === ws.pid) return;
          plot.editors = plot.editors.filter(x => x !== target);
          if (m.allow) plot.editors.push(target);
          room.world.seq++;
          broadcast(room, { t: 'plots', plots: room.world.plots });
          scheduleSave(room);
          return;
        }
        case 'chat': {
          const room = ws.room; if (!room) return;
          const text = String(m.text || '').slice(0, 300).trim(); if (!text) return;
          const msg = { pid: ws.pid, name: room.world.players[ws.pid].name, text, at: Date.now() };
          room.chat.push(msg); if (room.chat.length > 80) room.chat.shift();
          broadcast(room, { t: 'chat', ...msg });
          return;
        }
        case 'ping': return send(ws, { t: 'pong', at: m.at });
      }
    } catch (e) {
      console.error('[ws] erro', e);
      send(ws, { t: 'error', code: 'server', msg: 'Erro no servidor: ' + e.message });
    }
  });
  ws.on('close', () => {
    const room = ws.room; if (!room) return;
    room.clients.delete(ws);
    if (!ws.replaced) broadcast(room, { t: 'left', pid: ws.pid });
    if (room.clients.size === 0) { if (room.dirty || room.timer) doSave(room); else scheduleUnload(room); }
  });
});

// heartbeat para detectar conexões mortas
setInterval(() => {
  for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); }
}, 25000);

async function shutdown() {
  console.log('Salvando mundos antes de encerrar...');
  for (const room of rooms.values()) { clearTimeout(room.timer); try { await storage.put(room.id, room.world); } catch (e) { console.error(e); } }
  process.exit(0);
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);

server.listen(PORT, () => console.log(`Vizinhos 3D rodando em http://localhost:${PORT}`));
