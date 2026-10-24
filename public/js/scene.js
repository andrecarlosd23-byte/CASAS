// Renderizador, céu, iluminação, configurações gráficas e elementos fixos do bairro (rua, calçadas, vegetação ao redor).
import * as THREE from 'three';
import { Sky } from 'three/addons/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { WORLD_SIZE, STREET, terrainHeight, rng, plotAt } from '/shared/world.js';
import { getMaterial, colorMaterial } from './materials.js';
import { boxUV, mesh } from './geom.js';
import { makeTree } from './items3d.js';

export const QUALITY = {
  baixo: { shadows: false, shadowSize: 512, pixelRatio: 0.85, antialias: false, trees: 120, fog: 260 },
  medio: { shadows: true, shadowSize: 1024, pixelRatio: 1, antialias: true, trees: 260, fog: 340 },
  alto:  { shadows: true, shadowSize: 2048, pixelRatio: 2, antialias: true, trees: 420, fog: 420 },
  // Ultra: resolução nativa até 4K (com supersampling em telas comuns), sombras 4096, oclusão de ambiente e bloom
  ultra: { shadows: true, shadowSize: 4096, pixelRatio: 3, minPixelRatio: 1.5, antialias: true, trees: 600, fog: 560, post: true },
};

export class SceneManager {
  constructor(canvas, quality = 'medio') {
    this.q = QUALITY[quality] || QUALITY.medio; this.quality = quality;
    const r = new THREE.WebGLRenderer({ canvas, antialias: this.q.antialias, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(Math.max(window.devicePixelRatio, this.q.minPixelRatio || 0), this.q.pixelRatio);
    r.setPixelRatio(this.pixelRatio);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.9;
    r.shadowMap.enabled = this.q.shadows; r.shadowMap.type = THREE.PCFSoftShadowMap;
    if (this.q.post) r.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.08, 1200);
    this.scene.fog = new THREE.Fog(0xcfdbe6, 60, this.q.fog);

    this.sky = new Sky(); this.sky.scale.setScalar(4000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 4; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.005; u.mieDirectionalG.value = 0.8;
    this.scene.add(this.sky);
    this.hemi = new THREE.HemisphereLight(0xdfeeff, 0x5d6b45, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
    this.sun.castShadow = this.q.shadows;
    this.sun.shadow.mapSize.set(this.q.shadowSize, this.q.shadowSize);
    const sc = this.sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 250;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.pmrem = new THREE.PMREMGenerator(r);
    this.envScene = new THREE.Scene();
    this.timeOfDay = 10.5;
    this.lightPool = [];
    this.setTime(this.timeOfDay);
    if (this.q.post) this.setupComposer();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }
  setupComposer() {
    const r = this.renderer, w = window.innerWidth, h = window.innerHeight;
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
    const c = this.composer = new EffectComposer(r, rt);
    c.addPass(new RenderPass(this.scene, this.camera));
    const ao = this.aoPass = new GTAOPass(this.scene, this.camera, w, h);
    ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.2, scale: 1, samples: 16 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    ao.blendIntensity = 0.9;
    c.addPass(ao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.22, 0.45, 0.9);
    c.addPass(this.bloom);
    c.addPass(new OutputPass());
  }
  render() {
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }
  resize(w = window.innerWidth, h = window.innerHeight) {
    this.renderer.setSize(w, h, false);
    if (this.composer) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); }
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  // Renderiza a cena atual em alta resolução (padrão 3840×2160) e devolve um PNG
  capture(width = 3840, height = 2160) {
    const r = this.renderer;
    const max = r.capabilities.maxTextureSize || 4096;
    const scale = Math.min(1, max / Math.max(width, height));
    width = Math.floor(width * scale); height = Math.floor(height * scale);
    const oldPR = r.getPixelRatio();
    r.setPixelRatio(1);
    this.resize(width, height);
    if (this.aoPass) this.aoPass.setSize(width, height);
    this.render();
    const url = r.domElement.toDataURL('image/png');
    r.setPixelRatio(oldPR);
    this.resize();
    return { url, width, height };
  }
  // hora do dia: 5..20h
  setTime(hour) {
    this.timeOfDay = hour;
    const t = (hour - 6) / 12; // 0 nascer, 1 pôr
    const elev = Math.sin(Math.PI * THREE.MathUtils.clamp(t, -0.08, 1.08)) * 62;
    const az = 100 + t * 160;
    const phi = THREE.MathUtils.degToRad(90 - elev), theta = THREE.MathUtils.degToRad(az);
    this.sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir);
    const day = THREE.MathUtils.clamp(elev / 25, 0, 1);
    this.night = 1 - THREE.MathUtils.clamp((elev + 4) / 14, 0, 1);
    const noShadow = !this.q.shadows;
    this.sun.intensity = 0.12 + day * (noShadow ? 1.5 : 2.1);
    this.sun.color.setHSL(0.09, 0.55, 0.62 + day * 0.3);
    this.hemi.intensity = 0.12 + day * (noShadow ? 0.45 : 0.55);
    this.renderer.toneMappingExposure = 0.5 + day * 0.22 + this.night * 0.2;
    const fogC = new THREE.Color().setHSL(0.58, 0.25, 0.12 + day * 0.7);
    this.scene.fog.color.copy(fogC);
    // reflexos: ambiente gerado a partir do céu
    if (this.envRT) this.envRT.dispose();
    const skyClone = new Sky(); skyClone.scale.setScalar(1000);
    for (const k of Object.keys(this.sky.material.uniforms)) skyClone.material.uniforms[k].value = this.sky.material.uniforms[k].value;
    this.envScene.clear(); this.envScene.add(skyClone);
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 1100);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.2 + day * 0.4;
  }
  followSun(target) {
    // sombra acompanha a área de interesse
    this.sun.position.copy(target).addScaledVector(this.sunDir, 120);
    this.sun.target.position.copy(target);
  }
  // luzes pontuais noturnas: limitadas às âncoras mais próximas para manter o desempenho
  updateNightLights(anchors, camPos) {
    const max = this.quality === 'baixo' ? 0 : this.quality === 'medio' ? 6 : 12;
    while (this.lightPool.length < max) { const l = new THREE.PointLight(0xffd59a, 0, 8, 2); l.castShadow = false; this.scene.add(l); this.lightPool.push(l); }
    const on = this.night > 0.15;
    let list = [];
    if (on) {
      const tmp = new THREE.Vector3();
      list = anchors.map(a => ({ a, p: a.getWorldPosition(tmp.clone()) })).filter(x => x.a.visible !== false);
      list.sort((x, y) => x.p.distanceToSquared(camPos) - y.p.distanceToSquared(camPos));
    }
    this.lightPool.forEach((l, i) => {
      const it = list[i];
      if (!it) { l.intensity = 0; return; }
      const cfg = it.a.userData.lightAnchor;
      l.position.copy(it.p); if (!it.a.userData.bulb) l.position.y += 0.2;
      l.color.set(cfg.color); l.distance = cfg.distance; l.intensity = cfg.intensity * this.night;
    });
    for (const a of anchors) if (a.material?.emissiveIntensity !== undefined && a.userData.bulb) a.material.emissiveIntensity = 0.4 + this.night * 2.2;
  }
}

