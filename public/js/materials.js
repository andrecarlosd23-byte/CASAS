// Biblioteca de materiais com texturas procedurais (geradas em canvas, sem downloads).
import * as THREE from 'three';
import { MATERIALS } from '/shared/catalog.js';
import { fbm, rng } from '/shared/world.js';

let TEX_SIZE = 512, TEX_MULT = 1;
// tamanho físico (m) que uma repetição da textura representa
const TEX_METERS = {
  plaster: 2, stucco: 1.5, brick: 1.2, block: 1.6, concrete: 2.4, wood: 1.2, slats: 1.2, planks: 1.4, stone: 1.6, slate: 1.6,
  marble: 2.4, granite: 1.2, tiles: 1.2, bigtiles: 2.4, smalltiles: 0.6, relief: 1.2, brushed: 1, rooftile: 1.6, metalroof: 1.2,
  grass: 3, dirt: 3, sand: 3, pavers: 1.2, cobble: 1, asphalt: 3, fabric: 0.5, none: 1,
};

const texCache = new Map();
const matCache = new Map();
let quality = 'medio';
export function materialQuality() { return quality; }
export function setMaterialQuality(q) { quality = q; TEX_MULT = q === 'ultra' ? 2 : 1; TEX_SIZE = 512 * TEX_MULT; }

function canvas(size = TEX_SIZE) { const c = document.createElement('canvas'); c.width = c.height = size; return c; }

