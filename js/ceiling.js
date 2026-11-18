// ============================================================
// TROCKENBAU-MODUL (Test) – Knauf Deckensysteme D11 / D13
// Deckenfläche als Polygon, Profilraster (Deckenspiegel), Prüfung der
// Abstände nach Knauf-Tabellen, Massenermittlung, Werkzeug & Eigenschaften.
// ============================================================
import * as G from './geom.js';
import { state, nid, fmtNum } from './model.js';
import { Tool } from './tools.js';
import { emit } from './render.js';
import { BOARDS } from './drywall.js';

// ---------- Systemdaten (Knauf D11.de / D13.de) ----------
// Abhängerabstand a [mm] je Grundprofilabstand c (bzw. Traglatte/Tragprofil b bei direkter Befestigung)
// Spalten: Lastklasse ≤ 0,15 / ≤ 0,30 / ≤ 0,50 kN/m²  (ohne Brandschutz bzw. Brandschutz nur von unten)
const TAB = {
  D111: { 500: [1200, 950, 800], 600: [1150, 900, 750], 700: [1050, 850, 700], 800: [1050, 800, null], 900: [1000, 800, null], 1000: [950, null, null], 1100: [900, null, null], 1200: [900, null, null] },
  D112: { 500: [1200, 950, 800], 600: [1150, 900, 750], 700: [1100, 850, 700], 800: [1050, 800, 700], 900: [1000, 800, null], 1000: [950, 750, null], 1100: [900, 750, null], 1200: [900, null, null] },
  D113: { 500: [1200, 950, 800], 600: [1150, 900, 750], 700: [1100, 850, 700], 800: [1050, 800, 700], 900: [1000, 800, null], 1000: [950, 750, null], 1100: [900, 750, null], 1200: [900, 700, null], 1250: [900, 650, null] },
  D116: { 500: [2600, 2050, 1600], 600: [2450, 1950, 1300], 700: [2300, 1850, 1100], 800: [2200, 1650, 1000], 900: [2150, 1450, null], 1000: [2050, 1300, null], 1100: [2000, 1200, null], 1200: [1950, null, null], 1300: [1900, null, null], 1400: [1850, null, null], 1500: [1750, null, null] },
  DIRECT: { 500: [1200, 950, 800], 625: [null, 900, 750], 800: [null, 800, 700] },
};
// D131 freitragend, max. Raumbreite [m] Doppelprofil: [Bauplatte 12,5 | Diamant 12,5 | 2× 12,5]
const SPAN131 = { 50: [2.90, 2.75, 2.70], 75: [3.60, 3.45, 3.40], 100: [4.25, 4.05, 3.95], 125: [4.80, 4.55, 4.50], 150: [5.30, 5.05, 4.95] };
export const LOADS = [[0.15, '≤ 0,15 kN/m²'], [0.30, '≤ 0,30 kN/m²'], [0.50, '≤ 0,50 kN/m²']];

export const CSYS = {
  D111: { label: 'D111 – Plattendecke, Holz-UK (Grund- + Traglatte)', uk: 'holz', tab: 'D111', def: { b: 500, c: 900, load: 0.15, board: 'GKB', t: 12.5, layers: 1, hanger: 'direkt' } },
  D112: { label: 'D112 – Plattendecke, Metall-UK CD 60/27 abgehängt', uk: 'cd2', tab: 'D112', def: { b: 500, c: 1000, load: 0.30, board: 'GKB', t: 12.5, layers: 2, hanger: 'direkt' } },
  D112B: { label: 'D112 – Deckenbekleidung, CD 60/27 direkt befestigt', uk: 'cd1', tab: 'DIRECT', def: { b: 500, c: 0, load: 0.30, board: 'GKB', t: 12.5, layers: 1, hanger: 'direkt' } },
  D113: { label: 'D113 – Plattendecke, CD 60/27 niveaugleich', uk: 'cdn', tab: 'D113', def: { b: 500, c: 1250, load: 0.15, board: 'GKB', t: 12.5, layers: 1, hanger: 'direkt' } },
  D116: { label: 'D116 – Plattendecke weitspannend, UA 50/40 + CD 60/27', uk: 'ua', tab: 'D116', def: { b: 500, c: 1000, load: 0.15, board: 'GKB', t: 12.5, layers: 1, hanger: 'nonius' } },
  D131: { label: 'D131 – Freitragende Decke, CW-Doppelprofil', uk: 'free', def: { b: 500, c: 0, load: 0.15, board: 'GKB', t: 12.5, layers: 2, prof: 100, hanger: 'none' } },
};
const BOARD_L = 2000; // Deckenplatten 1250 × 2000