// Elementos estáticos do bairro (não editáveis): rua, calçadas, meio-fio, postes, marcos dos lotes e mata ao redor.
export function buildNeighborhood(world, scene, quality) {
  const group = new THREE.Group(); group.name = 'bairro';
  const half = WORLD_SIZE / 2;
  const asphalt = getMaterial({ id: 'asfalto', color: '#3c3d3f', rough: 0.95, metal: 0, scale: 1 });
  const road = mesh(boxUV(WORLD_SIZE, 0.1, STREET.z1 - STREET.z0), asphalt, false); road.position.set(0, 0.0, 0); group.add(road);
  // faixa central tracejada
  const lineM = colorMaterial('#f2e8c9', 0.6);
  for (let x = -half + 2; x < half; x += 6) { const l = mesh(new THREE.PlaneGeometry(3, 0.14), lineM, false); l.rotation.x = -Math.PI / 2; l.position.set(x, 0.056, 0); group.add(l); }
  const walkM = getMaterial({ id: 'pedra_portuguesa', color: '#dedad2', rough: 0.9, metal: 0, scale: 1 });
  const curbM = colorMaterial('#bdbab3', 0.85);
  for (const s of [-1, 1]) {
    const zc = s * (STREET.z1 + STREET.walk / 2);
    const w = mesh(boxUV(WORLD_SIZE, 0.2, STREET.walk), walkM, false); w.position.set(0, 0.05, zc); group.add(w);
    const curb = mesh(boxUV(WORLD_SIZE, 0.24, 0.14), curbM, false); curb.position.set(0, 0.05, s * (STREET.z1 + 0.07)); group.add(curb);
  }
  // postes de rua
  const poleM = colorMaterial('#3a3d40', 0.5, 0.6);
  const lampM = colorMaterial('#fff3d6', 0.3, 0, { emissive: new THREE.Color('#ffdca0'), emissiveIntensity: 0.4 });
  const anchors = [];
  for (let x = -half + 10; x < half; x += 22) {
    const pz = STREET.z1 + 0.5;
    const pole = mesh(new THREE.CylinderGeometry(0.07, 0.1, 6.5, 8), poleM); pole.position.set(x, 3.25, pz); group.add(pole);
    const arm = mesh(boxUV(0.08, 0.08, 1.6), poleM); arm.position.set(x, 6.4, pz - 0.8); group.add(arm);
    const lamp = mesh(boxUV(0.5, 0.12, 0.25), lampM.clone()); lamp.position.set(x, 6.3, pz - 1.5); group.add(lamp);
    lamp.userData.lightAnchor = { color: '#ffd9a0', intensity: 22, distance: 22 }; lamp.userData.bulb = true; anchors.push(lamp);
  }
  // marcos de canto dos lotes e placas
  for (const p of world.plots) {
    for (const [x, z] of [[p.x0, p.z0], [p.x1, p.z0], [p.x0, p.z1], [p.x1, p.z1]]) {
      const m = mesh(boxUV(0.12, 0.6, 0.12), colorMaterial('#d8d2c4', 0.8)); m.position.set(x, terrainHeight(world, x, z) + 0.3, z); group.add(m);
    }
  }
  // árvores e mata ao redor (instanciadas para leveza)
  const R = rng(world.seed % 100000 + 11);
  const n = quality.trees;
  const kinds = ['arvore', 'pinheiro', 'arvore', 'palmeira', 'arbusto'];
  const protos = kinds.map((k, i) => makeTree(k, k === 'pinheiro' ? '#2f5a34' : k === 'palmeira' ? '#4f8a3a' : ['#4e7a32', '#3f6e2c', '#5a8436'][i % 3], 50 + i));
  const placements = kinds.map(() => []);
  let tries = 0;
  while (placements.flat().length < n && tries++ < n * 20) {
    const x = (R() - 0.5) * (WORLD_SIZE - 8), z = (R() - 0.5) * (WORLD_SIZE - 8);
    if (Math.abs(z) < STREET.z1 + STREET.walk + 2) continue;
    if (plotAt(world, x, z, 4)) continue;
    const y = terrainHeight(world, x, z);
    if (y > 32) continue;
    const k = Math.floor(R() * kinds.length);
    placements[k].push(new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.1, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28), new THREE.Vector3().setScalar(0.7 + R() * 0.7)));
  }
  protos.forEach((proto, k) => {
    if (!placements[k].length) return;
    proto.updateMatrixWorld(true);
    proto.traverse(child => {
      if (!child.isMesh) return;
      const im = new THREE.InstancedMesh(child.geometry, child.material, placements[k].length);
      im.castShadow = quality.shadows && k !== 4; im.receiveShadow = false;
      placements[k].forEach((mtx, i) => im.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(mtx, child.matrixWorld)));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      group.add(im);
    });
  });
  scene.add(group);
  return { group, anchors };
}