function pixelTex(size, fn) {
  size = size > 16 ? size * TEX_MULT : size;
  const c = canvas(size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = fn(x / size, y / size, x, y);
    const i = (y * size + x) * 4;
    if (Array.isArray(v)) { d[i] = v[0]; d[i + 1] = v[1]; d[i + 2] = v[2]; }
    else { const g = Math.max(0, Math.min(255, v * 255)); d[i] = d[i + 1] = d[i + 2] = g; }
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
// ruído periódico (tileável) aproximado: mistura das 4 cópias deslocadas
function tnoise(u, v, scale, seed, oct = 4) {
  const a = fbm(u * scale, v * scale, seed, oct), b = fbm((u - 1) * scale, v * scale, seed, oct);
  const c = fbm(u * scale, (v - 1) * scale, seed, oct), d = fbm((u - 1) * scale, (v - 1) * scale, seed, oct);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function rectsTex(rows, cols, gap, opts = {}) {
  // tijolos/pisos: retângulos com rejunte claro e variação de tom por peça
  const c = canvas(), ctx = c.getContext('2d'), S = TEX_SIZE, R = rng(opts.seed || 7);
  ctx.fillStyle = opts.grout || '#e6e2da'; ctx.fillRect(0, 0, S, S);
  const rh = S / rows, cw = S / cols; gap *= TEX_MULT;
  for (let r = 0; r < rows; r++) {
    const off = opts.stagger ? (r % 2) * cw / 2 : 0;
    for (let k = -1; k <= cols; k++) {
      const x = k * cw + off, y = r * rh;
      const t = (opts.base ?? 0.78) + (R() - 0.5) * (opts.vary ?? 0.18);
      const g = Math.round(t * 255);
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.fillRect(x + gap, y + gap, cw - gap * 2, rh - gap * 2);
    }
  }
  // grão
  const img = ctx.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * (opts.grain ?? 22); d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  ctx.putImageData(img, 0, 0);
  return c;
}

function voronoiTex(n, seed, edge = 0.06, base = 0.75) {
  const R = rng(seed), pts = [];
  for (let i = 0; i < n; i++) { const p = [R(), R(), 0.6 + R() * 0.35]; for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) pts.push([p[0] + dx, p[1] + dy, p[2]]); }
  return pixelTex(256, (u, v) => {
    let d1 = 9, d2 = 9, c = 0;
    for (const p of pts) { const d = (p[0] - u) ** 2 + (p[1] - v) ** 2; if (d < d1) { d2 = d1; d1 = d; c = p[2]; } else if (d < d2) d2 = d; }
    const e = Math.sqrt(d2) - Math.sqrt(d1);
    const g = e < edge * 0.4 ? base * 0.62 : base * (0.88 + (c - 0.6) * 0.5) + (tnoise(u, v, 16, seed) - 0.5) * 0.12;
    return g;
  });
}

const GENERATORS = {
  none: () => pixelTex(8, () => 1),
  plaster: () => pixelTex(256, (u, v) => 0.93 + (tnoise(u, v, 24, 3) - 0.5) * 0.08 + (Math.random() - 0.5) * 0.03),
  stucco: () => pixelTex(256, (u, v) => 0.88 + (tnoise(u, v, 40, 5, 3) - 0.5) * 0.25 + (Math.random() - 0.5) * 0.06),
  brick: () => rectsTex(18, 5, 3, { stagger: true, base: 0.72, vary: 0.25, grain: 30 }),
  block: () => rectsTex(8, 4, 4, { stagger: true, base: 0.8, vary: 0.08, grain: 40, grout: '#d7d5d0' }),
  concrete: () => pixelTex(512, (u, v, x, y) => {
    let g = 0.8 + (tnoise(u, v, 6, 11) - 0.5) * 0.18 + (tnoise(u, v, 40, 12, 2) - 0.5) * 0.08;
    if (Math.random() < 0.004) g -= 0.25;
    if (y % 128 < 2) g -= 0.06;
    return g;
  }),
  wood: () => pixelTex(512, (u, v, x) => {
    const plank = Math.floor(u * 8), R = rng(plank * 31 + 3);
    const tone = 0.7 + R() * 0.2;
    const grain = Math.sin((u * 8 - plank) * 40 + tnoise(u, v, 6, plank + 1) * 18) * 0.06;
    const gap = (u * 8 - plank) < 0.02 ? -0.35 : 0;
    return tone + grain + (tnoise(u, v, 30, 4, 2) - 0.5) * 0.08 + gap;
  }),
  slats: () => pixelTex(512, (u, v) => {
    const k = u * 20, f = k - Math.floor(k), R = rng(Math.floor(k) * 7 + 1);
    if (f > 0.82) return 0.18;
    return 0.68 + R() * 0.2 + Math.sin(v * 60 + tnoise(u, v, 5, Math.floor(k)) * 10) * 0.05;
  }),
  planks: () => pixelTex(512, (u, v) => {
    const k = v * 10, f = k - Math.floor(k), R = rng(Math.floor(k) * 13 + 5);
    if (f > 0.9) return 0.2;
    const seg = Math.floor(u * 2 + R()) ; const R2 = rng(seg * 17 + Math.floor(k));
    return 0.6 + R2() * 0.25 + Math.sin(u * 90 + tnoise(u, v, 4, 2) * 12) * 0.05;
  }),
  stone: () => voronoiTex(26, 41, 0.05, 0.72),
  slate: () => rectsTex(6, 3, 3, { stagger: true, base: 0.65, vary: 0.3, grain: 28, grout: '#3a3a3a' }),
  cobble: () => voronoiTex(60, 77, 0.035, 0.92),
  marble: () => pixelTex(512, (u, v) => {
    const n = tnoise(u, v, 4, 21, 5);
    const vein = Math.abs(Math.sin((u + v) * 9 + n * 14));
    return 0.95 - Math.pow(1 - vein, 14) * 0.35 - (tnoise(u, v, 12, 22) - 0.5) * 0.06;
  }),
  granite: () => pixelTex(256, (u, v) => { const r = Math.random(); return r < 0.15 ? 0.45 : r > 0.9 ? 1.15 : 0.8 + (tnoise(u, v, 20, 9) - 0.5) * 0.2; }),
  tiles: () => rectsTex(2, 2, 3, { base: 0.86, vary: 0.06, grain: 10 }),
  bigtiles: () => rectsTex(2, 2, 2, { base: 0.9, vary: 0.04, grain: 6, grout: '#cfcac2' }),
  smalltiles: () => rectsTex(8, 8, 3, { base: 0.88, vary: 0.12, grain: 8, grout: '#f2f2f2' }),
  relief: () => pixelTex(512, (u, v) => 0.75 + Math.sin(u * Math.PI * 8) * Math.cos(v * Math.PI * 8) * 0.18),
  brushed: () => pixelTex(256, (u, v, x, y) => 0.82 + (tnoise(u * 0.02, v, 60, 2, 2) - 0.5) * 0.25),
  rooftile: () => pixelTex(512, (u, v) => {
    const row = v * 8, fr = row - Math.floor(row), col = u * 6 + (Math.floor(row) % 2) * 0.5, fc = col - Math.floor(col);
    const R = rng(Math.floor(row) * 11 + Math.floor(col) * 7);
    const curve = Math.sin(fc * Math.PI); const shade = fr > 0.88 ? 0.35 : 0.55 + curve * 0.35;
    return shade * (0.85 + R() * 0.25);
  }),
  metalroof: () => pixelTex(256, (u) => 0.65 + Math.sin(u * Math.PI * 16) * 0.25),
  grass: () => pixelTex(512, (u, v) => [ (0.75 + (tnoise(u, v, 30, 1) - 0.5) * 0.5) * 255, (0.85 + (tnoise(u, v, 50, 2) - 0.5) * 0.4) * 255, (0.7 + (Math.random() - 0.5) * 0.3) * 255 ].map(x => x * (0.85 + Math.random() * 0.3))),
  dirt: () => pixelTex(256, (u, v) => 0.8 + (tnoise(u, v, 18, 3) - 0.5) * 0.35 + (Math.random() - 0.5) * 0.15),
  sand: () => pixelTex(256, (u, v) => 0.92 + (tnoise(u, v, 30, 4) - 0.5) * 0.1 + (Math.random() - 0.5) * 0.08),
  pavers: () => rectsTex(10, 5, 3, { stagger: true, base: 0.82, vary: 0.15, grain: 26, grout: '#9a958c' }),
  asphalt: () => pixelTex(256, (u, v) => 0.75 + (Math.random() - 0.5) * 0.3 + (tnoise(u, v, 8, 5) - 0.5) * 0.1),
  fabric: () => pixelTex(128, (u, v, x, y) => 0.88 + ((x + y) % 4 < 2 ? 0.05 : -0.05) + (Math.random() - 0.5) * 0.06),
};

export function getTexture(kind) {
  if (texCache.has(kind)) return texCache.get(kind);
  const gen = GENERATORS[kind] || GENERATORS.none;
  const t = new THREE.CanvasTexture(gen());
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(kind, t);
  return t;
}
// mapa de normais gerado a partir do relevo da textura (preset Ultra)
const normCache = new Map();
export function getNormalMap(kind) {
  if (normCache.has(kind)) return normCache.get(kind);
  const src = getTexture(kind).image, S = src.width;
  const ctx = src.getContext('2d'), d = ctx.getImageData(0, 0, S, S).data;
  const lum = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) lum[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 765;
  const c = canvas(S), cx = c.getContext('2d'), img = cx.createImageData(S, S);
  const k = kind === 'relief' ? 6 : kind === 'brick' || kind === 'stone' || kind === 'cobble' || kind === 'rooftile' || kind === 'slate' ? 3.2 : 1.6;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const l = lum[y * S + (x - 1 + S) % S], r = lum[y * S + (x + 1) % S], t = lum[((y - 1 + S) % S) * S + x], b = lum[((y + 1) % S) * S + x];
    let nx = (l - r) * k, ny = (b - t) * k, nz = 1; const n = Math.hypot(nx, ny, nz); nx /= n; ny /= n; nz /= n;
    const i = (y * S + x) * 4; img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  normCache.set(kind, t);
  return t;
}
export function textureMeters(kind) { return TEX_METERS[kind] || 1; }

// mat = {id, color, rough, metal, scale}
export function getMaterial(mat, opts = {}) {
  const m = mat || { id: 'pintura' };
  const def = MATERIALS[m.id] || MATERIALS.pintura;
  const key = [m.id, m.color, m.rough, m.metal, m.scale, opts.side || 0, opts.transparent ? 1 : 0, quality].join('|');
  if (matCache.has(key)) return matCache.get(key);
  let material;
  const color = new THREE.Color(m.color || def.color);
  if (def.glass) {
    material = new THREE.MeshPhysicalMaterial({ color, roughness: m.rough ?? 0.05, metalness: 0, transparent: true, opacity: 0.28, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false, clearcoat: quality === 'alto' ? 1 : 0 });
  } else {
    const base = getTexture(def.tex);
    const map = base.clone(); map.needsUpdate = true;
    const rep = 1 / (textureMeters(def.tex) * (m.scale || 1));
    map.repeat.set(rep, rep);
    material = new THREE.MeshStandardMaterial({ color, map, roughness: m.rough ?? def.rough, metalness: m.metal ?? def.metal, side: opts.side || THREE.FrontSide });
    if (quality === 'ultra' && def.tex !== 'none') {
      const nm = getNormalMap(def.tex).clone(); nm.needsUpdate = true; nm.repeat.copy(map.repeat);
      material.normalMap = nm; material.normalScale = new THREE.Vector2(1, 1);
      map.anisotropy = 16;
    } else if (quality !== 'baixo' && def.tex !== 'none' && def.tex !== 'plaster') { material.bumpMap = map; material.bumpScale = def.tex === 'relief' ? 3 : 1.2; }
  }
  material.userData.matKey = key;
  matCache.set(key, material);
  return material;
}

export function colorMaterial(color, rough = 0.6, metal = 0, extra = {}) {
  const key = 'c|' + color + '|' + rough + '|' + metal + '|' + JSON.stringify(extra);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: rough, metalness: metal, ...extra });
  matCache.set(key, m);
  return m;
}
export function fabricMaterial(color, rough = 0.95) {
  const key = 'f|' + color + '|' + rough;
  if (matCache.has(key)) return matCache.get(key);
  const map = getTexture('fabric').clone(); map.needsUpdate = true; map.repeat.set(6, 6);
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: rough, map });
  matCache.set(key, m);
  return m;
}
export function clearMaterialCache() { for (const m of matCache.values()) m.dispose(); matCache.clear(); }

