// Catálogos compartilhados entre cliente e servidor (o servidor usa as chaves para validar dados).

export const LEVEL_H = 3; // altura de cada pavimento (m)

// ---------- Materiais ----------
// tex: tipo de textura procedural gerada no cliente
export const MATERIALS = {
  pintura:          { label: 'Pintura lisa',        cat: 'Paredes', color: '#efe9df', rough: 0.9,  metal: 0,   tex: 'plaster' },
  reboco:           { label: 'Reboco texturizado',  cat: 'Paredes', color: '#d9d2c5', rough: 0.95, metal: 0,   tex: 'stucco' },
  tijolo:           { label: 'Tijolo aparente',     cat: 'Paredes', color: '#a5532f', rough: 0.9,  metal: 0,   tex: 'brick' },
  tijolo_branco:    { label: 'Tijolo pintado',      cat: 'Paredes', color: '#ecebe6', rough: 0.85, metal: 0,   tex: 'brick' },
  bloco_concreto:   { label: 'Bloco de concreto',   cat: 'Paredes', color: '#9b9a96', rough: 0.95, metal: 0,   tex: 'block' },
  concreto:         { label: 'Concreto aparente',   cat: 'Estrutura', color: '#a3a29d', rough: 0.9, metal: 0,  tex: 'concrete' },
  cimento_queimado: { label: 'Cimento queimado',    cat: 'Pisos',   color: '#8e8d89', rough: 0.55, metal: 0,   tex: 'concrete' },
  madeira:          { label: 'Madeira clara',       cat: 'Madeira', color: '#c49a6c', rough: 0.7,  metal: 0,   tex: 'wood' },
  madeira_escura:   { label: 'Madeira escura',      cat: 'Madeira', color: '#6b4428', rough: 0.65, metal: 0,   tex: 'wood' },
  ripado:           { label: 'Ripado de madeira',   cat: 'Madeira', color: '#a8774a', rough: 0.7,  metal: 0,   tex: 'slats' },
  deck:             { label: 'Deck externo',        cat: 'Externo', color: '#8a5d3b', rough: 0.8,  metal: 0,   tex: 'planks' },
  pedra:            { label: 'Pedra natural',       cat: 'Pedras',  color: '#9d958a', rough: 0.95, metal: 0,   tex: 'stone' },
  pedra_ardosia:    { label: 'Ardósia',             cat: 'Pedras',  color: '#4c5257', rough: 0.8,  metal: 0,   tex: 'slate' },
  marmore:          { label: 'Mármore',             cat: 'Pedras',  color: '#f1efea', rough: 0.25, metal: 0,   tex: 'marble' },
  granito:          { label: 'Granito',             cat: 'Pedras',  color: '#3d3a38', rough: 0.3,  metal: 0,   tex: 'granite' },
  ceramica:         { label: 'Cerâmica',            cat: 'Pisos',   color: '#c9b9a3', rough: 0.5,  metal: 0,   tex: 'tiles' },
  porcelanato:      { label: 'Porcelanato',         cat: 'Pisos',   color: '#e3e0da', rough: 0.2,  metal: 0,   tex: 'bigtiles' },
  azulejo:          { label: 'Azulejo',             cat: 'Pisos',   color: '#f4f6f6', rough: 0.25, metal: 0,   tex: 'smalltiles' },
  revestimento_3d:  { label: 'Revestimento 3D',     cat: 'Paredes', color: '#e8e4dc', rough: 0.8,  metal: 0,   tex: 'relief' },
  vidro:            { label: 'Vidro',               cat: 'Metais/vidro', color: '#a9c8d6', rough: 0.05, metal: 0, tex: 'none', glass: true },
  aco:              { label: 'Aço',                 cat: 'Metais/vidro', color: '#8a8d90', rough: 0.35, metal: 0.9, tex: 'brushed' },
  aluminio:         { label: 'Alumínio',            cat: 'Metais/vidro', color: '#c7cacc', rough: 0.3, metal: 0.85, tex: 'brushed' },
  aco_preto:        { label: 'Aço preto',           cat: 'Metais/vidro', color: '#26282a', rough: 0.45, metal: 0.8, tex: 'brushed' },
  telha_ceramica:   { label: 'Telha cerâmica',      cat: 'Telhados', color: '#b0532e', rough: 0.8, metal: 0,   tex: 'rooftile' },
  telha_concreto:   { label: 'Telha de concreto',   cat: 'Telhados', color: '#5d5f61', rough: 0.85, metal: 0,  tex: 'rooftile' },
  telha_metalica:   { label: 'Telha metálica',      cat: 'Telhados', color: '#6f7b80', rough: 0.4, metal: 0.7, tex: 'metalroof' },
  grama:            { label: 'Grama',               cat: 'Externo', color: '#5d8a3a', rough: 1,    metal: 0,   tex: 'grass' },
  terra:            { label: 'Terra',               cat: 'Externo', color: '#7a5a3c', rough: 1,    metal: 0,   tex: 'dirt' },
  areia:            { label: 'Areia',               cat: 'Externo', color: '#d8c39a', rough: 1,    metal: 0,   tex: 'sand' },
  piso_externo:     { label: 'Piso drenante',       cat: 'Externo', color: '#b9b2a6', rough: 0.95, metal: 0,   tex: 'pavers' },
  pedra_portuguesa: { label: 'Pedra portuguesa',    cat: 'Externo', color: '#e6e1d8', rough: 0.9,  metal: 0,   tex: 'cobble' },
  asfalto:          { label: 'Asfalto',             cat: 'Externo', color: '#3c3d3f', rough: 0.95, metal: 0,   tex: 'asphalt' },
  pastilha:         { label: 'Pastilha de piscina', cat: 'Externo', color: '#3fa7c4', rough: 0.2,  metal: 0,   tex: 'smalltiles' },
};