export function bMax(board, t) { if (board === 'Silentboard') return 400; if (t >= 25) return 800; if (t >= 18) return 625; if (t >= 15) return 550; return 500; }
export function aMax(sys, c, b, load) {
  const S = CSYS[sys]; if (!S || !S.tab) return null;
  const T = TAB[S.tab]; const key = S.uk === 'cd1' ? b : c;
  const rows = Object.keys(T).map(Number).sort((x, y) => x - y);
  const row = rows.find((r) => r >= key - 1e-6); if (!row) return null;
  const col = load <= 0.15 ? 0 : load <= 0.30 ? 1 : 2;
  return T[row][col];
}
export function cMax(sys) { const S = CSYS[sys]; if (!S || !S.tab || S.uk === 'cd1') return null; return Math.max(...Object.keys(TAB[S.tab]).map(Number)); }
export const effA = (e) => (e.a === 'auto' || !e.a) ? Math.floor((aMax(e.sys, +e.c, +e.b, +e.load) || 600) / 50) * 50 : +e.a;

export function applyCeilingSystem(e, sys) { const S = CSYS[sys]; if (!S) return; e.sys = sys; Object.assign(e, S.def); e.a = 'auto'; }

// ---------- Geometrie / Raster ----------
const LIP = { trag: 100, grund: 150, hang: 250 }; // Randabstände (ca.)
function autoDir(pts) {
  let best = 0, bl = -1;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; const l = G.dist(a, b); if (l > bl) { bl = l; best = G.deg(G.ang(a, b)); } }
  return ((Math.round(best * 100) / 100) % 180 + 180) % 180;
}
export function newCeiling(pts, holes, o) {
  const n = state.doc.ents.filter((x) => x.type === 'ceiling').length + 1;
  const e = { type: 'ceiling', pts: pts.map(G.clone), holes: holes || [], name: 'Decke ' + n, label: true, uk: true, z: +o.z || 2750, ins: +o.ins || 0 };
  applyCeilingSystem(e, o.sys || 'D112');
  for (const k of ['board', 't', 'layers', 'b', 'c', 'load', 'hanger', 'prof']) if (o[k] !== undefined && o[k] !== '') e[k] = o[k];
  e.dir = o.dir === 'auto' || o.dir === undefined ? autoDir(pts) : +o.dir;
  return e;
}
const cache = new WeakMap();
export function ceilingLayout(e) {
  const key = JSON.stringify([e.pts, e.holes, e.sys, e.b, e.c, e.a, e.load, e.dir, e.board, e.t]);
  const c0 = cache.get(e); if (c0 && c0.key === key) return c0.L;
  const S = CSYS[e.sys] || CSYS.D112;
  const th = G.rad(+e.dir || 0); const u = { x: Math.cos(th), y: Math.sin(th) }, v = G.perp(u);
  const toL = (p) => ({ x: G.dot(p, u), y: G.dot(p, v) });
  const toW = (q) => ({ x: u.x * q.x + v.x * q.y, y: u.y * q.x + v.y * q.y });
  const rings = [e.pts, ...(e.holes || [])];
  const lr = rings.map((r) => r.map(toL));
  const bb = G.bboxOf(lr[0]);
  const lines = (lo, hi, step, inset) => { const out = []; if (hi - lo < 2 * inset) { out.push((lo + hi) / 2); return out; } let x = lo + inset; for (; x <= hi - inset + 1e-6; x += step) out.push(x); if (hi - inset - out[out.length - 1] > 50) out.push(hi - inset); return out; };
  const b = Math.max(100, +e.b || 500), c = Math.max(200, +e.c || 1000), a = effA(e);
  // Tragprofile: entlang u, Abstand b quer (v)
  const tragV = lines(bb.y0, bb.y1, b, LIP.trag);
  const trag = [];
  for (const y of tragV) for (const [p, q] of G.clipSegToRings({ x: bb.x0 - 10, y }, { x: bb.x1 + 10, y }, lr)) trag.push([p, q]);
  // Grundprofile: entlang v, Abstand c in u-Richtung
  const hasGrund = ['holz', 'cd2', 'cdn', 'ua'].includes(S.uk);
  const grundU = hasGrund ? lines(bb.x0, bb.x1, c, LIP.grund) : [];
  const grund = [];
  for (const x of grundU) for (const [p, q] of G.clipSegToRings({ x, y: bb.y0 - 10 }, { x, y: bb.y1 + 10 }, lr)) grund.push([p, q]);
  // Abhänger
  const hang = [];
  const along = (segs, step) => { for (const [p, q] of segs) { const L = G.dist(p, q); if (L < 2 * LIP.hang) { hang.push(G.mid(p, q)); continue; } const n = Math.ceil((L - 2 * LIP.hang) / step - 1e-9); for (let i = 0; i <= n; i++) hang.push(G.lerp(p, q, (LIP.hang + (L - 2 * LIP.hang) * i / n) / L)); } };
  if (hasGrund) along(grund, a); else if (S.uk === 'cd1') along(trag, a);
  // Kreuzungen
  let cross = 0; for (const x of grundU) for (const y of tragV) if (G.pointInRings({ x, y }, lr)) cross++;
  const area = Math.abs(G.polyArea(e.pts)) - (e.holes || []).reduce((s, r) => s + Math.abs(G.polyArea(r)), 0);
  let perim = 0; for (const r of rings) for (let i = 0; i < r.length; i++) perim += G.dist(r[i], r[(i + 1) % r.length]);
  const W = (s) => s.map(([p, q]) => [toW(p), toW(q)]);
  const L = { trag: W(trag), grund: W(grund), hang: hang.map(toW), cross, area, perim, a, b, c, S, tragLen: trag.reduce((s, [p, q]) => s + G.dist(p, q), 0), grundLen: grund.reduce((s, [p, q]) => s + G.dist(p, q), 0), tragSegs: trag.map(([p, q]) => G.dist(p, q)), grundSegs: grund.map(([p, q]) => G.dist(p, q)) };
  cache.set(e, { key, L });
  return L;
}
export function ceilingCentroid(e) {
  let A = 0, cx = 0, cy = 0; const p = e.pts;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const f = p[j].x * p[i].y - p[i].x * p[j].y; A += f; cx += (p[j].x + p[i].x) * f; cy += (p[j].y + p[i].y) * f; }
  return Math.abs(A) < 1e-9 ? p[0] : { x: cx / (3 * A), y: cy / (3 * A) };
}