// mapa de normais animado para água
let waterNormal = null;
export function getWaterNormal() {
  if (waterNormal) return waterNormal;
  const S = 256, h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) h[y * S + x] = tnoise(x / S, y / S, 8, 99, 4);
  const c = canvas(S), ctx = c.getContext('2d'), img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (h[y * S + (x + 1) % S] - h[y * S + (x - 1 + S) % S]) * 6, dy = (h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x]) * 6;
    const n = new THREE.Vector3(-dx, -dy, 1).normalize(), i = (y * S + x) * 4;
    img.data[i] = (n.x * 0.5 + 0.5) * 255; img.data[i + 1] = (n.y * 0.5 + 0.5) * 255; img.data[i + 2] = (n.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  waterNormal = new THREE.CanvasTexture(c); waterNormal.wrapS = waterNormal.wrapT = THREE.RepeatWrapping;
  return waterNormal;
}
const waterMats = [];
const waterCache = new Map();
export function waterMaterial(color = '#2c7fa3', opacity = 0.82) {
  const wk = color + opacity;
  if (waterCache.has(wk)) return waterCache.get(wk);
  const n1 = getWaterNormal().clone(); n1.needsUpdate = true; n1.repeat.set(0.25, 0.25);
  const m = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), roughness: 0.04, metalness: 0.05, transparent: true, opacity, normalMap: n1, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.3, depthWrite: false, clearcoat: 0.5 });
  waterMats.push(m); waterCache.set(wk, m);
  return m;
}
export function animateWater(t) {
  for (const m of waterMats) { m.normalMap.offset.set(t * 0.012, t * 0.008); }
}
