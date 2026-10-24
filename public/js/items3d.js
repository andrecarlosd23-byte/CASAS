// Móveis, decoração e vegetação 3D procedurais (volumes reais, sem imagens planas).
import * as THREE from 'three';
import { ITEMS } from '/shared/catalog.js';
import { colorMaterial, fabricMaterial, getMaterial, materialQuality } from './materials.js';
import { box, cyl, sphere, mesh } from './geom.js';
import { rng } from '/shared/world.js';

function palette(style, color, color2) {
  const P = {
    contemporaneo: { wood: '#a07850', metal: '#2b2b2b', gold: false, legR: 0.018, legMetal: true },
    classico:      { wood: '#5a3420', metal: '#b08d4a', gold: true, legR: 0.035, legMetal: false },
    minimalista:   { wood: '#d8c3a5', metal: '#e8e8e8', gold: false, legR: 0.014, legMetal: true },
    industrial:    { wood: '#6b4a30', metal: '#1f1f1f', gold: false, legR: 0.02, legMetal: true },
    rustico:       { wood: '#7a4f2a', metal: '#3b3330', gold: false, legR: 0.045, legMetal: false },
    luxuoso:       { wood: '#2a1a12', metal: '#c9a24a', gold: true, legR: 0.025, legMetal: true },
  }[style] || {};
  return {
    ...P,
    woodM: getMaterial({ id: 'madeira', color: P.wood, rough: style === 'luxuoso' ? 0.35 : 0.65, metal: 0, scale: 0.5 }),
    metalM: colorMaterial(P.metal, P.gold ? 0.25 : 0.4, 0.9),
    fab: fabricMaterial(color),
    fab2: fabricMaterial(color2 || '#ffffff'),
    solid: colorMaterial(color, 0.5),
    solid2: colorMaterial(color2 || '#ffffff', 0.5),
    white: colorMaterial('#f4f4f2', 0.3),
    steel: colorMaterial('#c7cacc', 0.3, 0.8),
    black: colorMaterial('#141414', 0.4),
    glass: getMaterial({ id: 'vidro', color: '#cfe3ea' }),
  };
}

function legs(g, p, w, d, h, inset = 0.05) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (w / 2 - inset), z = sz * (d / 2 - inset);
    if (p.legMetal) cyl(p.legR, p.legR, h, p.metalM, x, h / 2, z, g, 8);
    else cyl(p.legR * 1.1, p.legR * 0.7, h, p.woodM, x, h / 2, z, g, 10);
  }
}
function cushion(w, h, d, mat, x, y, z, g) {
  const r = Math.min(0.06, h / 2.2, w / 4, d / 4);
  const geo = new THREE.CapsuleGeometry(r, 1, 4, 8);
  // almofada arredondada: caixa + bordas suaves aproximadas por caixa com cantos chanfrados
  const m = box(w, h, d, mat, x, y, z, g);
  const edge = box(w - r, h + 0.01, d - r, mat, x, y + 0.005, z, g);
  geo.dispose();
  return m;
}

