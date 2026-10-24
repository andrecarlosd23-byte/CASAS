// Interface do jogo (HUD): categorias de ferramentas, catálogo, propriedades, chat, presença, salvamento e configurações.
import { MATERIALS, OPENINGS, ROOFS, ITEMS, STYLES, STYLE_LABELS, LEVEL_H } from '/shared/catalog.js';
import { SCHEMA, SOILS, plotAt } from '/shared/world.js';
import { wallFrame } from './builders.js';

const $ = (sel, root = document) => root.querySelector(sel);
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'html') e.innerHTML = v; else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
};
export { h };

const CATS = [
  { id: 'select', icon: '⌖', label: 'Selecionar' },
  { id: 'terreno', icon: '⛰', label: 'Terreno' },
  { id: 'paredes', icon: '▥', label: 'Paredes' },
  { id: 'estrutura', icon: '⊞', label: 'Estrutura' },
  { id: 'aberturas', icon: '◫', label: 'Portas e janelas' },
  { id: 'telhados', icon: '⌂', label: 'Telhados' },
  { id: 'pisos', icon: '▦', label: 'Pisos' },
  { id: 'materiais', icon: '🖌', label: 'Materiais e cores' },
  { id: 'moveis', icon: '🛋', label: 'Móveis' },
  { id: 'decoracao', icon: '🖼', label: 'Decoração' },
  { id: 'jardim', icon: '🌳', label: 'Jardim e externo' },
  { id: 'piscinas', icon: '🏊', label: 'Piscinas' },
  { id: 'agua', icon: '💧', label: 'Rios e lagos' },
  { id: 'montanhas', icon: '🏔', label: 'Montanhas e relevo' },
  { id: 'luz', icon: '☀', label: 'Iluminação' },
];

const FIELD_LABELS = {
  h: 'Altura (m)', t: 'Espessura (m)', y0: 'Elevação extra (m)', level: 'Pavimento', w: 'Largura (m)', d: 'Profundidade (m)', rot: 'Rotação (°)',
  u: 'Posição na parede (m)', sill: 'Peitoril / base (m)', style: 'Modelo', open: 'Aberta', frame: 'Cor do batente', pitch: 'Inclinação (°)', over: 'Beiral (m)',
  steps: 'Degraus', s: 'Seção (m)', shape: 'Formato', sc: 'Escala', color: 'Cor principal', color2: 'Cor secundária', depth: 'Profundidade (m)',
  tile: 'Revestimento', coping: 'Borda', light: 'Iluminação subaquática', shallow: 'Área rasa', y: 'Altura do chão (m)', x: 'Posição X', z: 'Posição Z', mode: 'Tipo',
  mat: 'Material', matB: 'Material (lado B / interno)', item: 'Objeto',
};
const ENUM_LABELS = {
  ...Object.fromEntries(Object.entries(OPENINGS).map(([k, v]) => [k, v.label])),
  ...Object.fromEntries(Object.entries(ROOFS).map(([k, v]) => [k, v.label])),
  ...STYLE_LABELS,
  macica: 'Maciça', vazada: 'Vazada (metálica)', concreto: 'Concreto', quadrado: 'Quadrado', redondo: 'Redondo',
  retangular: 'Retangular', redonda: 'Redonda', oval: 'Oval', borda_infinita: 'Borda infinita', lago: 'Lago (orgânico)',
  piso: 'Piso', laje: 'Laje', fundacao: 'Fundação',
};
const TYPE_LABELS = { wall: 'Parede', opening: 'Porta/Janela', floor: 'Piso/Laje', roof: 'Telhado', stairs: 'Escada', column: 'Pilar', beam: 'Viga', item: 'Objeto', pool: 'Piscina', water: 'Lago / espelho d\'água' };
const SOIL_LABELS = ['Grama', 'Grama seca', 'Terra', 'Areia', 'Pedra', 'Grama escura'];

export class UI {
  constructor(app) {
    this.app = app; // {game, player, tools, sm, net, openAvatar, quality}
    this.root = $('#hud');
    this.build();
    const g = this.game;
    g.addEventListener('selection', () => this.renderProps());
    g.addEventListener('changed', (e) => { if (e.detail.ids.some(id => g.selection.has(id))) this.renderProps(); });
    g.addEventListener('level', () => this.updateLevel());
  }
  get game() { return this.app.game; } get tools() { return this.app.tools; } get player() { return this.app.player; }