// ---------- Portas e janelas ----------
export const OPENINGS = {
  // portas
  porta_simples:   { kind: 'door',   label: 'Porta simples',      w: 0.9, h: 2.1, sill: 0 },
  porta_dupla:     { kind: 'door',   label: 'Porta dupla',        w: 1.6, h: 2.2, sill: 0 },
  porta_pivotante: { kind: 'door',   label: 'Porta pivotante',    w: 1.4, h: 2.6, sill: 0 },
  porta_correr:    { kind: 'door',   label: 'Porta de correr',    w: 2.0, h: 2.2, sill: 0 },
  porta_vidro:     { kind: 'door',   label: 'Porta de vidro',     w: 1.8, h: 2.3, sill: 0 },
  porta_varanda:   { kind: 'door',   label: 'Porta-janela varanda', w: 2.4, h: 2.3, sill: 0 },
  portao_garagem:  { kind: 'door',   label: 'Portão de garagem',  w: 3.0, h: 2.4, sill: 0 },
  passagem:        { kind: 'door',   label: 'Vão livre',          w: 1.2, h: 2.3, sill: 0 },
  // janelas
  janela_correr:   { kind: 'window', label: 'Janela de correr',   w: 1.5, h: 1.2, sill: 1.0 },
  janela_basculante:{ kind: 'window', label: 'Basculante',        w: 0.8, h: 0.6, sill: 1.6 },
  janela_tradicional:{ kind: 'window', label: 'Janela tradicional', w: 1.2, h: 1.3, sill: 0.95 },
  janela_panoramica:{ kind: 'window', label: 'Panorâmica',        w: 3.0, h: 1.6, sill: 0.6 },
  painel_vidro:    { kind: 'window', label: 'Painel de vidro',    w: 2.5, h: 2.6, sill: 0.1 },
  janela_pequena:  { kind: 'window', label: 'Janela pequena',     w: 0.6, h: 0.6, sill: 1.5 },
  janela_redonda:  { kind: 'window', label: 'Janela redonda (óculo)', w: 0.8, h: 0.8, sill: 1.3 },
};