function foliageGeo(r, seed, detail = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const pos = g.attributes.position, R = rng(seed);
  const map = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!map.has(k)) map.set(k, 0.8 + R() * 0.4);
    const f = map.get(k);
    pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * 0.85, pos.getZ(i) * f);
  }
  g.computeVertexNormals();
  return g;
}
export function makeTree(kind, color, seed = 1) {
  const g = new THREE.Group(), R = rng(seed);
  const bark = getMaterial({ id: 'madeira_escura', color: '#5b4632', rough: 0.95, metal: 0, scale: 0.4 });
  const hq = ['alto', 'ultra'].includes(materialQuality());
  const leaf = (c) => colorMaterial(c, 0.85, 0, { flatShading: !hq });
  if (kind === 'palmeira') {
    let y = 0, x = 0; const segs = 8, H = 6.8;
    for (let i = 0; i < segs; i++) { const c = cyl(0.13 - i * 0.008, 0.15 - i * 0.008, H / segs + 0.02, bark, x, y + H / segs / 2, 0, g, 8); x += 0.05; c.position.x = x; y += H / segs; }
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2;
      const frond = new THREE.Group(); frond.position.set(x, y, 0); frond.rotation.y = a; g.add(frond);
      const geo = new THREE.PlaneGeometry(0.7, 3, 1, 6); geo.translate(0, 1.5, 0);
      const pos = geo.attributes.position; for (let k = 0; k < pos.count; k++) { const t = pos.getY(k) / 3; pos.setZ(k, -t * t * 1.4); pos.setX(k, pos.getX(k) * (1 - t * 0.7)); }
      geo.computeVertexNormals();
      const m = mesh(geo, colorMaterial(color, 0.8, 0, { side: THREE.DoubleSide })); m.rotation.x = -1.1; frond.add(m);
    }
    sphere(0.22, colorMaterial('#6b5a2a', 0.9), x, y - 0.1, 0, g);
    return g;
  }
  if (kind === 'pinheiro') {
    cyl(0.12, 0.2, 2.2, bark, 0, 1.1, 0, g, 8);
    for (let i = 0; i < 4; i++) { const c = mesh(new THREE.ConeGeometry(1.6 - i * 0.33, 2.4, 9), leaf(color)); c.position.y = 2.2 + i * 1.3; c.rotation.y = R() * 3; g.add(c); }
    return g;
  }
  if (kind === 'bananeira') {
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2 + R();
      const geo = new THREE.PlaneGeometry(0.5, 1.6, 1, 5); geo.translate(0, 0.8, 0);
      const pos = geo.attributes.position; for (let k = 0; k < pos.count; k++) { const t = pos.getY(k) / 1.6; pos.setZ(k, -t * t * 0.8); pos.setX(k, pos.getX(k) * Math.sin(Math.min(1, t * 1.3) * Math.PI)); }
      geo.computeVertexNormals();
      const m = mesh(geo, colorMaterial(color, 0.7, 0, { side: THREE.DoubleSide })); m.position.y = 0.6 + R() * 0.4; m.rotation.set(-0.5, a, 0, 'YXZ'); g.add(m);
    }
    cyl(0.06, 0.09, 0.9, colorMaterial('#6b7a3a', 0.8), 0, 0.45, 0, g, 8);
    return g;
  }
  if (kind === 'arbusto' || kind === 'cerca_viva') {
    const n = kind === 'cerca_viva' ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const s = kind === 'cerca_viva' ? 0.5 : 0.45 + R() * 0.2;
      const m = mesh(foliageGeo(s, seed + i), leaf(color));
      m.position.set(kind === 'cerca_viva' ? -0.8 + i * 0.32 : (R() - 0.5) * 0.6, kind === 'cerca_viva' ? 0.8 + (R() - 0.5) * 0.2 : s * 0.9, (R() - 0.5) * (kind === 'cerca_viva' ? 0.1 : 0.6));
      if (kind === 'cerca_viva') m.scale.set(1, 1.6, 0.7);
      g.add(m);
    }
    return g;
  }
  // árvore frondosa / ipê
  const H = kind === 'ipe' ? 3.2 : 3.4;
  const trunk = cyl(0.14, 0.24, H, bark, 0, H / 2, 0, g, 9);
  for (let i = 0; i < 3; i++) { const b = cyl(0.05, 0.09, 1.6, bark, 0, H - 0.4, 0, g, 6); b.rotation.set(0.7, i * 2.1, 0, 'YXZ'); b.position.add(new THREE.Vector3(Math.sin(i * 2.1) * 0.4, 0.4, Math.cos(i * 2.1) * 0.4)); }
  const blobs = kind === 'ipe' ? 7 : 9;
  for (let i = 0; i < blobs; i++) {
    const a = R() * Math.PI * 2, rr = R() * 1.3;
    const s = 1.0 + R() * 0.7;
    const m = mesh(foliageGeo(s, seed * 7 + i, hq ? 2 : 1), leaf(i % 3 === 0 && kind !== 'ipe' ? new THREE.Color(color).offsetHSL(0, 0, 0.05).getStyle() : color));
    m.position.set(Math.cos(a) * rr, H + 0.8 + R() * 1.6, Math.sin(a) * rr);
    g.add(m);
  }
  trunk.userData.trunk = true;
  return g;
}

