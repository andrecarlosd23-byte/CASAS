// Ponto de entrada: tela inicial, identidade do jogador, conexão, laço principal e cópias de segurança locais.
import * as THREE from 'three';
import { SceneManager } from './scene.js';
import { Net } from './net.js';
import { Game } from './game.js';
import { Player, isTyping } from './player.js';
import { Tools } from './tools.js';
import { UI, h } from './ui.js';
import { AvatarEditor } from './editor.js';
import { setMaterialQuality } from './materials.js';
import { defaultAvatar } from '/shared/catalog.js';
import { LOT_PRESETS, TERRAIN_PRESETS, sanitizeAvatar } from '/shared/world.js';

// ---------- armazenamento local (preferências e cópias) ----------
const LS = {
  get(k, d) { try { const v = localStorage.getItem('viz3d.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('viz3d.' + k, JSON.stringify(v)); } catch {} },
};
const IDB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      try {
        const r = indexedDB.open('vizinhos3d', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('backups');
        r.onsuccess = () => { this.db = r.result; res(this.db); };
        r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
  },
  async put(k, v) { try { const db = await this.open(); await new Promise((res, rej) => { const tx = db.transaction('backups', 'readwrite'); tx.objectStore('backups').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } catch (e) { console.warn('backup local indisponível', e); } },
  async get(k) { try { const db = await this.open(); return await new Promise((res) => { const tx = db.transaction('backups'); const r = tx.objectStore('backups').get(k); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); } catch { return null; } },
};

function rid(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join(''); }
let identity = LS.get('identity');
if (!identity) { identity = { pid: 'p' + rid(15), secret: rid(32) }; LS.set('identity', identity); }
const profile = LS.get('profile', { name: '', avatar: defaultAvatar() });
profile.avatar = sanitizeAvatar(profile.avatar);

const app = {
  quality: LS.get('quality', 'medio'), showFps: LS.get('fps', false), mouseSens: LS.get('sens', 1),
  sm: null, net: null, game: null, player: null, tools: null, ui: null, storageKind: 'files',
};
window.__app = app; // útil para depuração/testes
setMaterialQuality(app.quality);
const editor = new AvatarEditor();
const startEl = document.getElementById('start');

// ---------- tela inicial ----------
function rememberWorld(id, name) {
  const list = LS.get('worlds', []).filter(w => w.id !== id);
  list.unshift({ id, name, last: Date.now() });
  LS.set('worlds', list.slice(0, 12));
}
function renderStart(msg) {
  const params = new URLSearchParams(location.search);
  const invite = (params.get('w') || '').toUpperCase();
  const worlds = LS.get('worlds', []);
  startEl.innerHTML = '';
  startEl.classList.remove('hidden');
  const nameInp = h('input', { value: profile.name, placeholder: 'Como o vizinho vai te ver', maxlength: 24 });
  const codeInp = h('input', { value: invite, placeholder: 'Código (6 letras)', maxlength: 6, class: 'code' });
  const wname = h('input', { value: profile.name ? `Bairro de ${profile.name}` : 'Nosso bairro', maxlength: 40 });
  const lot = h('select', {}, ...Object.entries(LOT_PRESETS).map(([k, v]) => h('option', { value: k, selected: k === 'medio' }, v.label)));
  const terr = h('select', {}, ...Object.entries(TERRAIN_PRESETS).map(([k, v]) => h('option', { value: k }, v)));
  const needName = () => { profile.name = nameInp.value.trim(); if (!profile.name) { nameInp.classList.add('err'); nameInp.focus(); return false; } LS.set('profile', profile); return true; };
  const fileInp = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
  fileInp.addEventListener('change', async () => {
    const f = fileInp.files[0]; if (!f) return;
    try { const w = JSON.parse(await f.text()); if (!needName()) return; go({ t: 'join', world: w.id, restore: w }); } catch { renderStart('Arquivo inválido.'); }
  });
  startEl.append(h('div', { class: 'start-card' },
    h('div', { class: 'logo' }, h('span', {}, '🏡'), h('div', {}, h('h1', {}, 'Vizinhos 3D'), h('p', {}, 'Construa sua casa do zero, lado a lado com um amigo, direto no navegador.'))),
    msg ? h('div', { class: 'alert' }, msg) : null,
    h('label', { class: 'field' }, h('span', {}, 'Seu nome'), nameInp),
    h('div', { class: 'cols' },
      h('section', {}, h('h3', {}, '➕ Criar mundo'), h('label', { class: 'field' }, h('span', {}, 'Nome do bairro'), wname),
        h('div', { class: 'row' }, h('label', { class: 'field' }, h('span', {}, 'Tamanho dos lotes'), lot), h('label', { class: 'field' }, h('span', {}, 'Relevo dos lotes'), terr)),
        h('button', { class: 'btn accent big', onclick: () => { if (needName()) go({ t: 'create', worldName: wname.value, lot: lot.value, terrain: terr.value }); } }, 'Criar mundo')),
      h('section', {}, h('h3', {}, '🔑 Entrar em um mundo existente'), h('label', { class: 'field' }, h('span', {}, 'Código do convite'), codeInp),
        h('button', { class: 'btn accent big', onclick: () => { if (needName() && /^[A-Z0-9]{6}$/i.test(codeInp.value.trim())) go({ t: 'join', world: codeInp.value.trim().toUpperCase() }); else codeInp.classList.add('err'); } }, 'Entrar'),
        h('h3', { class: 'mt' }, '✉ Convidar um amigo'),
        h('p', { class: 'desc' }, 'Crie (ou abra) um mundo e clique em “Convidar” no topo da tela. O link abre o jogo já com o código preenchido — sem IP, portas ou configurações.'))),
    worlds.length ? h('section', {}, h('h3', {}, '▶ Continuar jogando'), h('div', { class: 'worlds' }, ...worlds.map(w => h('button', { class: 'world', onclick: () => { if (needName()) go({ t: 'join', world: w.id }); } }, h('b', {}, w.name), h('code', {}, w.id), h('small', {}, new Date(w.last).toLocaleString('pt-BR')))))) : null,
    h('div', { class: 'row foot' }, h('button', { class: 'btn small', onclick: () => fileInp.click() }, '⬆ Restaurar de cópia (.json)'), fileInp,
      h('span', { class: 'desc' }, 'Sem dinheiro, compras ou desbloqueios: tudo liberado para criar.'))));
  if (invite) codeInp.focus();
}

function go(joinBase) {
  startEl.classList.add('hidden');
  editor.open({
    data: profile.avatar, name: profile.name, title: 'Crie seu personagem', confirmLabel: joinBase.t === 'create' ? 'Criar e entrar' : 'Entrar no mundo',
    onCancel: () => renderStart(),
    onConfirm: (data, name) => {
      profile.avatar = data; profile.name = name; LS.set('profile', profile);
      connect({ ...joinBase, pid: identity.pid, secret: identity.secret, name, avatar: data });
    },
  });
}

// ---------- conexão e jogo ----------
function connect(joinMsg) {
  const loading = document.getElementById('loading'); loading.classList.remove('hidden');
  loading.textContent = 'Conectando ao servidor…';
  if (!app.sm) app.sm = new SceneManager(document.getElementById('c'), app.quality);
  const net = app.net = new Net();
  let started = false;
  net.addEventListener('welcome', (e) => {
    const m = e.detail;
    app.storageKind = m.storage;
    loading.classList.add('hidden');
    rememberWorld(m.world.id, m.world.name);
    history.replaceState(null, '', `?w=${m.world.id}`);
    if (!started) { started = true; startGame(m); }
    else { app.game.load(m); app.ui.build(); app.ui.toast('Reconectado — mundo sincronizado', 'ok'); }
    for (const c of m.chat || []) app.ui.addChat(c);
    refreshSave();
    scheduleBackup();
  });
  net.addEventListener('error', async (e) => {
    const m = e.detail;
    loading.classList.add('hidden');
    if (started) { app.ui.toast(m.msg, 'warn'); return; }
    net.close();
    if (m.code === 'notfound' && joinMsg.world) {
      const bk = await IDB.get(joinMsg.world);
      if (bk) {
        renderStart(`O servidor não tem mais o mundo ${joinMsg.world}, mas existe uma cópia local salva em ${new Date(bk.savedAt).toLocaleString('pt-BR')}.`);
        startEl.querySelector('.start-card').insertBefore(h('button', { class: 'btn accent big', onclick: () => connect({ ...joinMsg, t: 'join', restore: bk.world }) }, '♻ Restaurar este mundo a partir da cópia local'), startEl.querySelector('.alert').nextSibling);
        return;
      }
    }
    renderStart(m.msg);
  });
  net.addEventListener('op', e => { app.game?.applyRemote(e.detail.op); });
  net.addEventListener('ack', e => { if (app.game) app.game.myMaxSeq = Math.max(app.game.myMaxSeq, e.detail.seq || 0); refreshSave(); });
  net.addEventListener('saved', e => { if (app.game) app.game.lastSavedSeq = e.detail.seq; refreshSave(); scheduleBackup(); });
  net.addEventListener('saveError', e => { app.ui?.setSave('err', '⚠ Falha ao salvar'); app.ui?.toast(e.detail.msg, 'warn'); });
  net.addEventListener('reject', e => { app.ui?.toast('Alteração recusada pelo servidor: ' + e.detail.msg, 'warn'); resync(); });
  net.addEventListener('move', e => {
    const m = e.detail, r = app.game?.remotes.get(m.pid); if (!r || !Array.isArray(m.p)) return;
    r.target.set(m.p[0], m.p[1], m.p[2]); r.yaw = m.r || 0; r.speed = m.s || 0; r.air = !!m.a;
  });
  net.addEventListener('avatar', e => {
    const m = e.detail, g = app.game; if (!g) return;
    const p = g.world.players[m.pid]; if (p) { p.avatar = m.avatar; p.name = m.name; }
    const r = g.remotes.get(m.pid); if (r) { r.avatar.setData(m.avatar); r.avatar.setName(m.name); }
    app.ui.updateOnline();
  });
  net.addEventListener('joined', e => {
    const m = e.detail, g = app.game; if (!g) return;
    const existed = !!g.world.players[m.pid];
    g.world.players[m.pid] = { ...(g.world.players[m.pid] || {}), ...m.player };
    if (!existed) { const pl = g.world.plots.find(p => p.id === m.player.plot); if (pl) pl.owner = m.pid; }
    g.online.add(m.pid); g.addRemote(m.pid); g.buildPlotMarkers();
    app.ui.toast(`${m.player.name} entrou no bairro`, 'ok'); app.ui.updateOnline();
    if (app.ui.cat === 'multi') app.ui.openCat('multi');
  });
  net.addEventListener('left', e => {
    const g = app.game; if (!g) return;
    g.online.delete(e.detail.pid); g.removeRemote(e.detail.pid);
    app.ui.toast(`${g.world.players[e.detail.pid]?.name || 'Vizinho'} saiu do bairro`); app.ui.updateOnline();
  });
  net.addEventListener('plots', e => { const g = app.game; if (!g) return; g.world.plots = e.detail.plots; g.buildPlotMarkers(); app.ui.toast('Permissões atualizadas'); if (app.ui.cat === 'multi') app.ui.openCat('multi'); app.ui.renderProps(); });
  net.addEventListener('chat', e => app.ui?.addChat(e.detail));
  net.addEventListener('disconnected', () => { app.ui?.setSave('err', '⚠ Offline — reconectando…'); if (!started) loading.textContent = 'Servidor indisponível — tentando novamente…'; });
  net.addEventListener('replaced', () => { app.ui?.toast('Você abriu este mundo em outra aba/janela. Esta foi desconectada.', 'warn', 15000); app.ui?.setSave('err', 'Desconectado'); });
  net.open(joinMsg);
}
function resync() { if (app.net?.connected) app.net.send(app.net.joinMsg); }
function refreshSave() {
  const g = app.game, ui = app.ui; if (!g || !ui) return;
  if (!app.net.connected) return ui.setSave('err', `⚠ Offline — ${app.net.pending.size} alteração(ões) aguardando`);
  if (app.net.pending.size > 0 || g.myMaxSeq > g.lastSavedSeq) return ui.setSave('saving', '● Salvando…');
  ui.setSave('ok', '✓ Salvo');
}
let backupTimer = null;
function scheduleBackup() {
  clearTimeout(backupTimer);
  backupTimer = setTimeout(() => { const w = app.game?.world; if (w) IDB.put(w.id, { savedAt: Date.now(), world: JSON.parse(JSON.stringify(w)) }); }, 4000);
}
app.exportBackup = () => {
  const w = app.game.world;
  const blob = new Blob([JSON.stringify(w)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `vizinhos3d-${w.id}-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
};
app.photo4k = () => {
  const g = app.game, sm = app.sm;
  app.ui.toast('Renderizando foto 4K…', '', 2000);
  setTimeout(() => {
    const hidden = [g.plotMarkers, app.tools.brush, app.tools.preview, ...g.selBoxes.values()].filter(Boolean).map(o => [o, o.visible]);
    hidden.forEach(([o]) => o.visible = false);
    try {
      const { url, width, height } = sm.capture(3840, 2160);
      const a = h('a', { href: url, download: `vizinhos3d-${g.world.id}-${width}x${height}.png` }); document.body.append(a); a.click(); a.remove();
      app.ui.toast(`Foto ${width}×${height} salva${app.quality !== 'ultra' ? ' — para máxima qualidade, ative o preset Ultra em ⚙' : ''}`, 'ok', 6000);
    } catch (e) { app.ui.toast('Não foi possível gerar a foto: ' + e.message, 'warn'); }
    hidden.forEach(([o, v]) => o.visible = v);
  }, 60);
};
app.setQuality = (q) => { LS.set('quality', q); try { sessionStorage.setItem('viz3d.resume', '1'); } catch {} location.reload(); };
app.setShowFps = (v) => { app.showFps = v; LS.set('fps', v); fpsEl.style.display = v ? 'block' : 'none'; };
app.setMouseSens = (v) => { app.mouseSens = v; LS.set('sens', v); if (app.player) app.player.sens = v; };
app.setMode = (m) => {
  const p = app.player; if (!p) return;
  p.setMode(m);
  if (m !== 'build') { app.tools.cancel(); app.game.clearSelection(); }
  app.ui.updateModeButtons();
};
app.goToPlot = (pl) => {
  const c = new THREE.Vector3((pl.x0 + pl.x1) / 2, 0, (pl.z0 + pl.z1) / 2);
  if (app.player.mode === 'build') app.player.focusBuild(c, 34);
  else { const sp = new THREE.Vector3((pl.x0 + pl.x1) / 2, 0, pl.z0 - 1.5); sp.y = app.game.physics.groundAt(sp.x, sp.z, 20).y; app.player.spawn(sp, 0); }
};
app.openAvatar = () => {
  editor.open({
    data: app.game.me.avatar, name: app.game.me.name, title: 'Editar personagem', confirmLabel: 'Salvar aparência', onCancel: () => {},
    onConfirm: (data, name) => {
      app.game.me.avatar = data; app.game.me.name = name; profile.avatar = data; profile.name = name; LS.set('profile', profile);
      app.player.setAvatar(data);
      app.net.send({ t: 'avatar', avatar: data, name, opId: 'av' + Date.now() });
      app.net.joinMsg.avatar = data; app.net.joinMsg.name = name;
      app.ui.toast('Aparência atualizada para o vizinho', 'ok');
    },
  });
};

const fpsEl = document.getElementById('fps');
function startGame(welcome) {
  const sm = app.sm;
  const me = { pid: identity.pid, name: welcome.world.players[identity.pid].name, avatar: welcome.world.players[identity.pid].avatar };
  const game = app.game = new Game(sm, app.net, me);
  game.load(welcome);
  game.physics.rebuild(game.world); game.physicsDirty = false;
  const canvas = document.getElementById('c');
  const player = app.player = new Player(game, canvas);
  player.sens = app.mouseSens;
  const uiProxy = {};
  const tools = app.tools = new Tools(game, player, canvas, uiProxy);
  const ui = app.ui = new UI(app);
  Object.assign(uiProxy, { onToolChanged: () => ui.onToolChanged(), onSnapChanged: v => ui.onSnapChanged(v), onVisChanged: () => ui.onVisChanged() });
  game.addEventListener('toast', e => ui.toast(e.detail.msg, e.detail.kind));
  game.addEventListener('saving', refreshSave);
  game.addEventListener('resync', resync);
  // posição inicial
  const mp = game.world.players[me.pid];
  const plot = game.myPlot();
  let spawn;
  if (mp.pos) spawn = new THREE.Vector3(mp.pos[0], mp.pos[1], mp.pos[2]);
  else spawn = plot ? game.spawnPoint(plot.id) : new THREE.Vector3(0, 0.05, 0);
  player.spawn(spawn, mp.pos?.[3] || 0);
  player.setMode('build');
  const focus = plot ? new THREE.Vector3((plot.x0 + plot.x1) / 2, 0, (plot.z0 + plot.z1) / 2) : new THREE.Vector3(0, 0, 10);
  player.focusBuild(focus, 38);
  ui.toast(plot ? `Bem-vindo! Seu lote é o ${plot.name} (${plot.id === 'A' ? 'à esquerda' : 'à direita'} de quem olha da rua).` : 'Os dois lotes já têm dono: você entrou como visitante.', 'ok', 7000);
  if (!plot) app.setMode('third');
  // teclas globais
  window.addEventListener('keydown', e => {
    if (isTyping(e)) return;
    if (e.code === 'Tab') { e.preventDefault(); app.setMode(player.mode === 'build' ? 'third' : 'build'); }
    if (e.code === 'KeyV' && player.mode !== 'build') app.setMode(player.mode === 'first' ? 'third' : 'first');
    if (e.code === 'Enter') { e.preventDefault(); ui.chatInput.focus(); }
    if (e.code === 'KeyE' && player.mode !== 'build') player.interact();
    if (e.code === 'F1') { e.preventDefault(); ui.toggleHelp(); }
  });
  window.addEventListener('beforeunload', (e) => { if (app.net.pending.size) { e.preventDefault(); e.returnValue = ''; } });
  // laço principal
  let last = performance.now(), frames = 0, fpsT = 0;
  const loop = () => {
    const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now;
    player.update(dt);
    game.update(dt, sm.camera.position);
    sm.followSun(player.mode === 'build' ? player.orbit.target : player.pos);
    sm.render();
    frames++; fpsT += dt; if (fpsT > 0.5) { if (app.showFps) fpsEl.textContent = `${Math.round(frames / fpsT)} FPS`; frames = 0; fpsT = 0; }
    requestAnimationFrame(loop);
  };
  fpsEl.style.display = app.showFps ? 'block' : 'none';
  loop();
}

// WebGL indisponível?
const testCanvas = document.createElement('canvas');
if (!(testCanvas.getContext('webgl2') || testCanvas.getContext('webgl'))) {
  startEl.innerHTML = '<div class="start-card"><h1>Vizinhos 3D</h1><p class="alert">Seu navegador não suporta WebGL. Atualize o Chrome/Edge/Firefox ou ative a aceleração de hardware.</p></div>';
} else {
  const params = new URLSearchParams(location.search);
  // retorno rápido após trocar a qualidade gráfica
  let resume = null; try { resume = sessionStorage.getItem('viz3d.resume'); sessionStorage.removeItem('viz3d.resume'); } catch {}
  const w = (params.get('w') || '').toUpperCase();
  if (resume && /^[A-Z0-9]{6}$/.test(w) && profile.name) connect({ t: 'join', world: w, pid: identity.pid, secret: identity.secret, name: profile.name, avatar: profile.avatar });
  else renderStart();
}
