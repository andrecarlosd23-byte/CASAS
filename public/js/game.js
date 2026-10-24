// Núcleo do jogo: estado do mundo, aplicação de operações (locais e remotas), malhas, seleção, desfazer/refazer.
import * as THREE from 'three';
import { applyOp, plotAt, canEditPlot, plotOfObject, levelBase } from '/shared/world.js';
import { LEVEL_H } from '/shared/catalog.js';
import { buildObject } from './builders.js';
import { TerrainView } from './terrain.js';
import { buildNeighborhood } from './scene.js';
import { Physics } from './physics.js';
import { Avatar } from './avatar.js';
import { disposeTree, textSprite } from './geom.js';
import { terrainHeight } from '/shared/world.js';
import { animateWater } from './materials.js';

export class Game extends EventTarget {
  constructor(sm, net, me) {
    super();
    this.sm = sm; this.net = net; this.me = me; // me = {pid, name, avatar}
    this.world = null;
    this.meshes = new Map();
    this.buildGroup = new THREE.Group(); this.buildGroup.name = 'construcoes';
    sm.scene.add(this.buildGroup);
    this.physics = new Physics();
    this.physicsDirty = true;
    this.level = 0; this.hideRoofs = false; this.hideUpper = false;
    this.selection = new Set();
    this.selBoxes = new Map();
    this.undoStack = []; this.redoStack = [];
    this.remotes = new Map(); // pid -> {avatar, pos, target, yaw, speed}
    this.online = new Set();
    this.anchors = [];
    this.lastSavedSeq = 0; this.myMaxSeq = 0;
  }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  // ---------- carregamento ----------
  load(welcome) {
    const first = !this.world;
    this.world = welcome.world;
    this.online = new Set(welcome.online);
    this.lastSavedSeq = welcome.savedSeq; this.myMaxSeq = 0;
    // limpa tudo
    for (const g of this.meshes.values()) { this.buildGroup.remove(g); disposeTree(g); }
    this.meshes.clear(); this.clearSelection();
    if (this.terrain) { this.sm.scene.remove(this.terrain.mesh); this.terrain.geo.dispose(); }
    if (this.hood) { this.sm.scene.remove(this.hood.group); }
    this.terrain = new TerrainView(this.world);
    this.sm.scene.add(this.terrain.mesh);
    this.hood = buildNeighborhood(this.world, this.sm.scene, this.sm.q);
    for (const o of Object.values(this.world.objects)) this.rebuild(o.id);
    this.refreshPools();
    this.physicsDirty = true;
    // jogadores remotos
    for (const [pid, r] of this.remotes) { this.sm.scene.remove(r.avatar.root); }
    this.remotes.clear();
    for (const pid of this.online) if (pid !== this.me.pid) this.addRemote(pid);
    this.collectAnchors();
    this.buildPlotMarkers();
    this.emit('loaded', { first });
  }
  get me_() { return this.world.players[this.me.pid]; }
  myPlot() { return this.world.plots.find(p => p.owner === this.me.pid) || null; }
  canEditAt(x, z) { const p = plotAt(this.world, x, z); return !!p && canEditPlot(this.world, this.me.pid, p); }
  canEditObj(o) { const p = plotOfObject(this.world, o); return !!p && canEditPlot(this.world, this.me.pid, p); }

  // ---------- malhas ----------
  rebuild(id) {
    const old = this.meshes.get(id);
    if (old) { this.buildGroup.remove(old); disposeTree(old); this.meshes.delete(id); }
    const o = this.world.objects[id];
    if (!o || o.type === 'opening') return;
    const g = buildObject(this.world, o);
    if (!g) return;
    g.userData.oid = id;
    this.buildGroup.add(g);
    this.meshes.set(id, g);
    this.applyVisibility(o, g);
    if (this.selection.has(id)) this.updateSelBox(id);
  }
  applyVisibility(o, g) {
    let vis = true;
    if (this.hideUpper && o.level > this.level) vis = false;
    if (this.hideRoofs && o.type === 'roof' && o.level >= this.level) vis = false;
    g.visible = vis;
  }
  refreshVisibility() {
    for (const [id, g] of this.meshes) this.applyVisibility(this.world.objects[id], g);
  }
  setLevel(l) { this.level = Math.max(0, Math.min(9, l)); this.refreshVisibility(); this.emit('level', this.level); }
  refreshPools() { this.terrain.setPools(Object.values(this.world.objects).filter(o => o.type === 'pool')); }
  collectAnchors() {
    this.anchors = [...(this.hood?.anchors || [])];
    for (const g of this.meshes.values()) g.traverse(c => { if (c.userData.lightAnchor) this.anchors.push(c); });
  }

