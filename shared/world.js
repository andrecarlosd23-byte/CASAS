// Lógica do mundo compartilhada entre cliente e servidor:
// geração do bairro, terreno (heightfield), validação de objetos e aplicação de operações.
import { LEVEL_H, MATERIALS, OPENINGS, ROOFS, ITEMS, STYLES, AVATAR, defaultAvatar } from './catalog.js';

export const WORLD_SIZE = 200;   // metros (quadrado centrado na origem)
export const TERRAIN_RES = 1;    // espaçamento da malha do terreno (m)
export const GRID_N = WORLD_SIZE / TERRAIN_RES + 1;
export const MAX_OBJECTS = 6000;
export const SOILS = ['grama', 'grama_seca', 'terra', 'areia', 'pedra', 'grama_escura'];
export const STREET = { z0: -4, z1: 4, walk: 2.2 }; // rua ao longo do eixo X

export const LOT_PRESETS = {
  pequeno: { w: 20, d: 30, label: '20 × 30 m' },
  medio:   { w: 30, d: 40, label: '30 × 40 m' },
  grande:  { w: 40, d: 50, label: '40 × 50 m' },
};
export const TERRAIN_PRESETS = { plano: 'Plano', inclinado: 'Inclinado (aclive ao fundo)', ondulado: 'Ondulado' };