// ---------- Telhados ----------
export const ROOFS = {
  duas_aguas:   { label: 'Duas águas', pitch: 30 },
  uma_agua:     { label: 'Uma água', pitch: 15 },
  quatro_aguas: { label: 'Quatro águas', pitch: 28 },
  colonial:     { label: 'Colonial', pitch: 35 },
  plano:        { label: 'Laje plana', pitch: 0 },
  embutido:     { label: 'Embutido (platibanda)', pitch: 8 },
  pergolado:    { label: 'Pergolado', pitch: 0 },
  cobertura:    { label: 'Cobertura (garagem)', pitch: 5 },
};

export const STYLES = ['contemporaneo', 'classico', 'minimalista', 'industrial', 'rustico', 'luxuoso'];
export const STYLE_LABELS = { contemporaneo: 'Contemporâneo', classico: 'Clássico', minimalista: 'Minimalista', industrial: 'Industrial', rustico: 'Rústico', luxuoso: 'Luxuoso' };

// ---------- Móveis, decoração e jardim ----------
// w,d,h: dimensões base (m); solid: bloqueia o personagem; wall: encosta na parede (quadros/cortinas)
export const ITEMS = {
  // Sala
  sofa:          { cat: 'moveis', group: 'Sala', label: 'Sofá 3 lugares', w: 2.2, d: 0.95, h: 0.85, solid: true, color: '#8c8f93' },
  sofa_l:        { cat: 'moveis', group: 'Sala', label: 'Sofá em L', w: 2.8, d: 2.0, h: 0.85, solid: true, color: '#c8bfae' },
  poltrona:      { cat: 'moveis', group: 'Sala', label: 'Poltrona', w: 0.85, d: 0.85, h: 0.9, solid: true, color: '#7b5a44' },
  mesa_centro:   { cat: 'moveis', group: 'Sala', label: 'Mesa de centro', w: 1.1, d: 0.6, h: 0.42, solid: true, color: '#7a5434' },
  rack_tv:       { cat: 'moveis', group: 'Sala', label: 'Rack com TV', w: 1.9, d: 0.45, h: 1.3, solid: true, color: '#3a3330' },
  estante:       { cat: 'moveis', group: 'Sala', label: 'Estante', w: 1.6, d: 0.38, h: 2.0, solid: true, color: '#9c7451' },
  tapete:        { cat: 'decoracao', group: 'Sala', label: 'Tapete', w: 2.4, d: 1.7, h: 0.02, solid: false, color: '#b8a58c' },
  // Jantar / cozinha
  mesa_jantar:   { cat: 'moveis', group: 'Jantar', label: 'Mesa de jantar', w: 1.8, d: 0.95, h: 0.76, solid: true, color: '#6e4a2e' },
  cadeira:       { cat: 'moveis', group: 'Jantar', label: 'Cadeira', w: 0.48, d: 0.52, h: 0.9, solid: false, color: '#5b3e28' },
  bancada:       { cat: 'moveis', group: 'Cozinha', label: 'Bancada com pia', w: 2.4, d: 0.62, h: 0.92, solid: true, color: '#e9e6df' },
  armario_alto:  { cat: 'moveis', group: 'Cozinha', label: 'Armário alto', w: 1.2, d: 0.6, h: 2.2, solid: true, color: '#d8d2c6' },
  geladeira:     { cat: 'moveis', group: 'Cozinha', label: 'Geladeira', w: 0.75, d: 0.72, h: 1.85, solid: true, color: '#c9ccce' },
  fogao:         { cat: 'moveis', group: 'Cozinha', label: 'Fogão', w: 0.76, d: 0.65, h: 0.9, solid: true, color: '#b6b9bb' },
  ilha:          { cat: 'moveis', group: 'Cozinha', label: 'Ilha gourmet', w: 2.0, d: 1.0, h: 0.92, solid: true, color: '#efece6' },
  // Quarto
  cama_casal:    { cat: 'moveis', group: 'Quarto', label: 'Cama de casal', w: 1.6, d: 2.1, h: 1.0, solid: true, color: '#e7e2d8' },
  cama_solteiro: { cat: 'moveis', group: 'Quarto', label: 'Cama de solteiro', w: 0.95, d: 2.0, h: 0.9, solid: true, color: '#d8e1e6' },
  criado_mudo:   { cat: 'moveis', group: 'Quarto', label: 'Criado-mudo', w: 0.5, d: 0.4, h: 0.55, solid: true, color: '#8b6443' },
  guarda_roupa:  { cat: 'moveis', group: 'Quarto', label: 'Guarda-roupa', w: 2.0, d: 0.6, h: 2.3, solid: true, color: '#cfc6b8' },
  escrivaninha:  { cat: 'moveis', group: 'Escritório', label: 'Escrivaninha', w: 1.3, d: 0.6, h: 0.75, solid: true, color: '#9c7451' },
  // Banheiro / lavanderia
  vaso_sanitario:{ cat: 'moveis', group: 'Banheiro', label: 'Vaso sanitário', w: 0.4, d: 0.65, h: 0.78, solid: true, color: '#f5f5f3' },
  pia_banheiro:  { cat: 'moveis', group: 'Banheiro', label: 'Gabinete com cuba', w: 0.9, d: 0.5, h: 0.88, solid: true, color: '#e9e6df' },
  box_chuveiro:  { cat: 'moveis', group: 'Banheiro', label: 'Box com chuveiro', w: 0.9, d: 0.9, h: 2.0, solid: false, color: '#dfe7ea' },
  banheira:      { cat: 'moveis', group: 'Banheiro', label: 'Banheira', w: 1.7, d: 0.8, h: 0.6, solid: true, color: '#f8f8f6' },
  maquina_lavar: { cat: 'moveis', group: 'Lavanderia', label: 'Máquina de lavar', w: 0.6, d: 0.65, h: 0.95, solid: true, color: '#eef0f1' },
  // Decoração
  luminaria_chao:{ cat: 'decoracao', group: 'Iluminação', label: 'Luminária de chão', w: 0.4, d: 0.4, h: 1.7, solid: false, color: '#2b2b2b', light: true },
  pendente:      { cat: 'decoracao', group: 'Iluminação', label: 'Pendente de teto', w: 0.4, d: 0.4, h: 0.8, solid: false, color: '#1f1f1f', light: true, ceiling: true },
  cortina:       { cat: 'decoracao', group: 'Têxteis', label: 'Cortina', w: 2.0, d: 0.12, h: 2.6, solid: false, color: '#e9e1d2', wall: true },
  quadro:        { cat: 'decoracao', group: 'Arte', label: 'Quadro', w: 0.9, d: 0.04, h: 0.65, solid: false, color: '#2f6f8f', wall: true },
  espelho:       { cat: 'decoracao', group: 'Arte', label: 'Espelho', w: 0.7, d: 0.04, h: 1.4, solid: false, color: '#b9a37a', wall: true },
  vaso_planta:   { cat: 'decoracao', group: 'Plantas', label: 'Planta em vaso', w: 0.5, d: 0.5, h: 1.2, solid: false, color: '#5f6a63' },
  vaso_decor:    { cat: 'decoracao', group: 'Objetos', label: 'Vaso decorativo', w: 0.25, d: 0.25, h: 0.45, solid: false, color: '#c08a5b' },
  // Área externa / lazer
  espreguicadeira:{ cat: 'jardim', group: 'Lazer', label: 'Espreguiçadeira', w: 0.7, d: 1.9, h: 0.75, solid: false, color: '#f2efe8' },
  guarda_sol:    { cat: 'jardim', group: 'Lazer', label: 'Guarda-sol', w: 2.4, d: 2.4, h: 2.5, solid: false, color: '#e8dcc0' },
  churrasqueira: { cat: 'jardim', group: 'Lazer', label: 'Churrasqueira', w: 1.4, d: 0.7, h: 2.4, solid: true, color: '#a5532f' },
  mesa_externa:  { cat: 'jardim', group: 'Lazer', label: 'Mesa externa', w: 1.6, d: 0.9, h: 0.75, solid: true, color: '#8a5d3b' },
  banco_jardim:  { cat: 'jardim', group: 'Lazer', label: 'Banco de jardim', w: 1.5, d: 0.55, h: 0.8, solid: true, color: '#7a5434' },
  fonte:         { cat: 'jardim', group: 'Lazer', label: 'Fonte', w: 1.6, d: 1.6, h: 1.5, solid: true, color: '#cfc8bb' },
  cascata:       { cat: 'jardim', group: 'Lazer', label: 'Cascata de piscina', w: 1.2, d: 0.5, h: 1.2, solid: true, color: '#9d958a' },
  poste_luz:     { cat: 'jardim', group: 'Iluminação', label: 'Poste de luz', w: 0.3, d: 0.3, h: 3.2, solid: true, color: '#2b2b2b', light: true },
  balizador:     { cat: 'jardim', group: 'Iluminação', label: 'Balizador de jardim', w: 0.15, d: 0.15, h: 0.6, solid: false, color: '#2b2b2b', light: true },
  // Vegetação
  arvore:        { cat: 'jardim', group: 'Vegetação', label: 'Árvore frondosa', w: 1.0, d: 1.0, h: 7.0, solid: true, color: '#4e7a32' },
  ipe:           { cat: 'jardim', group: 'Vegetação', label: 'Ipê florido', w: 0.8, d: 0.8, h: 6.0, solid: true, color: '#e5c32f' },
  pinheiro:      { cat: 'jardim', group: 'Vegetação', label: 'Pinheiro', w: 0.8, d: 0.8, h: 8.0, solid: true, color: '#2f5a34' },
  palmeira:      { cat: 'jardim', group: 'Vegetação', label: 'Palmeira', w: 0.6, d: 0.6, h: 7.5, solid: true, color: '#4f8a3a' },
  arbusto:       { cat: 'jardim', group: 'Vegetação', label: 'Arbusto', w: 1.2, d: 1.2, h: 1.0, solid: false, color: '#46722f' },
  cerca_viva:    { cat: 'jardim', group: 'Vegetação', label: 'Cerca viva (2 m)', w: 2.0, d: 0.6, h: 1.6, solid: true, color: '#3f6b2a' },
  flores:        { cat: 'jardim', group: 'Vegetação', label: 'Canteiro de flores', w: 1.5, d: 0.8, h: 0.45, solid: false, color: '#d9446a' },
  bananeira:     { cat: 'jardim', group: 'Vegetação', label: 'Planta tropical', w: 1.2, d: 1.2, h: 2.6, solid: false, color: '#5a9a3c' },
  pedra:         { cat: 'jardim', group: 'Pedras', label: 'Pedra grande', w: 1.2, d: 1.0, h: 0.8, solid: true, color: '#8e877c' },
  pedras_decor:  { cat: 'jardim', group: 'Pedras', label: 'Seixos decorativos', w: 1.5, d: 1.5, h: 0.15, solid: false, color: '#d6d0c4' },
  pisante:       { cat: 'jardim', group: 'Caminhos', label: 'Pisantes (caminho)', w: 0.6, d: 2.4, h: 0.05, solid: false, color: '#b9b2a6' },
  cerca:         { cat: 'jardim', group: 'Muros e cercas', label: 'Cerca de madeira (2 m)', w: 2.0, d: 0.1, h: 1.2, solid: true, color: '#8a5d3b' },
  gradil:        { cat: 'jardim', group: 'Muros e cercas', label: 'Gradil metálico (2 m)', w: 2.0, d: 0.08, h: 1.6, solid: true, color: '#2a2c2e' },
};

