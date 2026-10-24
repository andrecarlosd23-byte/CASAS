// Editor de personagem com prévia 3D em tempo real.
import * as THREE from 'three';
import { Avatar } from './avatar.js';
import { AVATAR, AVATAR_LABELS, defaultAvatar } from '/shared/catalog.js';
import { sanitizeAvatar } from '/shared/world.js';
import { h } from './ui.js';

const SKINS = ['#f6dcc8', '#f1d3bd', '#e8c0a0', '#e4b896', '#d6a47e', '#c98e66', '#b97c56', '#a86f4c', '#8f5b3c', '#7d4f33', '#653f29', '#4a2e1f'];
const HAIRS = ['#0f0b09', '#2b1d14', '#4a3020', '#6b4a2b', '#8a6239', '#b88a54', '#d9b77a', '#e8d3a3', '#a03b22', '#c25b2d', '#9a9a9a', '#e6e6e6', '#3a5fc0', '#c04a8a'];
const EYES = ['#3b2a1d', '#5a3d25', '#6b5a2a', '#3d6b3a', '#3b6d8f', '#7a8a96', '#1d1d1d'];

export class AvatarEditor {
  constructor() {
    this.el = document.getElementById('editor');
  }
  open({ data, name, title = 'Seu personagem', confirmLabel = 'Entrar no mundo', onConfirm, onCancel }) {
    this.data = sanitizeAvatar(data || defaultAvatar());
    this.name = name || '';
    this.onConfirm = onConfirm; this.onCancel = onCancel;
    this.el.innerHTML = '';
    this.el.classList.remove('hidden');
    const canvas = h('canvas', { class: 'preview' });
    this.walk = false;
    const controls = h('div', { class: 'ed-controls' });
    this.controls = controls;
    const nameInp = h('input', { class: 'name', value: this.name, maxlength: 24, placeholder: 'Seu nome' });
    nameInp.addEventListener('input', () => { this.name = nameInp.value; });
    nameInp.addEventListener('keydown', e => e.stopPropagation());
    this.el.append(h('div', { class: 'ed-card' },
      h('div', { class: 'ed-left' }, canvas, h('div', { class: 'row center' },
        h('button', { class: 'btn small', onclick: () => { this.walk = !this.walk; } }, '▶ Andar / parar'),
        h('button', { class: 'btn small', onclick: () => { this.data = sanitizeAvatar({ ...defaultAvatar(Math.random()), ...this.randomize() }); this.refresh(); this.renderControls(); } }, '🎲 Aleatório')),
        h('p', { class: 'desc center' }, 'Arraste a prévia para girar · roda do mouse aproxima')),
      h('div', { class: 'ed-right' }, h('h2', {}, title), h('label', { class: 'field' }, h('span', {}, 'Nome'), nameInp), controls,
        h('div', { class: 'row end' }, onCancel ? h('button', { class: 'btn', onclick: () => this.close(true) }, 'Cancelar') : null,
          h('button', { class: 'btn accent big', onclick: () => { if (!this.name.trim()) { nameInp.focus(); nameInp.classList.add('err'); return; } this.close(false); } }, confirmLabel)))));
    this.setup3D(canvas);
    this.renderControls();
  }
  randomize() {
    const pick = a => a[Math.floor(Math.random() * a.length)];
    const fem = Math.random() < 0.5;
    return {
      base: fem ? 'feminino' : 'masculino', height: fem ? 1.55 + Math.random() * 0.2 : 1.66 + Math.random() * 0.22, build: 0.85 + Math.random() * 0.35,
      skin: pick(SKINS), hair: pick(fem ? ['longo', 'ondulado', 'cacheado', 'coque', 'rabo', 'tranças', 'medio', 'black', 'franja'] : ['curto', 'social', 'raspado', 'crespo', 'medio', 'careca', 'cacheado']), hairColor: pick(HAIRS.slice(0, 11)),
      beard: fem ? 'nenhuma' : pick(AVATAR.beard), top: pick(AVATAR.top), topColor: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'),
      bottom: pick(fem ? AVATAR.bottom : ['calca', 'jeans', 'bermuda', 'social']), bottomColor: pick(['#34495e', '#2c3e50', '#1f2a44', '#6b5a45', '#222222', '#7a6a55', '#8e2f2f', '#d9d4c7']),
      shoes: pick(AVATAR.shoes.filter(s => fem || s !== 'salto')), shoesColor: pick(['#f2f2f2', '#222222', '#6b4a2b', '#8a2f2f', '#2f4f8a']),
      glasses: Math.random() < 0.25, hat: Math.random() < 0.2 ? pick(AVATAR.hat.slice(1)) : 'nenhum', watch: Math.random() < 0.4, bag: Math.random() < 0.2,
      faceW: Math.random(), jaw: Math.random(), eyeSize: Math.random(), nose: Math.random(), mouth: Math.random(), brows: Math.random(), eyeColor: pick(EYES),
    };
  }
  setup3D(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio)); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = true;
    const scene = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
    this.camDist = 3.6; this.yaw = 0.35;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7d6a, 1.1));
    const key = new THREE.DirectionalLight(0xfff1e0, 2.4); key.position.set(2, 4, 3); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); scene.add(key);
    const rim = new THREE.DirectionalLight(0xb8d4ff, 1.2); rim.position.set(-3, 2.5, -2); scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.2, 48), new THREE.MeshStandardMaterial({ color: 0xd9d4cc, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    this.avatar = new Avatar(this.data); scene.add(this.avatar.root);
    let drag = null;
    canvas.addEventListener('pointerdown', e => { drag = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (drag !== null) { this.yaw += (e.clientX - drag) * 0.01; drag = e.clientX; } });
    canvas.addEventListener('pointerup', () => drag = null);
    canvas.addEventListener('wheel', e => { e.preventDefault(); this.camDist = THREE.MathUtils.clamp(this.camDist + Math.sign(e.deltaY) * 0.3, 1.2, 6); }, { passive: false });
    let last = performance.now();
    const loop = () => {
      if (!this.renderer) return;
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
      const w = canvas.clientWidth, hgt = canvas.clientHeight;
      if (canvas.width !== Math.floor(w * r.getPixelRatio()) || canvas.height !== Math.floor(hgt * r.getPixelRatio())) { r.setSize(w, hgt, false); this.camera.aspect = w / hgt; this.camera.updateProjectionMatrix(); }
      const H = this.avatar.height, close = this.camDist < 2;
      const ty = close ? H * 0.9 : H * 0.55;
      this.camera.position.set(Math.sin(this.yaw) * this.camDist, ty + 0.1, Math.cos(this.yaw) * this.camDist);
      this.camera.lookAt(0, ty, 0);
      this.avatar.update(dt, this.walk ? 1.3 : 0, false);
      r.render(scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }
  refresh() { this.avatar.setData(this.data); }
  set(k, v) { this.data[k] = v; this.data = sanitizeAvatar(this.data); this.refresh(); }
  renderControls() {
    const c = this.controls, d = this.data; c.innerHTML = '';
    const sel = (label, key, vals) => { const s = h('select', { onchange: () => this.set(key, s.value) }, ...vals.map(v => h('option', { value: v, selected: d[key] === v }, AVATAR_LABELS[v] || v))); return h('label', { class: 'field' }, h('span', {}, label), s); };
    const rng = (label, key, min, max, step) => { const i = h('input', { type: 'range', min, max, step, value: d[key] }); i.addEventListener('input', () => this.set(key, +i.value)); return h('label', { class: 'field' }, h('span', {}, label), i); };
    const col = (label, key, sw) => {
      const i = h('input', { type: 'color', value: d[key] }); i.addEventListener('input', () => this.set(key, i.value));
      return h('label', { class: 'field' }, h('span', {}, label), h('div', { class: 'row wrap' }, i, ...(sw || []).map(s => h('button', { class: 'sw', style: `background:${s}`, onclick: (e) => { e.preventDefault(); i.value = s; this.set(key, s); } }))));
    };
    const chk = (label, key) => { const i = h('input', { type: 'checkbox', checked: d[key] }); i.addEventListener('change', () => this.set(key, i.checked)); return h('label', { class: 'field check' }, i, h('span', {}, label)); };
    const tab = (name, ...els) => h('details', { open: name === 'Corpo' }, h('summary', {}, name), h('div', { class: 'grid2' }, ...els));
    c.append(
      tab('Corpo', sel('Base corporal', 'base', AVATAR.base), rng('Altura', 'height', 1.45, 2.05, 0.01), rng('Físico', 'build', 0.75, 1.35, 0.01), col('Tom de pele', 'skin', SKINS)),
      tab('Rosto', rng('Largura do rosto', 'faceW', 0, 1, 0.01), rng('Queixo / mandíbula', 'jaw', 0, 1, 0.01), rng('Olhos', 'eyeSize', 0, 1, 0.01), col('Cor dos olhos', 'eyeColor', EYES), rng('Nariz', 'nose', 0, 1, 0.01), rng('Boca', 'mouth', 0, 1, 0.01), rng('Sobrancelhas', 'brows', 0, 1, 0.01), sel('Barba e bigode', 'beard', AVATAR.beard)),
      tab('Cabelo', sel('Corte / penteado', 'hair', AVATAR.hair), col('Cor do cabelo', 'hairColor', HAIRS)),
      tab('Roupas', sel('Parte de cima', 'top', AVATAR.top), col('Cor de cima', 'topColor', ['#f2f2f2', '#222222', '#2f5d8a', '#c0504d', '#3d7a4a', '#e8b04a', '#7a4a8a', '#d9c9a0']),
        sel('Parte de baixo / vestido', 'bottom', AVATAR.bottom), col('Cor de baixo', 'bottomColor', ['#34495e', '#1f2a44', '#222222', '#6b5a45', '#d9d4c7', '#8e2f2f', '#2f6b5a', '#c06a8a'])),
      tab('Calçados e acessórios', sel('Calçado', 'shoes', AVATAR.shoes), col('Cor do calçado', 'shoesColor', ['#f2f2f2', '#222222', '#6b4a2b', '#8a2f2f']), sel('Chapéu / boné', 'hat', AVATAR.hat), col('Cor do chapéu', 'hatColor'),
        chk('Óculos', 'glasses'), chk('Relógio', 'watch'), chk('Bolsa', 'bag'), col('Cor da bolsa', 'accColor')));
  }
  close(cancel) {
    cancelAnimationFrame(this.raf);
    this.renderer?.dispose(); this.renderer?.forceContextLoss(); this.renderer = null;
    this.el.classList.add('hidden'); this.el.innerHTML = '';
    if (cancel) this.onCancel?.(); else this.onConfirm?.(this.data, this.name.trim());
  }
}
