// Gera a geometria 3D de cada objeto do mundo a partir dos dados (paredes, aberturas, pisos, telhados...).
import * as THREE from 'three';
import { LEVEL_H, OPENINGS, MATERIALS } from '/shared/catalog.js';
import { levelBase } from '/shared/world.js';
import { getMaterial, colorMaterial, waterMaterial } from './materials.js';
import { boxUV, mesh, box, cyl, FaceBuilder } from './geom.js';
import { buildItem } from './items3d.js';

export const STAIR_RUN = 0.28;
export function stairLength(o) { return o.steps * STAIR_RUN; }
export function floorTop(o) { return levelBase(o.level) + o.y0 + (o.level === 0 ? o.t : 0); }
export function wallBase(o) { return levelBase(o.level) + o.y0; }
export function roofBase(o) { return levelBase(o.level) + LEVEL_H + o.y0; }

const glassMat = () => getMaterial({ id: 'vidro', color: '#b7d3df', rough: 0.05, metal: 0, scale: 1 });
const metal = (c = '#9a9da0') => colorMaterial(c, 0.35, 0.85);

// ---------- paredes e aberturas ----------
export function wallFrame(w) {
  const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1];
  const L = Math.hypot(dx, dz);
  return { L, dir: [dx / L, dz / L], normal: [-dz / L, dx / L], angle: Math.atan2(-dz, dx) };
}
export function openingsOf(world, wall) {
  const { L } = wallFrame(wall);
  const list = Object.values(world.objects).filter(o => o.type === 'opening' && o.wall === wall.id)
    .map(o => {
      const w = Math.min(o.w, L - 0.1);
      const u = Math.max(w / 2 + 0.05, Math.min(L - w / 2 - 0.05, o.u));
      const top = Math.min(o.sill + o.h, wall.h - 0.05);
      return { o, u0: u - w / 2, u1: u + w / 2, u, w, sill: Math.min(o.sill, top - 0.2), top };
    })
    .filter(x => x.w > 0.25 && x.top - x.sill > 0.15)
    .sort((a, b) => a.u0 - b.u0);
  const out = [];
  for (const x of list) { if (out.length && x.u0 < out[out.length - 1].u1 + 0.05) continue; out.push(x); }
  return out;
}

export function buildWall(world, w) {
  const { L, angle } = wallFrame(w);
  const g = new THREE.Group();
  g.position.set(w.a[0], wallBase(w), w.a[1]);
  g.rotation.y = angle;
  const ops = openingsOf(world, w);
  const H = w.h;
  // contorno com recortes para portas (vãos que tocam o chão) e furos para janelas
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  for (const op of ops) if (op.sill <= 0.01) { shape.lineTo(op.u0, 0); shape.lineTo(op.u0, op.top); shape.lineTo(op.u1, op.top); shape.lineTo(op.u1, 0); }
  shape.lineTo(L, 0); shape.lineTo(L, H); shape.lineTo(0, H); shape.lineTo(0, 0);
  for (const op of ops) {
    if (op.sill <= 0.01) continue;
    const hole = new THREE.Path();
    if (op.o.style === 'janela_redonda') { const r = Math.min(op.w, op.top - op.sill) / 2; hole.absarc(op.u, (op.sill + op.top) / 2, r, 0, Math.PI * 2, true); }
    else { hole.moveTo(op.u0, op.sill); hole.lineTo(op.u0, op.top); hole.lineTo(op.u1, op.top); hole.lineTo(op.u1, op.sill); hole.lineTo(op.u0, op.sill); }
    shape.holes.push(hole);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w.t, bevelEnabled: false, curveSegments: 20 });
  geo.translate(0, 0, -w.t / 2);
  // separa as faces da frente (+z, material A) e de trás (-z, material B)
  const g0 = geo.groups[0], g1 = geo.groups[1];
  const half = g0.count / 2;
  geo.clearGroups();
  geo.addGroup(g0.start, half, 1);
  geo.addGroup(g0.start + half, half, 0);
  if (g1) geo.addGroup(g1.start, g1.count, 0);
  const m = mesh(geo, [getMaterial(w.mat), getMaterial(w.matB || w.mat)]);
  m.userData.part = 'wall';
  g.add(m);
  for (const op of ops) {
    const og = buildOpening(op, w);
    og.userData.openingId = op.o.id;
    g.add(og);
  }
  return g;
}