export function buildItem(o) {
  const def = ITEMS[o.item];
  const g = new THREE.Group();
  const inner = new THREE.Group(); g.add(inner);
  const p = palette(o.style, o.color, o.color2);
  const c = o.color;
  const I = inner;
  switch (o.item) {
    case 'sofa': case 'sofa_l': {
      const W = def.w, D = 0.95;
      box(W, 0.18, D, p.fab, 0, 0.2, 0, I);
      for (let i = 0; i < 3; i++) cushion(W / 3 - 0.04 - 0.08, 0.16, D - 0.25, p.fab, -W / 2 + 0.1 + (i + 0.5) * (W - 0.2) / 3, 0.37, 0.08, I);
      box(W, 0.45, 0.22, p.fab, 0, 0.55, -D / 2 + 0.11, I);
      box(0.16, 0.32, D, p.fab, -W / 2 + 0.08, 0.45, 0, I); box(0.16, 0.32, D, p.fab, W / 2 - 0.08, 0.45, 0, I);
      for (let i = 0; i < 2; i++) { const m = box(0.42, 0.38, 0.12, p.fab2, -W / 2 + 0.45 + i * (W - 0.9), 0.62, -D / 2 + 0.3, I); m.rotation.x = -0.2; }
      if (o.item === 'sofa_l') { box(0.95, 0.18, 1.1, p.fab, W / 2 - 0.475, 0.2, D / 2 + 0.5, I); cushion(0.8, 0.16, 1.0, p.fab, W / 2 - 0.475, 0.37, D / 2 + 0.5, I); I.position.z = -0.5; }
      legs(I, p, W - 0.1, D - 0.1, 0.11);
      break;
    }
    case 'poltrona': {
      box(0.8, 0.2, 0.8, p.fab, 0, 0.32, 0, I); cushion(0.6, 0.12, 0.62, p.fab, 0, 0.47, 0.05, I);
      const back = box(0.8, 0.6, 0.15, p.fab, 0, 0.7, -0.33, I); back.rotation.x = -0.12;
      box(0.12, 0.25, 0.75, p.fab, -0.34, 0.55, 0, I); box(0.12, 0.25, 0.75, p.fab, 0.34, 0.55, 0, I);
      legs(I, p, 0.72, 0.72, 0.22); break;
    }
    case 'mesa_centro': {
      const top = o.style === 'luxuoso' ? getMaterial({ id: 'marmore' }) : p.woodM;
      box(1.1, 0.05, 0.6, top, 0, 0.4, 0, I); box(1.0, 0.03, 0.5, p.woodM, 0, 0.12, 0, I); legs(I, p, 1.05, 0.55, 0.4); break;
    }
    case 'rack_tv': {
      box(1.9, 0.45, 0.45, p.woodM, 0, 0.28, 0, I); box(1.86, 0.02, 0.42, p.black, 0, 0.28, 0.02, I);
      legs(I, p, 1.8, 0.4, 0.06);
      box(1.45, 0.84, 0.05, p.black, 0, 0.98, -0.05, I);
      const scr = box(1.4, 0.79, 0.01, colorMaterial('#0b1622', 0.1, 0.2, { emissive: new THREE.Color('#0a1a2a'), emissiveIntensity: 0.6 }), 0, 0.98, -0.02, I);
      box(0.3, 0.02, 0.2, p.black, 0, 0.52, -0.05, I); break;
    }
    case 'estante': {
      for (const sx of [-1, 1]) box(0.03, 2, 0.38, p.woodM, sx * 0.785, 1, 0, I);
      for (let i = 0; i < 6; i++) box(1.57, 0.03, 0.38, p.woodM, 0, 0.02 + i * 0.39, 0, I);
      box(1.6, 2, 0.01, p.woodM, 0, 1, -0.185, I);
      const R = rng(o.id.length * 13);
      for (let s = 0; s < 5; s++) { let x = -0.72; while (x < 0.6) { const bw = 0.03 + R() * 0.04, bh = 0.22 + R() * 0.1; box(bw, bh, 0.22, colorMaterial(['#7a2e2e', '#2e4a7a', '#d9c9a0', '#2f5d3a', '#444'][Math.floor(R() * 5)], 0.8), x + bw / 2, 0.04 + s * 0.39 + bh / 2, 0.02, I); x += bw + 0.005; if (R() < 0.08) x += 0.2; } }
      break;
    }
    case 'tapete': {
      box(def.w, 0.015, def.d, p.fab, 0, 0.008, 0, I);
      box(def.w - 0.25, 0.017, def.d - 0.25, p.fab2, 0, 0.009, 0, I);
      box(def.w - 0.4, 0.019, def.d - 0.4, p.fab, 0, 0.01, 0, I);
      I.traverse(m => { if (m.isMesh) m.castShadow = false; });
      break;
    }
    case 'mesa_jantar': case 'mesa_externa': case 'escrivaninha': {
      const w = def.w, d = def.d;
      const top = o.style === 'luxuoso' ? getMaterial({ id: 'marmore' }) : (o.item === 'mesa_externa' ? getMaterial({ id: 'deck', color: c }) : getMaterial({ id: 'madeira', color: c, scale: 0.5 }));
      box(w, 0.045, d, top, 0, def.h - 0.02, 0, I);
      legs(I, p, w - 0.06, d - 0.06, def.h - 0.04, 0.06);
      if (o.item === 'escrivaninha') { box(0.4, 0.5, d - 0.05, p.woodM, w / 2 - 0.22, 0.45, 0, I); }
      break;
    }
    case 'cadeira': {
      box(0.46, 0.04, 0.46, p.woodM, 0, 0.46, 0, I); cushion(0.42, 0.04, 0.42, p.fab, 0, 0.49, 0, I);
      const b = box(0.44, 0.42, 0.03, p.woodM, 0, 0.72, -0.21, I); b.rotation.x = -0.08;
      legs(I, p, 0.42, 0.42, 0.45, 0.03); break;
    }
    case 'bancada': case 'ilha': {
      const w = def.w, d = def.d;
      box(w - 0.04, 0.84, d - 0.04, p.solid, 0, 0.42, 0, I);
      const top = getMaterial({ id: o.style === 'industrial' ? 'concreto' : (o.style === 'luxuoso' ? 'marmore' : 'granito') });
      box(w, 0.04, d, top, 0, 0.88, 0, I);
      const n = Math.round(w / 0.6);
      for (let i = 0; i < n; i++) { box(w / n - 0.01, 0.7, 0.02, p.solid, -w / 2 + (i + 0.5) * w / n, 0.42, d / 2 - 0.01, I); box(0.25, 0.015, 0.02, p.metalM, -w / 2 + (i + 0.5) * w / n, 0.72, d / 2 + 0.01, I); }
      if (o.item === 'bancada') { box(0.5, 0.01, 0.4, p.steel, w / 4, 0.905, 0, I); const tap = cyl(0.012, 0.012, 0.3, p.steel, w / 4, 1.05, -d / 2 + 0.1, I); }
      else for (let i = 0; i < 3; i++) { cyl(0.18, 0.18, 0.04, p.fab, -0.6 + i * 0.6, 0.72, d / 2 + 0.35, I); cyl(0.02, 0.02, 0.7, p.metalM, -0.6 + i * 0.6, 0.35, d / 2 + 0.35, I); }
      break;
    }
    case 'armario_alto': case 'guarda_roupa': {
      const w = def.w, h = def.h, d = def.d;
      box(w, h, d - 0.02, p.solid, 0, h / 2, -0.01, I);
      const n = Math.max(2, Math.round(w / 0.5));
      for (let i = 0; i < n; i++) { box(w / n - 0.01, h - 0.04, 0.02, p.solid, -w / 2 + (i + 0.5) * w / n, h / 2, d / 2 - 0.01, I); box(0.015, 0.4, 0.02, p.metalM, -w / 2 + (i + (i % 2 ? 0.1 : 0.9)) * w / n, h / 2, d / 2 + 0.01, I); }
      break;
    }
    case 'geladeira': {
      box(0.75, 1.85, 0.7, p.solid, 0, 0.925, 0, I); box(0.74, 0.01, 0.01, p.black, 0, 1.25, 0.355, I);
      box(0.02, 0.5, 0.03, p.steel, -0.3, 1.55, 0.37, I); box(0.02, 0.5, 0.03, p.steel, -0.3, 0.9, 0.37, I); break;
    }
    case 'fogao': {
      box(0.76, 0.85, 0.65, p.solid, 0, 0.425, 0, I); box(0.76, 0.02, 0.65, p.black, 0, 0.86, 0, I);
      for (const [x, z] of [[-0.18, -0.15], [0.18, -0.15], [-0.18, 0.15], [0.18, 0.15]]) cyl(0.08, 0.08, 0.02, p.black, x, 0.88, z, I);
      box(0.6, 0.4, 0.01, colorMaterial('#111', 0.1, 0.3), 0, 0.42, 0.33, I); box(0.5, 0.02, 0.03, p.steel, 0, 0.7, 0.34, I); break;
    }
    case 'cama_casal': case 'cama_solteiro': {
      const w = def.w, d = def.d;
      box(w + 0.06, 0.3, d, p.woodM, 0, 0.2, 0, I);
      cushion(w - 0.02, 0.24, d - 0.06, p.white, 0, 0.47, 0.02, I);
      box(w, 0.06, d * 0.62, p.fab, 0, 0.6, d * 0.18, I); box(w + 0.02, 0.3, 0.04, p.fab, 0, 0.45, d * 0.18 + d * 0.31, I);
      const pillows = o.item === 'cama_casal' ? 2 : 1;
      for (let i = 0; i < pillows; i++) { const m = mesh(new THREE.CapsuleGeometry(0.1, 0.45, 4, 10), p.fab2); m.rotation.z = Math.PI / 2; m.scale.set(1, 1, 0.55); m.position.set(pillows === 2 ? (i ? 0.38 : -0.38) : 0, 0.66, -d / 2 + 0.3); I.add(m); }
      box(w + 0.1, 1.0, 0.08, o.style === 'contemporaneo' || o.style === 'luxuoso' ? p.fab2 : p.woodM, 0, 0.6, -d / 2 - 0.02, I);
      break;
    }
    case 'criado_mudo': { box(0.5, 0.45, 0.4, p.woodM, 0, 0.32, 0, I); box(0.46, 0.18, 0.01, p.woodM, 0, 0.42, 0.2, I); box(0.08, 0.015, 0.02, p.metalM, 0, 0.42, 0.21, I); legs(I, p, 0.46, 0.36, 0.1, 0.03); break; }
    case 'vaso_sanitario': {
      const bowl = cyl(0.19, 0.14, 0.4, p.white, 0, 0.2, 0.08, I, 20); bowl.scale.z = 1.25;
      box(0.38, 0.38, 0.18, p.white, 0, 0.58, -0.22, I); cyl(0.2, 0.2, 0.03, p.white, 0, 0.42, 0.1, I).scale.z = 1.2; break;
    }
    case 'pia_banheiro': {
      box(0.9, 0.7, 0.48, p.woodM, 0, 0.4, 0, I); box(0.9, 0.03, 0.5, getMaterial({ id: 'marmore' }), 0, 0.77, 0, I);
      const cuba = cyl(0.2, 0.15, 0.1, p.white, 0, 0.83, 0.02, I, 20); cuba.scale.z = 0.8; cyl(0.012, 0.012, 0.25, p.steel, 0, 0.9, -0.18, I);
      box(0.7, 0.9, 0.02, colorMaterial('#d7e3e8', 0.05, 1), 0, 1.6, -0.23, I); break;
    }
    case 'box_chuveiro': {
      box(0.9, 0.04, 0.9, p.white, 0, 0.02, 0, I);
      box(0.9, 1.95, 0.01, p.glass, 0, 1.0, 0.44, I); box(0.01, 1.95, 0.9, p.glass, 0.44, 1.0, 0, I);
      cyl(0.012, 0.012, 1.9, p.steel, -0.4, 1.0, -0.4, I); cyl(0.1, 0.1, 0.02, p.steel, -0.3, 1.95, -0.3, I); break;
    }
    case 'banheira': { const b = box(1.7, 0.55, 0.8, p.white, 0, 0.28, 0, I); box(1.55, 0.02, 0.65, colorMaterial('#bfe3ef', 0.05, 0, { transparent: true, opacity: 0.7 }), 0, 0.5, 0, I); break; }
    case 'maquina_lavar': { box(0.6, 0.9, 0.62, p.solid, 0, 0.45, 0, I); const d = mesh(new THREE.TorusGeometry(0.17, 0.03, 8, 24), p.steel); d.position.set(0, 0.45, 0.31); I.add(d); const gl = cyl(0.16, 0.16, 0.02, p.glass, 0, 0.45, 0.31, I); gl.rotation.x = Math.PI / 2; break; }
    case 'luminaria_chao': {
      cyl(0.15, 0.17, 0.03, p.metalM, 0, 0.015, 0, I); cyl(0.012, 0.012, 1.45, p.metalM, 0, 0.75, 0, I);
      const shade = cyl(0.14, 0.2, 0.28, colorMaterial('#f3ead8', 0.9, 0, { side: THREE.DoubleSide, emissive: new THREE.Color('#ffdca0'), emissiveIntensity: 0.25 }), 0, 1.55, 0, I);
      shade.userData.lightAnchor = { color: '#ffd59a', intensity: 4, distance: 7 }; shade.userData.bulb = true; break;
    }
    case 'pendente': {
      cyl(0.006, 0.006, 0.6, p.black, 0, 0.5, 0, I);
      const shade = cyl(0.06, 0.2, 0.2, colorMaterial(c, 0.5, 0.4, { side: THREE.DoubleSide }), 0, 0.12, 0, I);
      const bulb = sphere(0.05, colorMaterial('#fff6dd', 0.2, 0, { emissive: new THREE.Color('#ffe2a8'), emissiveIntensity: 1.5 }), 0, 0.04, 0, I);
      bulb.userData.lightAnchor = { color: '#ffd59a', intensity: 5, distance: 8 }; bulb.userData.bulb = true; break;
    }
    case 'cortina': {
      const geo = new THREE.PlaneGeometry(def.w, def.h, 24, 1);
      const pos = geo.attributes.position; for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 18) * 0.04);
      geo.computeVertexNormals();
      const m = mesh(geo, fabricMaterial(c, 1)); m.material = m.material.clone(); m.material.side = THREE.DoubleSide; m.position.y = def.h / 2; I.add(m);
      const rod = cyl(0.015, 0.015, def.w + 0.2, p.metalM, 0, def.h + 0.02, 0, I); rod.rotation.z = Math.PI / 2; break;
    }
    case 'quadro': case 'espelho': {
      box(def.w, def.h, 0.035, p.metalM.clone ? colorMaterial(o.item === 'espelho' ? c : '#2a2420', 0.4, o.item === 'espelho' ? 0.6 : 0) : p.woodM, 0, 1.5, 0, I);
      if (o.item === 'espelho') box(def.w - 0.08, def.h - 0.08, 0.01, colorMaterial('#dfe8ec', 0.02, 1), 0, 1.5, 0.02, I);
      else {
        const cv = document.createElement('canvas'); cv.width = 128; cv.height = 96; const ctx = cv.getContext('2d');
        const R = rng(o.id.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0));
        ctx.fillStyle = c; ctx.fillRect(0, 0, 128, 96);
        for (let i = 0; i < 7; i++) { ctx.fillStyle = `hsl(${Math.floor(R() * 360)},${40 + R() * 40}%,${35 + R() * 40}%)`; ctx.globalAlpha = 0.75; if (R() < 0.5) ctx.fillRect(R() * 128, R() * 96, 20 + R() * 60, 10 + R() * 50); else { ctx.beginPath(); ctx.arc(R() * 128, R() * 96, 8 + R() * 30, 0, 7); ctx.fill(); } }
        const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
        box(def.w - 0.08, def.h - 0.08, 0.01, new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }), 0, 1.5, 0.02, I);
      }
      I.traverse(m => { if (m.isMesh) m.castShadow = false; });
      break;
    }
    case 'vaso_planta': {
      const pot = cyl(0.2, 0.15, 0.4, colorMaterial(c, 0.7), 0, 0.2, 0, I, 16);
      cyl(0.18, 0.18, 0.02, colorMaterial('#3b2a1a', 1), 0, 0.39, 0, I);
      const plant = makeTree('bananeira', '#4f8f3a', o.id.length); plant.scale.setScalar(0.5); plant.position.y = 0.35; I.add(plant); break;
    }
    case 'vaso_decor': { const v = mesh(new THREE.LatheGeometry([[0.02, 0], [0.11, 0.05], [0.12, 0.2], [0.06, 0.38], [0.07, 0.45]].map(([x, y]) => new THREE.Vector2(x, y)), 20), colorMaterial(c, 0.3)); I.add(v); break; }
    case 'espreguicadeira': {
      box(0.65, 0.06, 1.3, p.woodM, 0, 0.32, 0.25, I); const b = box(0.65, 0.06, 0.65, p.woodM, 0, 0.5, -0.6, I); b.rotation.x = 0.7;
      cushion(0.6, 0.06, 1.25, p.fab, 0, 0.38, 0.25, I); const cb = box(0.6, 0.06, 0.6, p.fab, 0, 0.55, -0.57, I); cb.rotation.x = 0.7;
      legs(I, p, 0.6, 1.8, 0.3); break;
    }
    case 'guarda_sol': {
      cyl(0.25, 0.28, 0.08, colorMaterial('#333', 0.6), 0, 0.04, 0, I); cyl(0.025, 0.025, 2.4, p.metalM, 0, 1.2, 0, I);
      const cone = mesh(new THREE.ConeGeometry(1.25, 0.45, 8, 1, true), fabricMaterial(c)); cone.material = cone.material.clone(); cone.material.side = THREE.DoubleSide; cone.position.y = 2.3; I.add(cone); break;
    }
    case 'churrasqueira': {
      const br = getMaterial({ id: 'tijolo', color: c });
      box(1.4, 0.9, 0.7, br, 0, 0.45, 0, I); box(1.45, 0.06, 0.75, getMaterial({ id: 'granito' }), 0, 0.93, 0, I);
      box(0.1, 0.7, 0.6, br, -0.65, 1.3, 0, I); box(0.1, 0.7, 0.6, br, 0.65, 1.3, 0, I); box(1.4, 0.1, 0.7, br, 0, 1.68, 0, I); box(1.2, 0.6, 0.05, br, 0, 1.3, -0.3, I);
      const hood = mesh(new THREE.CylinderGeometry(0.15, 0.6, 0.4, 4), br); hood.rotation.y = Math.PI / 4; hood.position.y = 1.93; I.add(hood); box(0.3, 0.6, 0.3, br, 0, 2.4, 0, I);
      box(1.1, 0.02, 0.5, p.black, 0, 1.0, 0, I); break;
    }
    case 'banco_jardim': { for (let i = 0; i < 4; i++) box(1.5, 0.03, 0.1, p.woodM, 0, 0.45, -0.2 + i * 0.13, I); for (let i = 0; i < 2; i++) box(1.5, 0.09, 0.03, p.woodM, 0, 0.62 + i * 0.12, -0.26, I); for (const sx of [-1, 1]) { box(0.05, 0.45, 0.5, p.metalM, sx * 0.65, 0.225, 0, I); box(0.05, 0.4, 0.04, p.metalM, sx * 0.65, 0.65, -0.26, I); } break; }
    case 'fonte': {
      const stone = getMaterial({ id: 'pedra', color: c });
      const basin = mesh(new THREE.CylinderGeometry(0.8, 0.85, 0.45, 28, 1, true), stone); basin.material = stone.clone(); basin.material.side = THREE.DoubleSide; basin.position.y = 0.225; I.add(basin);
      const ring = mesh(new THREE.TorusGeometry(0.8, 0.06, 8, 32), stone); ring.rotation.x = Math.PI / 2; ring.position.y = 0.45; I.add(ring);
      const wtr = mesh(new THREE.CircleGeometry(0.78, 28), colorMaterial('#3f8fae', 0.05, 0.1, { transparent: true, opacity: 0.8 })); wtr.rotation.x = -Math.PI / 2; wtr.position.y = 0.38; I.add(wtr);
      cyl(0.12, 0.18, 0.9, stone, 0, 0.6, 0, I); cyl(0.35, 0.2, 0.12, stone, 0, 1.1, 0, I); cyl(0.05, 0.05, 0.3, stone, 0, 1.3, 0, I); break;
    }
    case 'cascata': {
      const st = getMaterial({ id: 'pedra', color: c });
      box(1.2, 1.2, 0.5, st, 0, 0.6, 0, I); box(1.0, 0.04, 0.3, getMaterial({ id: 'aco' }), 0, 1.0, 0.35, I);
      const fall = box(0.9, 0.95, 0.02, colorMaterial('#bfefff', 0.05, 0, { transparent: true, opacity: 0.55, emissive: new THREE.Color('#5fb8d0'), emissiveIntensity: 0.2 }), 0, 0.5, 0.5, I); fall.castShadow = false; break;
    }
    case 'poste_luz': case 'balizador': {
      const h = def.h;
      cyl(0.04, 0.06, h, p.metalM, 0, h / 2, 0, I, 10);
      const lamp = o.item === 'poste_luz' ? box(0.35, 0.12, 0.35, colorMaterial('#fff3d6', 0.3, 0, { emissive: new THREE.Color('#ffdca0'), emissiveIntensity: 0.6 }), 0, h, 0, I)
        : box(0.12, 0.08, 0.12, colorMaterial('#fff3d6', 0.3, 0, { emissive: new THREE.Color('#ffdca0'), emissiveIntensity: 0.6 }), 0, h - 0.06, 0, I);
      lamp.userData.lightAnchor = { color: '#ffd59a', intensity: o.item === 'poste_luz' ? 10 : 2, distance: o.item === 'poste_luz' ? 14 : 4 }; lamp.userData.bulb = true; break;
    }
    case 'arvore': case 'ipe': case 'pinheiro': case 'palmeira': case 'arbusto': case 'cerca_viva': case 'bananeira':
      I.add(makeTree(o.item, c, o.id.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0))); break;
    case 'flores': {
      box(1.5, 0.25, 0.8, getMaterial({ id: 'tijolo', color: '#9a5a3a' }), 0, 0.125, 0, I); box(1.4, 0.02, 0.7, colorMaterial('#3b2a1a', 1), 0, 0.25, 0, I);
      const R = rng(o.id.length * 7 + 1);
      for (let i = 0; i < 26; i++) { const x = (R() - 0.5) * 1.3, z = (R() - 0.5) * 0.6; cyl(0.006, 0.006, 0.18, colorMaterial('#3f7a2a', 0.8), x, 0.34, z, I, 4); sphere(0.035, colorMaterial(i % 4 ? c : '#f5e35a', 0.6), x, 0.44, z, I, 1, 0.7, 1, 6); }
      for (let i = 0; i < 6; i++) { const m = mesh(foliageGeo(0.12, i + 3, 0), colorMaterial('#3f7a2a', 0.85, 0, { flatShading: true })); m.position.set((R() - 0.5) * 1.2, 0.33, (R() - 0.5) * 0.5); I.add(m); }
      break;
    }
    case 'pedra': { const m = mesh(foliageGeo(0.6, o.id.length, 1), getMaterial({ id: 'pedra', color: c })); m.scale.set(1, 0.65, 0.85); m.position.y = 0.3; I.add(m); break; }
    case 'pedras_decor': {
      const R = rng(o.id.length);
      box(1.5, 0.04, 1.5, colorMaterial('#bdb6a8', 1), 0, 0.02, 0, I);
      for (let i = 0; i < 40; i++) sphere(0.04 + R() * 0.04, colorMaterial(c, 0.6), (R() - 0.5) * 1.4, 0.05, (R() - 0.5) * 1.4, I, 1, 0.5, 1, 6);
      break;
    }
    case 'pisante': { for (let i = 0; i < 4; i++) box(0.55, 0.05, 0.45, getMaterial({ id: 'pedra_ardosia', color: c }), 0, 0.025, -0.9 + i * 0.6, I); break; }
    case 'cerca': { for (let i = 0; i < 9; i++) box(0.12, 1.2, 0.03, p.woodM.clone ? getMaterial({ id: 'madeira', color: c }) : p.woodM, -0.96 + i * 0.24, 0.6, 0, I); box(2, 0.08, 0.03, getMaterial({ id: 'madeira', color: c }), 0, 0.3, -0.03, I); box(2, 0.08, 0.03, getMaterial({ id: 'madeira', color: c }), 0, 0.9, -0.03, I); break; }
    case 'gradil': { const m = colorMaterial(c, 0.4, 0.8); box(2, 0.04, 0.04, m, 0, 1.58, 0, I); box(2, 0.04, 0.04, m, 0, 0.1, 0, I); for (let i = 0; i < 17; i++) cyl(0.01, 0.01, 1.5, m, -0.96 + i * 0.12, 0.84, 0, I, 5); for (const sx of [-1, 1]) box(0.06, 1.6, 0.06, m, sx, 0.8, 0, I); break; }
    default: box(def?.w || 1, def?.h || 1, def?.d || 1, p.solid, 0, (def?.h || 1) / 2, 0, I);
  }
  g.position.set(o.x, o.y, o.z);
  g.rotation.y = o.rot;
  g.scale.setScalar(o.sc);
  return g;
}