  // ---------- operações ----------
  // Calcula a operação inversa (para desfazer) antes de aplicar
  inverseOf(op) {
    const W = this.world.objects;
    switch (op.k) {
      case 'add': return { k: 'remove', id: op.obj.id };
      case 'remove': {
        const o = W[op.id]; if (!o) return null;
        const ops = [{ k: 'add', obj: structuredClone(o) }];
        if (o.type === 'wall') for (const x of Object.values(W)) if (x.type === 'opening' && x.wall === o.id) ops.push({ k: 'add', obj: structuredClone(x) });
        return ops.length === 1 ? ops[0] : { k: 'batch', ops };
      }
      case 'update': {
        const o = W[op.id]; if (!o) return null;
        const props = {}; for (const k of Object.keys(op.props)) props[k] = structuredClone(o[k]);
        return { k: 'update', id: op.id, props };
      }
      case 'batch': { const inv = op.ops.map(x => this.inverseOf(x)).filter(Boolean).reverse(); return { k: 'batch', ops: inv }; }
      default: return null;
    }
  }
  // aplica uma operação feita por este jogador: otimista localmente + envio ao servidor
  doOp(op, { record = true, inverse = null } = {}) {
    let inv = inverse;
    try {
      if (record && !inv) inv = this.inverseOf(op);
      const before = this.snapshotRefs(op);
      const res = applyOp(this.world, op, this.me.pid, true);
      this.afterOp(op, res, before);
    } catch (e) {
      this.emit('toast', { msg: e.message, kind: 'warn' });
      return false;
    }
    this.net.sendOp(op);
    this.emit('saving');
    if (record && inv) { this.undoStack.push({ op: structuredClone(op), inv }); if (this.undoStack.length > 200) this.undoStack.shift(); this.redoStack = []; }
    return true;
  }
  applyRemote(op) {
    try {
      const before = this.snapshotRefs(op);
      const res = applyOp(this.world, op, null, false);
      this.afterOp(op, res, before);
    } catch (e) { console.warn('op remota falhou', e); this.emit('resync'); }
  }
  snapshotRefs(op) {
    const W = this.world.objects, out = [];
    const visit = (o) => {
      if (o.k === 'batch') return o.ops.forEach(visit);
      const id = o.k === 'add' ? o.obj.id : o.id;
      if (id && W[id]) { out.push(structuredClone(W[id])); if (W[id].type === 'wall') for (const x of Object.values(W)) if (x.type === 'opening' && x.wall === id) out.push(structuredClone(x)); }
      if (o.k === 'add') out.push(o.obj);
    };
    visit(op);
    return out;
  }
  afterOp(op, res, before) {
    const W = this.world.objects;
    const ids = new Set();
    const regions = [];
    const visit = (o, r) => {
      if (o.k === 'batch') return o.ops.forEach((x, i) => visit(x, r?.[i]));
      if (o.k === 'terrain' || o.k === 'heights') { if (r) regions.push(r); return; }
      if (Array.isArray(r)) r.forEach(id => ids.add(id)); else if (o.id) ids.add(o.id);
    };
    visit(op, res);
    for (const r of regions) if (r.i1 >= r.i0) this.terrain.updateRegion(r.i0, r.i1, r.j0, r.j1);
    if (regions.length) this.markersDirty = true;
    const walls = new Set(), floorLevels = new Set();
    let pools = false;
    const consider = (o) => {
      if (!o) return;
      if (o.type === 'opening') walls.add(o.wall);
      if (o.type === 'stairs') floorLevels.add(o.level + 1);
      if (o.type === 'pool') pools = true;
    };
    for (const o of before) consider(o);
    for (const id of ids) { consider(W[id]); this.rebuild(id); }
    for (const w of walls) if (!ids.has(w)) this.rebuild(w);
    if (floorLevels.size) for (const o of Object.values(W)) if (o.type === 'floor' && floorLevels.has(o.level)) this.rebuild(o.id);
    if (pools) this.refreshPools();
    for (const id of [...this.selection]) if (!W[id]) this.selection.delete(id);
    this.refreshSelBoxes();
    this.physicsDirty = true;
    this.collectAnchors();
    this.emit('changed', { ids: [...ids] });
  }
  undo() {
    const e = this.undoStack.pop(); if (!e) return this.emit('toast', { msg: 'Nada para desfazer' });
    if (this.doOp(e.inv, { record: false })) this.redoStack.push(e);
  }
  redo() {
    const e = this.redoStack.pop(); if (!e) return this.emit('toast', { msg: 'Nada para refazer' });
    if (this.doOp(e.op, { record: false })) this.undoStack.push(e);
  }
  pushUndo(op, inv) { this.undoStack.push({ op, inv }); this.redoStack = []; }