// ---------- Darstellung (Deckenspiegel) ----------
export function emitCeiling(e, B, sc, st) {
  const L = ceilingLayout(e);
  if (e.uk !== false) {
    const thin = { color: '#8a8f96', lw: 0.13, dash: [] };
    const grundSt = { color: st.color, lw: 0.18, dash: [3, 1.5] };
    B.segs(L.trag, L.S.uk === 'free' ? { color: st.color, lw: 0.25, dash: [] } : thin);
    if (L.grund.length) B.segs(L.grund, grundSt);
    const s = 1.2 * sc; const xs = [];
    for (const p of L.hang) xs.push([{ x: p.x - s, y: p.y - s }, { x: p.x + s, y: p.y + s }], [{ x: p.x - s, y: p.y + s }, { x: p.x + s, y: p.y - s }]);
    if (xs.length) B.segs(xs, { color: st.color, lw: 0.18, dash: [] });
  }
  for (const r of [e.pts, ...(e.holes || [])]) B.stroke(r, true, { color: st.color, lw: Math.max(st.lw, 0.35), dash: [] });
  if (e.label !== false) {
    const cpt = ceilingCentroid(e); const h = 2.5 * sc;
    const t1 = `${e.name || 'Decke'} · ${e.sys.replace('D112B', 'D112')} · ${e.layers}× ${e.board} ${fmtNum(+e.t, 1)}`;
    const t2 = L.S.uk === 'free' ? `2× CW ${e.prof} · b = ${fmtNum(L.b, 0)} · ${fmtNum(L.area / 1e6, 2)} m²` : `b = ${fmtNum(L.b, 0)}${L.grund.length ? ` · c = ${fmtNum(L.c, 0)}` : ''}${L.hang.length ? ` · a = ${fmtNum(L.a, 0)}` : ''} · ${fmtNum(L.area / 1e6, 2)} m²`;
    B.text({ x: cpt.x, y: cpt.y + 0.4 * h }, t1, h, 0, 'c', 'b', st.color);
    B.text({ x: cpt.x, y: cpt.y - 1.4 * h }, t2, h * 0.85, 0, 'c', 'b', st.color);
  }
}