function buildOpening(op, wall) {
  const o = op.o, def = OPENINGS[o.style];
  const g = new THREE.Group();
  const w = op.w, h = op.top - op.sill, t = wall.t;
  g.position.set(op.u, op.sill, 0);
  const frameM = colorMaterial(o.frame || '#eeeeee', 0.5, o.mat.id.startsWith('alum') || o.mat.id.startsWith('aco') ? 0.6 : 0);
  const leafM = getMaterial(o.mat);
  const fs = 0.05, fd = t + 0.03;
  const round = o.style === 'janela_redonda';
  if (o.style !== 'passagem' && !round) {
    box(fs, h, fd, frameM, -w / 2 + fs / 2, h / 2, 0, g);
    box(fs, h, fd, frameM, w / 2 - fs / 2, h / 2, 0, g);
    box(w, fs, fd, frameM, 0, h - fs / 2, 0, g);
    if (def.kind === 'window') box(w + 0.08, 0.04, fd + 0.08, colorMaterial('#d9d6cf', 0.6), 0, -0.02, 0, g); // peitoril
  }
  const iw = w - fs * 2, ih = h - fs;
  const glass = glassMat();
  const pane = (pw, ph, x, y, z = 0, parent = g, frameColor = frameM) => {
    const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p);
    box(pw, ph, 0.012, glass, 0, 0, 0, p).castShadow = false;
    const b = 0.035;
    box(pw, b, 0.04, frameColor, 0, ph / 2 - b / 2, 0, p); box(pw, b, 0.04, frameColor, 0, -ph / 2 + b / 2, 0, p);
    box(b, ph, 0.04, frameColor, -pw / 2 + b / 2, 0, 0, p); box(b, ph, 0.04, frameColor, pw / 2 - b / 2, 0, 0, p);
    return p;
  };
  const handle = (parent, x, y, z) => { cyl(0.012, 0.012, 0.14, metal(), x, y, z, parent).rotation.z = Math.PI / 2; };
  const open = !!o.open;
  switch (o.style) {
    case 'porta_simples': case 'porta_vidro': case 'porta_pivotante': {
      const pivotX = o.style === 'porta_pivotante' ? -iw / 2 + iw * 0.25 : -iw / 2;
      const pv = new THREE.Group(); pv.position.set(pivotX, 0, 0); g.add(pv);
      const lx = -iw / 2 - pivotX + iw / 2;
      if (o.style === 'porta_vidro') pane(iw, ih, lx, ih / 2, 0, pv);
      else {
        box(iw, ih, 0.045, leafM, lx, ih / 2, 0, pv);
        if (o.style === 'porta_pivotante') { box(0.03, 1.2, 0.06, metal('#222'), lx + iw / 2 - 0.15, ih / 2, 0.05, pv); box(0.03, 1.2, 0.06, metal('#222'), lx + iw / 2 - 0.15, ih / 2, -0.05, pv); }
        else { handle(pv, lx + iw / 2 - 0.08, 1.0, 0.05); handle(pv, lx + iw / 2 - 0.08, 1.0, -0.05); }
      }
      if (open) pv.rotation.y = o.style === 'porta_pivotante' ? -1.4 : -1.5;
      break;
    }
    case 'porta_dupla': {
      for (const s of [-1, 1]) {
        const pv = new THREE.Group(); pv.position.set(s * iw / 2, 0, 0); g.add(pv);
        box(iw / 2, ih, 0.045, leafM, -s * iw / 4, ih / 2, 0, pv);
        box(iw / 2 - 0.2, ih * 0.7, 0.05, leafM, -s * iw / 4, ih / 2, 0, pv); // almofada
        handle(pv, -s * (iw / 2 - 0.08), 1.0, 0.05);
        if (open) pv.rotation.y = s * 1.5;
      }
      break;
    }
    case 'porta_correr': case 'porta_varanda': {
      const pw = iw / 2 + 0.03;
      const glassDoor = o.style === 'porta_varanda';
      const a = glassDoor ? pane(pw, ih, -iw / 4, ih / 2, -0.03) : box(pw, ih, 0.04, leafM, -iw / 4, ih / 2, -0.03, g);
      const b = glassDoor ? pane(pw, ih, iw / 4, ih / 2, 0.03) : box(pw, ih, 0.04, leafM, iw / 4, ih / 2, 0.03, g);
      if (open) b.position.x = -iw / 4 + 0.05;
      break;
    }
    case 'portao_garagem': {
      const pv = new THREE.Group(); pv.position.set(0, ih, 0); g.add(pv);
      const panel = new THREE.Group(); pv.add(panel);
      const n = 5;
      for (let i = 0; i < n; i++) box(iw, ih / n - 0.01, 0.05, leafM, 0, -ih + (i + 0.5) * ih / n, 0, panel);
      if (open) pv.rotation.x = Math.PI / 2 - 0.02;
      break;
    }
    case 'passagem': break;
    case 'janela_correr': case 'janela_panoramica': {
      const n = o.style === 'janela_panoramica' ? 3 : 2;
      const pw = iw / n + 0.03;
      for (let i = 0; i < n; i++) {
        const p = pane(pw, ih - 0.02, -iw / 2 + (i + 0.5) * iw / n, ih / 2, (i % 2 ? 0.03 : -0.03));
        if (open && i === n - 1) p.position.x -= iw / n - 0.06;
      }
      break;
    }
    case 'janela_basculante': case 'janela_pequena': {
      const pv = new THREE.Group(); pv.position.set(0, ih, 0); g.add(pv);
      pane(iw, ih, 0, -ih / 2, 0, pv);
      if (open) pv.rotation.x = -0.6;
      break;
    }
    case 'janela_tradicional': {
      for (const s of [-1, 1]) {
        const pv = new THREE.Group(); pv.position.set(s * iw / 2, 0, 0); g.add(pv);
        const p = pane(iw / 2, ih, -s * iw / 4, ih / 2, 0, pv);
        box(0.03, ih, 0.045, frameM, 0, 0, 0, p); box(iw / 2, 0.03, 0.045, frameM, 0, 0, 0, p);
        if (open) pv.rotation.y = s * 1.3;
      }
      break;
    }
    case 'painel_vidro': pane(iw, ih, 0, ih / 2, 0); break;
    case 'janela_redonda': {
      const r = Math.min(w, h) / 2;
      const ring = mesh(new THREE.TorusGeometry(r - 0.03, 0.04, 8, 32), frameM); ring.position.set(0, h / 2, 0); g.add(ring);
      const gl = mesh(new THREE.CircleGeometry(r - 0.03, 32), glass, false); gl.position.set(0, h / 2, 0); g.add(gl);
      gl.material.side = THREE.DoubleSide;
      break;
    }
  }
  return g;
}