// ---------- utilitários ----------
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function hash2(x, z, seed) {
  let h = (x * 374761393 + z * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177; h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
function smooth(t) { return t * t * (3 - 2 * t); }
function vnoise(x, z, seed) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const a = hash2(xi, zi, seed), b = hash2(xi + 1, zi, seed), c = hash2(xi, zi + 1, seed), d = hash2(xi + 1, zi + 1, seed);
  const u = smooth(xf), v = smooth(zf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z, seed, oct = 4) {
  let s = 0, amp = 1, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { s += vnoise(x * f, z * f, seed + i * 17) * amp; norm += amp; amp *= 0.5; f *= 2; }
  return s / norm;
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function newId(prefix = 'o') {
  return prefix + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 8);
}
export function newWorldCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = ''; for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// ---------- layout do bairro ----------
export function makePlots(lotW, lotD) {
  const z0 = STREET.z1 + STREET.walk + 1; // após calçada
  return [
    { id: 'A', name: 'Terreno 1', x0: -1 - lotW, x1: -1, z0, z1: z0 + lotD, owner: null, editors: [] },
    { id: 'B', name: 'Terreno 2', x0: 1, x1: 1 + lotW, z0, z1: z0 + lotD, owner: null, editors: [] },
  ];
}

function distToRect(x, z, r) {
  const dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
}

export function createWorld({ id, name, lot = 'medio', terrain = 'plano', seed }) {
  const L = LOT_PRESETS[lot] || LOT_PRESETS.medio;
  const plots = makePlots(L.w, L.d);
  seed = seed ?? Math.floor(Math.random() * 1e9);
  const N = GRID_N, half = WORLD_SIZE / 2;
  const heights = new Array(N * N);
  const soil = new Array(N * N);
  const street = { x0: -half, x1: half, z0: STREET.z0 - STREET.walk, z1: STREET.z1 + STREET.walk };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -half + i * TERRAIN_RES, z = -half + j * TERRAIN_RES;
    // relevo natural ao redor: colinas que crescem com a distância até montanhas nas bordas
    const dPlot = Math.min(distToRect(x, z, plots[0]), distToRect(x, z, plots[1]));
    const dStreet = distToRect(x, z, street);
    const dMin = Math.min(dPlot, dStreet);
    const edge = Math.max(Math.abs(x), Math.abs(z)) / half; // 0 centro .. 1 borda
    let natural = fbm(x / 38, z / 38, seed) * 9 - 3 + fbm(x / 12, z / 12, seed + 5, 3) * 1.5;
    natural += Math.pow(Math.max(0, edge - 0.45) / 0.55, 2) * 38 * (0.6 + 0.8 * fbm(x / 25, z / 25, seed + 9));
    if (z < STREET.z0 - STREET.walk) natural -= 1.2; // lado sul ligeiramente mais baixo
    const blend = smooth(clamp((dMin - 2) / 16, 0, 1));
    let inner = 0;
    // relevo dentro dos lotes conforme o preset
    for (const p of plots) {
      if (x >= p.x0 - 0.01 && x <= p.x1 + 0.01 && z >= p.z0 - 0.01 && z <= p.z1 + 0.01) {
        const t = (z - p.z0) / (p.z1 - p.z0);
        if (terrain === 'inclinado') inner = Math.max(0, t - 0.35) * 7;
        else if (terrain === 'ondulado') inner = (fbm(x / 9, z / 9, seed + 3, 3) - 0.5) * 2.4 * smooth(clamp(t * 4, 0, 1));
      }
    }
    let h = inner * (1 - blend) + natural * blend;
    if (dStreet === 0) h = 0;
    heights[j * N + i] = Math.round(h * 100) / 100;
    let s = 0;
    if (blend > 0.5) { const n = fbm(x / 7, z / 7, seed + 21, 2); s = n > 0.62 ? 5 : n < 0.3 ? 1 : 0; if (h > 22) s = 4; }
    soil[j * N + i] = s;
  }
  return {
    id, name: String(name || 'Meu bairro').slice(0, 40), createdAt: Date.now(), updatedAt: Date.now(),
    seed, lot, terrainPreset: terrain, seq: 0, version: 1,
    plots, players: {},
    terrain: { N, res: TERRAIN_RES, size: WORLD_SIZE, heights, soil },
    objects: {},
  };
}

// ---------- terreno ----------
export function gridIndex(x, z) {
  const half = WORLD_SIZE / 2;
  return [Math.round((x + half) / TERRAIN_RES), Math.round((z + half) / TERRAIN_RES)];
}
export function terrainHeight(world, x, z) {
  const t = world.terrain, half = WORLD_SIZE / 2, N = t.N;
  const fx = clamp((x + half) / t.res, 0, N - 1.0001), fz = clamp((z + half) / t.res, 0, N - 1.0001);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const h = t.heights;
  const a = h[j * N + i], b = h[j * N + i + 1], c = h[(j + 1) * N + i], d = h[(j + 1) * N + i + 1];
  // mesma triangulação usada na malha (diagonal a-d)
  if (u + v <= 1 && false) return a;
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

// Aplica um pincel ou operação de terreno. bounds = retângulo permitido (lote). Retorna a região alterada.
export function applyTerrain(world, op, bounds) {
  const t = world.terrain, N = t.N, half = WORLD_SIZE / 2, H = t.heights, S = t.soil;
  const inB = (x, z) => !bounds || (x >= bounds.x0 - 1e-6 && x <= bounds.x1 + 1e-6 && z >= bounds.z0 - 1e-6 && z <= bounds.z1 + 1e-6);
  let reach = op.r || 1;
  if (op.mode === 'rect') reach = Math.hypot(op.w, op.d) / 2 + (op.margin || 0) + 1;
  const i0 = clamp(Math.floor((op.x - reach + half) / t.res), 0, N - 1), i1 = clamp(Math.ceil((op.x + reach + half) / t.res), 0, N - 1);
  const j0 = clamp(Math.floor((op.z - reach + half) / t.res), 0, N - 1), j1 = clamp(Math.ceil((op.z + reach + half) / t.res), 0, N - 1);
  let src = null;
  if (op.mode === 'smooth') { src = {}; for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) src[j * N + i] = H[j * N + i]; }
  const cos = Math.cos(-(op.rot || 0)), sin = Math.sin(-(op.rot || 0));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = -half + i * t.res, z = -half + j * t.res;
    if (!inB(x, z)) continue;
    const k = j * N + i;
    if (op.mode === 'rect') {
      const dx = x - op.x, dz = z - op.z;
      const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
      const m = op.margin || 0;
      if (Math.abs(lx) <= op.w / 2 + m && Math.abs(lz) <= op.d / 2 + m) H[k] = Math.round(op.h * 100) / 100;
      continue;
    }
    const d = Math.hypot(x - op.x, z - op.z);
    if (d > op.r) continue;
    const f = Math.pow(1 - (d / op.r) * (d / op.r), 2);
    const s = op.s * f;
    if (op.mode === 'raise') H[k] += s;
    else if (op.mode === 'lower') H[k] -= s;
    else if (op.mode === 'flatten') H[k] += (op.h - H[k]) * clamp(s * 2, 0, 1);
    else if (op.mode === 'smooth') {
      let sum = 0, n = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
        const kk = jj * N + ii; sum += src[kk] ?? H[kk]; n++;
      }
      H[k] += (sum / n - H[k]) * clamp(s * 2, 0, 1);
    } else if (op.mode === 'paint') { if (f > 0.25) S[k] = op.soil; continue; }
    H[k] = Math.round(clamp(H[k], -25, 70) * 100) / 100;
  }
  return { i0, i1, j0, j1 };
}

