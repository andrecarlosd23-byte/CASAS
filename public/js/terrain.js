// Malha 3D do terreno (heightfield real), cores por tipo de solo e recortes para piscinas.
import * as THREE from 'three';
import { WORLD_SIZE, terrainHeight, clamp } from '/shared/world.js';
import { getTexture, getNormalMap, materialQuality } from './materials.js';

const SOIL_COLORS = [
  [0.36, 0.52, 0.22], // grama
  [0.55, 0.55, 0.3],  // grama seca
  [0.45, 0.33, 0.22], // terra
  [0.82, 0.74, 0.56], // areia
  [0.5, 0.49, 0.47],  // pedra
  [0.24, 0.4, 0.17],  // grama escura
];
const MAX_POOLS = 16;

export class TerrainView {
  constructor(world) {
    this.world = world;
    const t = world.terrain, N = t.N;
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, N - 1, N - 1);
    geo.rotateX(-Math.PI / 2); // vértices: linha j (z crescente), coluna i (x crescente)
    this.geo = geo;
    const colors = new Float32Array(N * N * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * WORLD_SIZE / 3, uv.getY(k) * WORLD_SIZE / 3);
    const map = getTexture('grass').clone(); map.needsUpdate = true;
    this.uniforms = { poolA: { value: Array.from({ length: MAX_POOLS }, () => new THREE.Vector4()) }, poolB: { value: Array.from({ length: MAX_POOLS }, () => new THREE.Vector4()) }, poolCount: { value: 0 } };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map, roughness: 0.97, metalness: 0 });
    if (materialQuality() === 'ultra') { const nm = getNormalMap('grass').clone(); nm.needsUpdate = true; mat.normalMap = nm; mat.normalScale.set(0.8, 0.8); map.anisotropy = 16; }
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWPos; uniform vec4 poolA[${MAX_POOLS}]; uniform vec4 poolB[${MAX_POOLS}]; uniform int poolCount;`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
for (int i = 0; i < ${MAX_POOLS}; i++) { if (i >= poolCount) break;
  vec2 d = vWPos.xz - poolA[i].xy; float c = poolB[i].x, s = poolB[i].y;
  vec2 l = vec2(d.x * c - d.y * s, d.x * s + d.y * c);
  if (poolB[i].z > 0.5) { vec2 q = l / poolA[i].zw; if (dot(q, q) < 1.0) discard; }
  else if (abs(l.x) < poolA[i].z && abs(l.y) < poolA[i].w) discard; }`);
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';
    this.updateRegion(0, N - 1, 0, N - 1);
  }
  updateRegion(i0, i1, j0, j1) {
    const t = this.world.terrain, N = t.N, H = t.heights, S = t.soil;
    const pos = this.geo.attributes.position, col = this.geo.attributes.color;
    i0 = clamp(i0 - 1, 0, N - 1); j0 = clamp(j0 - 1, 0, N - 1); i1 = clamp(i1 + 1, 0, N - 1); j1 = clamp(j1 + 1, 0, N - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * N + i;
      pos.setY(k, H[k]);
      const c = SOIL_COLORS[S[k]] || SOIL_COLORS[0];
      const n = ((i * 73856093) ^ (j * 19349663)) % 100 / 100 * 0.12 - 0.06;
      // encostas íngremes ficam mais terrosas
      const sl = i > 0 && j > 0 && i < N - 1 && j < N - 1 ? Math.abs(H[k + 1] - H[k - 1]) + Math.abs(H[k + N] - H[k - N]) : 0;
      const rock = clamp((sl - 1.6) / 2, 0, 0.7);
      col.setXYZ(k, (c[0] + n) * (1 - rock) + 0.45 * rock, (c[1] + n) * (1 - rock) + 0.4 * rock, (c[2] + n * 0.5) * (1 - rock) + 0.35 * rock);
    }
    pos.needsUpdate = true; col.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere(); this.geo.computeBoundingBox();
  }
  setPools(pools) {
    let n = 0;
    for (const p of pools) {
      if (n >= MAX_POOLS) break;
      const round = p.shape === 'redonda' || p.shape === 'oval';
      const hw = (p.w / 2) + 0.15, hd = ((p.shape === 'redonda' ? p.w : p.d) / 2) + 0.15;
      this.uniforms.poolA.value[n].set(p.x, p.z, hw, hd);
      // rotação inversa (mundo -> local)
      this.uniforms.poolB.value[n].set(Math.cos(-p.rot), Math.sin(-p.rot), round ? 1 : 0, 0);
      n++;
    }
    this.uniforms.poolCount.value = n;
  }
  height(x, z) { return terrainHeight(this.world, x, z); }
}

// Raio x terreno por marcha (rápido; não usa a malha)
export function raycastTerrain(world, origin, dir, maxDist = 400) {
  let t = 0, step = 0.5, prevAbove = true;
  const p = new THREE.Vector3();
  for (let i = 0; i < 2000 && t < maxDist; i++) {
    p.copy(dir).multiplyScalar(t).add(origin);
    const h = terrainHeight(world, p.x, p.z);
    if (p.y < h) {
      // refina por bisseção
      let a = t - step, b = t;
      for (let k = 0; k < 12; k++) { const m = (a + b) / 2; p.copy(dir).multiplyScalar(m).add(origin); if (p.y < terrainHeight(world, p.x, p.z)) b = m; else a = m; }
      p.copy(dir).multiplyScalar(b).add(origin);
      return { point: p.clone(), distance: b };
    }
    t += step; step = Math.min(2, step * 1.04);
  }
  return null;
}
