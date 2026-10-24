// Utilitários de geometria: caixas com UV em metros, construtor de faces com projeção planar.
import * as THREE from 'three';

// BoxGeometry cujas UVs correspondem a metros reais (texturas não esticam ao redimensionar)
export function boxUV(w, h, d, offU = 0, offV = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // ordem das faces: +x, -x, +y, -y, +z, -z (4 vértices cada)
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0] + (f >= 4 ? offU : 0), uv.getY(i) * dims[f][1] + (f >= 4 || f < 2 ? offV : 0));
    }
  }
  return g;
}

export function mesh(geo, mat, cast = true, receive = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}
export function box(w, h, d, mat, x = 0, y = 0, z = 0, parent) {
  const m = mesh(boxUV(w, h, d), mat);
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}
export function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, parent, seg = 16) {
  const m = mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}
export function sphere(r, mat, x = 0, y = 0, z = 0, parent, sx = 1, sy = 1, sz = 1, seg = 16) {
  const m = mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg * 0.75 | 0)), mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  if (parent) parent.add(m);
  return m;
}

// Constrói polígonos (faces planas) com UV planar em metros e normais por face.
export class FaceBuilder {
  constructor() { this.pos = []; this.uv = []; this.groups = []; this._cur = null; }
  group(matIndex) { this._cur = { start: this.pos.length / 3, count: 0, mat: matIndex }; this.groups.push(this._cur); }
  poly(pts, flip = false) {
    if (!this._cur) this.group(0);
    const p = pts.map(a => new THREE.Vector3(...a));
    if (flip) p.reverse();
    const n = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0])).normalize();
    if (n.lengthSq() < 0.5) return;
    const up = Math.abs(n.y) > 0.95 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const tU = new THREE.Vector3().crossVectors(up, n).normalize();
    const tV = new THREE.Vector3().crossVectors(n, tU).normalize();
    for (let i = 1; i < p.length - 1; i++) {
      for (const q of [p[0], p[i], p[i + 1]]) { this.pos.push(q.x, q.y, q.z); this.uv.push(q.dot(tU), q.dot(tV)); }
      this._cur.count += 3;
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    for (const gr of this.groups) if (gr.count) g.addGroup(gr.start, gr.count, gr.mat);
    g.computeVertexNormals();
    return g;
  }
}

export function disposeTree(obj) {
  obj.traverse(o => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
}

// sprite de texto (nomes acima dos personagens, medidas)
export function textSprite(text, opts = {}) {
  const c = document.createElement('canvas'), ctx = c.getContext('2d');
  const fs = opts.size || 42;
  ctx.font = `600 ${fs}px system-ui, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 28;
  c.width = w; c.height = fs + 22;
  ctx.font = `600 ${fs}px system-ui, sans-serif`;
  ctx.fillStyle = opts.bg || 'rgba(15,20,25,0.62)';
  const r = 14; ctx.beginPath(); ctx.roundRect(0, 0, c.width, c.height, r); ctx.fill();
  ctx.fillStyle = opts.color || '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(text, 14, c.height / 2 + 1);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: opts.depthTest ?? true, transparent: true }));
  const hgt = opts.height || 0.28;
  s.scale.set(hgt * c.width / c.height, hgt, 1);
  return s;
}