// ---------- Massenermittlung ----------
export function ceilingTakeoff(e, p = {}) {
  const L = ceilingLayout(e); const S = L.S;
  const t = +e.t, n = +e.layers || 1; const A = L.area / 1e6; const U = L.perim / 1000;
  const q = { kind: 'ceiling', area: A, len: 0, h: 0, d: n * t, items: [], warn: [] };
  const add = (key, label, qty, unit, note) => q.items.push({ key, label, qty, unit, note });
  const W = q.warn;
  const bm = bMax(e.board, t); if (L.b > bm) W.push(`Tragprofilabstand b = ${L.b} mm > ${bm} mm zulässig für ${e.board} ${fmtNum(t, 1)} mm`);
  const cm = cMax(e.sys); if (cm && L.c > cm && L.grund.length) W.push(`Grundprofilabstand c = ${L.c} mm > ${cm} mm (Tabelle ${e.sys})`);
  const am = aMax(e.sys, L.c, L.b, +e.load);
  if (S.tab && L.hang.length) { if (!am) W.push(`Für c = ${L.c} mm und Lastklasse ${fmtNum(+e.load, 2)} kN/m² kein Tabellenwert – Abstände verringern`); else if (L.a > am) W.push(`Abhängerabstand a = ${L.a} mm > ${am} mm zulässig`); }
  if ((S.uk === 'free') && L.tragSegs.length) {
    const col = n >= 2 ? 2 : e.board === 'Diamant' ? 1 : 0; const span = (SPAN131[e.prof] || SPAN131[100])[col] * 1000; const mx = Math.max(...L.tragSegs);
    if (mx > span) W.push(`Spannweite ${fmtNum(mx / 1000, 2)} m > ${fmtNum(span / 1000, 2)} m (2× CW ${e.prof})`);
  }
  const cdPieces = (segs) => segs.reduce((s, l) => s + Math.max(0, Math.ceil(l / 4000 - 1e-9) - 1), 0);
  // Unterkonstruktion
  if (S.uk === 'holz') {
    add('GL', 'Grundlatte 50 × 30 mm', L.grundLen / 1000, 'lfm'); add('TL', 'Traglatte 50 × 30 mm', L.tragLen / 1000, 'lfm');
    add('TN43', 'Schnellbauschraube TN 4,3 × 55', L.cross, 'Stk', 'Verbindung Grund-/Traglatte');
    add('ABH-H', 'Direktabhänger für Holzlatte', L.hang.length, 'Stk', `a ≤ ${L.a} mm`); add('TN25', 'Schnellbauschraube TN 3,5 × 25', 2 * L.hang.length, 'Stk', '2 je Direktabhänger');
  }
  if (['cd2', 'cdn', 'cd1', 'ua'].includes(S.uk)) {
    if (S.uk === 'cdn') add('CD119', 'CD-Profil 60/27, 1190 mm (Tragprofil niveaugleich)', Math.ceil(L.tragLen / 1190), 'Stk', `${fmtNum(L.tragLen / 1000, 1)} lfm`);
    else add('CD-T', 'CD-Profil 60/27 – Tragprofil', L.tragLen / 1000, 'lfm');
    if (S.uk === 'cd2' || S.uk === 'cdn') add('CD-G', 'CD-Profil 60/27 – Grundprofil', L.grundLen / 1000, 'lfm');
    if (S.uk === 'ua') add('UA50', 'UA-Profil 50/40 – Grundprofil', L.grundLen / 1000, 'lfm');
    const lv = cdPieces(L.tragSegs) + (S.uk !== 'ua' ? cdPieces(L.grundSegs) : 0); if (lv) add('LV', 'Längsverbinder für CD 60/27', lv, 'Stk');
    if (S.uk === 'cd2') add('KV', 'Kreuzverbinder für CD 60/27', L.cross, 'Stk');
    if (S.uk === 'cdn') add('NV', 'Niveauverbinder für CD 60/27', L.cross, 'Stk');
    if (S.uk === 'ua') add('KVUA', 'Kreuzverbinder für UA 50/40 / CD', L.cross, 'Stk');
    add('UD', 'UD-Profil 28/27 – Randprofil', U, 'lfm', 'umlaufend');
    const nh = L.hang.length;
    if (S.uk === 'ua') { add('ABH-NO', 'Nonius-Hänger-Oberteil + Nonius-Bügel für UA + Splint', nh, 'Stk', `a ≤ ${L.a} mm`); add('LB16', 'Blechschraube LB 3,5 × 16', 2 * nh + 4 * cdPieces(L.grundSegs), 'Stk', 'Bügel/UA-Stöße'); }
    else if (e.hanger === 'nonius') { add('ABH-NO', 'Nonius-Hänger-Oberteil + Unterteil + Splint', nh, 'Stk', `a ≤ ${L.a} mm`); add('LN11', 'Blechschraube LN 3,5 × 11', 2 * nh, 'Stk'); }
    else { add('ABH-D', 'Direktabhänger für CD 60/27', nh, 'Stk', `a ≤ ${L.a} mm`); add('LN11', 'Blechschraube LN 3,5 × 11', 2 * nh, 'Stk', '2 je Abhänger'); }
  }
  if (S.uk === 'free') {
    const nP = L.tragSegs.length; const stock = [2500, 2600, 2750, 3000, 3250, 3500, 4000, 4500, 5000, 6000];
    for (const l of L.tragSegs) { const s = stock.find((x) => x >= l - 10) || 6000; add(`CW${e.prof}-${s}`, `CW-Profil ${e.prof} × 50 × 0,6 – Lieferlänge ${s} mm`, 2, 'Stk', 'Doppelprofil'); }
    add(`UW${e.prof}`, `UW-Profil ${e.prof} × 40 × 0,6 – Randprofil`, U, 'lfm', 'umlaufend');
    add('LN11', 'Blechschraube LN 3,5 × 11', L.tragSegs.reduce((s, l) => s + 4 + Math.floor(l / 750) + 1, 0), 'Stk', 'Doppelprofile + Auflager, a ≤ 750 mm');
    void nP;
  }
  // Befestigung
  const anchors = L.hang.length; const udFix = Math.ceil(L.perim / (S.uk === 'free' ? 500 : 1000));
  add('DN', 'Knauf Deckennagel / Befestigungsmittel', anchors + udFix, 'Stk', `${anchors ? anchors + ' Abhänger + ' : ''}Randprofil a ≤ ${S.uk === 'free' ? 500 : 1000} mm`);
  // Beplankung
  const bw = 1250; const per = Math.ceil(A * 1e6 * 1.1 / (bw * BOARD_L) - 1e-9);
  for (let i = 0; i < n; i++) add(`B-${e.board}-${t}-${BOARD_L}`, `${BOARDS[e.board]?.label || e.board} ${fmtNum(t, 1)} mm – ${bw} × ${BOARD_L} mm`, per, 'Stk', `${i + 1}. Lage, inkl. 10 % Verschnitt`);
  for (let i = 0; i < n; i++) {
    const outer = i === n - 1; const perM2 = (S.uk === 'cdn' && n === 1 ? 25 : outer ? 17 : 9) * 500 / L.b; const T = (i + 1) * t; const sl = [25, 35, 45, 55, 70, 90].find((x) => x >= T + 10) || 90;
    add(`TN${sl}`, `Schnellbauschraube TN 3,5 × ${sl}`, perM2 * A, 'Stk', `${i + 1}. Lage, a ≤ ${outer ? 170 : 500} mm`);
  }
  if (+e.ins > 0) add(`MW${e.ins}`, `Mineralwolle ${fmtNum(+e.ins, 0)} mm (Auflage)`, A, 'm²');
  add('TF', 'Trenn-Fix', U, 'lfm', 'umlaufend');
  if (p.strip !== false) add('FDS', 'Fugendeckstreifen (Stirnkanten)', 0.45 * A, 'lfm');
  add('UNI', 'Fugenspachtel (z. B. Uniflott) – Schätzwert', (0.3 + 0.2 * (n - 1)) * A + U * 0.1, 'kg');
  return q;
}