  build() {
    const g = this.game;
    this.root.innerHTML = '';
    // barra superior
    this.status = h('span', { class: 'save-status' }, 'Conectando…');
    this.onlineEl = h('div', { class: 'online' });
    this.modeBtns = {};
    const modes = h('div', { class: 'modes' },
      ...[['build', '🏗 Construir'], ['third', '🚶 3ª pessoa'], ['first', '👁 1ª pessoa']].map(([m, l]) => (this.modeBtns[m] = h('button', { class: 'mode', title: 'Alternar modo (Tab)', onclick: () => this.app.setMode(m) }, l))));
    const top = h('div', { class: 'topbar' },
      h('div', { class: 'brand' }, h('b', {}, 'Vizinhos 3D'), h('span', { class: 'world-name' }, g.world.name), h('code', { class: 'world-code', title: 'Código do mundo' }, g.world.id)),
      h('button', { class: 'btn small accent', onclick: () => this.invite() }, '✉ Convidar'),
      this.onlineEl, modes,
      h('button', { class: 'btn small', onclick: () => this.app.openAvatar() }, '🧍 Personagem'),
      h('button', { class: 'btn small', title: 'Renderiza a vista atual em 3840×2160 e baixa como PNG', onclick: () => this.app.photo4k() }, '📷 Foto 4K'),
      h('button', { class: 'btn small', onclick: () => this.openSettings() }, '⚙'),
      h('button', { class: 'btn small', onclick: () => this.toggleHelp() }, '?'),
      this.status);
    // barra lateral de categorias
    this.catBtns = {};
    const side = h('div', { class: 'sidebar' }, ...CATS.map(c => (this.catBtns[c.id] = h('button', { class: 'cat', title: c.label, onclick: () => this.openCat(c.id) }, h('span', { class: 'ic' }, c.icon), h('span', { class: 'lb' }, c.label)))),
      h('div', { class: 'sep' }),
      h('button', { class: 'cat', title: 'Multiplayer', onclick: () => this.openCat('multi') }, h('span', { class: 'ic' }, '👥'), h('span', { class: 'lb' }, 'Multiplayer')),
      h('button', { class: 'cat', title: 'Salvamento', onclick: () => this.openCat('salvar') }, h('span', { class: 'ic' }, '💾'), h('span', { class: 'lb' }, 'Salvamento')));
    this.catBtns.multi = side.children[side.children.length - 2]; this.catBtns.salvar = side.lastChild;
    this.sub = h('div', { class: 'subpanel' });
    this.props = h('div', { class: 'props hidden' });
    // barra inferior
    this.levelEl = h('span', { class: 'level' });
    this.snapBtn = h('button', { class: 'tog', onclick: () => { this.tools.snap = !this.tools.snap; this.onSnapChanged(this.tools.snap); } }, '▦ Grade');
    this.roofBtn = h('button', { class: 'tog', onclick: () => { g.hideRoofs = !g.hideRoofs; g.refreshVisibility(); this.onVisChanged(); } }, '⌂ Ocultar telhados');
    this.upperBtn = h('button', { class: 'tog', onclick: () => { g.hideUpper = !g.hideUpper; g.refreshVisibility(); this.onVisChanged(); } }, '▤ Ocultar andares acima');
    const bottom = h('div', { class: 'bottombar' },
      h('button', { class: 'btn small', title: 'Pavimento abaixo (PageDown)', onclick: () => g.setLevel(g.level - 1) }, '▼'), this.levelEl,
      h('button', { class: 'btn small', title: 'Pavimento acima (PageUp)', onclick: () => g.setLevel(g.level + 1) }, '▲'),
      h('span', { class: 'divider' }), this.snapBtn, this.roofBtn, this.upperBtn, h('span', { class: 'divider' }),
      h('button', { class: 'btn small', title: 'Desfazer (Ctrl+Z)', onclick: () => g.undo() }, '↶ Desfazer'),
      h('button', { class: 'btn small', title: 'Refazer (Ctrl+Y)', onclick: () => g.redo() }, '↷ Refazer'));
    // chat
    this.chatLog = h('div', { class: 'chat-log' });
    this.chatInput = h('input', { class: 'chat-input', placeholder: 'Mensagem para o vizinho… (Enter)', maxlength: 300 });
    this.chatInput.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter' && this.chatInput.value.trim()) { this.app.net.send({ t: 'chat', text: this.chatInput.value.trim() }); this.chatInput.value = ''; }
      if (e.key === 'Escape') this.chatInput.blur();
    });
    const chat = h('div', { class: 'chat' }, this.chatLog, this.chatInput);
    this.toasts = h('div', { class: 'toasts' });
    this.hint = h('div', { class: 'hint' });
    this.help = h('div', { class: 'help hidden' }, h('h3', {}, 'Atalhos'), h('div', { html: `
      <p><b>Construir:</b> botão esquerdo usa a ferramenta · botão direito gira a câmera · roda aproxima · W A S D movem a câmera · Shift acelera</p>
      <p><b>Paredes:</b> clique no início e em cada canto; duplo clique ou Esc termina · <b>Cômodo/piso/telhado/piscina:</b> clique e arraste</p>
      <p><b>Seleção:</b> clique seleciona · Shift+clique soma · arraste move · R gira (Shift: 90°) · Ctrl+D duplica · Delete exclui</p>
      <p><b>Ao posicionar objetos:</b> Q / E giram · G liga/desliga a grade · T oculta telhados · PageUp/PageDown trocam o pavimento</p>
      <p><b>Explorar:</b> W A S D andam · Shift corre · Espaço pula · mouse olha (clique para travar o cursor) · E abre/fecha portas e janelas</p>
      <p><b>Geral:</b> Tab alterna Construir/3ª pessoa · V alterna 1ª/3ª pessoa · Enter abre o chat · Ctrl+Z / Ctrl+Y desfazem/refazem</p>` }),
      h('button', { class: 'btn small', onclick: () => this.toggleHelp() }, 'Fechar'));
    this.root.append(top, side, this.sub, this.props, bottom, chat, this.toasts, this.hint, this.help);
    this.updateLevel(); this.onSnapChanged(this.tools.snap); this.onVisChanged(); this.updateOnline(); this.updateModeButtons();
    this.openCat(this.cat || 'select');
  }

  // ---------- painéis ----------
  openCat(id) {
    this.cat = id;
    for (const [k, b] of Object.entries(this.catBtns)) b.classList.toggle('active', k === id);
    const sub = this.sub; sub.innerHTML = ''; sub.classList.remove('hidden');
    const T = this.tools, o = T.opts, g = this.game;
    const title = (t, desc) => [h('h3', {}, t), desc ? h('p', { class: 'desc' }, desc) : null];
    const toolBtn = (tool, label, extra = {}) => h('button', { class: 'btn tool-btn' + (T.tool === tool ? ' on' : ''), 'data-tool': tool, onclick: () => { this.ensureBuild(); T.setTool(tool); this.highlightTools(); } , ...extra }, label);
    const add = (...els) => sub.append(...els.flat().filter(Boolean));
    const section = (label) => h('div', { class: 'sec' }, label);
    switch (id) {
      case 'select':
        add(title('Selecionar e editar', 'Clique em qualquer objeto do seu terreno para editar medidas, materiais e cores. Arraste para mover.'),
          toolBtn('select', '⌖ Ferramenta de seleção'),
          h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => T.duplicate() }, '⧉ Duplicar'), h('button', { class: 'btn', onclick: () => T.rotateSelection(Math.PI / 12) }, '⟳ Girar 15°'), h('button', { class: 'btn', onclick: () => T.rotateSelection(Math.PI / 2) }, '⟳ 90°')),
          h('button', { class: 'btn danger', onclick: () => T.deleteSelection() }, '🗑 Excluir seleção'));
        T.setTool('select');
        break;
      case 'terreno': case 'montanhas': {
        const presets = id === 'montanhas';
        add(title(presets ? 'Montanhas e relevo' : 'Terreno e topografia', 'Pincéis de relevo com geometria real. Funcionam apenas dentro do seu lote (ou do lote em que você tem permissão).'));
        if (presets) add(section('Atalhos de pincel'), h('div', { class: 'grid2' },
          ...[['Montanha', { mode: 'raise', r: 12, s: 0.6 }], ['Colina', { mode: 'raise', r: 8, s: 0.25 }], ['Morro íngreme', { mode: 'raise', r: 4, s: 0.6 }], ['Vale / escavação', { mode: 'lower', r: 7, s: 0.4 }], ['Barranco', { mode: 'lower', r: 3, s: 0.6 }], ['Aterro / nivelar', { mode: 'flatten', r: 6, s: 0.5 }], ['Suavizar encostas', { mode: 'smooth', r: 6, s: 0.5 }], ['Leito de lago', { mode: 'lower', r: 6, s: 0.2 }]]
            .map(([l, cfg]) => h('button', { class: 'btn', onclick: () => { Object.assign(o.terrain, cfg); this.ensureBuild(); T.setTool('terrain'); this.openCat('terreno'); } }, l))));
        else {
          add(section('Modo'), h('div', { class: 'grid2' }, ...[['raise', '⬆ Elevar'], ['lower', '⬇ Abaixar'], ['flatten', '▬ Nivelar'], ['smooth', '≈ Suavizar'], ['paint', '🖌 Pintar solo']].map(([m, l]) =>
            h('button', { class: 'btn' + (o.terrain.mode === m ? ' on' : ''), onclick: () => { o.terrain.mode = m; this.ensureBuild(); T.setTool('terrain'); this.openCat('terreno'); } }, l))),
            this.slider('Raio do pincel (m)', o.terrain.r, 1, 20, 0.5, v => o.terrain.r = v),
            this.slider('Intensidade', o.terrain.s, 0.02, 1.5, 0.01, v => o.terrain.s = v),
            this.select('Tipo de solo (modo pintar)', SOILS.map((s, i) => [i, SOIL_LABELS[i]]), o.terrain.soil, v => o.terrain.soil = +v),
            toolBtn('terrain', '🖐 Usar pincel de relevo'),
            h('p', { class: 'desc' }, 'Dica: “Nivelar” usa a altura do ponto onde você começou a arrastar. Ctrl+Z desfaz a pincelada inteira.'));
        }
        break;
      }
      case 'paredes':
        add(title('Paredes', 'Desenhe paredes ponto a ponto ou crie um cômodo inteiro arrastando um retângulo. As medidas aparecem na tela.'),
          h('div', { class: 'row' }, toolBtn('wall', '▥ Desenhar paredes'), toolBtn('room', '▭ Cômodo (arrastar)')),
          this.slider('Altura (m)', o.wall.h, 0.5, 6, 0.05, v => o.wall.h = v),
          this.slider('Espessura (m)', o.wall.t, 0.05, 0.6, 0.01, v => o.wall.t = v),
          section('Material externo'), this.matEditor(o.wall.mat, m => o.wall.mat = m),
          section('Material interno'), this.matEditor(o.wall.matB, m => o.wall.matB = m),
          h('p', { class: 'desc' }, 'Muros externos: use paredes com altura 1,8–2,2 m e material de bloco, pedra ou concreto. Portões estão em Portas e janelas.'));
        break;
      case 'estrutura':
        add(title('Estrutura', 'Pilares, vigas, lajes, fundações e escadas. A escada sobe exatamente um pavimento (3 m) e abre automaticamente o vão na laje de cima.'),
          h('div', { class: 'grid2' }, toolBtn('column', '▮ Pilar'), toolBtn('beam', '━ Viga'), toolBtn('stairs', '▤ Escada'), toolBtn('floor', '▦ Laje / fundação')),
          this.select('Modelo da escada', ['macica', 'vazada', 'concreto'].map(k => [k, ENUM_LABELS[k]]), o.stairs.style, v => o.stairs.style = v),
          this.slider('Largura da escada (m)', o.stairs.w, 0.6, 3, 0.05, v => o.stairs.w = v),
          this.select('Formato do pilar', [['quadrado', 'Quadrado'], ['redondo', 'Redondo']], o.column.shape, v => o.column.shape = v),
          this.slider('Seção do pilar (m)', o.column.s, 0.1, 1, 0.01, v => o.column.s = v),
          h('p', { class: 'desc' }, 'Para criar um sobrado: construa o térreo, suba o pavimento (▲ na barra inferior), desenhe a laje e as paredes do andar de cima. Q/E giram a escada antes de posicionar.'));
        break;
      case 'aberturas': {
        add(title('Portas e janelas', 'Escolha o modelo e clique sobre uma parede. O vão é recortado automaticamente.'));
        for (const kind of ['door', 'window']) {
          add(section(kind === 'door' ? 'Portas e portões' : 'Janelas'), h('div', { class: 'grid2' }, ...Object.entries(OPENINGS).filter(([, v]) => v.kind === kind).map(([k, v]) =>
            h('button', { class: 'btn' + (o.opening.style === k && T.tool === 'opening' ? ' on' : ''), onclick: () => { o.opening.style = k; this.ensureBuild(); T.setTool('opening'); this.openCat('aberturas'); } }, v.label))));
        }
        add(h('p', { class: 'desc' }, 'Depois de colocar, selecione a abertura para alterar largura, altura, material e cor, ou marcar como aberta. No modo explorar, aperte E perto dela.'));
        break;
      }
      case 'telhados':
        add(title('Telhados e coberturas', 'Arraste um retângulo sobre as paredes do pavimento atual. O telhado nasce no topo das paredes desse pavimento.'),
          h('div', { class: 'grid2' }, ...Object.entries(ROOFS).map(([k, v]) => h('button', { class: 'btn' + (o.roof.style === k && T.tool === 'roof' ? ' on' : ''), onclick: () => {
            o.roof.style = k; o.roof.pitch = v.pitch;
            if (['plano', 'embutido', 'cobertura'].includes(k)) o.roof.mat = { id: k === 'cobertura' ? 'telha_metalica' : 'concreto' };
            else if (k === 'pergolado') o.roof.mat = { id: 'madeira' };
            else if (!o.roof.mat.id.startsWith('telha')) o.roof.mat = { id: 'telha_ceramica' };
            this.ensureBuild(); T.setTool('roof'); this.openCat('telhados');
          } }, v.label))),
          this.slider('Inclinação (°)', o.roof.pitch, 0, 55, 1, v => o.roof.pitch = v),
          this.slider('Beiral (m)', o.roof.over, 0, 2, 0.05, v => o.roof.over = v),
          section('Material'), this.matEditor(o.roof.mat, m => o.roof.mat = m),
          h('p', { class: 'desc' }, 'Use “Ocultar telhados” (T) para decorar os interiores.'));
        break;
      case 'pisos':
        add(title('Pisos e lajes', 'Arraste para criar pisos, decks, calçadas, entradas de garagem e quadras.'),
          toolBtn('floor', '▦ Desenhar piso'),
          this.slider('Espessura (m)', o.floor.t, 0.02, 0.6, 0.01, v => o.floor.t = v),
          section('Material'), this.matEditor(o.floor.mat, m => o.floor.mat = m));
        break;
      case 'materiais':
        add(title('Materiais, texturas e cores', 'Escolha um material e clique em qualquer superfície (cada lado de uma parede é independente), ou aplique à seleção.'),
          this.matEditor(o.paint.mat, m => o.paint.mat = m, true),
          h('div', { class: 'row' }, toolBtn('paint', '🖌 Pintar clicando'), h('button', { class: 'btn', onclick: () => T.paintSelection() }, '✓ Aplicar à seleção')));
        break;
      case 'moveis': case 'decoracao': case 'jardim': {
        const catKey = id;
        add(title({ moveis: 'Móveis', decoracao: 'Decoração', jardim: 'Jardim, paisagismo e lazer' }[id], 'Escolha e clique no chão para posicionar. Q/E giram antes de colocar. Quadros e cortinas grudam na parede.'),
          this.select('Estilo', STYLES.map(s => [s, STYLE_LABELS[s]]), o.item.style, v => o.item.style = v),
          this.colorField('Cor (vazio = padrão)', o.item.color || ITEMS[o.item.item]?.color || '#888888', v => o.item.color = v, () => o.item.color = null));
        const groups = {};
        for (const [k, v] of Object.entries(ITEMS)) if (v.cat === catKey) (groups[v.group] ||= []).push([k, v]);
        for (const [gname, list] of Object.entries(groups)) add(section(gname), h('div', { class: 'grid2' }, ...list.map(([k, v]) =>
          h('button', { class: 'btn' + (o.item.item === k && T.tool === 'item' ? ' on' : ''), onclick: () => { o.item.item = k; o.item.color = null; this.ensureBuild(); T.setTool('item'); this.openCat(catKey); } }, v.label))));
        break;
      }
      case 'piscinas':
        add(title('Piscinas', 'Arraste um retângulo no terreno. O solo é nivelado e escavado automaticamente.'),
          h('div', { class: 'grid2' }, ...['retangular', 'redonda', 'oval', 'borda_infinita'].map(s => h('button', { class: 'btn' + (o.pool.shape === s && T.tool === 'pool' ? ' on' : ''), onclick: () => { o.pool.shape = s; this.ensureBuild(); T.setTool('pool'); this.openCat('piscinas'); } }, ENUM_LABELS[s]))),
          this.slider('Profundidade (m)', o.pool.depth, 0.4, 3.5, 0.05, v => o.pool.depth = v),
          this.colorField('Revestimento', o.pool.tile, v => o.pool.tile = v),
          this.check('Iluminação subaquática', o.pool.light, v => o.pool.light = v),
          h('p', { class: 'desc' }, 'Complete a área de lazer com deck (Pisos → material Deck), espreguiçadeiras, guarda-sol e cascata (Jardim → Lazer).'));
        break;
      case 'agua':
        add(title('Lagos e espelhos d\'água', 'Escave com o pincel “Abaixar” ou “Leito de lago” e depois arraste para definir a lâmina d\'água. O nível pode ser ajustado nas propriedades.'),
          h('div', { class: 'grid2' }, h('button', { class: 'btn' + (o.water.shape === 'lago' && T.tool === 'water' ? ' on' : ''), onclick: () => { o.water.shape = 'lago'; this.ensureBuild(); T.setTool('water'); this.openCat('agua'); } }, 'Lago orgânico'),
            h('button', { class: 'btn' + (o.water.shape === 'retangular' && T.tool === 'water' ? ' on' : ''), onclick: () => { o.water.shape = 'retangular'; this.ensureBuild(); T.setTool('water'); this.openCat('agua'); } }, 'Espelho d\'água')),
          h('button', { class: 'btn', onclick: () => { Object.assign(o.terrain, { mode: 'lower', r: 6, s: 0.2 }); this.ensureBuild(); T.setTool('terrain'); this.openCat('terreno'); } }, '⛏ Escavar leito'),
          h('p', { class: 'desc' }, 'Rios desenhados por pontos e curvas ainda não estão nesta versão; por enquanto, escave um canal com o pincel e cubra com espelhos d\'água.'));
        break;
      case 'luz':
        add(title('Iluminação', 'Hora do dia (somente na sua tela). À noite, luminárias, postes e luzes de piscina acendem.'),
          this.slider('Hora do dia', this.app.sm.timeOfDay, 5, 20, 0.25, v => this.app.sm.setTime(v), v => `${Math.floor(v)}h${String(Math.round((v % 1) * 60)).padStart(2, '0')}`),
          section('Luminárias'), h('div', { class: 'grid2' }, ...['luminaria_chao', 'pendente', 'poste_luz', 'balizador'].map(k => h('button', { class: 'btn', onclick: () => { o.item.item = k; this.ensureBuild(); T.setTool('item'); } }, ITEMS[k].label))));
        break;
      case 'multi': this.renderMulti(); break;
      case 'salvar': this.renderSave(); break;
    }
    this.highlightTools();
  }
  highlightTools() { for (const b of this.sub.querySelectorAll('[data-tool]')) b.classList.toggle('on', b.dataset.tool === this.tools.tool); }
  ensureBuild() { if (this.player.mode !== 'build') this.app.setMode('build'); }
  onToolChanged() { this.highlightTools(); this.updateHint(); }
  updateHint() {
    const t = this.tools.tool;
    const hints = { wall: 'Clique para iniciar a parede; clique em cada canto. Duplo clique ou Esc para terminar.', room: 'Clique e arraste para criar um cômodo com 4 paredes e piso.', floor: 'Clique e arraste para criar o piso/laje.', roof: 'Arraste sobre as paredes do pavimento atual.', opening: 'Clique sobre uma parede para inserir.', item: 'Clique para posicionar · Q/E giram.', stairs: 'Clique para posicionar · Q/E giram · sobe 1 pavimento.', column: 'Clique para posicionar o pilar.', beam: 'Clique no início e no fim da viga.', pool: 'Arraste para definir a piscina.', water: 'Arraste para definir a lâmina d\'água.', terrain: 'Segure o botão esquerdo e arraste sobre o seu lote.', paint: 'Clique nas superfícies para aplicar o material.' };
    this.hint.textContent = this.player.mode === 'build' ? (hints[t] || '') : 'W A S D andam · Shift corre · Espaço pula · E interage · Tab volta a construir';
    this.hint.style.display = this.hint.textContent ? 'block' : 'none';
  }

  // ---------- campos ----------
  slider(label, value, min, max, step, onChange, fmt) {
    const out = h('span', { class: 'val' }, fmt ? fmt(value) : String(+value.toFixed(2)));
    const inp = h('input', { type: 'range', min, max, step, value });
    inp.addEventListener('input', () => { out.textContent = fmt ? fmt(+inp.value) : String(+(+inp.value).toFixed(2)); onChange(+inp.value, false); });
    return h('label', { class: 'field' }, h('span', {}, label, ' ', out), inp);
  }
  select(label, options, value, onChange) {
    const s = h('select', { onchange: () => onChange(s.value) }, ...options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) }, l)));
    return h('label', { class: 'field' }, h('span', {}, label), s);
  }
  check(label, value, onChange) {
    const c = h('input', { type: 'checkbox', checked: !!value, onchange: () => onChange(c.checked) });
    return h('label', { class: 'field check' }, c, h('span', {}, label));
  }
  colorField(label, value, onChange, onReset) {
    const c = h('input', { type: 'color', value });
    const hex = h('input', { class: 'hex', value, maxlength: 7 });
    c.addEventListener('input', () => { hex.value = c.value; onChange(c.value); });
    hex.addEventListener('change', () => { if (/^#[0-9a-f]{6}$/i.test(hex.value)) { c.value = hex.value.toLowerCase(); onChange(c.value); } else hex.value = c.value; });
    return h('label', { class: 'field' }, h('span', {}, label), h('div', { class: 'row' }, c, hex, onReset ? h('button', { class: 'btn small', onclick: (e) => { e.preventDefault(); onReset(); } }, 'padrão') : null));
  }
  numField(label, value, step, onChange, min, max) {
    const inp = h('input', { type: 'number', step, value: +(+value).toFixed(3), min, max });
    inp.addEventListener('change', () => { if (inp.value !== '' && Number.isFinite(+inp.value)) onChange(+inp.value); });
    inp.addEventListener('keydown', e => e.stopPropagation());
    return h('label', { class: 'field' }, h('span', {}, label), inp);
  }
  // editor de material: biblioteca + cor (paleta, seletor, hex) + acabamento
  matEditor(mat, onChange, big = false) {
    const m = { id: mat.id, color: mat.color || MATERIALS[mat.id].color, rough: mat.rough ?? MATERIALS[mat.id].rough, metal: mat.metal ?? MATERIALS[mat.id].metal, scale: mat.scale ?? 1 };
    const wrap = h('div', { class: 'mated' });
    const emit = () => onChange({ ...m });
    const render = () => {
      wrap.innerHTML = '';
      const cats = {};
      for (const [k, v] of Object.entries(MATERIALS)) (cats[v.cat] ||= []).push([k, v]);
      const sel = h('select', { onchange: () => { const d = MATERIALS[sel.value]; m.id = sel.value; m.color = d.color; m.rough = d.rough; m.metal = d.metal; emit(); render(); } },
        ...Object.entries(cats).map(([c, list]) => h('optgroup', { label: c }, ...list.map(([k, v]) => h('option', { value: k, selected: k === m.id }, v.label)))));
      const palette = ['#f4f1ea', '#e9e2d0', '#d8c3a5', '#b9b2a6', '#8e8d89', '#4c5257', '#26282a', '#a5532f', '#c49a6c', '#6b4428', '#5d8a3a', '#2f5d8a', '#7aa6c2', '#c0504d', '#e8b04a', '#ffffff'];
      wrap.append(h('label', { class: 'field' }, h('span', {}, 'Material'), sel),
        h('div', { class: 'palette' }, ...palette.map(c => h('button', { class: 'sw', style: `background:${c}`, title: c, onclick: () => { m.color = c; emit(); render(); } }))),
        this.colorField('Cor', m.color, v => { m.color = v; emit(); }),
        this.slider('Rugosidade (fosco ↔ brilhante = 1 ↔ 0)', m.rough, 0, 1, 0.01, v => { m.rough = v; emit(); }),
        this.slider('Reflexividade metálica', m.metal, 0, 1, 0.01, v => { m.metal = v; emit(); }),
        this.slider('Escala da textura', m.scale, 0.2, 5, 0.05, v => { m.scale = v; emit(); }));
    };
    render();
    return wrap;
  }

  // ---------- propriedades da seleção ----------
  renderProps() {
    const g = this.game, ids = [...g.selection].filter(id => g.world.objects[id]);
    const p = this.props;
    p.innerHTML = '';
    if (!ids.length) { p.classList.add('hidden'); return; }
    p.classList.remove('hidden');
    if (ids.length > 1) {
      p.append(h('h3', {}, `${ids.length} objetos selecionados`),
        h('p', { class: 'desc' }, 'Use Materiais e cores → “Aplicar à seleção” para pintar todos de uma vez.'),
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => this.tools.duplicate() }, '⧉ Duplicar'), h('button', { class: 'btn', onclick: () => this.tools.rotateSelection(Math.PI / 2) }, '⟳ 90°')),
        h('button', { class: 'btn danger', onclick: () => this.tools.deleteSelection() }, '🗑 Excluir'));
      return;
    }
    const o = g.world.objects[ids[0]];
    const editable = g.canEditObj(o);
    const owner = plotAt(g.world, ...(o.a || (o.type === 'opening' ? g.world.objects[o.wall]?.a : [o.x, o.z]) || [0, 0]));
    const ownerName = owner?.owner ? (g.world.players[owner.owner]?.name || '—') : 'sem dono';
    const upd = (props) => g.doOp({ k: 'update', id: o.id, props });
    p.append(h('h3', {}, (o.type === 'item' ? ITEMS[o.item]?.label : TYPE_LABELS[o.type]) || o.type),
      h('p', { class: 'desc' }, `${owner?.name || 'Área comum'} · proprietário: ${ownerName}`));
    if (!editable) { p.append(h('p', { class: 'warn' }, 'Somente visualização — você não tem permissão para editar este terreno.')); return; }
    const sch = SCHEMA[o.type];
    if (o.type === 'wall' || o.type === 'beam') {
      const { L, dir } = wallFrame(o);
      p.append(this.numField('Comprimento (m)', L, 0.05, v => upd({ b: [o.a[0] + dir[0] * Math.max(0.2, v), o.a[1] + dir[1] * Math.max(0.2, v)] }), 0.2, 100));
      const ang = Math.round(Math.atan2(dir[1], dir[0]) * 180 / Math.PI);
      p.append(this.numField('Ângulo (°)', ang, 1, v => { const r = v * Math.PI / 180; upd({ b: [o.a[0] + Math.cos(r) * L, o.a[1] + Math.sin(r) * L] }); }));
    }
    for (const [key, f] of Object.entries(sch)) {
      if (['a', 'b', 'wall', 'item'].includes(key)) continue;
      if (o.type === 'opening' && key === 'open') { p.append(this.check(FIELD_LABELS.open, o.open, v => g.doOp({ k: 'door', id: o.id, open: v }))); continue; }
      if (o.type === 'roof' && key === 'matB' && !['duas_aguas', 'colonial', 'uma_agua', 'embutido'].includes(o.style)) continue;
      if (o.type === 'stairs' && key === 'level') { p.append(this.numField('Pavimento de saída', o.level, 1, v => upd({ level: v }), 0, 9)); continue; }
      const label = FIELD_LABELS[key] || key;
      if (f.k === 'num' || f.k === 'int') {
        if ((o.type === 'item' || o.type === 'pool' || o.type === 'water') && ['x', 'z'].includes(key)) continue;
        if (['x', 'z'].includes(key)) continue;
        if (key === 'level') { p.append(this.numField(label + ' (0 = térreo)', o.level, 1, v => upd({ level: v }), 0, 9)); continue; }
        p.append(this.numField(label, o[key], f.k === 'int' ? 1 : 0.05, v => upd({ [key]: v }), f.min, f.max));
      } else if (f.k === 'rot') p.append(this.numField(label, Math.round(o.rot * 180 / Math.PI), 5, v => upd({ rot: v * Math.PI / 180 })));
      else if (f.k === 'enum') p.append(this.select(label, f.vals.filter(v => o.type !== 'opening' || OPENINGS[v].kind === OPENINGS[o.style].kind).map(v => [v, ENUM_LABELS[v] || v]), o[key], v => upd({ [key]: v })));
      else if (f.k === 'color') p.append(this.colorField(label, o[key], v => { clearTimeout(this._ct); this._ct = setTimeout(() => upd({ [key]: v }), 200); }));
      else if (f.k === 'bool') p.append(this.check(label, o[key], v => upd({ [key]: v })));
      else if (f.k === 'mat') {
        const det = h('details', { open: key === 'mat' }, h('summary', {}, label));
        det.append(this.matEditor(o[key], m => { clearTimeout(this._mt); this._mt = setTimeout(() => upd({ [key]: m }), 200); }));
        p.append(det);
      }
    }
    p.append(h('div', { class: 'row' },
      o.type !== 'opening' ? h('button', { class: 'btn', onclick: () => this.tools.duplicate() }, '⧉ Duplicar') : null,
      o.type !== 'opening' ? h('button', { class: 'btn', onclick: () => this.tools.rotateSelection(Math.PI / 2) }, '⟳ 90°') : null),
      h('button', { class: 'btn danger', onclick: () => this.tools.deleteSelection() }, '🗑 Excluir'));
  }

  // ---------- multiplayer ----------
  invite() {
    const link = `${location.origin}${location.pathname}?w=${this.game.world.id}`;
    const done = () => this.toast(`Link copiado: ${link}`, 'ok', 7000);
    navigator.clipboard?.writeText(link).then(done, () => this.modal('Convidar um amigo', h('div', {}, h('p', {}, 'Envie este link ou o código para o seu vizinho:'), h('input', { class: 'copy', value: link, readonly: true }), h('p', {}, 'Código: ', h('code', {}, this.game.world.id))))) ?? this.modal('Convidar', h('input', { class: 'copy', value: link, readonly: true }));
  }
  renderMulti() {
    const g = this.game, sub = this.sub;
    const mine = g.myPlot();
    const link = `${location.origin}${location.pathname}?w=${g.world.id}`;
    sub.append(h('h3', {}, 'Multiplayer'), h('p', { class: 'desc' }, 'Mundo compartilhado por até dois proprietários. Visitantes extras podem passear, mas não construir.'),
      h('label', { class: 'field' }, h('span', {}, 'Link de convite'), h('input', { class: 'copy', value: link, readonly: true })),
      h('button', { class: 'btn accent', onclick: () => this.invite() }, '✉ Copiar convite'),
      h('div', { class: 'sec' }, 'Terrenos'));
    for (const pl of g.world.plots) {
      const ownerName = pl.owner ? g.world.players[pl.owner]?.name : null;
      sub.append(h('div', { class: 'plotrow' }, h('b', {}, pl.name), ` — ${ownerName ? ownerName + (pl.owner === g.me.pid ? ' (você)' : '') : 'livre (o próximo a entrar fica com ele)'}`,
        h('div', { class: 'desc' }, `${(pl.x1 - pl.x0)} × ${(pl.z1 - pl.z0)} m`), h('button', { class: 'btn small', onclick: () => this.app.goToPlot(pl) }, 'Ir até lá')));
    }
    if (mine) {
      sub.append(h('div', { class: 'sec' }, 'Permissões do seu terreno'));
      const others = Object.entries(g.world.players).filter(([pid]) => pid !== g.me.pid);
      if (!others.length) sub.append(h('p', { class: 'desc' }, 'Quando o vizinho entrar, você poderá permitir que ele ajude na sua construção.'));
      for (const [pid, p] of others) sub.append(this.check(`Permitir que ${p.name} construa no meu terreno`, mine.editors.includes(pid), v => this.app.net.send({ t: 'perm', pid, allow: v })));
    }
  }
  renderSave() {
    const g = this.game, sub = this.sub;
    sub.append(h('h3', {}, 'Salvamento'),
      h('p', { class: 'desc' }, 'Cada alteração é enviada ao servidor, validada e gravada automaticamente. O indicador no canto superior só mostra “Salvo” depois da confirmação do servidor.'),
      h('p', {}, 'Armazenamento do servidor: ', h('b', {}, this.app.storageKind === 'postgres' ? 'Banco de dados PostgreSQL' : 'Arquivos no servidor')),
      h('p', {}, 'Objetos no mundo: ', h('b', {}, String(Object.keys(g.world.objects).length))),
      h('button', { class: 'btn', onclick: () => this.app.exportBackup() }, '⬇ Baixar cópia de segurança (.json)'),
      h('p', { class: 'desc' }, 'Uma cópia local também é guardada automaticamente neste navegador. Se o servidor perder o mundo, a tela inicial oferece restaurá-lo a partir dela.'));
  }

  // ---------- status ----------
  updateLevel() { this.levelEl.textContent = this.game.level === 0 ? 'Térreo' : `${this.game.level}º pavimento`; }
  onSnapChanged(v) { this.snapBtn.classList.toggle('on', v); }
  onVisChanged() { this.roofBtn.classList.toggle('on', this.game.hideRoofs); this.upperBtn.classList.toggle('on', this.game.hideUpper); }
  updateModeButtons() { for (const [m, b] of Object.entries(this.modeBtns)) b.classList.toggle('on', this.player.mode === m); this.root.classList.toggle('exploring', this.player.mode !== 'build'); this.updateHint(); }
  updateOnline() {
    const g = this.game; this.onlineEl.innerHTML = '';
    for (const [pid, p] of Object.entries(g.world.players)) {
      const on = g.online.has(pid) || pid === g.me.pid;
      this.onlineEl.append(h('span', { class: 'chip' + (on ? ' on' : ''), title: on ? 'Conectado' : 'Desconectado' }, h('i', {}), p.name + (pid === g.me.pid ? ' (você)' : '')));
    }
  }
  setSave(state, text) { this.status.className = 'save-status ' + state; this.status.textContent = text; }
  addChat(m) {
    const mine = m.pid === this.game.me.pid;
    const line = h('div', { class: 'msg' + (mine ? ' mine' : '') }, h('b', {}, m.name + ': '), m.text);
    this.chatLog.append(line); this.chatLog.scrollTop = this.chatLog.scrollHeight;
    while (this.chatLog.children.length > 60) this.chatLog.firstChild.remove();
  }
  toast(msg, kind = '', ms = 3500) {
    const t = h('div', { class: 'toast ' + (kind || '') }, msg);
    this.toasts.append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
  }
  modal(title, body) {
    const bg = h('div', { class: 'modal-bg', onclick: (e) => { if (e.target === bg) bg.remove(); } },
      h('div', { class: 'modal' }, h('h3', {}, title), body, h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => bg.remove() }, 'Fechar'))));
    document.body.append(bg);
    return bg;
  }
  toggleHelp() { this.help.classList.toggle('hidden'); }
  openSettings() {
    const cur = this.app.quality;
    const body = h('div', {},
      h('p', { class: 'desc' }, 'Baixa: mais fluidez (sem sombras). Média: equilíbrio. Alta: sombras e reflexos melhores. Ultra (4K): resolução nativa até 4K, texturas 1024 px com relevo, sombras 4096, oclusão de ambiente e brilho — exige placa de vídeo dedicada.'),
      h('div', { class: 'row' }, ...[['baixo', 'Baixa'], ['medio', 'Média'], ['alto', 'Alta'], ['ultra', 'Ultra (4K)']].map(([q, l]) => h('button', { class: 'btn' + (cur === q ? ' on' : ''), onclick: () => this.app.setQuality(q) }, l))),
      h('p', { class: 'desc' }, 'A troca de qualidade recarrega a página e reconecta ao mesmo mundo (nada é perdido).'),
      this.check('Mostrar FPS', this.app.showFps, v => this.app.setShowFps(v)),
      this.slider('Sensibilidade do mouse', this.app.mouseSens || 1, 0.3, 3, 0.05, v => this.app.setMouseSens(v)));
    this.modal('Configurações gráficas', body);
  }
}
