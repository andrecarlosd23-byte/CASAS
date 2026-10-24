// Personagem humano 3D procedural: proporções anatômicas, rosto, cabelos, roupas, calçados, acessórios e animações.
// Construído com superfícies suaves (torno/cápsulas) e hierarquia de articulações animadas.
import * as THREE from 'three';
import { colorMaterial, fabricMaterial } from './materials.js';
import { mesh, textSprite } from './geom.js';
import { sanitizeAvatar } from '/shared/world.js';

const REF_H = 1.75;

function limbGeo(r1, r2, len, seg = 14) {
  // membro afunilado com pontas arredondadas, do y=0 até y=-len
  const pts = [];
  const n = 6;
  for (let i = 0; i <= n; i++) { const a = Math.PI / 2 * (i / n); pts.push(new THREE.Vector2(Math.sin(a) * r1, Math.cos(a) * r1)); }
  for (let i = 1; i < 6; i++) { const t = i / 6; const r = r1 + (r2 - r1) * t; pts.push(new THREE.Vector2(r * (1 + Math.sin(t * Math.PI) * 0.06), -len * t)); }
  for (let i = 0; i <= n; i++) { const a = Math.PI / 2 * (i / n); pts.push(new THREE.Vector2(Math.cos(a) * r2, -len - Math.sin(a) * r2)); }
  pts.reverse();
  const g = new THREE.LatheGeometry(pts, seg);
  return g;
}
function lathe(profile, seg = 24) { return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg); }

export class Avatar {
  constructor(data, opts = {}) {
    this.root = new THREE.Group();
    this.data = sanitizeAvatar(data);
    this.phase = Math.random() * 6;
    this.speed = 0; this.airborne = false; this.t = Math.random() * 10;
    this.lookTimer = 0; this.lookTarget = 0;
    this.interact = 0;
    this.build();
    if (opts.name) this.setName(opts.name);
  }
  setName(name) {
    if (this.tag) { this.root.remove(this.tag); this.tag.material.map.dispose(); this.tag.material.dispose(); }
    this.tag = textSprite(name, { height: 0.2 / (this.data.height / REF_H) });
    this.tag.position.y = REF_H + 0.32;
    this.root.add(this.tag);
  }
  setData(data) {
    this.data = sanitizeAvatar(data);
    const tag = this.tag;
    if (this.body) { this.root.remove(this.body); this.body.traverse(o => o.geometry?.dispose()); }
    this.build();
    if (tag) { this.tag.scale.setScalar(1); }
  }
  get height() { return this.data.height; }