// ---------- Avatar ----------
export const AVATAR = {
  base: ['feminino', 'masculino'],
  hair: ['curto', 'social', 'raspado', 'franja', 'medio', 'longo', 'ondulado', 'cacheado', 'crespo', 'black', 'coque', 'rabo', 'tranças', 'careca'],
  beard: ['nenhuma', 'bigode', 'cavanhaque', 'curta', 'cheia'],
  top: ['camiseta', 'regata', 'camisa', 'camisa_longa', 'polo', 'moletom', 'jaqueta', 'casaco', 'blazer', 'esportiva'],
  bottom: ['calca', 'jeans', 'bermuda', 'short', 'saia', 'saia_longa', 'vestido', 'legging', 'social'],
  shoes: ['tenis', 'sapato', 'bota', 'sandalia', 'chinelo', 'salto'],
  hat: ['nenhum', 'bone', 'chapeu', 'gorro', 'panama'],
};

export const AVATAR_LABELS = {
  feminino: 'Feminino', masculino: 'Masculino',
  curto: 'Curto', social: 'Social', raspado: 'Raspado', franja: 'Com franja', medio: 'Médio', longo: 'Longo liso', ondulado: 'Ondulado', cacheado: 'Cacheado', crespo: 'Crespo curto', black: 'Black power', coque: 'Coque', rabo: 'Rabo de cavalo', 'tranças': 'Tranças', careca: 'Careca',
  nenhuma: 'Nenhuma', bigode: 'Bigode', cavanhaque: 'Cavanhaque', curta: 'Barba curta', cheia: 'Barba cheia',
  camiseta: 'Camiseta', regata: 'Regata', camisa: 'Camisa manga curta', camisa_longa: 'Camisa manga longa', polo: 'Polo', moletom: 'Moletom', jaqueta: 'Jaqueta', casaco: 'Casaco longo', blazer: 'Blazer', esportiva: 'Esportiva',
  calca: 'Calça', jeans: 'Jeans', bermuda: 'Bermuda', short: 'Short', saia: 'Saia', saia_longa: 'Saia longa', vestido: 'Vestido', legging: 'Legging', social: 'Calça social',
  tenis: 'Tênis', sapato: 'Sapato', bota: 'Bota', sandalia: 'Sandália', chinelo: 'Chinelo', salto: 'Salto',
  nenhum: 'Nenhum', bone: 'Boné', chapeu: 'Chapéu', gorro: 'Gorro', panama: 'Panamá',
};

export function defaultAvatar(seed = Math.random()) {
  const fem = seed < 0.5;
  const skins = ['#f1d3bd', '#e4b896', '#c98e66', '#a86f4c', '#7d4f33', '#5a3825'];
  return {
    base: fem ? 'feminino' : 'masculino',
    height: fem ? 1.66 : 1.77,
    build: 1,
    skin: skins[Math.floor(seed * 97) % skins.length],
    faceW: 0.5, jaw: 0.5, eyeSize: 0.5, nose: 0.5, mouth: 0.5, brows: 0.5,
    eyeColor: '#4a3626',
    hair: fem ? 'longo' : 'curto', hairColor: '#2b1d14',
    beard: 'nenhuma',
    top: 'camiseta', topColor: fem ? '#c0504d' : '#2f5d8a',
    bottom: fem ? 'jeans' : 'jeans', bottomColor: '#34495e',
    shoes: 'tenis', shoesColor: '#f2f2f2',
    hat: 'nenhum', hatColor: '#222222',
    glasses: false, watch: false, bag: false, accColor: '#6b4a2b',
  };
}