// ---------- pisos e lajes ----------
function stairsAbove(world, f) {
  // escadas do pavimento de baixo cujo topo atravessa esta laje: viram vão na laje
  const holes = [];
  if (f.level === 0) return holes;
  const c = Math.cos(f.rot), s = Math.sin(f.rot);
  for (const st of Object.values(world.objects)) {
    if (st.type !== 'stairs' || st.level !== f.level - 1) continue;
    const L = stairLength(st), cs = Math.cos(st.rot), ss = Math.sin(st.rot);
    const pts = [[-st.w / 2, -L / 2], [st.w / 2, -L / 2], [st.w / 2, L / 2], [-st.w / 2, L / 2]].map(([lx, lz]) => {
      const wx = st.x + lx * cs + lz * ss, wz = st.z - lx * ss + lz * cs;
      const dx = wx - f.x, dz = wz - f.z;
      return [dx * c - dz * s, dx * s + dz * c];
    });
    if (pts.every(([x, z]) => Math.abs(x) < f.w / 2 - 0.05 && Math.abs(z) < f.d / 2 - 0.05)) holes.push(pts);
  }
  return holes;
}
export function floorHoles(world, f) { return stairsAbove(world, f); }

export function buildFloor(world, f) {
  const shape = new THREE.Shape();
  shape.moveTo(-f.w / 2, f.d / 2); shape.lineTo(f.w / 2, f.d / 2); shape.lineTo(f.w / 2, -f.d / 2); shape.lineTo(-f.w / 2, -f.d / 2); shape.lineTo(-f.w / 2, f.d / 2);
  for (const pts of stairsAbove(world, f)) {
    const h = new THREE.Path(); h.moveTo(pts[0][0], -pts[0][1]); for (const p of pts.slice(1)) h.lineTo(p[0], -p[1]); h.lineTo(pts[0][0], -pts[0][1]);
    shape.holes.push(h);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: f.t, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  const g = new THREE.Group();
  const m = mesh(geo, getMaterial(f.mat));
  g.add(m);
  g.position.set(f.x, floorTop(f) - f.t, f.z);
  g.rotation.y = f.rot;
  return g;
}

// ---------- telhados ----------
function slab(fb, top, th, matTop, matUnder) {
  fb.group(matTop); fb.poly(top);
  fb.group(matUnder); fb.poly(top.map(p => [p[0], p[1] - th, p[2]]), true);
  fb.group(matUnder);
  for (let i = 0; i < top.length; i++) {
    const a = top[i], b = top[(i + 1) % top.length];
    fb.poly([a, [a[0], a[1] - th, a[2]], [b[0], b[1] - th, b[2]], b]);
  }
}

export function buildRoof(world, r) {
  const g = new THREE.Group();
  g.position.set(r.x, roofBase(r), r.z);
  g.rotation.y = r.rot;
  const inner = new THREE.Group(); g.add(inner);
  let w = r.w, d = r.d;
  if (r.style === 'quatro_aguas' && d > w) { inner.rotation.y = Math.PI / 2; [w, d] = [d, w]; }
  const o = r.over, tp = Math.tan(THREE.MathUtils.degToRad(r.pitch)), th = 0.12;
  const X = w / 2 + o, Z = d / 2 + o;
  const mats = [getMaterial(r.mat), getMaterial(r.matB || { id: 'pintura' }), colorMaterial('#efece6', 0.9)];
  const fb = new FaceBuilder();
  const posts = (hgt) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.14, hgt, 0.14, mats[0], sx * (w / 2 - 0.1), -hgt / 2, sz * (d / 2 - 0.1), inner); };
  switch (r.style) {
    case 'duas_aguas': case 'colonial': {
      const rise = d / 2 * tp, drop = o * tp;
      slab(fb, [[-X, -drop, -Z], [-X, rise, 0], [X, rise, 0], [X, -drop, -Z]], th, 0, 2);
      slab(fb, [[X, -drop, Z], [X, rise, 0], [-X, rise, 0], [-X, -drop, Z]], th, 0, 2);
      fb.group(1);
      for (const sx of [-1, 1]) {
        const tri = [[sx * w / 2, 0, -d / 2], [sx * w / 2, rise - th, 0], [sx * w / 2, 0, d / 2]];
        fb.poly(tri); fb.poly(tri, true);
      }
      if (r.style === 'colonial') { // cumeeira
        const c = cyl(0.11, 0.11, X * 2, mats[0], 0, rise + 0.02, 0, inner, 10); c.rotation.z = Math.PI / 2;
      }
      break;
    }
    case 'quatro_aguas': {
      const rise = d / 2 * tp, drop = o * tp, R = (w - d) / 2;
      slab(fb, [[-X, -drop, -Z], [-R, rise, 0], [R, rise, 0], [X, -drop, -Z]], th, 0, 2);
      slab(fb, [[X, -drop, Z], [R, rise, 0], [-R, rise, 0], [-X, -drop, Z]], th, 0, 2);
      slab(fb, [[-X, -drop, Z], [-R, rise, 0], [-X, -drop, -Z]], th, 0, 2);
      slab(fb, [[X, -drop, -Z], [R, rise, 0], [X, -drop, Z]], th, 0, 2);
      break;
    }
    case 'uma_agua': {
      const y = z => (z + d / 2) * tp;
      slab(fb, [[-X, y(-Z), -Z], [-X, y(Z), Z], [X, y(Z), Z], [X, y(-Z), -Z]], th, 0, 2);
      fb.group(1);
      for (const sx of [-1, 1]) { const tri = [[sx * w / 2, 0, -d / 2], [sx * w / 2, y(d / 2) - th, d / 2], [sx * w / 2, 0, d / 2]]; fb.poly(tri); fb.poly(tri, true); }
      const back = [[-w / 2, 0, d / 2], [w / 2, 0, d / 2], [w / 2, y(d / 2) - th, d / 2], [-w / 2, y(d / 2) - th, d / 2]];
      fb.poly(back); fb.poly(back, true);
      break;
    }
    case 'plano': slab(fb, [[-X, 0.2, -Z], [-X, 0.2, Z], [X, 0.2, Z], [X, 0.2, -Z]], 0.22, 0, 2); break;
    case 'embutido': {
      slab(fb, [[-w / 2, 0.15, -d / 2], [-w / 2, 0.15, d / 2], [w / 2, 0.15, d / 2], [w / 2, 0.15, -d / 2]], 0.17, 0, 2);
      const pt = 0.15, ph = 0.9;
      box(w, ph, pt, mats[1], 0, ph / 2, -d / 2 + pt / 2, inner); box(w, ph, pt, mats[1], 0, ph / 2, d / 2 - pt / 2, inner);
      box(pt, ph, d - pt * 2, mats[1], -w / 2 + pt / 2, ph / 2, 0, inner); box(pt, ph, d - pt * 2, mats[1], w / 2 - pt / 2, ph / 2, 0, inner);
      break;
    }
    case 'pergolado': {
      const n = Math.max(2, Math.round((w + 2 * o) / 0.45));
      for (let i = 0; i <= n; i++) box(0.06, 0.2, d + 2 * o, mats[0], -X + i * (2 * X) / n, 0.32, 0, inner);
      box(w + 2 * o, 0.25, 0.12, mats[0], 0, 0.1, -d / 2 + 0.1, inner); box(w + 2 * o, 0.25, 0.12, mats[0], 0, 0.1, d / 2 - 0.1, inner);
      posts(LEVEL_H);
      break;
    }
    case 'cobertura': {
      const tilt = Math.min(tp * d, 0.6);
      slab(fb, [[-X, 0.1, -Z], [-X, 0.1 + tilt, Z], [X, 0.1 + tilt, Z], [X, 0.1, -Z]], 0.1, 0, 2);
      posts(LEVEL_H);
      break;
    }
  }
  if (fb.pos.length) { const m = mesh(fb.build(), mats); inner.add(m); m.material = mats; }
  return g;
}
export function roofTopHeight(r) {
  const tp = Math.tan(THREE.MathUtils.degToRad(r.pitch));
  if (r.style === 'duas_aguas' || r.style === 'colonial') return r.d / 2 * tp;
  if (r.style === 'quatro_aguas') return Math.min(r.w, r.d) / 2 * tp;
  if (r.style === 'uma_agua') return r.d * tp;
  return 0.9;
}

