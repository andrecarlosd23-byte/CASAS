// Personagem local: movimento, gravidade, colisões e câmeras (construção livre, 3ª pessoa, 1ª pessoa).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { Avatar } from './avatar.js';
import { WORLD_SIZE } from '/shared/world.js';

export class Player {
  constructor(game, canvas) {
    this.game = game; this.canvas = canvas;
    const sm = game.sm;
    this.camera = sm.camera;
    this.avatar = new Avatar(game.me.avatar, {});
    sm.scene.add(this.avatar.root);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = 0; this.speed = 0;
    this.onGround = true; this.air = false;
    this.mode = 'build'; // build | third | first
    this.camYaw = 0; this.camPitch = -0.25; this.camDist = 4.2;
    this.keys = new Set();
    this.orbit = new OrbitControls(this.camera, canvas);
    this.orbit.enableDamping = true; this.orbit.dampingFactor = 0.12;
    this.orbit.maxPolarAngle = Math.PI * 0.495; this.orbit.minDistance = 2; this.orbit.maxDistance = 160;
    this.orbit.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.orbit.keys = {};
    this.lastSend = 0; this.lastSent = '';
    this.camRay = new THREE.Raycaster();
    window.addEventListener('keydown', e => { if (isTyping(e)) return; this.keys.add(e.code); });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousemove', e => this.onMouse(e));
    canvas.addEventListener('click', () => { if (this.mode !== 'build' && document.pointerLockElement !== canvas) canvas.requestPointerLock?.(); });
    canvas.addEventListener('wheel', e => { if (this.mode === 'third') { this.camDist = THREE.MathUtils.clamp(this.camDist + Math.sign(e.deltaY) * 0.5, 1.6, 12); } }, { passive: true });
  }
  spawn(pos, yaw = 0) {
    this.pos.copy(pos); this.yaw = yaw; this.camYaw = yaw + Math.PI;
    this.avatar.root.position.copy(pos); this.avatar.root.rotation.y = yaw;
  }
  setAvatar(data) { this.avatar.setData(data); }
  setMode(mode) {
    this.mode = mode;
    this.orbit.enabled = mode === 'build';
    if (mode === 'build') {
      if (document.pointerLockElement) document.exitPointerLock();
      this.orbit.target.copy(this.pos).add(new THREE.Vector3(0, 1, 0));
      this.camera.position.copy(this.pos).add(new THREE.Vector3(-14, 16, -16));
    } else {
      this.camYaw = this.yaw + Math.PI; this.camPitch = mode === 'first' ? 0 : -0.25;
    }
    this.avatar.root.visible = true;
  }
  focusBuild(target, dist = 30) {
    this.orbit.target.copy(target);
    const dir = new THREE.Vector3(-0.5, 0.75, -0.6).normalize();
    this.camera.position.copy(target).addScaledVector(dir, dist);
  }
  onMouse(e) {
    if (this.mode === 'build') return;
    const locked = document.pointerLockElement === this.canvas;
    if (!locked && !(e.buttons & 2) && !(e.buttons & 1)) return;
    const k = this.sens || 1;
    this.camYaw -= e.movementX * 0.0025 * k;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch - e.movementY * 0.0022 * k, -1.3, 1.2);
  }
  interact() {
    // abre/fecha a porta ou janela mais próxima à frente
    const g = this.game, W = g.world.objects;
    let best = null, bd = 2.2;
    for (const o of Object.values(W)) {
      if (o.type !== 'opening') continue;
      const w = W[o.wall]; if (!w) continue;
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); const t = Math.min(1, Math.max(0, o.u / L));
      const x = w.a[0] + (w.b[0] - w.a[0]) * t, z = w.a[1] + (w.b[1] - w.a[1]) * t;
      const y = w.level * 3 + w.y0 + o.sill;
      const d = Math.hypot(x - this.pos.x, z - this.pos.z) + Math.abs(y + 0.8 - (this.pos.y + 1)) * 0.5;
      if (d < bd) { bd = d; best = o; }
    }
    if (!best) return false;
    this.avatar.interact = 1;
    g.doOp({ k: 'door', id: best.id, open: !best.open }, { record: false });
    return true;
  }
  update(dt) {
    const g = this.game, ph = g.physics;
    if (!ph.world) return;
    const k = this.keys;
    const exploring = this.mode !== 'build';
    let mx = 0, mz = 0;
    if (exploring) {
      if (k.has('KeyW') || k.has('ArrowUp')) mz += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) mz -= 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) mx += 1;
      if (k.has('KeyD') || k.has('ArrowRight')) mx -= 1;
    }
    const run = k.has('ShiftLeft') || k.has('ShiftRight');
    const ground0 = ph.groundAt(this.pos.x, this.pos.z, this.pos.y);
    const maxSpeed = (run ? 5.2 : 1.9) * (ground0.water ? 0.45 : 1);
    const fwdYaw = this.camYaw + Math.PI;
    let target = new THREE.Vector3();
    if (mx || mz) {
      const len = Math.hypot(mx, mz); mx /= len; mz /= len;
      const sx = Math.sin(fwdYaw), cz = Math.cos(fwdYaw);
      target.set(sx * mz + cz * mx, 0, cz * mz - sx * mx).multiplyScalar(maxSpeed);
      const wantYaw = Math.atan2(target.x, target.z);
      let dy = wantYaw - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * Math.min(1, dt * (this.mode === 'first' ? 30 : 10));
    }
    const accel = this.onGround ? 12 : 3;
    this.vel.x += (target.x - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (target.z - this.vel.z) * Math.min(1, accel * dt);
    if (exploring && k.has('Space') && this.onGround) { this.vel.y = 4.6; this.onGround = false; }
    this.vel.y -= 14 * dt;
    if (ground0.water) this.vel.y = Math.max(this.vel.y, -1.5);
    const next = this.pos.clone().addScaledVector(this.vel, dt);
    const h = this.avatar.height;
    ph.collide(next, 0.28, Math.max(next.y, this.pos.y) + 0.3, h - 0.3);
    const half = WORLD_SIZE / 2 - 1;
    next.x = THREE.MathUtils.clamp(next.x, -half, half); next.z = THREE.MathUtils.clamp(next.z, -half, half);
    const gr = ph.groundAt(next.x, next.z, Math.max(this.pos.y, next.y));
    if (next.y <= gr.y) {
      // subida suave em degraus
      next.y = this.onGround ? THREE.MathUtils.lerp(this.pos.y, gr.y, Math.min(1, dt * 18)) : gr.y;
      if (Math.abs(next.y - gr.y) < 0.02) next.y = gr.y;
      this.vel.y = 0; this.onGround = true;
    } else if (next.y - gr.y < 0.08 && this.vel.y <= 0) { next.y = gr.y; this.vel.y = 0; this.onGround = true; }
    else this.onGround = false;
    this.speed = Math.hypot(next.x - this.pos.x, next.z - this.pos.z) / Math.max(dt, 1e-4);
    this.pos.copy(next);
    const root = this.avatar.root;
    root.position.copy(this.pos); root.rotation.y = this.yaw;
    this.air = !this.onGround && (this.pos.y - gr.y) > 0.3;
    this.avatar.update(dt, this.speed, this.air);
    this.updateCamera(dt);
    // rede (12 Hz)
    const now = performance.now();
    if (now - this.lastSend > 80) {
      const p = [round2(this.pos.x), round2(this.pos.y), round2(this.pos.z)];
      const sig = p.join(',') + ',' + round2(this.yaw) + ',' + (this.speed > 0.1 ? 1 : 0);
      if (sig !== this.lastSent || now - this.lastSend > 2000) {
        g.net.send({ t: 'move', p, r: round2(this.yaw), s: round2(this.speed), a: this.air ? 1 : 0 });
        this.lastSent = sig; this.lastSend = now;
      }
    }
  }
  updateCamera(dt) {
    const cam = this.camera;
    if (this.mode === 'build') {
      // WASD/QE movimentam a câmera livre
      const k = this.keys, mv = new THREE.Vector3();
      const fwd = new THREE.Vector3().subVectors(this.orbit.target, cam.position); fwd.y = 0; fwd.normalize();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
      if (k.has('KeyW')) mv.add(fwd); if (k.has('KeyS')) mv.sub(fwd);
      if (k.has('KeyD')) mv.add(right); if (k.has('KeyA')) mv.sub(right);
      if (mv.lengthSq()) {
        const sp = (k.has('ShiftLeft') ? 40 : 16) * dt * Math.max(0.5, cam.position.distanceTo(this.orbit.target) / 25);
        mv.normalize().multiplyScalar(sp); cam.position.add(mv); this.orbit.target.add(mv);
      }
      this.orbit.update();
      return;
    }
    const h = this.avatar.height;
    const head = this.pos.clone().add(new THREE.Vector3(0, h * 0.93, 0));
    const dir = new THREE.Vector3(Math.sin(this.camYaw) * Math.cos(this.camPitch), Math.sin(-this.camPitch), Math.cos(this.camYaw) * Math.cos(this.camPitch));
    if (this.mode === 'first') {
      this.avatar.joints.head.visible = false;
      cam.position.copy(head).addScaledVector(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), 0.12);
      cam.lookAt(cam.position.clone().sub(dir));
      this.yaw = this.camYaw + Math.PI; // corpo acompanha a câmera
      return;
    }
    this.avatar.joints.head.visible = true;
    const pivot = head.clone().add(new THREE.Vector3(0, 0.1, 0));
    let dist = this.camDist;
    // evita que a câmera atravesse paredes
    this.camRay.set(pivot, dir); this.camRay.far = dist;
    const hits = this.camRay.intersectObjects(this.game.buildGroup.children, true).filter(h => h.object.visible && !h.object.material?.transparent);
    if (hits.length) dist = Math.max(0.5, hits[0].distance - 0.25);
    const want = pivot.clone().addScaledVector(dir, dist);
    const tg = this.game.terrain.height(want.x, want.z) + 0.3;
    if (want.y < tg) want.y = tg;
    cam.position.lerp(want, 1 - Math.exp(-dt * 20));
    cam.lookAt(pivot);
  }
}
function round2(v) { return Math.round(v * 100) / 100; }
export function isTyping(e) { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); }