// ---------- lotes e permissões ----------
export function plotAt(world, x, z, tol = 0) {
  return world.plots.find(p => x >= p.x0 - tol && x <= p.x1 + tol && z >= p.z0 - tol && z <= p.z1 + tol) || null;
}
export function canEditPlot(world, playerId, plot) {
  if (!plot) return false;
  return plot.owner === playerId || (plot.editors || []).includes(playerId);
}
export function levelBase(level) { return level * LEVEL_H; }

// pontos que precisam estar dentro do lote
export function objectPoints(world, o) {
  if (o.type === 'wall') return [o.a, o.b];
  if (o.type === 'opening') { const w = world.objects[o.wall]; return w ? [w.a, w.b] : []; }
  const pts = [[o.x, o.z]];
  if (o.w && o.d && o.type !== 'item') {
    const c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const lx = sx * o.w / 2, lz = sz * o.d / 2;
      pts.push([o.x + lx * c + lz * s, o.z - lx * s + lz * c]);
    }
  }
  return pts;
}
export function plotOfObject(world, o) {
  const pts = objectPoints(world, o);
  if (!pts.length) return null;
  const tol = o.type === 'roof' ? 3.5 : 0.6;
  const p0 = plotAt(world, pts[0][0], pts[0][1], tol);
  if (!p0) return null;
  for (const p of pts) if (!(p[0] >= p0.x0 - tol && p[0] <= p0.x1 + tol && p[1] >= p0.z0 - tol && p[1] <= p0.z1 + tol)) return null;
  return p0;
}

// ---------- esquema e sanitização ----------
const num = (min, max, def) => ({ k: 'num', min, max, def });
const int = (min, max, def) => ({ k: 'int', min, max, def });
const en = (vals, def) => ({ k: 'enum', vals, def: def ?? vals[0] });
const P = num(-WORLD_SIZE, WORLD_SIZE, 0);
const MAT = { k: 'mat' }, COLOR = { k: 'color', def: '#ffffff' }, BOOL = { k: 'bool' }, ROT = { k: 'rot' }, V2 = { k: 'vec2' };
const LEVEL = int(0, 9, 0), Y0 = num(-20, 60, 0);