// ---------- Bedienung ----------
let C = null;
export function initCeiling(ctx) { C = ctx; }
export function ensureCeilingLayer() {
  let L = state.doc.layers.find((l) => l.name === 'Decken');
  if (!L) { L = { id: 'Ld' + Date.now().toString(36), name: 'Decken', color: '#00838f', lw: 0.25, lt: 'solid', vis: true, lock: false, print: true }; state.doc.layers.push(L); }
  return L.id;
}
export class CeilingTool extends Tool {
  constructor(app) { super(app); this.poly = false; }
  msg() { const o = this.app.opts.ceil; return this.poly ? (this.pts.length ? 'Deckenumriss: weitere Punkte – Enter oder Startpunkt schließt' : 'Deckenumriss: ersten Punkt wählen') : `Decke ${o.sys.replace('D112B', 'D112 direkt')}: in den Raum klicken (Fläche wird aus Wänden/Linien erkannt)`; }
  rawClick() { return !this.poly; }
  create(pts, holes) {
    const e = newCeiling(pts, holes, this.app.opts.ceil);
    e.layer = ensureCeilingLayer();
    this.app.addEnts([e]); this.app.commit(); C.refreshPanels();
    C.toast(`${e.name}: ${fmtNum(Math.abs(G.polyArea(pts)) / 1e6, 2)} m²`);
  }
  click(p) {
    if (this.poly) {
      if (this.pts.length > 2 && G.dist(p, this.pts[0]) < this.app.tol()) return this.finish();
      this.pts.push(p); return this.update();
    }
    const segs = this.app.segsAll();
    const f = G.findFace(segs, p);
    if (!f) { C.toast('Keine geschlossene Fläche gefunden – „Umriss zeichnen" verwenden'); return; }
    this.create(f.pts, f.holes);
  }
  finish() { if (this.pts.length > 2) this.create(this.pts, []); this.pts = []; this.update(); }
  enter() { if (this.poly && this.pts.length > 2) this.finish(); else super.enter(); }
  chips() {
    const c = [{ t: this.poly ? 'Raum anklicken' : 'Umriss zeichnen', f: () => { this.poly = !this.poly; this.pts = []; this.update(); } }];
    if (this.poly && this.pts.length) c.push({ t: 'Zurück', f: () => { this.pts.pop(); this.update(); } });
    if (this.poly && this.pts.length > 2) c.push({ t: 'Schließen', f: () => this.finish(), main: true });
    return c;
  }
  preview(B, sc) {
    if (!this.poly || !this.pts.length) return;
    const pts = this.cur ? [...this.pts, this.cur] : this.pts;
    if (pts.length > 2) emit(Object.assign(newCeiling(pts, [], this.app.opts.ceil), { id: '_tmp', layer: state.doc.cur }), B, sc);
    else B.stroke(pts, false, { color: '#1e6cff', lw: 0.25, dash: [] });
  }
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v) => String(v).replace('.', ',');
const selO = (name, opts, cur) => `<select data-o="${name}">${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
export function optbarHtml(o) {
  const S = CSYS[o.sys] || CSYS.D112; const B = BOARDS[o.board] || BOARDS.GKB;
  return `<label class="ob">System ${selO('c.sys', Object.entries(CSYS).map(([k, s]) => [k, s.label]), o.sys)}</label>
    <label class="ob">Platte ${selO('c.board', Object.keys(BOARDS).map((k) => [k, k]), o.board)}</label>
    <label class="ob">d ${selO('c.t', B.t.map((t) => [t, num(t)]), o.t)}</label>
    <label class="ob">Lagen ${selO('c.layers', [[1, '1'], [2, '2'], [3, '3']], o.layers)}</label>
    ${S.uk === 'free' ? `<label class="ob">Profil ${selO('c.prof', [50, 75, 100, 125, 150].map((p) => [p, '2× CW ' + p]), o.prof)}</label>` : ''}
    <label class="ob">b ${selO('c.b', [[312.5, '312,5'], [400, '400'], [417, '417'], [500, '500'], [550, '550'], [625, '625'], [800, '800']], o.b)}</label>
    ${['holz', 'cd2', 'cdn', 'ua'].includes(S.uk) ? `<label class="ob">c ${selO('c.c', [500, 600, 700, 800, 900, 1000, 1100, 1200, 1250, 1300, 1400, 1500].map((x) => [x, x]), o.c)}</label>` : ''}
    ${S.tab ? `<label class="ob">Last ${selO('c.load', LOADS, o.load)}</label>` : ''}
    <label class="ob">Richtung ${selO('c.dir', [['auto', 'auto'], [0, '0°'], [90, '90°']], o.dir)}</label>`;
}
export function optbarChange(o, kk, v) {
  if (kk === 'sys') { Object.assign(o, CSYS[v].def, { sys: v }); return 'rerender'; }
  if (kk === 'board') { o.board = v; const B = BOARDS[v]; if (!B.t.includes(+o.t)) o.t = B.t[0]; return 'rerender'; }
  o[kk] = ['t', 'layers', 'b', 'c', 'load', 'prof'].includes(kk) ? parseFloat(v) : v;
}
export function propsHtml(ents, common, row) {
  const e0 = ents[0]; const one = ents.length === 1; const S = CSYS[common('sys')];
  const sv = (k, opts, isNum) => `<select data-k="${k}" ${isNum ? 'data-num="1"' : ''}>${common(k) === undefined ? '<option value="">– verschieden –</option>' : ''}${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(common(k)) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  let h = `<div class="psec">Decke (Test)</div>`;
  if (one) h += row('Bezeichnung', `<input data-k="name" value="${esc(e0.name)}">`);
  h += row('System', sv('sys', Object.entries(CSYS).map(([k, s]) => [k, s.label])));
  h += row('Platte', sv('board', Object.entries(BOARDS).map(([k, b]) => [k, b.label])));
  const B = BOARDS[common('board')] || BOARDS.GKB;
  h += row('Plattendicke', sv('t', B.t.map((t) => [t, num(t) + ' mm']), true));
  h += row('Lagen', sv('layers', [[1, '1'], [2, '2'], [3, '3']], true));
  if (S && S.uk === 'free') h += row('Profil', sv('prof', [50, 75, 100, 125, 150].map((p) => [p, '2× CW ' + p]), true));
  h += row(S?.uk === 'free' ? 'Profilabstand b' : 'Tragprofil b', sv('b', [[312.5, '312,5 mm'], [400, '400 mm'], [417, '417 mm'], [500, '500 mm'], [550, '550 mm'], [625, '625 mm'], [800, '800 mm']], true));
  if (S && ['holz', 'cd2', 'cdn', 'ua'].includes(S.uk)) h += row('Grundprofil c', sv('c', [500, 600, 700, 800, 900, 1000, 1100, 1200, 1250, 1300, 1400, 1500].map((x) => [x, x + ' mm']), true));
  if (S && S.tab) {
    h += row('Lastklasse', sv('load', LOADS, true));
    h += row('Abhänger a', `<input data-k="a" value="${common('a') === 'auto' ? 'auto' : (common('a') ?? '')}" placeholder="auto = Tabellenwert">`);
    if (S.uk !== 'ua') h += row('Abhängertyp', sv('hanger', [['direkt', 'Direktabhänger'], ['nonius', 'Nonius-Hänger']]));
  }
  h += row('Profilrichtung °', `<input data-k="dir" data-num="1" value="${num(Math.round((common('dir') ?? 0) * 100) / 100)}" inputmode="decimal">`);
  h += row('Dämmauflage', sv('ins', [[0, 'ohne'], [40, '40 mm'], [60, '60 mm'], [80, '80 mm'], [100, '100 mm']], true));
  h += row('Unterkante (3D)', `<input data-k="z" data-num="1" value="${common('z') ?? ''}" inputmode="decimal">`);
  h += row('Unterkonstruktion zeigen', `<input type="checkbox" data-k="uk" ${common('uk') !== false ? 'checked' : ''}>`);
  h += row('Beschriftung', `<input type="checkbox" data-k="label" ${common('label') !== false ? 'checked' : ''}>`);
  if (one) {
    const q = ceilingTakeoff(e0); const L = ceilingLayout(e0);
    h += `<div class="pinfo">Fläche ${fmtNum(q.area, 2)} m² · Umfang ${fmtNum(L.perim / 1000, 2)} m<br>${L.trag.length} Trag-, ${L.grund.length} Grundprofile · ${L.hang.length} Abhänger · ${L.cross} Kreuzungen${S?.tab ? `<br>a = ${L.a} mm (max. ${aMax(e0.sys, L.c, L.b, +e0.load) ?? '–'} mm)` : ''}</div>`;
    if (q.warn.length) h += `<div class="pinfo warn">⚠ ${q.warn.map(esc).join('<br>⚠ ')}</div>`;
  }
  h += `<div class="pbtns"><button data-act="ceRot">Profilrichtung 90° drehen</button><button data-act="dwMass" class="primary">Massenermittlung</button></div>`;
  return h;
}
export function propChanged(e, k, v) {
  if (k === 'sys' && CSYS[v]) { const keep = { z: e.z, ins: e.ins, dir: e.dir }; applyCeilingSystem(e, v); Object.assign(e, keep); return true; }
  if (k === 'board') { const B = BOARDS[v]; if (B && !B.t.includes(+e.t)) e.t = B.t[0]; }
  if (k === 'a') { const s = String(v).trim().toLowerCase(); e.a = (!s || s === 'auto') ? 'auto' : parseFloat(s.replace(',', '.')) || 'auto'; return 'handled'; }
  return false;
}
export function propAction(act, ents) {
  if (act === 'ceRot') { for (const e of ents) if (e.type === 'ceiling') e.dir = ((+e.dir || 0) + 90) % 180; C.app.commit(); }
}