  // ---------- seleção ----------
  select(ids, additive = false) {
    if (!additive) this.clearSelection();
    for (const id of ids) {
      if (additive && this.selection.has(id)) { this.selection.delete(id); continue; }
      if (this.world.objects[id]) this.selection.add(id);
    }
    this.refreshSelBoxes();
    this.emit('selection', [...this.selection]);
  }
  clearSelection() {
    this.selection.clear();
    for (const b of this.selBoxes.values()) { this.sm.scene.remove(b); b.geometry.dispose(); }
    this.selBoxes.clear();
    this.emit('selection', []);
  }
  refreshSelBoxes() {
    for (const [id, b] of this.selBoxes) if (!this.selection.has(id)) { this.sm.scene.remove(b); b.geometry.dispose(); this.selBoxes.delete(id); }
    for (const id of this.selection) this.updateSelBox(id);
  }
  updateSelBox(id) {
    const o = this.world.objects[id];
    let target = this.meshes.get(id);
    if (o?.type === 'opening') { const wg = this.meshes.get(o.wall); target = null; wg?.traverse(c => { if (c.userData.openingId === id) target = c; }); }
    if (!target) return;
    let b = this.selBoxes.get(id);
    if (!b) { b = new THREE.BoxHelper(target, 0xffc531); b.material.depthTest = false; b.material.transparent = true; b.renderOrder = 999; this.selBoxes.set(id, b); this.sm.scene.add(b); }
    b.setFromObject(target);
  }

  // ---------- jogadores remotos ----------
  addRemote(pid) {
    if (pid === this.me.pid || this.remotes.has(pid)) return;
    const p = this.world.players[pid]; if (!p) return;
    const av = new Avatar(p.avatar, { name: p.name });
    const pos = p.pos ? new THREE.Vector3(p.pos[0], p.pos[1], p.pos[2]) : this.spawnPoint(p.plot);
    av.root.position.copy(pos);
    this.sm.scene.add(av.root);
    this.remotes.set(pid, { avatar: av, target: pos.clone(), yaw: p.pos?.[3] || 0, speed: 0, air: false });
  }
  removeRemote(pid) { const r = this.remotes.get(pid); if (r) { this.sm.scene.remove(r.avatar.root); this.remotes.delete(pid); } }
  spawnPoint(plotId) {
    const p = this.world.plots.find(x => x.id === plotId);
    const x = p ? (p.x0 + p.x1) / 2 : 0, z = p ? p.z0 + 2 : 5.5;
    return new THREE.Vector3(x, this.physics.world ? this.physics.groundAt(x, z, 50).y : 0.2, z);
  }

  // contorno tracejado e placa de cada lote (laranja = seu, azul = do vizinho)
  buildPlotMarkers() {
    if (this.plotMarkers) { this.sm.scene.remove(this.plotMarkers); this.plotMarkers.traverse(o => { o.geometry?.dispose(); o.material?.map?.dispose(); }); }
    const grp = new THREE.Group(); grp.name = 'lotes';
    for (const p of this.world.plots) {
      const pts = [];
      const edge = (x0, z0, x1, z1) => { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0))); for (let i = 0; i < n; i++) { const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n; pts.push(new THREE.Vector3(x, terrainHeight(this.world, x, z) + 0.07, z)); } };
      edge(p.x0, p.z0, p.x1, p.z0); edge(p.x1, p.z0, p.x1, p.z1); edge(p.x1, p.z1, p.x0, p.z1); edge(p.x0, p.z1, p.x0, p.z0); pts.push(pts[0].clone());
      const mine = p.owner === this.me.pid;
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: mine ? 0xffa53a : p.owner ? 0x5cc0ff : 0xffffff, dashSize: 0.8, gapSize: 0.45, transparent: true, opacity: 0.9 }));
      line.computeLineDistances(); grp.add(line);
      const owner = p.owner ? (this.world.players[p.owner]?.name || '?') + (mine ? ' (você)' : '') : 'livre';
      const lab = textSprite(`${p.name} · ${owner}`, { height: 0.45, bg: mine ? 'rgba(160,90,10,0.75)' : 'rgba(15,40,70,0.7)' });
      const cx = (p.x0 + p.x1) / 2; lab.position.set(cx, terrainHeight(this.world, cx, p.z0) + 2.4, p.z0 + 0.2); grp.add(lab);
    }
    this.plotMarkers = grp; this.sm.scene.add(grp); this.markersDirty = false;
  }

  update(dt, camPos) {
    if (!this.world) return;
    this.markerT = (this.markerT || 0) + dt;
    if (this.markersDirty && this.markerT > 0.6) { this.markerT = 0; this.buildPlotMarkers(); }
    if (this.physicsDirty) { this.physics.rebuild(this.world); this.physicsDirty = false; }
    for (const r of this.remotes.values()) {
      const root = r.avatar.root;
      const k = 1 - Math.exp(-dt * 10);
      root.position.lerp(r.target, k);
      let dy = r.yaw - root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      root.rotation.y += dy * k;
      r.avatar.update(dt, r.speed, r.air);
    }
    animateWater(performance.now() / 1000);
    this.sm.updateNightLights(this.anchors, camPos);
  }
}