export const SCHEMA = {
  wall:    { a: V2, b: V2, level: LEVEL, h: num(0.2, 15, LEVEL_H), t: num(0.04, 1.5, 0.15), y0: Y0, mat: MAT, matB: MAT },
  opening: { wall: { k: 'id' }, u: num(0, 300, 1), w: num(0.3, 15, 0.9), h: num(0.2, 12, 2.1), sill: num(0, 10, 0), style: en(Object.keys(OPENINGS)), open: BOOL, mat: MAT, frame: COLOR },
  floor:   { x: P, z: P, w: num(0.2, 120, 4), d: num(0.2, 120, 4), rot: ROT, level: LEVEL, t: num(0.02, 1.5, 0.15), y0: Y0, mat: MAT, mode: en(['piso', 'laje', 'fundacao']) },
  roof:    { x: P, z: P, w: num(0.5, 120, 8), d: num(0.5, 120, 6), rot: ROT, level: LEVEL, style: en(Object.keys(ROOFS)), pitch: num(0, 60, 30), over: num(0, 3, 0.5), y0: Y0, mat: MAT, matB: MAT },
  stairs:  { x: P, z: P, rot: ROT, w: num(0.6, 4, 1.1), level: LEVEL, steps: int(4, 30, 16), style: en(['macica', 'vazada', 'concreto']), y0: Y0, mat: MAT },
  column:  { x: P, z: P, level: LEVEL, s: num(0.08, 2, 0.25), h: num(0.3, 20, LEVEL_H), shape: en(['quadrado', 'redondo']), y0: Y0, mat: MAT },
  beam:    { a: V2, b: V2, level: LEVEL, s: num(0.08, 1.5, 0.2), h: num(0.08, 1.5, 0.35), y0: Y0, mat: MAT },
  item:    { item: en(Object.keys(ITEMS)), x: P, z: P, y: num(-25, 80, 0), rot: ROT, sc: num(0.2, 5, 1), level: LEVEL, color: COLOR, color2: COLOR, style: en(STYLES) },
  pool:    { x: P, z: P, y: num(-25, 80, 0), w: num(1.5, 30, 8), d: num(1.2, 30, 4), depth: num(0.3, 4, 1.5), rot: ROT, shape: en(['retangular', 'redonda', 'oval', 'borda_infinita']), tile: COLOR, coping: COLOR, light: BOOL, shallow: BOOL },
  water:   { x: P, z: P, y: num(-25, 80, 0), w: num(1, 80, 10), d: num(1, 80, 8), rot: ROT, shape: en(['lago', 'retangular']), color: COLOR },
};

function sanitizeMat(m, fallbackId) {
  m = m && typeof m === 'object' ? m : {};
  const id = MATERIALS[m.id] ? m.id : fallbackId;
  const base = MATERIALS[id];
  return {
    id,
    color: isColor(m.color) ? m.color.toLowerCase() : base.color,
    rough: isNum(m.rough) ? clamp(m.rough, 0, 1) : base.rough,
    metal: isNum(m.metal) ? clamp(m.metal, 0, 1) : base.metal,
    scale: isNum(m.scale) ? clamp(m.scale, 0.1, 10) : 1,
  };
}
const isNum = v => typeof v === 'number' && Number.isFinite(v);
export const isColor = v => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
const DEFAULT_MATS = { wall: 'pintura', opening: 'madeira', floor: 'porcelanato', roof: 'telha_ceramica', stairs: 'madeira', column: 'concreto', beam: 'concreto' };

