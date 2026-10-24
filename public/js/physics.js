// Física simples do personagem: chão (terreno, pisos, escadas, piscinas) e colisão com paredes e objetos sólidos.
import { ITEMS, LEVEL_H } from '/shared/catalog.js';
import { terrainHeight, levelBase, STREET } from '/shared/world.js';
import { wallFrame, openingsOf, floorTop, wallBase, stairLength, floorHoles } from './builders.js';

const STEP = 0.5;

function toLocal(o, x, z) {
  const dx = x - o.x, dz = z - o.z, c = Math.cos(-o.rot), s = Math.sin(-o.rot);
  return [dx * c + dz * s, -dx * s + dz * c];
}
function inPoly(pts, x, z) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export class Physics {
  constructor() { this.walls = []; this.floors = []; this.stairs = []; this.pools = []; this.solids = []; }
  rebuild(world) {
    this.world = world;
    this.walls = []; this.floors = []; this.stairs = []; this.pools = []; this.solids = [];
    for (const o of Object.values(world.objects)) {
      switch (o.type) {
        case 'wall': {
          const f = wallFrame(o);
          this.walls.push({ o, ...f, y0: wallBase(o), y1: wallBase(o) + o.h, ops: openingsOf(world, o) });
          break;
        }
        case 'floor': this.floors.push({ o, top: floorTop(o), holes: floorHoles(world, o) }); break;
        case 'stairs': this.stairs.push({ o, L: stairLength(o), base: levelBase(o.level) + o.y0 }); break;
        case 'pool': this.pools.push(o); break;
        case 'column': this.solids.push({ x: o.x, z: o.z, rot: 0, hw: o.s / 2, hd: o.s / 2, y0: levelBase(o.level) + o.y0, y1: levelBase(o.level) + o.y0 + o.h }); break;
        case 'item': {
          const d = ITEMS[o.item]; if (!d?.solid) break;
          const tree = ['arvore', 'ipe', 'pinheiro', 'palmeira'].includes(o.item);
          const hw = tree ? 0.22 * o.sc : d.w * o.sc / 2, hd = tree ? 0.22 * o.sc : d.d * o.sc / 2;
          this.solids.push({ x: o.x, z: o.z, rot: o.rot, hw, hd, y0: o.y, y1: o.y + d.h * o.sc });
          break;
        }
      }
    }
  }
  // altura do chão mais alta que ainda está "alcançável" a partir dos pés
  groundAt(x, z, feetY) {
    const w = this.world;
    let best = -Infinity, inWater = false;
    let terr = terrainHeight(w, x, z);
    if (Math.abs(z) <= STREET.z1 + STREET.walk) terr = Math.max(terr, Math.abs(z) <= STREET.z1 ? 0.05 : 0.15);
    for (const p of this.pools) {
      const [lx, lz] = toLocal(p, x, z);
      const round = p.shape === 'redonda' || p.shape === 'oval';
      const hw = p.w / 2, hd = (p.shape === 'redonda' ? p.w : p.d) / 2;
      const inside = round ? (lx * lx) / (hw * hw) + (lz * lz) / (hd * hd) < 1 : Math.abs(lx) < hw && Math.abs(lz) < hd;
      if (inside) { terr = p.y - p.depth; inWater = feetY < p.y - 0.15; }
    }
    if (terr <= feetY + STEP) best = terr;
    for (const f of this.floors) {
      const [lx, lz] = toLocal(f.o, x, z);
      if (Math.abs(lx) > f.o.w / 2 || Math.abs(lz) > f.o.d / 2) continue;
      if (f.holes.some(h => inPoly(h, lx, lz))) continue;
      if (f.top <= feetY + STEP && f.top > best) best = f.top;
    }
    for (const s of this.stairs) {
      const [lx, lz] = toLocal(s.o, x, z);
      if (Math.abs(lx) > s.o.w / 2 + 0.05 || Math.abs(lz) > s.L / 2 + 0.02) continue;
      const t = Math.max(0, Math.min(1, (lz + s.L / 2) / s.L));
      const h = s.base + t * LEVEL_H;
      if (h <= feetY + STEP && h > best) best = h;
    }
    if (best === -Infinity) best = terr;
    return { y: best, water: inWater };
  }
  // empurra o círculo (raio r) para fora de paredes/objetos. Retorna posição corrigida.
  collide(pos, r, feetY, height) {
    const headY = feetY + height;
    for (let iter = 0; iter < 3; iter++) {
      for (const w of this.walls) {
        if (headY < w.y0 + 0.05 || feetY > w.y1 - 0.05) continue;
        const ax = w.o.a[0], az = w.o.a[1];
        const px = pos.x - ax, pz = pos.z - az;
        const u = px * w.dir[0] + pz * w.dir[1];
        if (u < -r || u > w.L + r) continue;
        const v = px * w.normal[0] + pz * w.normal[1];
        const half = w.o.t / 2 + r;
        if (Math.abs(v) >= half) continue;
        // atravessando uma abertura (porta) com altura suficiente?
        const relFeet = feetY - w.y0, relHead = headY - w.y0;
        let pass = false;
        for (const op of w.ops) {
          if (u > op.u0 + r * 0.6 && u < op.u1 - r * 0.6 && op.sill <= relFeet + 0.35 && op.top >= Math.min(relHead, w.o.h) - 0.25) { pass = true; break; }
        }
        if (pass) continue;
        const uc = Math.max(0, Math.min(w.L, u));
        if (u >= 0 && u <= w.L) {
          const push = (half - Math.abs(v)) * Math.sign(v || 1);
          pos.x += w.normal[0] * push; pos.z += w.normal[1] * push;
        } else {
          const cx = ax + w.dir[0] * uc, cz = az + w.dir[1] * uc;
          const dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz);
          const rr = Math.hypot(w.o.t / 2, 0) + r;
          if (d < rr && d > 1e-5) { pos.x = cx + dx / d * rr; pos.z = cz + dz / d * rr; }
        }
      }
      for (const s of this.solids) {
        if (headY < s.y0 + 0.05 || feetY > s.y1 - 0.3) continue;
        const [lx, lz] = toLocal(s, pos.x, pos.z);
        const cx = Math.max(-s.hw, Math.min(s.hw, lx)), cz = Math.max(-s.hd, Math.min(s.hd, lz));
        let dx = lx - cx, dz = lz - cz; let d = Math.hypot(dx, dz);
        if (d >= r) continue;
        let nlx, nlz;
        if (d < 1e-5) { // centro dentro da caixa
          const ex = s.hw - Math.abs(lx), ez = s.hd - Math.abs(lz);
          if (ex < ez) { nlx = Math.sign(lx || 1) * (s.hw + r); nlz = lz; } else { nlx = lx; nlz = Math.sign(lz || 1) * (s.hd + r); }
        } else { nlx = cx + dx / d * r; nlz = cz + dz / d * r; }
        const c = Math.cos(s.rot), sn = Math.sin(s.rot);
        pos.x = s.x + nlx * c + nlz * sn; pos.z = s.z - nlx * sn + nlz * c;
      }
    }
    return pos;
  }
}
