// Ferramentas de construção: seleção/movimento, paredes, cômodos, pisos, telhados, aberturas, objetos, piscinas, água, relevo e pintura.
import * as THREE from 'three';
import { LEVEL_H, OPENINGS, ITEMS, ROOFS, MATERIALS } from '/shared/catalog.js';
import { newId, levelBase, sanitizeObject, terrainHeight, plotAt, canEditPlot, gridIndex, WORLD_SIZE, GRID_N } from '/shared/world.js';
import { buildObject, wallFrame, stairLength } from './builders.js';
import { raycastTerrain } from './terrain.js';
import { isTyping } from './player.js';

const ghostOk = new THREE.MeshBasicMaterial({ color: 0x3ec5ff, transparent: true, opacity: 0.38, depthWrite: false });
const ghostBad = new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.4, depthWrite: false });

export class Tools {
  constructor(game, player, canvas, ui) {
    this.game = game; this.player = player; this.canvas = canvas; this.ui = ui;
    this.tool = 'select';
    this.snap = true;
    this.rot = 0;
    this.opts = {
      wall: { h: LEVEL_H, t: 0.15, mat: { id: 'pintura', color: '#efe9df' }, matB: { id: 'pintura', color: '#f4f1ea' } },
      opening: { style: 'porta_simples' },
      floor: { t: 0.15, mat: { id: 'porcelanato', color: '#e3e0da' } },
      roof: { style: 'duas_aguas', pitch: 30, over: 0.5, mat: { id: 'telha_ceramica', color: '#b0532e' } },
      stairs: { style: 'macica', w: 1.1, mat: { id: 'madeira', color: '#c49a6c' } },
      column: { s: 0.25, shape: 'quadrado', mat: { id: 'concreto', color: '#a3a29d' } },
      item: { item: 'sofa', style: 'contemporaneo', color: null },
      pool: { shape: 'retangular', depth: 1.5, tile: '#3fa7c4', light: true },
      water: { shape: 'lago' },
      terrain: { mode: 'raise', r: 4, s: 0.25, soil: 0 },
      paint: { mat: { id: 'tijolo', color: '#a5532f', rough: 0.9, metal: 0, scale: 1 }, itemColor: '#8c8f93' },
    };
    this.ray = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.preview = null; this.start = null; this.chain = null; this.drag = null;
    this.brush = this.makeBrush(); game.sm.scene.add(this.brush); this.brush.visible = false;
    this.label = document.createElement('div'); this.label.className = 'measure'; document.body.appendChild(this.label);
    canvas.addEventListener('pointerdown', e => this.onDown(e));
    canvas.addEventListener('pointermove', e => this.onMove(e));
    window.addEventListener('pointerup', e => this.onUp(e));
    canvas.addEventListener('dblclick', () => { if (this.tool === 'wall') this.endChain(); });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => this.onKey(e));
  }
  get active() { return this.player.mode === 'build'; }
  setTool(t) {
    this.tool = t; this.cancel();
    this.brush.visible = false;
    this.canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';
    this.ui.onToolChanged?.(t);
  }
  cancel() {
    this.clearPreview(); this.start = null; this.chain = null; this.drag = null; this.label.style.display = 'none';
  }
  clearPreview() { if (this.preview) { this.game.sm.scene.remove(this.preview); this.preview.traverse(o => o.geometry?.dispose()); this.preview = null; } }
  showPreview(objData, ok = true) {
    this.clearPreview();
    const o = sanitizeObject(objData.type, { id: 'preview0', ...objData });
    if (!o) return null;
    const tmpWorld = { ...this.game.world, objects: { ...this.game.world.objects, preview0: o } };
    const g = buildObject(tmpWorld, o);
    if (!g) return null;
    g.traverse(c => { if (c.isMesh) { c.material = ok ? ghostOk : ghostBad; c.castShadow = false; } });
    this.preview = g; this.game.sm.scene.add(g);
    return o;
  }

  // ---------- raios ----------
  setMouse(e) {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.mouse, this.game.sm.camera);
  }
  pickObject() {
    const hits = this.ray.intersectObjects(this.game.buildGroup.children, true).filter(h => isVisible(h.object));
    for (const h of hits) {
      let o = h.object, openingId = null;
      while (o && o !== this.game.buildGroup) { if (o.userData.openingId && !openingId) openingId = o.userData.openingId; if (o.userData.oid) return { id: o.userData.oid, openingId, hit: h }; o = o.parent; }
    }
    return null;
  }
  // ponto no plano do pavimento atual (térreo usa o terreno)
  levelPoint() {
    const g = this.game;
    if (g.level === 0) {
      const t = raycastTerrain(g.world, this.ray.ray.origin, this.ray.ray.direction);
      return t ? t.point : null;
    }
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -levelBase(g.level));
    const p = new THREE.Vector3();
    return this.ray.ray.intersectPlane(plane, p) ? p : null;
  }
  surfacePoint() {
    // superfície mais próxima (objetos construídos ou terreno) para posicionar móveis e plantas
    const g = this.game;
    const hits = this.ray.intersectObjects(g.buildGroup.children, true).filter(h => isVisible(h.object) && h.face);
    const t = raycastTerrain(g.world, this.ray.ray.origin, this.ray.ray.direction);
    let best = t ? { point: t.point, distance: t.distance, normal: new THREE.Vector3(0, 1, 0), object: null } : null;
    for (const h of hits) {
      if (best && h.distance >= best.distance) break;
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
      best = { point: h.point, distance: h.distance, normal: n, object: h.object };
      break;
    }
    return best;
  }
  snapV(v) { if (!this.snap) return v; return Math.round(v * 2) / 2; }
  snapPoint(p) {
    if (!p) return p;
    const q = p.clone();
    // encaixe nas extremidades de paredes existentes
    let best = null, bd = 0.45;
    for (const o of Object.values(this.game.world.objects)) {
      if (o.type !== 'wall' || o.level !== this.game.level) continue;
      for (const e of [o.a, o.b]) { const d = Math.hypot(e[0] - p.x, e[1] - p.z); if (d < bd) { bd = d; best = e; } }
    }
    if (best) { q.x = best[0]; q.z = best[1]; return q; }
    q.x = this.snapV(p.x); q.z = this.snapV(p.z);
    return q;
  }
  canBuildAt(x, z) { return this.game.canEditAt(x, z); }
  baseY0() { return 0; }

  // ---------- eventos ----------
  onDown(e) {
    if (!this.active || e.button !== 0) return;
    this.setMouse(e);
    this.downAt = { x: e.clientX, y: e.clientY };
    const t = this.tool, g = this.game;
    if (t === 'select') {
      const pk = this.pickObject();
      const id = pk ? (pk.openingId || pk.id) : null;
      if (!id) { if (!e.shiftKey) g.clearSelection(); return; }
      if (e.shiftKey) { g.select([id], true); return; }
      if (!g.selection.has(id)) g.select([id]);
      const p0 = pk.hit.point.clone();
      this.drag = { p0, plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -p0.y), moved: false, ids: [...g.selection] };
      return;
    }
    if (t === 'wall' || t === 'beam') {
      const p = this.snapPoint(this.levelPoint()); if (!p) return;
      if (!this.chain) { this.chain = p; return; }
      this.placeLinear(this.chain, p, t);
      this.chain = p;
      return;
    }
    if (['room', 'floor', 'roof', 'pool', 'water'].includes(t)) {
      const p = this.snapPoint(this.levelPoint()); if (!p) return;
      this.start = p; return;
    }
    if (t === 'opening') return this.placeOpening();
    if (t === 'stairs' || t === 'column' || t === 'item') return this.placePoint();
    if (t === 'terrain') { this.stroke = { last: 0, undo: new Map(), h: null }; this.terrainDab(true); return; }
    if (t === 'paint') return this.paintAt(e);
  }
  onMove(e) {
    if (!this.active) { this.brush.visible = false; return; }
    this.setMouse(e);
    const t = this.tool, g = this.game;
    if (t === 'select' && this.drag) {
      const p = new THREE.Vector3();
      if (!this.ray.ray.intersectPlane(this.drag.plane, p)) return;
      let dx = p.x - this.drag.p0.x, dz = p.z - this.drag.p0.z;
      if (this.snap) { dx = Math.round(dx * 4) / 4; dz = Math.round(dz * 4) / 4; }
      if (!this.drag.moved && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) < 5) return;
      this.drag.moved = true; this.drag.dx = dx; this.drag.dz = dz;
      this.previewDrag(dx, dz);
      return;
    }
    if ((t === 'wall' || t === 'beam') && this.chain) {
      const p = this.snapPoint(this.levelPoint()); if (!p) return;
      const ok = this.canBuildAt(this.chain.x, this.chain.z) && this.canBuildAt(p.x, p.z);
      if (p.distanceTo(this.chain) > 0.1) {
        const o = t === 'wall' ? { type: 'wall', a: [this.chain.x, this.chain.z], b: [p.x, p.z], level: g.level, ...this.opts.wall }
          : { type: 'beam', a: [this.chain.x, this.chain.z], b: [p.x, p.z], level: g.level };
        this.showPreview(o, ok);
        this.showLabel(this.chain.clone().lerp(p, 0.5), `${Math.hypot(p.x - this.chain.x, p.z - this.chain.z).toFixed(2)} m`);
      }
      return;
    }
    if (this.start && ['room', 'floor', 'roof', 'pool', 'water'].includes(t)) {
      const p = this.snapPoint(this.levelPoint()); if (!p) return;
      const r = this.rectFrom(this.start, p);
      if (r.w < 0.3 || r.d < 0.3) return;
      const objs = this.rectObjects(t, r);
      const ok = objs.every(o => this.objInPlot(o));
      this.clearPreview();
      const grp = new THREE.Group();
      for (const o of objs) { const pv = this.showPreview(o, ok); if (this.preview) { grp.add(this.preview); this.preview = null; } }
      this.preview = grp; g.sm.scene.add(grp);
      this.showLabel(new THREE.Vector3(r.x, p.y, r.z), `${r.w.toFixed(2)} × ${r.d.toFixed(2)} m`);
      return;
    }
    if (t === 'opening') return this.hoverOpening();
    if (t === 'stairs' || t === 'column' || t === 'item') return this.hoverPoint();
    if (t === 'terrain') { this.updateBrush(); if (this.stroke && e.buttons & 1) this.terrainDab(false); return; }
  }
  onUp(e) {
    if (e.button !== 0) return;
    const t = this.tool, g = this.game;
    if (t === 'select' && this.drag) {
      const d = this.drag; this.drag = null;
      if (d.moved) this.commitDrag(d);
      return;
    }
    if (this.start && ['room', 'floor', 'roof', 'pool', 'water'].includes(t)) {
      if (e.target !== this.canvas) { this.start = null; this.clearPreview(); return; }
      this.setMouse(e);
      const p = this.snapPoint(this.levelPoint());
      const s = this.start; this.start = null; this.clearPreview(); this.label.style.display = 'none';
      if (!p) return;
      const r = this.rectFrom(s, p);
      if (r.w < 0.5 || r.d < 0.5) return this.toast('Arraste para definir o retângulo');
      const objs = this.rectObjects(t, r);
      if (!objs.every(o => this.objInPlot(o))) return this.toast('Fora dos limites do seu terreno', 'warn');
      const ops = [];
      if (t === 'pool') { const h = terrainHeight(g.world, r.x, r.z); ops.push({ k: 'terrain', mode: 'rect', x: r.x, z: r.z, w: r.w, d: r.d, rot: 0, h, margin: 1 }); objs[0].y = h; }
      for (const o of objs) ops.push({ k: 'add', obj: { id: newId(o.type[0]), ...o } });
      const op = ops.length === 1 ? ops[0] : { k: 'batch', ops };
      if (t === 'pool') {
        // relevo não tem desfazer automático: registra alturas anteriores
        const before = this.heightsSnapshot(r.x, r.z, Math.hypot(r.w, r.d) / 2 + 2);
        if (g.doOp(op, { record: false })) {
          const after = before.map(([k]) => [k, g.world.terrain.heights[k]]);
          g.pushUndo(op, { k: 'batch', ops: [{ k: 'remove', id: ops[1].obj.id }, { k: 'heights', pts: before }] });
          g.undoStack[g.undoStack.length - 1].op = { k: 'batch', ops: [{ k: 'heights', pts: after }, ops[1]] };
        }
      } else g.doOp(op);
      if (t === 'room') this.toast('Cômodo criado: 4 paredes + piso');
      return;
    }
    if (t === 'terrain' && this.stroke) {
      const st = this.stroke; this.stroke = null;
      if (st.undo.size) {
        const before = [...st.undo.entries()];
        const after = before.map(([k]) => [k, g.world.terrain.heights[k]]);
        g.pushUndo({ k: 'heights', pts: after }, { k: 'heights', pts: before });
      }
    }
  }
  onKey(e) {
    if (!this.active || isTyping(e)) return;
    const g = this.game;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.code === 'KeyZ') { e.preventDefault(); return e.shiftKey ? g.redo() : g.undo(); }
    if (ctrl && e.code === 'KeyY') { e.preventDefault(); return g.redo(); }
    if (ctrl && e.code === 'KeyD') { e.preventDefault(); return this.duplicate(); }
    if (e.code === 'Escape') { if (this.chain || this.start) this.cancel(); else { g.clearSelection(); this.setTool('select'); } return; }
    if (e.code === 'Delete' || e.code === 'Backspace') return this.deleteSelection();
    if (e.code === 'KeyR' || e.code === 'KeyE' || e.code === 'KeyQ') {
      const step = (e.shiftKey ? 90 : 15) * Math.PI / 180 * (e.code === 'KeyQ' ? -1 : 1);
      if (['stairs', 'item', 'column'].includes(this.tool)) { this.rot += step; this.hoverPoint(); }
      else if (this.tool === 'select' && e.code === 'KeyR') this.rotateSelection(step);
      return;
    }
    if (e.code === 'KeyG') { this.snap = !this.snap; this.ui.onSnapChanged?.(this.snap); this.toast(this.snap ? 'Grade/encaixe ativado' : 'Posicionamento livre'); }
    if (e.code === 'KeyT') { g.hideRoofs = !g.hideRoofs; g.refreshVisibility(); this.ui.onVisChanged?.(); }
    if (e.code === 'PageUp') g.setLevel(g.level + 1);
    if (e.code === 'PageDown') g.setLevel(g.level - 1);
  }
  endChain() { this.chain = null; this.clearPreview(); this.label.style.display = 'none'; }
  toast(msg, kind) { this.game.emit('toast', { msg, kind }); }
  showLabel(p, text) {
    const v = p.clone(); v.y += 0.3; v.project(this.game.sm.camera);
    if (v.z > 1) { this.label.style.display = 'none'; return; }
    this.label.style.display = 'block'; this.label.textContent = text;
    this.label.style.left = ((v.x + 1) / 2 * window.innerWidth) + 'px'; this.label.style.top = ((1 - v.y) / 2 * window.innerHeight) + 'px';
  }
  objInPlot(o) {
    const s = sanitizeObject(o.type, { id: 'chk00000', ...o }); if (!s) return false;
    return this.game.canEditObj(s);
  }

  // ---------- criação ----------
  placeLinear(a, b, type) {
    const g = this.game;
    if (a.distanceTo(b) < 0.1) return;
    const o = type === 'wall'
      ? { id: newId('w'), type: 'wall', a: [a.x, a.z], b: [b.x, b.z], level: g.level, ...structuredClone(this.opts.wall) }
      : { id: newId('v'), type: 'beam', a: [a.x, a.z], b: [b.x, b.z], level: g.level };
    if (!this.objInPlot(o)) return this.toast('Fora dos limites do seu terreno', 'warn');
    g.doOp({ k: 'add', obj: o });
  }
  rectFrom(a, b) { return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, w: Math.abs(b.x - a.x), d: Math.abs(b.z - a.z), x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) }; }
  rectObjects(t, r) {
    const L = this.game.level, o = this.opts;
    if (t === 'room') {
      const W = o.wall, pts = [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]];
      const walls = [];
      // ordem anti-horária: lado A (frente) voltado para fora
      for (let i = 0; i < 4; i++) { const a = pts[i], b = pts[(i + 1) % 4]; walls.push({ type: 'wall', a: [...a], b: [...b], level: L, h: W.h, t: W.t, mat: structuredClone(W.matB), matB: structuredClone(W.mat) }); }
      return [...walls, { type: 'floor', x: r.x, z: r.z, w: r.w, d: r.d, rot: 0, level: L, t: o.floor.t, mat: structuredClone(o.floor.mat) }];
    }
    if (t === 'floor') return [{ type: 'floor', x: r.x, z: r.z, w: r.w, d: r.d, rot: 0, level: L, t: o.floor.t, mat: structuredClone(o.floor.mat) }];
    if (t === 'roof') return [{ type: 'roof', x: r.x, z: r.z, w: r.w, d: r.d, rot: 0, level: L, style: o.roof.style, pitch: o.roof.pitch, over: o.roof.over, mat: structuredClone(o.roof.mat), matB: structuredClone(o.wall.mat) }];
    if (t === 'pool') return [{ type: 'pool', x: r.x, z: r.z, w: Math.max(1.5, r.w), d: Math.max(1.2, r.d), rot: 0, y: terrainHeight(this.game.world, r.x, r.z), depth: o.pool.depth, shape: o.pool.shape, tile: o.pool.tile, coping: '#e9e4da', light: o.pool.light }];
    if (t === 'water') {
      const w = this.game.world;
      const ys = [[r.x0, r.z], [r.x1, r.z], [r.x, r.z0], [r.x, r.z1]].map(([x, z]) => terrainHeight(w, x, z));
      return [{ type: 'water', x: r.x, z: r.z, w: r.w, d: r.d, rot: 0, y: Math.min(...ys) - 0.15, shape: o.water.shape, color: '#2e6f7e' }];
    }
    return [];
  }
  hoverOpening() {
    const pk = this.pickObject();
    const o = pk && this.game.world.objects[pk.id];
    if (!o || o.type !== 'wall') { this.clearPreview(); this.hoverWall = null; return; }
    const { L, dir } = wallFrame(o);
    const st = this.opts.opening.style, def = OPENINGS[st];
    let u = (pk.hit.point.x - o.a[0]) * dir[0] + (pk.hit.point.z - o.a[1]) * dir[1];
    if (this.snap) u = Math.round(u * 10) / 10;
    const w = Math.min(def.w, L - 0.1);
    u = Math.max(w / 2 + 0.05, Math.min(L - w / 2 - 0.05, u));
    const h = Math.min(def.h, o.h - def.sill - 0.1);
    this.hoverWall = { wall: o, u, w, h, sill: def.sill };
    // pré-visualização: caixa no vão
    this.clearPreview();
    const ok = this.game.canEditObj(o);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, o.t + 0.06), ok ? ghostOk : ghostBad);
    const base = levelBase(o.level) + o.y0;
    m.position.set(o.a[0] + dir[0] * u, base + def.sill + h / 2, o.a[1] + dir[1] * u);
    m.rotation.y = Math.atan2(-dir[1], dir[0]);
    this.preview = m; this.game.sm.scene.add(m);
    this.showLabel(m.position, `${def.label} · ${w.toFixed(2)} × ${h.toFixed(2)} m`);
  }
  placeOpening() {
    this.hoverOpening();
    const hw = this.hoverWall; if (!hw) return this.toast('Aponte para uma parede');
    if (!this.game.canEditObj(hw.wall)) return this.toast('Sem permissão nesta parede', 'warn');
    const st = this.opts.opening.style;
    this.game.doOp({ k: 'add', obj: { id: newId('a'), type: 'opening', wall: hw.wall.id, u: hw.u, w: hw.w, h: hw.h, sill: hw.sill, style: st, mat: OPENINGS[st].kind === 'window' ? { id: 'aluminio' } : { id: st === 'porta_vidro' ? 'aluminio' : 'madeira' } } });
  }
  pointObject(sp) {
    const g = this.game, t = this.tool, o = this.opts;
    let x = sp.point.x, z = sp.point.z, y = sp.point.y;
    if (this.snap && t !== 'item') { x = this.snapV(x); z = this.snapV(z); }
    else if (this.snap) { x = Math.round(x * 10) / 10; z = Math.round(z * 10) / 10; }
    const lvl = Math.max(0, Math.min(9, Math.round((y + 0.4) / LEVEL_H - 0.15)));
    if (t === 'stairs') return { type: 'stairs', x, z, rot: this.rot, w: o.stairs.w, level: g.level, steps: 16, style: o.stairs.style, mat: structuredClone(o.stairs.mat), y0: g.level === 0 ? Math.max(0, Math.round(terrainHeight(g.world, x, z) * 10) / 10) : 0 };
    if (t === 'column') return { type: 'column', x, z, level: g.level, s: o.column.s, h: LEVEL_H, shape: o.column.shape, mat: structuredClone(o.column.mat) };
    const def = ITEMS[o.item.item];
    let rot = this.rot;
    if (def.wall && sp.normal && Math.abs(sp.normal.y) < 0.5 && sp.object) {
      // itens de parede (quadros, cortinas): encostam na superfície e olham para fora
      rot = Math.atan2(sp.normal.x, sp.normal.z);
      x = sp.point.x + sp.normal.x * 0.03; z = sp.point.z + sp.normal.z * 0.03;
      y = levelBase(lvl);
      const wallObj = this.findOid(sp.object);
      if (wallObj?.type === 'wall') y = levelBase(wallObj.level) + wallObj.y0 + (wallObj.level === 0 ? 0.1 : 0);
    }
    if (def.ceiling) y = levelBase(Math.max(0, Math.round(y / LEVEL_H))) + LEVEL_H - 0.82;
    return { type: 'item', item: o.item.item, x, z, y, rot, sc: 1, level: lvl, style: o.item.style, color: o.item.color || def.color, color2: '#f2efe8' };
  }
  findOid(obj) { while (obj) { if (obj.userData?.oid) return this.game.world.objects[obj.userData.oid]; obj = obj.parent; } return null; }
  hoverPoint() {
    const sp = this.lastSurface = this.surfacePoint(); if (!sp) return this.clearPreview();
    const o = this.pointObject(sp);
    this.showPreview(o, this.objInPlot(o));
  }
  placePoint() {
    const sp = this.surfacePoint(); if (!sp) return;
    const o = this.pointObject(sp);
    if (!this.objInPlot(o)) return this.toast('Fora dos limites do seu terreno', 'warn');
    this.game.doOp({ k: 'add', obj: { id: newId(o.type[0]), ...o } });
  }

  // ---------- relevo ----------
  makeBrush() {
    const pts = []; for (let i = 0; i <= 48; i++) pts.push(new THREE.Vector3(Math.cos(i / 48 * Math.PI * 2), 0, Math.sin(i / 48 * Math.PI * 2)));
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffe066, depthTest: false, transparent: true }));
    l.renderOrder = 998; return l;
  }
  updateBrush() {
    const hit = raycastTerrain(this.game.world, this.ray.ray.origin, this.ray.ray.direction);
    if (!hit) { this.brush.visible = false; return; }
    this.brushPos = hit.point;
    const r = this.opts.terrain.r, pos = this.brush.geometry.attributes.position, w = this.game.world;
    for (let i = 0; i < pos.count; i++) { const a = i / 48 * Math.PI * 2; const x = hit.point.x + Math.cos(a) * r, z = hit.point.z + Math.sin(a) * r; pos.setXYZ(i, x, terrainHeight(w, x, z) + 0.08, z); }
    pos.needsUpdate = true; this.brush.geometry.computeBoundingSphere();
    this.brush.visible = true;
    this.brush.material.color.set(this.canBuildAt(hit.point.x, hit.point.z) ? 0xffe066 : 0xff4d4d);
  }
  heightsSnapshot(x, z, r) {
    const N = GRID_N, half = WORLD_SIZE / 2, H = this.game.world.terrain.heights, out = [];
    const [ci, cj] = gridIndex(x, z), rr = Math.ceil(r) + 1;
    for (let j = Math.max(0, cj - rr); j <= Math.min(N - 1, cj + rr); j++) for (let i = Math.max(0, ci - rr); i <= Math.min(N - 1, ci + rr); i++) {
      const k = j * N + i, px = -half + i, pz = -half + j;
      if (this.canBuildAt(px, pz)) out.push([k, H[k]]);
    }
    return out;
  }
  terrainDab(first) {
    const now = performance.now();
    if (!first && now - this.stroke.last < 70) return;
    this.updateBrush();
    const p = this.brushPos; if (!p) return;
    if (!this.canBuildAt(p.x, p.z)) { if (first) this.toast('Só é possível modificar o relevo do seu terreno', 'warn'); return; }
    this.stroke.last = now;
    const o = this.opts.terrain;
    if (this.stroke.h === null) this.stroke.h = terrainHeight(this.game.world, p.x, p.z);
    for (const [k, h] of this.heightsSnapshot(p.x, p.z, o.r)) if (!this.stroke.undo.has(k)) this.stroke.undo.set(k, h);
    const op = { k: 'terrain', mode: o.mode, x: p.x, z: p.z, r: o.r, s: o.s, h: this.stroke.h, soil: o.soil };
    this.game.doOp(op, { record: false });
    this.updateBrush();
  }

  // ---------- pintura ----------
  paintAt(e) {
    const pk = this.pickObject(); if (!pk) return;
    const g = this.game, id = pk.openingId || pk.id, o = g.world.objects[id];
    if (!g.canEditObj(o)) return this.toast('Sem permissão para alterar este objeto', 'warn');
    const mat = structuredClone(this.opts.paint.mat);
    if (o.type === 'item') return g.doOp({ k: 'update', id, props: { color: mat.color } });
    if (o.type === 'pool') return g.doOp({ k: 'update', id, props: { tile: mat.color } });
    if (o.type === 'water') return g.doOp({ k: 'update', id, props: { color: mat.color } });
    let key = 'mat';
    if (o.type === 'wall' && !pk.openingId) {
      const n = pk.hit.face.normal.clone().transformDirection(pk.hit.object.matrixWorld);
      const { normal } = wallFrame(o);
      const dot = n.x * normal[0] + n.z * normal[1];
      if (dot < -0.5) key = 'matB';
    }
    if (o.type === 'roof' && pk.hit.object.material?.[pk.hit.face.materialIndex]?.userData?.matKey?.startsWith('pintura') && pk.hit.face.materialIndex === 1) key = 'matB';
    g.doOp({ k: 'update', id, props: { [key]: mat } });
  }
  paintSelection() {
    const g = this.game, mat = structuredClone(this.opts.paint.mat), ops = [];
    for (const id of g.selection) {
      const o = g.world.objects[id]; if (!o || !g.canEditObj(o)) continue;
      if (o.type === 'item') ops.push({ k: 'update', id, props: { color: mat.color } });
      else if (o.type === 'pool') ops.push({ k: 'update', id, props: { tile: mat.color } });
      else if (o.type === 'water') ops.push({ k: 'update', id, props: { color: mat.color } });
      else ops.push({ k: 'update', id, props: o.type === 'wall' ? { mat, matB: structuredClone(mat) } : { mat } });
    }
    if (!ops.length) return this.toast('Selecione objetos que você pode editar');
    g.doOp({ k: 'batch', ops });
    this.toast(`Material aplicado a ${ops.length} objeto(s)`);
  }

  // ---------- edição da seleção ----------
  previewDrag(dx, dz) {
    const g = this.game;
    for (const id of this.drag.ids) {
      const o = g.world.objects[id];
      if (o?.type === 'opening') continue;
      const m = g.meshes.get(id); if (!m) continue;
      if (!m.userData.origin) m.userData.origin = m.position.clone();
      m.position.set(m.userData.origin.x + dx, m.userData.origin.y, m.userData.origin.z + dz);
    }
    for (const id of this.drag.ids) g.updateSelBox(id);
  }
  commitDrag(d) {
    const g = this.game, ops = [];
    for (const id of d.ids) { const m = g.meshes.get(id); if (m?.userData.origin) { m.position.copy(m.userData.origin); delete m.userData.origin; } }
    const dx = d.dx || 0, dz = d.dz || 0;
    if (!dx && !dz) return;
    for (const id of d.ids) {
      const o = g.world.objects[id]; if (!o) continue;
      if (o.type === 'opening') {
        const w = g.world.objects[o.wall]; const { dir } = wallFrame(w);
        ops.push({ k: 'update', id, props: { u: o.u + dx * dir[0] + dz * dir[1] } });
      } else if (o.type === 'wall' || o.type === 'beam') ops.push({ k: 'update', id, props: { a: [o.a[0] + dx, o.a[1] + dz], b: [o.b[0] + dx, o.b[1] + dz] } });
      else {
        const props = { x: o.x + dx, z: o.z + dz };
        if (o.type === 'item') { // acompanha o chão no destino
          const t = terrainHeight(g.world, props.x, props.z);
          const gr = g.physics.groundAt(props.x, props.z, o.y + 0.3).y;
          props.y = Math.abs(o.y - terrainHeight(g.world, o.x, o.z)) < 0.05 ? t : gr;
        }
        ops.push({ k: 'update', id, props });
      }
    }
    if (ops.length) g.doOp(ops.length === 1 ? ops[0] : { k: 'batch', ops });
  }
  deleteSelection() {
    const g = this.game; const ids = [...g.selection];
    if (!ids.length) return;
    const ops = ids.filter(id => g.world.objects[id]).map(id => ({ k: 'remove', id }));
    // remove aberturas das paredes que também serão removidas para evitar duplicidade
    const wallIds = new Set(ids.filter(id => g.world.objects[id]?.type === 'wall'));
    const filtered = ops.filter(op => { const o = g.world.objects[op.id]; return !(o.type === 'opening' && wallIds.has(o.wall)); });
    g.doOp(filtered.length === 1 ? filtered[0] : { k: 'batch', ops: filtered });
    g.clearSelection();
  }
  centroid(ids) {
    const W = this.game.world.objects; let sx = 0, sz = 0, n = 0;
    for (const id of ids) { const o = W[id]; if (!o || o.type === 'opening') continue; if (o.a) { sx += (o.a[0] + o.b[0]) / 2; sz += (o.a[1] + o.b[1]) / 2; } else { sx += o.x; sz += o.z; } n++; }
    return n ? [sx / n, sz / n] : null;
  }
  rotateSelection(ang) {
    const g = this.game, ids = [...g.selection], c = this.centroid(ids); if (!c) return;
    const rotP = (x, z) => { const dx = x - c[0], dz = z - c[1], cs = Math.cos(ang), sn = Math.sin(ang); return [c[0] + dx * cs + dz * sn, c[1] - dx * sn + dz * cs]; };
    const ops = [];
    for (const id of ids) {
      const o = g.world.objects[id]; if (!o || o.type === 'opening') continue;
      if (o.a) ops.push({ k: 'update', id, props: { a: rotP(...o.a), b: rotP(...o.b) } });
      else { const [x, z] = rotP(o.x, o.z); ops.push({ k: 'update', id, props: { x, z, rot: (o.rot || 0) + ang } }); }
    }
    if (ops.length) g.doOp(ops.length === 1 ? ops[0] : { k: 'batch', ops });
  }
  duplicate() {
    const g = this.game, W = g.world.objects, ops = [], newIds = [];
    for (const id of g.selection) {
      const o = W[id]; if (!o || o.type === 'opening') continue;
      const c = structuredClone(o); c.id = newId(o.type[0]);
      if (c.a) { c.a = [c.a[0] + 1, c.a[1] + 1]; c.b = [c.b[0] + 1, c.b[1] + 1]; } else { c.x += 1; c.z += 1; }
      ops.push({ k: 'add', obj: c }); newIds.push(c.id);
      if (o.type === 'wall') for (const x of Object.values(W)) if (x.type === 'opening' && x.wall === o.id) { const oc = structuredClone(x); oc.id = newId('a'); oc.wall = c.id; ops.push({ k: 'add', obj: oc }); }
    }
    if (!ops.length) return this.toast('Selecione algo para duplicar');
    if (g.doOp({ k: 'batch', ops })) g.select(newIds);
  }
}

function isVisible(o) { while (o) { if (!o.visible) return false; o = o.parent; } return true; }