export function sanitizeObject(type, input, base = {}) {
  const sch = SCHEMA[type]; if (!sch) return null;
  const out = { id: String(input.id || base.id || ''), type };
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(out.id)) return null;
  for (const [key, f] of Object.entries(sch)) {
    const has = Object.prototype.hasOwnProperty.call(input, key);
    const v = has ? input[key] : base[key];
    switch (f.k) {
      case 'num': out[key] = isNum(v) ? clamp(v, f.min, f.max) : f.def; break;
      case 'int': out[key] = isNum(v) ? clamp(Math.round(v), f.min, f.max) : f.def; break;
      case 'enum': out[key] = f.vals.includes(v) ? v : f.def; break;
      case 'color': out[key] = isColor(v) ? v.toLowerCase() : (type === 'item' && ITEMS[out.item] ? ITEMS[out.item].color : f.def); break;
      case 'bool': out[key] = !!v; break;
      case 'rot': out[key] = isNum(v) ? ((v % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) : 0; break;
      case 'vec2': out[key] = Array.isArray(v) && isNum(v[0]) && isNum(v[1]) ? [clamp(v[0], -WORLD_SIZE / 2, WORLD_SIZE / 2), clamp(v[1], -WORLD_SIZE / 2, WORLD_SIZE / 2)] : [0, 0]; break;
      case 'id': out[key] = typeof v === 'string' ? v.slice(0, 40) : ''; break;
      case 'mat': {
        let fb = DEFAULT_MATS[type] || 'pintura';
        if (type === 'roof' && ['plano', 'embutido', 'cobertura'].includes(out.style)) fb = 'concreto';
        if (type === 'opening' && OPENINGS[out.style]?.kind === 'window') fb = 'aluminio';
        out[key] = sanitizeMat(v, fb); break;
      }
    }
  }
  if (type === 'wall' && Math.hypot(out.a[0] - out.b[0], out.a[1] - out.b[1]) < 0.1) return null;
  if (type === 'beam' && Math.hypot(out.a[0] - out.b[0], out.a[1] - out.b[1]) < 0.1) return null;
  if (type === 'opening' && !input.frame && !base.frame) out.frame = OPENINGS[out.style].kind === 'window' ? '#e8e8e6' : '#f2efe9';
  return out;
}

export function sanitizeAvatar(a) {
  const d = defaultAvatar(0.3); a = a && typeof a === 'object' ? a : {};
  const out = {};
  for (const [k, v] of Object.entries(d)) {
    const x = a[k];
    if (typeof v === 'number') out[k] = isNum(x) ? x : v;
    else if (typeof v === 'boolean') out[k] = !!x;
    else if (isColor(v)) out[k] = isColor(x) ? x : v;
    else out[k] = x;
  }
  out.height = clamp(out.height, 1.45, 2.05); out.build = clamp(out.build, 0.75, 1.35);
  for (const k of ['faceW', 'jaw', 'eyeSize', 'nose', 'mouth', 'brows']) out[k] = clamp(out[k], 0, 1);
  const enums = { base: AVATAR.base, hair: AVATAR.hair, beard: AVATAR.beard, top: AVATAR.top, bottom: AVATAR.bottom, shoes: AVATAR.shoes, hat: AVATAR.hat };
  for (const [k, vals] of Object.entries(enums)) if (!vals.includes(out[k])) out[k] = d[k];
  return out;
}