// ---------- escadas, pilares, vigas ----------
export function buildStairs(world, s) {
  const g = new THREE.Group();
  g.position.set(s.x, levelBase(s.level) + s.y0, s.z);
  g.rotation.y = s.rot;
  const L = stairLength(s), rise = LEVEL_H / s.steps, run = STAIR_RUN;
  const m = getMaterial(s.mat);
  const conc = getMaterial({ id: 'concreto' });
  for (let i = 0; i < s.steps; i++) {
    const z = -L / 2 + (i + 0.5) * run, top = (i + 1) * rise;
    if (s.style === 'vazada') box(s.w, 0.05, run + 0.02, m, 0, top - 0.025, z, g);
    else {
      box(s.w, top, run, s.style === 'concreto' ? conc : m, 0, top / 2, z, g);
      if (s.style === 'macica') box(s.w, 0.03, run + 0.03, m, 0, top - 0.015, z + 0.01, g);
    }
  }
  if (s.style === 'vazada') {
    const len = Math.hypot(L, LEVEL_H), ang = Math.atan2(LEVEL_H, L);
    for (const sx of [-1, 1]) {
      const b = box(0.06, 0.25, len, metal('#2a2c2e'), sx * (s.w / 2 + 0.03), LEVEL_H / 2 - 0.1, 0, g);
      b.rotation.x = -ang;
    }
  }
  // corrimão
  const len = Math.hypot(L, LEVEL_H), ang = Math.atan2(LEVEL_H, L);
  const rail = cyl(0.02, 0.02, len, metal(), s.w / 2 - 0.02, LEVEL_H / 2 + 0.9, 0, g, 8);
  rail.rotation.x = Math.PI / 2 - ang;
  for (let i = 0; i <= 3; i++) { const t = i / 3; cyl(0.015, 0.015, 0.9, metal(), s.w / 2 - 0.02, t * LEVEL_H + 0.45, -L / 2 + t * L, g, 6); }
  return g;
}
export function buildColumn(world, c) {
  const g = new THREE.Group();
  g.position.set(c.x, levelBase(c.level) + c.y0, c.z);
  const m = getMaterial(c.mat);
  if (c.shape === 'redondo') cyl(c.s / 2, c.s / 2, c.h, m, 0, c.h / 2, 0, g, 20);
  else box(c.s, c.h, c.s, m, 0, c.h / 2, 0, g);
  return g;
}
export function buildBeam(world, b) {
  const dx = b.b[0] - b.a[0], dz = b.b[1] - b.a[1], L = Math.hypot(dx, dz);
  const g = new THREE.Group();
  g.position.set((b.a[0] + b.b[0]) / 2, levelBase(b.level) + b.y0 + LEVEL_H - b.h / 2, (b.a[1] + b.b[1]) / 2);
  g.rotation.y = Math.atan2(-dz, dx);
  box(L, b.h, b.s, getMaterial(b.mat), 0, 0, 0, g);
  return g;
}