  build() {
    const a = this.data, fem = a.base === 'feminino';
    const s = a.height / REF_H, b = a.build;
    const skin = colorMaterial(a.skin, 0.62, 0, { });
    skin.userData.sss = true;
    const top = fabricMaterial(a.topColor), bot = fabricMaterial(a.bottomColor, a.bottom === 'jeans' ? 0.9 : 0.85);
    const hairM = colorMaterial(a.hairColor, 0.55, 0.05);
    const shoeM = colorMaterial(a.shoesColor, a.shoes === 'sapato' || a.shoes === 'salto' ? 0.3 : 0.7);
    const sole = colorMaterial(a.shoes === 'tenis' ? '#f4f4f4' : '#2a2522', 0.8);
    const acc = colorMaterial(a.accColor, 0.5);
    const dress = a.bottom === 'vestido';
    const longSleeve = ['camisa_longa', 'moletom', 'jaqueta', 'casaco', 'blazer'].includes(a.top) && !dress;
    const shortSleeve = ['camiseta', 'camisa', 'polo', 'esportiva'].includes(a.top) && !dress;
    const fullLegs = ['calca', 'jeans', 'legging', 'social'].includes(a.bottom);
    const torsoMat = dress ? bot : top;

    const body = new THREE.Group(); this.body = body;
    body.scale.set(s, s, s);
    this.root.add(body);
    const J = this.joints = {};
    const hips = J.hips = new THREE.Group(); hips.position.y = 0.95; body.add(hips);
    // pelve
    const pel = mesh(new THREE.SphereGeometry(0.1, 20, 14), dress || a.bottom.startsWith('saia') ? (dress ? bot : bot) : bot);
    pel.scale.set((fem ? 1.62 : 1.5) * b, 1.05, 1.15 * b); pel.position.y = 0.0; hips.add(pel);
    const spine = J.spine = new THREE.Group(); spine.position.y = 0.06; hips.add(spine);
    const chest = J.chest = new THREE.Group(); chest.position.y = 0.26; spine.add(chest);
    // tronco
    const prof = fem
      ? [[0, -0.34], [0.145, -0.33], [0.14, -0.24], [0.122, -0.14], [0.14, -0.03], [0.155, 0.06], [0.158, 0.13], [0.15, 0.18], [0.075, 0.235], [0, 0.245]]
      : [[0, -0.34], [0.148, -0.33], [0.15, -0.22], [0.148, -0.12], [0.162, -0.01], [0.182, 0.09], [0.188, 0.15], [0.165, 0.2], [0.08, 0.24], [0, 0.25]];
    const torso = mesh(lathe(prof, 28), torsoMat); torso.scale.set(b * (fem ? 0.98 : 1.05), 1, b * 0.62); chest.add(torso);
    if (fem) for (const sx of [-1, 1]) { const bust = mesh(new THREE.SphereGeometry(0.062, 16, 12), torsoMat); bust.position.set(sx * 0.062 * b, 0.065, 0.072 * b); bust.scale.set(1, 0.92, 0.85); chest.add(bust); }
    // detalhes das roupas superiores
    if (!dress) {
      if (['camisa', 'camisa_longa', 'polo', 'blazer', 'jaqueta'].includes(a.top)) {
        const collar = mesh(new THREE.TorusGeometry(0.06, 0.016, 6, 18, Math.PI * 1.4), a.top === 'blazer' ? fabricMaterial('#f5f5f5') : top);
        collar.rotation.set(Math.PI / 2, 0, Math.PI * 0.8); collar.position.set(0, 0.235, 0.005); chest.add(collar);
      }
      if (a.top === 'blazer' || a.top === 'jaqueta') {
        for (const sx of [-1, 1]) { const lap = mesh(new THREE.BoxGeometry(0.05, 0.2, 0.012), top); lap.position.set(sx * 0.045, 0.1, 0.118 * b); lap.rotation.z = sx * 0.3; chest.add(lap); }
        const shirt = mesh(new THREE.BoxGeometry(0.06, 0.16, 0.01), fabricMaterial(a.top === 'blazer' ? '#f5f5f5' : '#2b2b2b')); shirt.position.set(0, 0.12, 0.112 * b); chest.add(shirt);
      }
      if (a.top === 'moletom') {
        const hood = mesh(new THREE.TorusGeometry(0.085, 0.035, 8, 18), top); hood.rotation.x = Math.PI / 2.4; hood.position.set(0, 0.24, -0.04); chest.add(hood);
        const pocket = mesh(new THREE.BoxGeometry(0.17, 0.08, 0.01), top); pocket.position.set(0, -0.2, 0.1 * b); chest.add(pocket);
      }
      if (a.top === 'esportiva') for (const sx of [-1, 1]) { const st = mesh(new THREE.BoxGeometry(0.012, 0.44, 0.06), fabricMaterial('#f2f2f2')); st.position.set(sx * 0.15 * b * 1.03, -0.07, 0); chest.add(st); }
      if (a.top === 'casaco') { const coat = mesh(new THREE.CylinderGeometry(0.165 * b, 0.2 * b, 0.42, 22, 1, true), top); coat.material = top.clone(); coat.material.side = THREE.DoubleSide; coat.scale.z = 0.7; coat.position.y = -0.48; chest.add(coat); }
      if (a.top === 'camisa' || a.top === 'camisa_longa' || a.top === 'polo') for (let i = 0; i < 4; i++) { const bt = mesh(new THREE.SphereGeometry(0.006, 6, 4), colorMaterial('#eee', 0.4)); bt.position.set(0, 0.17 - i * 0.09, 0.118 * b * (i < 2 ? 1 : 0.94)); chest.add(bt); }
    }
    // saias e vestido
    if (dress || a.bottom === 'saia' || a.bottom === 'saia_longa') {
      const len = a.bottom === 'saia_longa' ? 0.82 : 0.44;
      const sk = mesh(new THREE.CylinderGeometry(0.15 * b, (a.bottom === 'saia_longa' ? 0.27 : 0.25) * b, len, 26, 1, true), bot);
      sk.material = bot.clone(); sk.material.side = THREE.DoubleSide; sk.scale.z = 0.78; sk.position.y = -len / 2 + 0.04; hips.add(sk);
    }
    // pescoço e cabeça
    const neck = J.neck = new THREE.Group(); neck.position.y = 0.235; chest.add(neck);
    const nk = mesh(new THREE.CylinderGeometry(0.043, 0.05, 0.11, 14), skin); nk.position.y = 0.045; neck.add(nk);
    const head = J.head = new THREE.Group(); head.position.set(0, 0.17, 0.01); neck.add(head);
    this.buildHead(head, a, skin, hairM, acc);
    // braços
    for (const side of [-1, 1]) {
      const key = side < 0 ? 'R' : 'L';
      const sh = J['shoulder' + key] = new THREE.Group(); sh.position.set(side * -1 * -(fem ? 0.165 : 0.185) * b, 0.175, 0); chest.add(sh);
      sh.position.x = (side > 0 ? 1 : -1) * (fem ? 0.165 : 0.185) * b;
      const shoulderBall = mesh(new THREE.SphereGeometry(0.052 * b, 14, 10), dress || a.top === 'regata' ? skin : torsoMat); sh.add(shoulderBall);
      const ua = mesh(limbGeo(0.047 * b, 0.038 * b, 0.25), longSleeve ? top : skin); sh.add(ua);
      if (shortSleeve) { const sl = mesh(limbGeo(0.058 * b, 0.05 * b, 0.11), top); sl.position.y = 0.01; sh.add(sl); }
      const el = J['elbow' + key] = new THREE.Group(); el.position.y = -0.27; sh.add(el);
      const fa = mesh(limbGeo(0.038 * b, 0.03 * b, 0.22), longSleeve ? top : skin); el.add(fa);
      const hand = mesh(new THREE.SphereGeometry(0.04, 12, 10), skin); hand.scale.set(0.75, 1.5, 0.45); hand.position.y = -0.27; el.add(hand);
      const thumb = mesh(new THREE.CapsuleGeometry(0.011, 0.035, 3, 6), skin); thumb.position.set(side * -0.0 + 0.0, -0.25, 0.022); thumb.rotation.x = 0.5; el.add(thumb);
      if (a.watch && side > 0) { const w = mesh(new THREE.TorusGeometry(0.033, 0.009, 6, 16), colorMaterial('#222', 0.4, 0.5)); w.rotation.x = Math.PI / 2; w.position.y = -0.2; el.add(w); const face = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.008, 16), colorMaterial('#c9c9c9', 0.2, 0.9)); face.rotation.z = Math.PI / 2; face.position.set(0.036, -0.2, 0); el.add(face); }
    }
    // pernas
    for (const side of [-1, 1]) {
      const key = side < 0 ? 'R' : 'L';
      const th = J['thigh' + key] = new THREE.Group(); th.position.set(side * (fem ? 0.092 : 0.088) * b, -0.03, 0); hips.add(th);
      const legSkin = !(fullLegs || a.bottom === 'bermuda');
      const tg = mesh(limbGeo((fem ? 0.075 : 0.07) * b, 0.05 * b, 0.42), legSkin ? skin : bot); th.add(tg);
      if (a.bottom === 'short') { const sh = mesh(limbGeo(0.085 * b, 0.075 * b, 0.13), bot); th.add(sh); }
      if (a.bottom === 'bermuda') { const cuff = mesh(limbGeo(0.064 * b, 0.062 * b, 0.4), bot); th.add(cuff); }
      const kn = J['knee' + key] = new THREE.Group(); kn.position.y = -0.43; th.add(kn);
      const sg = mesh(limbGeo(0.05 * b, 0.034 * b, 0.4), fullLegs ? bot : skin); kn.add(sg);
      const an = J['ankle' + key] = new THREE.Group(); an.position.y = -0.42; kn.add(an);
      this.buildShoe(an, a, shoeM, sole, skin, bot, fullLegs);
    }
    // bolsa transversal
    if (a.bag) {
      const strap = mesh(new THREE.TorusGeometry(0.2, 0.008, 4, 30), acc); strap.scale.set(1.05 * b, 1.4, 0.7 * b); strap.rotation.z = -0.65; strap.position.set(0, -0.05, 0); chest.add(strap);
      const bag = mesh(new THREE.BoxGeometry(0.2, 0.15, 0.06), acc); bag.position.set(0.19 * b, -0.05, 0.03); hips.add(bag);
    }
    body.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    this.rest = {};
    for (const [k, j] of Object.entries(J)) this.rest[k] = j.rotation.clone();
  }

  buildHead(head, a, skin, hairM, acc) {
    const fem = a.base === 'feminino';
    const fw = 0.88 + a.faceW * 0.16, jw = 0.8 + a.jaw * 0.3;
    const cran = mesh(new THREE.SphereGeometry(0.1, 28, 22), skin); cran.scale.set(fw * 0.95, 1.12, 1.04); cran.position.y = 0.015; head.add(cran);
    const jaw = mesh(new THREE.SphereGeometry(0.085, 24, 18), skin); jaw.scale.set(fw * jw * (fem ? 0.92 : 1), 0.82, 1.0); jaw.position.set(0, -0.035, 0.016); head.add(jaw);
    const chin = mesh(new THREE.SphereGeometry(0.03, 12, 10), skin); chin.position.set(0, -0.085, 0.06); chin.scale.set(jw * 1.1, 0.8, 0.9); head.add(chin);
    for (const sx of [-1, 1]) { const cheek = mesh(new THREE.SphereGeometry(0.03, 12, 10), skin); cheek.position.set(sx * 0.05 * fw, -0.01, 0.068); head.add(cheek); }
    // olhos
    const es = 0.85 + a.eyeSize * 0.35;
    const white = colorMaterial('#f6f3ee', 0.25), iris = colorMaterial(a.eyeColor, 0.3), pupil = colorMaterial('#0a0a0a', 0.2);
    const lid = colorMaterial(new THREE.Color(a.skin).multiplyScalar(0.88).getStyle(), 0.6);
    for (const sx of [-1, 1]) {
      const eg = new THREE.Group(); eg.position.set(sx * 0.037 * fw, 0.017, 0.083); head.add(eg);
      const e = mesh(new THREE.SphereGeometry(0.0155 * es, 14, 10), white); e.scale.set(1.15, 0.85, 0.7); eg.add(e);
      const ir = mesh(new THREE.SphereGeometry(0.0085 * es, 12, 8), iris); ir.position.z = 0.0095 * es; ir.scale.z = 0.5; eg.add(ir);
      const pu = mesh(new THREE.SphereGeometry(0.0042 * es, 8, 6), pupil); pu.position.z = 0.0128 * es; pu.scale.z = 0.4; eg.add(pu);
      const ul = mesh(new THREE.SphereGeometry(0.0168 * es, 14, 8, 0, Math.PI * 2, 0, 1.2), lid); ul.scale.set(1.18, 0.9, 0.75); ul.rotation.x = -0.25; eg.add(ul);
      if (fem) { const lash = mesh(new THREE.TorusGeometry(0.0145 * es, 0.0018, 4, 12, Math.PI), colorMaterial('#1a1410', 0.6)); lash.position.set(0, 0.002, 0.007); lash.scale.set(1.1, 0.7, 1); eg.add(lash); }
      const brow = mesh(new THREE.CapsuleGeometry(0.004 + a.brows * 0.0035, 0.026, 3, 6), hairM); brow.rotation.z = Math.PI / 2 + sx * 0.12; brow.position.set(sx * 0.04 * fw, 0.042, 0.093); head.add(brow);
      const ear = mesh(new THREE.SphereGeometry(0.022, 10, 8), skin); ear.scale.set(0.45, 1.25, 0.8); ear.position.set(sx * 0.095 * fw, 0.005, 0.0); head.add(ear);
    }
    // nariz
    const ns = 0.8 + a.nose * 0.45;
    const bridge = mesh(new THREE.CapsuleGeometry(0.008 * ns, 0.03 * ns, 3, 8), skin); bridge.position.set(0, 0.0, 0.098); bridge.rotation.x = -0.35; head.add(bridge);
    const tip = mesh(new THREE.SphereGeometry(0.013 * ns, 12, 8), skin); tip.position.set(0, -0.018, 0.106 + 0.004 * ns); head.add(tip);
    for (const sx of [-1, 1]) { const al = mesh(new THREE.SphereGeometry(0.008 * ns, 8, 6), skin); al.position.set(sx * 0.011 * ns, -0.022, 0.1); head.add(al); }
    // boca
    const mw = 0.8 + a.mouth * 0.4;
    const lipC = new THREE.Color(a.skin).lerp(new THREE.Color(fem ? '#b5525a' : '#9a5a55'), fem ? 0.45 : 0.3);
    const lipM = colorMaterial(lipC.getStyle(), 0.45);
    const ul2 = mesh(new THREE.CapsuleGeometry(0.0055, 0.03 * mw, 3, 8), lipM); ul2.rotation.z = Math.PI / 2; ul2.position.set(0, -0.043, 0.092); head.add(ul2);
    const ll = mesh(new THREE.CapsuleGeometry(0.0068, 0.026 * mw, 3, 8), lipM); ll.rotation.z = Math.PI / 2; ll.position.set(0, -0.054, 0.09); head.add(ll);
    // barba
    if (a.beard !== 'nenhuma' && a.beard) {
      if (a.beard === 'curta' || a.beard === 'cheia') {
        const full = a.beard === 'cheia';
        const bd = mesh(new THREE.SphereGeometry(0.091, 24, 16, Math.PI * 0.08, Math.PI * 0.84, Math.PI * 0.48, Math.PI * 0.45), hairM);
        bd.material = hairM.clone(); bd.material.side = THREE.DoubleSide;
        bd.scale.set(fw * jw * 1.04, full ? 1.0 : 0.88, full ? 1.12 : 1.04); bd.position.set(0, -0.03, 0.015); bd.rotation.y = Math.PI * 0; head.add(bd);
      }
      if (a.beard !== 'nenhuma') { const m = mesh(new THREE.CapsuleGeometry(0.006, 0.034, 3, 6), hairM); m.rotation.z = Math.PI / 2; m.position.set(0, -0.034, 0.1); head.add(m); }
      if (a.beard === 'cavanhaque') { const c = mesh(new THREE.SphereGeometry(0.02, 10, 8), hairM); c.position.set(0, -0.085, 0.072); c.scale.set(1, 1.2, 0.7); head.add(c); }
    }
    this.buildHair(head, a, hairM, fw);
    // óculos
    if (a.glasses) {
      const fm = colorMaterial('#1b1b1b', 0.35, 0.3);
      for (const sx of [-1, 1]) {
        const r = mesh(new THREE.TorusGeometry(0.019, 0.0028, 6, 20), fm); r.position.set(sx * 0.037 * fw, 0.016, 0.102); r.scale.y = 0.85; head.add(r);
        const ln = mesh(new THREE.CircleGeometry(0.018, 16), colorMaterial('#9fb8c4', 0.05, 0, { transparent: true, opacity: 0.25 })); ln.position.copy(r.position); head.add(ln);
        const tm = mesh(new THREE.BoxGeometry(0.003, 0.003, 0.09), fm); tm.position.set(sx * 0.057 * fw, 0.018, 0.058); head.add(tm);
      }
      const br = mesh(new THREE.BoxGeometry(0.018, 0.003, 0.003), fm); br.position.set(0, 0.022, 0.104); head.add(br);
    }
    // chapéus
    if (a.hat && a.hat !== 'nenhum') {
      const hm = fabricMaterial(a.hatColor);
      if (a.hat === 'bone') {
        const dome = mesh(new THREE.SphereGeometry(0.108, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hm); dome.scale.set(fw, 1.0, 1.08); dome.position.y = 0.045; head.add(dome);
        const brim = mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.008, 20, 1, false, -Math.PI / 2, Math.PI), hm); brim.scale.set(1, 1, 0.9); brim.position.set(0, 0.05, 0.08); brim.rotation.x = 0.12; head.add(brim);
      } else if (a.hat === 'gorro') {
        const dome = mesh(new THREE.SphereGeometry(0.112, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hm); dome.scale.set(fw, 1.12, 1.08); dome.position.y = 0.03; head.add(dome);
        const band = mesh(new THREE.TorusGeometry(0.1, 0.018, 8, 26), hm); band.rotation.x = Math.PI / 2; band.scale.set(fw * 1.06, 1.1, 1); band.position.y = 0.03; head.add(band);
      } else {
        const big = a.hat === 'chapeu';
        const crown = mesh(new THREE.CylinderGeometry(big ? 0.088 : 0.084, 0.1, big ? 0.12 : 0.085, 22), hm); crown.position.y = 0.11; crown.scale.z = 1.08; head.add(crown);
        const brim = mesh(new THREE.CylinderGeometry(big ? 0.21 : 0.16, big ? 0.21 : 0.16, 0.008, 28), hm); brim.position.y = 0.06; head.add(brim);
        const band = mesh(new THREE.CylinderGeometry(0.101, 0.101, 0.022, 22, 1, true), colorMaterial('#222', 0.6)); band.position.y = 0.075; band.scale.z = 1.08; head.add(band);
      }
    }
  }

  buildHair(head, a, hairM, fw) {
    const style = a.hair; if (style === 'careca') return;
    const add = (geo, x, y, z, sx = 1, sy = 1, sz = 1, mat = hairM) => { const m = mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); head.add(m); return m; };
    const cap = (r, theta, tilt = 0.32, y = 0.018) => {
      const m = add(new THREE.SphereGeometry(r, 28, 18, 0, Math.PI * 2, 0, theta), 0, y, -0.004, fw * 0.97, 1.13, 1.06);
      m.rotation.x = -tilt; return m;
    };
    if (style === 'raspado') { const shaved = colorMaterial(new THREE.Color(a.skin).lerp(new THREE.Color(a.hairColor), 0.55).getStyle(), 0.9); cap(0.1025, 1.55, 0.35).material = shaved; return; }
    if (style === 'black') { const m = add(new THREE.IcosahedronGeometry(0.165, 3), 0, 0.055, -0.025, fw, 0.92, 0.98); m.material = hairM.clone(); m.material.flatShading = false; this.bumpify(m, 0.012, 7); return; }
    cap(style === 'crespo' ? 0.108 : 0.106, style === 'curto' || style === 'social' || style === 'crespo' ? 1.5 : 1.62, 0.3);
    switch (style) {
      case 'social': add(new THREE.SphereGeometry(0.06, 14, 10), 0.012, 0.11, 0.035, 1.2, 0.5, 1); break;
      case 'crespo': { const c = cap(0.114, 1.45, 0.3); this.bumpify(c, 0.006, 30); break; }
      case 'franja': add(new THREE.SphereGeometry(0.09, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), 0, 0.055, 0.035, fw * 1.02, 0.7, 0.85).rotation.x = 0.45; break;
      case 'medio': case 'longo': case 'ondulado': {
        const len = style === 'medio' ? 0.17 : 0.36;
        const back = add(new THREE.CylinderGeometry(0.104, style === 'medio' ? 0.105 : 0.115, len, 24, 6, true, Math.PI * 0.62, Math.PI * 1.76), 0, 0.02 - len / 2 + 0.02, -0.012, fw, 1, 0.95);
        back.material = hairM.clone(); back.material.side = THREE.DoubleSide;
        if (style === 'ondulado') this.bumpify(back, 0.012, 14);
        add(new THREE.SphereGeometry(0.06, 14, 10), 0, 0.105, 0.02, 1.4 * fw, 0.45, 1.3); // volume superior
        break;
      }
      case 'cacheado': {
        const R = (i) => Math.sin(i * 12.9898) * 43758.5453 % 1;
        for (let i = 0; i < 70; i++) {
          const u = Math.abs(R(i + 1)), v = Math.abs(R(i + 7));
          const th = u * Math.PI * 2, ph = v * 1.9;
          if (Math.cos(th) > 0.55 && ph > 0.9) continue; // rosto livre
          const r = 0.112;
          add(new THREE.SphereGeometry(0.034, 8, 6), Math.sin(ph) * Math.sin(th) * r * fw, Math.cos(ph) * r * 1.1 + 0.015 - (ph > 1.4 ? 0.05 : 0), Math.sin(ph) * Math.cos(th) * r - 0.005);
        }
        break;
      }
      case 'coque': add(new THREE.SphereGeometry(0.052, 16, 12), 0, 0.12, -0.075); break;
      case 'rabo': { add(new THREE.SphereGeometry(0.03, 10, 8), 0, 0.06, -0.105); const t = add(new THREE.CapsuleGeometry(0.032, 0.22, 4, 10), 0, -0.06, -0.14); t.rotation.x = 0.35; break; }
      case 'tranças': for (const sx of [-1, 1]) for (let i = 0; i < 10; i++) add(new THREE.SphereGeometry(0.022, 8, 6), sx * 0.05, -0.02 - i * 0.035, -0.09 - i * 0.004, 1, 1.15, 1); break;
    }
  }
  bumpify(m, amt, freq) {
    const g = m.geometry; const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = Math.sin(x * freq * 10 + y * 7) * Math.cos(z * freq * 10 - y * 5) * amt;
      const l = Math.hypot(x, y, z) || 1;
      p.setXYZ(i, x + x / l * n, y + y / l * n, z + z / l * n);
    }
    g.computeVertexNormals();
  }

  buildShoe(an, a, shoeM, sole, skin, bot, fullLegs) {
    const s = a.shoes;
    const foot = new THREE.Group(); foot.position.set(0, -0.02, 0.0); an.add(foot);
    const showFoot = s === 'sandalia' || s === 'chinelo';
    if (showFoot) { const f = mesh(new THREE.CapsuleGeometry(0.036, 0.11, 4, 10), skin); f.rotation.x = Math.PI / 2; f.scale.set(1.05, 1, 0.7); f.position.set(0, -0.03, 0.045); foot.add(f); }
    if (s === 'tenis' || s === 'sapato' || s === 'salto') {
      const sh = mesh(new THREE.CapsuleGeometry(0.044, 0.12, 4, 12), shoeM); sh.rotation.x = Math.PI / 2; sh.scale.set(1.05, 1, s === 'tenis' ? 0.9 : 0.72); sh.position.set(0, -0.025, 0.045); foot.add(sh);
      if (s === 'tenis') { const so = mesh(new THREE.BoxGeometry(0.09, 0.025, 0.24), sole); so.position.set(0, -0.06, 0.045); foot.add(so); }
      if (s === 'salto') { const h = mesh(new THREE.CylinderGeometry(0.01, 0.014, 0.06, 8), sole); h.position.set(0, -0.055, -0.03); foot.add(h); }
      else if (s === 'sapato') { const so = mesh(new THREE.BoxGeometry(0.085, 0.015, 0.22), sole); so.position.set(0, -0.06, 0.045); foot.add(so); }
    } else if (s === 'bota') {
      const shaft = mesh(new THREE.CylinderGeometry(0.052, 0.05, 0.2, 14), shoeM); shaft.position.y = 0.06; foot.add(shaft);
      const sh = mesh(new THREE.CapsuleGeometry(0.047, 0.11, 4, 12), shoeM); sh.rotation.x = Math.PI / 2; sh.scale.set(1.05, 1, 0.85); sh.position.set(0, -0.025, 0.045); foot.add(sh);
      const so = mesh(new THREE.BoxGeometry(0.095, 0.025, 0.23), sole); so.position.set(0, -0.06, 0.045); foot.add(so);
    } else {
      const so = mesh(new THREE.BoxGeometry(0.085, 0.018, 0.24), shoeM); so.position.set(0, -0.06, 0.045); foot.add(so);
      if (s === 'sandalia') for (let i = 0; i < 2; i++) { const st = mesh(new THREE.TorusGeometry(0.037, 0.006, 4, 12, Math.PI), shoeM); st.position.set(0, -0.045, 0.02 + i * 0.07); foot.add(st); }
      else { const st = mesh(new THREE.TorusGeometry(0.035, 0.005, 4, 12, Math.PI), shoeM); st.rotation.y = Math.PI / 2; st.position.set(0, -0.045, 0.06); foot.add(st); }
    }
    this.joints.foot = foot;
  }

  // speed em m/s, airborne quando no ar
  update(dt, speed = this.speed, airborne = false) {
    this.t += dt;
    const J = this.joints; if (!J) return;
    const walk = Math.min(1, speed / 1.3), run = Math.max(0, Math.min(1, (speed - 2.6) / 2.4));
    const stride = 1.35 + run * 1.1;
    this.phase += dt * Math.PI * 2 * (speed / stride);
    const ph = this.phase;
    const k = 1 - Math.exp(-dt * 14);
    const set = (joint, x, y = 0, z = 0) => {
      const r = this.rest[joint]; const j = J[joint]; if (!j) return;
      j.rotation.x += (r.x + x - j.rotation.x) * k; j.rotation.y += (r.y + y - j.rotation.y) * k; j.rotation.z += (r.z + z - j.rotation.z) * k;
    };
    const legA = 0.42 * walk + 0.38 * run, armA = 0.32 * walk + 0.55 * run;
    const breathe = Math.sin(this.t * 1.7) * 0.012;
    if (airborne) {
      set('thighL', -0.55); set('thighR', -0.2); set('kneeL', 0.9); set('kneeR', 0.5);
      set('shoulderL', -0.4, 0, 0.35); set('shoulderR', -0.4, 0, -0.35); set('elbowL', -0.6); set('elbowR', -0.6);
      set('spine', 0.08);
    } else {
      const s = Math.sin(ph);
      set('thighL', -s * legA - run * 0.1);
      set('thighR', s * legA - run * 0.1);
      set('kneeL', Math.max(0, Math.sin(ph - 1.6)) * (0.75 * walk + 0.9 * run) + 0.05 * walk);
      set('kneeR', Math.max(0, Math.sin(ph + Math.PI - 1.6)) * (0.75 * walk + 0.9 * run) + 0.05 * walk);
      set('ankleL', Math.max(0, -Math.sin(ph)) * 0.2 * walk); set('ankleR', Math.max(0, Math.sin(ph)) * 0.2 * walk);
      const idleSway = (1 - walk) * Math.sin(this.t * 0.9) * 0.03;
      set('shoulderL', s * armA - this.interact * 1.2, 0, 0.07 + idleSway);
      set('shoulderR', -s * armA, 0, -0.07 - idleSway);
      set('elbowL', -(0.12 + walk * 0.25 + run * 1.1) - this.interact * 0.3);
      set('elbowR', -(0.12 + walk * 0.25 + run * 1.1));
      set('spine', run * 0.2 + walk * 0.03, Math.sin(ph) * 0.06 * walk);
      set('chest', breathe, -Math.sin(ph) * 0.1 * walk);
      J.hips.position.y = 0.95 - run * 0.03 + Math.abs(Math.cos(ph)) * 0.025 * walk - 0.012 * walk;
    }
    // olhar ocioso
    this.lookTimer -= dt;
    if (this.lookTimer <= 0) { this.lookTimer = 2 + Math.random() * 4; this.lookTarget = (Math.random() - 0.5) * (speed < 0.2 ? 0.9 : 0.2); }
    set('head', speed < 0.2 ? Math.sin(this.t * 0.5) * 0.04 : 0, this.lookTarget);
    if (this.interact > 0) this.interact = Math.max(0, this.interact - dt * 1.5);
  }
}