// ---------- operações ----------
// op: {k:'add', obj} | {k:'update', id, props} | {k:'remove', id} | {k:'terrain', ...} | {k:'door', id, open} | {k:'batch', ops:[]}
// validate=true no servidor: verifica permissões. Lança Error com mensagem em caso de rejeição.
export function applyOp(world, op, playerId, validate = false) {
  if (!op || typeof op !== 'object') throw new Error('Operação inválida');
  const objs = world.objects;
  const check = (o) => {
    if (!validate) return;
    const plot = plotOfObject(world, o);
    if (!plot) throw new Error('Fora dos limites do seu terreno');
    if (!canEditPlot(world, playerId, plot)) throw new Error('Sem permissão para construir neste terreno');
  };
  switch (op.k) {
    case 'add': {
      if (!op.obj || typeof op.obj !== 'object') throw new Error('Objeto inválido');
      const o = sanitizeObject(op.obj.type, op.obj);
      if (!o) throw new Error('Objeto inválido');
      if (objs[o.id]) { if (validate) throw new Error('ID duplicado'); }
      if (validate && Object.keys(objs).length >= MAX_OBJECTS) throw new Error('Limite técnico de objetos do mundo atingido');
      if (o.type === 'opening' && !objs[o.wall]) throw new Error('Parede não encontrada');
      check(o);
      objs[o.id] = o; op.obj = o; // normalizado
      return [o.id];
    }
    case 'update': {
      const cur = objs[op.id]; if (!cur) throw new Error('Objeto não encontrado');
      check(cur);
      const props = { ...(op.props || {}) }; delete props.id; delete props.type;
      const o = sanitizeObject(cur.type, props, cur);
      if (!o) throw new Error('Alteração inválida');
      check(o);
      objs[o.id] = o;
      // mantém aberturas dentro da parede
      return [o.id];
    }
    case 'remove': {
      const cur = objs[op.id]; if (!cur) return [];
      check(cur);
      delete objs[op.id];
      const removed = [op.id];
      if (cur.type === 'wall') for (const o of Object.values(objs)) if (o.type === 'opening' && o.wall === cur.id) { delete objs[o.id]; removed.push(o.id); }
      return removed;
    }
    case 'door': {
      const cur = objs[op.id]; if (!cur || cur.type !== 'opening') throw new Error('Porta não encontrada');
      cur.open = !!op.open; return [cur.id]; // visitantes podem abrir/fechar portas
    }
    case 'terrain': {
      const mode = ['raise', 'lower', 'flatten', 'smooth', 'paint', 'rect'].includes(op.mode) ? op.mode : null;
      if (!mode || !isNum(op.x) || !isNum(op.z)) throw new Error('Pincel inválido');
      const plot = plotAt(world, op.x, op.z);
      if (validate && (!plot || !canEditPlot(world, playerId, plot))) throw new Error('Só é possível modificar o relevo do seu terreno');
      const clean = { k: 'terrain', mode, x: op.x, z: op.z, r: clamp(+op.r || 3, 0.5, 20), s: clamp(+op.s || 0.2, 0.01, 3), h: clamp(+op.h || 0, -25, 70), soil: clamp(op.soil | 0, 0, SOILS.length - 1), w: clamp(+op.w || 1, 0.5, 60), d: clamp(+op.d || 1, 0.5, 60), rot: +op.rot || 0, margin: clamp(+op.margin || 0, 0, 3) };
      Object.assign(op, clean);
      return applyTerrain(world, op, plot ? { x0: plot.x0, x1: plot.x1, z0: plot.z0, z1: plot.z1 } : null);
    }
    case 'heights': {
      // define alturas exatas de vértices (usado para desfazer/refazer pinceladas de relevo)
      if (!Array.isArray(op.pts) || op.pts.length > 40000) throw new Error('Alturas inválidas');
      const t = world.terrain, N = t.N, half = WORLD_SIZE / 2;
      let i0 = N, i1 = 0, j0 = N, j1 = 0;
      const clean = [];
      for (const pt of op.pts) {
        if (!Array.isArray(pt)) continue;
        const k = pt[0] | 0, h = +pt[1];
        if (k < 0 || k >= N * N || !isNum(h)) continue;
        const i = k % N, j = (k / N) | 0, x = -half + i * t.res, z = -half + j * t.res;
        if (validate) { const pl = plotAt(world, x, z); if (!pl || !canEditPlot(world, playerId, pl)) continue; }
        t.heights[k] = Math.round(clamp(h, -25, 70) * 100) / 100;
        clean.push([k, t.heights[k]]);
        i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j);
      }
      op.pts = clean;
      return { i0, i1, j0, j1 };
    }
    case 'batch': {
      if (!Array.isArray(op.ops) || op.ops.length > 400) throw new Error('Lote inválido');
      // valida em cópia rasa para atomicidade
      const out = [];
      for (const sub of op.ops) { if (sub.k === 'batch') throw new Error('Lote aninhado'); out.push(applyOp(world, sub, playerId, validate)); }
      return out;
    }
    default: throw new Error('Operação desconhecida');
  }
}

// cópia profunda barata para transações em lote no servidor
export function snapshotObjects(world) { return JSON.parse(JSON.stringify(world.objects)); }

export function publicWorld(world) {
  const players = {};
  for (const [id, p] of Object.entries(world.players)) players[id] = { name: p.name, avatar: p.avatar, plot: p.plot, pos: p.pos };
  return { ...world, players };
}