// ---------- piscinas e água ----------
function ellipseShape(rx, rz, holeRx, holeRz) {
  const s = new THREE.Shape(); s.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false);
  if (holeRx) { const h = new THREE.Path(); h.absellipse(0, 0, holeRx, holeRz, 0, Math.PI * 2, true); s.holes.push(h); }
  return s;
}
export function buildPool(world, p) {
  const g = new THREE.Group();
  g.position.set(p.x, p.y, p.z); g.rotation.y = p.rot;
  const tile = getMaterial({ id: 'pastilha', color: p.tile, rough: 0.2, metal: 0, scale: 1 });
  const cop = getMaterial({ id: 'porcelanato', color: p.coping, rough: 0.6, metal: 0, scale: 1 });
  const water = waterMaterial('#3aa6c9', 0.72);
  const D = p.depth, cw = 0.35;
  if (p.shape === 'redonda' || p.shape === 'oval') {
    const rx = p.w / 2, rz = (p.shape === 'redonda' ? p.w : p.d) / 2;
    const wall = mesh(new THREE.CylinderGeometry(1, 1, D, 48, 1, true), tile, false);
    wall.material = tile.clone(); wall.material.side = THREE.BackSide;
    wall.scale.set(rx, 1, rz); wall.position.y = -D / 2; g.add(wall);
    const floor = mesh(new THREE.CircleGeometry(1, 48), tile, false); floor.rotation.x = -Math.PI / 2; floor.scale.set(rx, rz, 1); floor.position.y = -D; g.add(floor);
    const ring = mesh(new THREE.ExtrudeGeometry(ellipseShape(rx + cw, rz + cw, rx, rz), { depth: 0.06, bevelEnabled: false, curveSegments: 40 }), cop);
    ring.rotation.x = -Math.PI / 2; g.add(ring);
    const wtr = mesh(new THREE.CircleGeometry(1, 48), water, false, true); wtr.rotation.x = -Math.PI / 2; wtr.scale.set(rx, rz, 1); wtr.position.y = -0.12; g.add(wtr);
  } else {
    const W = p.w, Dd = p.d, inf = p.shape === 'borda_infinita';
    const wallM = tile;
    box(W, D, 0.05, wallM, 0, -D / 2, -Dd / 2 - 0.025, g); box(W, D, 0.05, wallM, 0, -D / 2, Dd / 2 + 0.025, g);
    box(0.05, D, Dd, wallM, -W / 2 - 0.025, -D / 2, 0, g); box(0.05, D, Dd, wallM, W / 2 + 0.025, -D / 2, 0, g);
    if (p.shallow) {
      const sh = Math.min(0.9, D * 0.6);
      box(W * 0.35, D - sh, Dd, wallM, -W / 2 + W * 0.175, -D + (D - sh) / 2, 0, g);
      box(W * 0.65, 0.05, Dd, wallM, W * 0.175, -D, 0, g);
    } else box(W, 0.05, Dd, wallM, 0, -D - 0.025, 0, g);
    // degraus de acesso
    for (let i = 0; i < 3; i++) box(0.9, 0.05, 0.3, wallM, -W / 2 + 0.45, -0.25 - i * 0.25, -Dd / 2 + 0.15 + i * 0.3, g);
    box(W + cw * 2, 0.06, cw, cop, 0, 0.03, Dd / 2 + cw / 2, g);
    box(cw, 0.06, Dd, cop, -W / 2 - cw / 2, 0.03, 0, g); box(cw, 0.06, Dd, cop, W / 2 + cw / 2, 0.03, 0, g);
    if (!inf) box(W + cw * 2, 0.06, cw, cop, 0, 0.03, -Dd / 2 - cw / 2, g);
    else { box(W + cw * 2, 0.45, 0.4, wallM, 0, -0.35, -Dd / 2 - 0.25, g); }
    const wtr = mesh(new THREE.PlaneGeometry(W, Dd), water, false); wtr.rotation.x = -Math.PI / 2; wtr.position.y = inf ? -0.03 : -0.12; g.add(wtr);
  }
  if (p.light) {
    const l = mesh(new THREE.CircleGeometry(0.12, 16), colorMaterial('#bff4ff', 0.3, 0, { emissive: new THREE.Color('#9eeaff'), emissiveIntensity: 2 }), false);
    l.position.set(0, -D * 0.6, (p.shape === 'retangular' || p.shape === 'borda_infinita' ? p.d / 2 : (p.shape === 'redonda' ? p.w : p.d) / 2) - 0.03);
    l.rotation.y = Math.PI; g.add(l);
    l.userData.lightAnchor = { color: '#7fe3ff', intensity: 6, distance: 8 };
  }
  return g;
}
export function buildWater(world, w) {
  const g = new THREE.Group();
  g.position.set(w.x, w.y, w.z); g.rotation.y = w.rot;
  const geo = w.shape === 'lago' ? new THREE.ShapeGeometry(ellipseShape(w.w / 2, w.d / 2), 48) : new THREE.PlaneGeometry(w.w, w.d);
  const m = mesh(geo, waterMaterial(w.color === '#ffffff' ? '#2e6f7e' : w.color, 0.86), false);
  m.rotation.x = -Math.PI / 2; g.add(m);
  return g;
}

// ---------- despacho ----------
export function buildObject(world, o) {
  let g = null;
  switch (o.type) {
    case 'wall': g = buildWall(world, o); break;
    case 'floor': g = buildFloor(world, o); break;
    case 'roof': g = buildRoof(world, o); break;
    case 'stairs': g = buildStairs(world, o); break;
    case 'column': g = buildColumn(world, o); break;
    case 'beam': g = buildBeam(world, o); break;
    case 'item': g = buildItem(o); break;
    case 'pool': g = buildPool(world, o); break;
    case 'water': g = buildWater(world, o); break;
    default: return null;
  }
  g.userData.oid = o.id;
  return g;
}
