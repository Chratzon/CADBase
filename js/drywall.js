// ============================================================
// TROCKENBAU-MODUL (Test) – Knauf Wandsysteme W11 / W61 / W62
// Querschnitt als Schichtbänder, Eckverschnitt, Massenermittlung, Wandansicht.
// Zum Entfernen: diese Datei + drywall-ui.js löschen und die mit
// "Trockenbau" markierten Zeilen in main/model/render/view3d/tools.
// ============================================================
import * as G from './geom.js';
import { state, nid, fmtNum } from './model.js';
import { cwProfile } from './gen.js';

// ---------- Kataloge ----------
// stud: CW | CWD (CW-Doppelprofil/Kasten) | UWD (UW-Doppelprofil) | CD (CD 60/27 + Direktabhänger) | RIEGEL | NONE
// sides: 2 = beidseitig, 1 = einseitig (Seite B = Raumseite, Seite A = Grundwand/Schacht)
// maxH in m bei a = 625 mm (Werte aus Knauf-Detailblättern, ohne Brandschutz; null = nicht hinterlegt)
export const SYSTEMS = {
  W111: { cat: 'Metallständerwände (W11)', label: 'W111 – Einfachständerwerk, 1-lagig', stud: 'CW', sides: 2, rows: 1, layers: 1, maxH: { 50: 3.0, 75: 4.0, 100: 5.1 }, dub: 1000,
    def: { prof: 75, achs: 625, board: 'GKB', t: 12.5, ins: 60, just: 'M', gap: 0 } },
  W112: { cat: 'Metallständerwände (W11)', label: 'W112 – Einfachständerwerk, 2-lagig', stud: 'CW', sides: 2, rows: 1, layers: 2, maxH: { 50: 4.0, 75: 5.0, 100: 7.0 }, dub: 1000,
    def: { prof: 75, achs: 625, board: 'GKB', t: 12.5, ins: 60, just: 'M', gap: 0 } },
  W113: { cat: 'Metallständerwände (W11)', label: 'W113 – Einfachständerwerk, 3-lagig', stud: 'CW', sides: 2, rows: 1, layers: 3, maxH: { 50: 5.2, 75: 7.65, 100: 9.6 }, dub: 1000,
    def: { prof: 75, achs: 625, board: 'GKB', t: 12.5, ins: 60, just: 'M', gap: 0 } },
  W115: { cat: 'Metallständerwände (W11)', label: 'W115 – Doppelständerwerk entkoppelt, 2-lagig', stud: 'CW', sides: 2, rows: 2, layers: 2, maxH: null, dub: 1000, gapLabel: 'Abstand Ständerreihen',
    def: { prof: 75, achs: 625, board: 'GKB', t: 12.5, ins: 60, just: 'M', gap: 5 } },
  W116: { cat: 'Metallständerwände (W11)', label: 'W116 – Installationswand, Doppelständerwerk verlascht', stud: 'CW', sides: 2, rows: 2, layers: 2, maxH: { 50: 4.0, 75: 4.55, 100: 5.9 }, dub: 1000, gapLabel: 'Installationsraum zw. Ständerreihen', laschen: true,
    def: { prof: 50, achs: 625, board: 'GKB', t: 12.5, ins: 40, just: 'M', gap: 100 } },
  W623: { cat: 'Vorsatzschalen (W61)', label: 'W623 – Vorsatzschale CD 60/27, direkt befestigt', stud: 'CD', sides: 1, rows: 1, layers: 1, maxH: { 27: 10.0 }, dub: 1000, gapLabel: 'Abstand CD zur Wand', hanger: 1500,
    def: { prof: 27, achs: 625, board: 'GKB', t: 12.5, ins: 0, just: 'A', gap: 30 } },
  W625: { cat: 'Vorsatzschalen (W61)', label: 'W625 – Vorsatzschale freistehend CW, 1-lagig', stud: 'CW', sides: 1, rows: 1, layers: 1, maxH: { 50: 2.7, 75: 4.0, 100: 4.15 }, dub: 1000, gapLabel: 'Abstand zur Wand',
    def: { prof: 50, achs: 625, board: 'GKB', t: 12.5, ins: 40, just: 'A', gap: 10 } },
  W626: { cat: 'Vorsatzschalen (W61)', label: 'W626 – Vorsatzschale freistehend CW, 2-lagig', stud: 'CW', sides: 1, rows: 1, layers: 2, maxH: { 50: 3.0, 75: 4.0, 100: 4.5 }, dub: 1000, gapLabel: 'Abstand zur Wand',
    def: { prof: 50, achs: 625, board: 'GKB', t: 12.5, ins: 40, just: 'A', gap: 10 } },
  W627: { cat: 'Vorsatzschalen (W61)', label: 'W627 – Vorsatzschale freistehend CW-Doppelprofil, 2-lagig', stud: 'CWD', sides: 1, rows: 1, layers: 2, maxH: { 50: 4.0 }, dub: 1000, gapLabel: 'Abstand zur Wand',
    def: { prof: 50, achs: 625, board: 'GKB', t: 12.5, ins: 40, just: 'A', gap: 10 } },
  W653: { cat: 'Vorsatzschalen (W61)', label: 'W653 – Vorsatzschale freistehend CW, Massivbauplatte', stud: 'CW', sides: 1, rows: 1, layers: 1, maxH: null, dub: 1000, gapLabel: 'Abstand zur Wand',
    def: { prof: 50, achs: 625, board: 'Massivbau', t: 25, ins: 40, just: 'A', gap: 10 } },
  W628A: { cat: 'Schachtwände (W62)', label: 'W628A – Schachtwand freispannend', stud: 'NONE', sides: 1, rows: 0, layers: 2, maxH: { 0: 15.0 }, maxSpan: 2000, dub: 500, hor: true, screwFix: [300, 200],
    def: { prof: 0, achs: 625, board: 'Massivbau', t: 25, ins: 0, just: 'A', gap: 0 } },
  W628B: { cat: 'Schachtwände (W62)', label: 'W628B – Schachtwand Ständerwerk CW', stud: 'CW', sides: 1, rows: 1, layers: 2, maxH: { 50: 5.0, 75: 5.0, 100: 5.0 }, dub: 500,
    def: { prof: 75, achs: 625, board: 'GKF', t: 12.5, ins: 0, just: 'A', gap: 0 } },
  W629: { cat: 'Schachtwände (W62)', label: 'W629 – Schachtwand Ständerwerk CW-Doppelprofil', stud: 'CWD', sides: 1, rows: 1, layers: 2, maxH: { 50: 5.6, 75: 5.6, 100: 5.6 }, dub: 500,
    def: { prof: 75, achs: 625, board: 'GKF', t: 12.5, ins: 0, just: 'A', gap: 0 } },
  W630: { cat: 'Schachtwände (W62)', label: 'W630 – Schachtwand Riegelwerk CW', stud: 'RIEGEL', sides: 1, rows: 1, layers: 2, maxH: {}, noLimit: true, maxSpan: { 50: 3000, 75: 4000, 100: 5000 }, dub: 625,
    def: { prof: 75, achs: 312.5, board: 'GKF', t: 12.5, ins: 0, just: 'A', gap: 0 } },
  W635: { cat: 'Schachtwände (W62)', label: 'W635 – Schachtwand UW-Doppelprofil + eingestellte Platte', stud: 'UWD', sides: 1, rows: 1, layers: 2, maxH: { 50: 3.0, 75: 4.0, 100: 5.0 }, dub: 1000, inner: 12.5,
    def: { prof: 75, achs: 625, board: 'Diamant', t: 15, ins: 40, just: 'A', gap: 0 } },
};
export const BOARDS = {
  GKB: { label: 'Bauplatte GKB (A)', w: 1250, L: [2000, 2500, 2600, 2750, 3000], t: [12.5, 15, 18, 20, 25] },
  GKF: { label: 'Feuerschutzplatte GKF (DF)', w: 1250, L: [2000, 2500, 2600, 2750, 3000], t: [12.5, 15, 18, 20, 25] },
  GKBI: { label: 'Bauplatte imprägniert GKBI (H2)', w: 1250, L: [2000, 2500, 2600, 2750, 3000], t: [12.5, 15] },
  GKFI: { label: 'Feuerschutzplatte impr. GKFI (DFH2)', w: 1250, L: [2000, 2500, 2600, 2750, 3000], t: [12.5, 15, 18, 20, 25] },
  Diamant: { label: 'Diamant (DFH2IR)', w: 1250, L: [2000, 2500, 2600, 2750, 3000], t: [12.5, 15, 18] },
  Silentboard: { label: 'Silentboard', w: 625, L: [2000, 2500, 2600, 2750, 3000], t: [12.5] },
  Fireboard: { label: 'Fireboard', w: 1250, L: [2000, 2500], t: [15, 20, 25, 30] },
  Massivbau: { label: 'Massivbauplatte (GKF)', w: 625, L: [2000, 2500, 3000], t: [20, 25] },
};
export const MIN_INS = { 50: 40, 75: 60, 100: 80 };
const CW_STOCK = [2500, 2600, 2750, 3000, 3250, 3500, 4000, 4500, 5000, 6000];
const CD_STOCK = [2600, 3000, 4000];
const UW_STOCK = 4000;
const SCREW_L = [25, 35, 45, 55, 70, 90];
const SCREW_A = { 1: [250], 2: [750, 250], 3: [750, 500, 250] };
export const profilesFor = (sys) => { const s = SYSTEMS[sys]; if (!s) return [50, 75, 100]; if (s.stud === 'CD') return [27]; if (s.stud === 'NONE') return [0]; return [50, 75, 100]; };
export const profLabel = (sys, p) => { const s = SYSTEMS[sys]; if (!s) return 'CW ' + p; return { CD: 'CD 60/27', NONE: '–', UWD: `2× UW ${p}`, CWD: `2× CW ${p}`, RIEGEL: `CW ${p} (Riegel)` }[s.stud] || (s.rows === 2 ? `2× CW ${p}` : `CW ${p}`); };

export function applySystem(e, sys) {
  const S = SYSTEMS[sys]; if (!S) return;
  e.sys = sys; Object.assign(e, S.def);
  if (S.sides === 2) { e.nA = S.layers; e.nB = S.layers; } else { e.nA = 0; e.nB = S.layers; }
}

// ---------- Querschnitt ----------
// Bänder von Seite A (y klein) nach Seite B; grp: 'A' | 'core' | 'B'
export function xsec(e) {
  const S = SYSTEMS[e.sys] || SYSTEMS.W112;
  const t = +e.t, P = +e.prof, nA = S.sides === 2 ? +e.nA : 0, nB = +e.nB, gap = +e.gap || 0, ins = +e.ins || 0;
  const bands = [];
  for (let i = nA - 1; i >= 0; i--) bands.push({ kind: 'board', d: t, grp: 'A', idx: i, n: nA });
  if (S.sides === 1 && gap > 0) bands.push({ kind: 'gap', d: gap, grp: 'core', ins: S.stud === 'CD' ? Math.min(ins, gap) : 0 });
  if (S.stud === 'CD') bands.push({ kind: 'core', d: 27, grp: 'core', stud: 'CD', ins: 0 });
  else if (S.stud !== 'NONE') {
    if (S.rows === 2) {
      bands.push({ kind: 'core', d: P, grp: 'core', stud: 'CW', ins: Math.min(ins, P), row: 0 });
      bands.push({ kind: 'gap', d: Math.max(0, gap), grp: 'core', ins: 0 });
      bands.push({ kind: 'core', d: P, grp: 'core', stud: 'CW', ins: Math.min(ins, P), row: 1 });
    } else bands.push({ kind: 'core', d: P, grp: 'core', stud: S.stud, ins: Math.min(ins, P), inner: S.inner || 0 });
  }
  for (let i = 0; i < nB; i++) bands.push({ kind: 'board', d: t, grp: 'B', idx: i, n: nB });
  const D = bands.reduce((s, b) => s + b.d, 0);
  const y0 = e.just === 'A' ? 0 : e.just === 'B' ? -D : -D / 2;
  let y = y0; for (const b of bands) { b.y0 = y; y += b.d; b.y1 = y; }
  const grpY = (g) => { const bs = bands.filter((b) => b.grp === g); return bs.length ? [bs[0].y0, bs[bs.length - 1].y1] : null; };
  const yCore = grpY('core'); const yA = grpY('A'); const yB = grpY('B');
  // Grenze Kern/Seite: falls Seite ohne Platten, ist die Außenfläche die Grenze
  const coreA = yCore ? yCore[0] : (yA ? yA[1] : y0), coreB = yCore ? yCore[1] : (yB ? yB[0] : y0 + D);
  return { S, bands, D, y0, y1: y0 + D, coreA, coreB, nA, nB };
}
export function wallDims(e) { const X = xsec(e); return { D: X.D, y0: X.y0, P: +e.prof, t: +e.t, nA: X.nA, nB: X.nB }; }

function frame(e) {
  const u = G.norm(G.sub(e.b, e.a)); let n = G.perp(u); if (e.flip) n = G.mul(n, -1);
  const L = G.dist(e.a, e.b);
  return { u, n, L, W: (x, y) => ({ x: e.a.x + u.x * x + n.x * y, y: e.a.y + u.y * x + n.y * y }), ang: G.deg(Math.atan2(u.y, u.x)) };
}

// ---------- Eckverbindungen ----------
const wallById = (id) => state.doc.ents.find((x) => x.id === id && x.type === 'wall');
function partnerAt(e, end) {
  const j = end === 'a' ? e.jA : e.jB; if (!j) return null;
  const o = wallById(j.id); if (!o || o === e) return null;
  const p = end === 'a' ? e.a : e.b;
  const oEnd = G.dist(o.a, p) < 1 ? 'a' : G.dist(o.b, p) < 1 ? 'b' : null;
  if (!oEnd) return null;
  const ue = G.norm(G.sub(e.b, e.a)), uo = G.norm(G.sub(o.b, o.a));
  if (Math.abs(G.cross(ue, uo)) < 0.05) return null; // nahezu parallel
  return { o, oEnd, role: j.role, C: p };
}
// Schnittlinien je Gruppe an einem Wandende: {A, core, B} -> {p, d} oder null
function cutsAt(e, end) {
  const pj = partnerAt(e, end); if (!pj) return null;
  const { o, oEnd, role, C } = pj;
  const Fe = frame(e), Fo = frame(o);
  const dirE = end === 'a' ? Fe.u : G.mul(Fe.u, -1);       // Richtung in den Wandkörper von e
  const dirO = oEnd === 'a' ? Fo.u : G.mul(Fo.u, -1);      // Richtung in den Wandkörper von o
  const concE = G.dot(Fe.n, dirO) > 0 ? 'B' : 'A';         // konkave Seite von e
  const concO = G.dot(Fo.n, dirE) > 0 ? 'B' : 'A';
  const Xo = xsec(o);
  const line = (y) => ({ p: Fo.W(0, y), d: Fo.u });
  const oFace = { concave: concO === 'B' ? Xo.y1 : Xo.y0, convex: concO === 'B' ? Xo.y0 : Xo.y1, coreConvex: concO === 'B' ? Xo.coreA : Xo.coreB };
  const convE = concE === 'A' ? 'B' : 'A';
  if (role === 'through') {
    const L1 = line(oFace.coreConvex);
    return { A: L1, core: L1, B: L1, corner: { convE, convexBoarded: (convE === 'A' ? xsec(e).nA : xsec(e).nB) > 0 } };
  }
  const conc = line(oFace.concave), conv = line(oFace.convex);
  const r = { A: conc, core: conc, B: conc };
  r[convE] = conv;
  return r;
}
function lineParam(F, y, L) { // Schnitt der Bandlinie (y) mit Linie L -> x-Parameter
  const a = F.W(0, y), b = F.W(1000, y);
  const I = G.segSegInt(a, b, L.p, G.add(L.p, L.d), true);
  return I ? I.t * 1000 : null;
}
function clipHalf(poly, L, ref) {
  const side = (p) => G.cross(L.d, G.sub(p, L.p));
  const s0 = Math.sign(side(ref)) || 1;
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i], Q = poly[(i + 1) % poly.length];
    const sp = side(P) * s0, sq = side(Q) * s0;
    if (sp >= 0) out.push(P);
    if ((sp >= 0) !== (sq >= 0)) { const I = G.segSegInt(P, Q, L.p, G.add(L.p, L.d), true); if (I) out.push({ x: I.x, y: I.y }); }
  }
  return out;
}

// Bereiche je Band (x-Start/-Ende entlang der Bandmitte) + Schnittlinien
function layout(e) {
  const X = xsec(e), F = frame(e);
  const ca = cutsAt(e, 'a'), cb = cutsAt(e, 'b');
  const ext = 4000;
  for (const b of X.bands) {
    const ym = (b.y0 + b.y1) / 2;
    b.cutA = ca ? ca[b.grp] : null; b.cutB = cb ? cb[b.grp] : null;
    b.xs = b.cutA ? (lineParam(F, ym, b.cutA) ?? 0) : 0;
    b.xe = b.cutB ? (lineParam(F, ym, b.cutB) ?? F.L) : F.L;
    b.xa = b.cutA ? -ext : 0; b.xb = b.cutB ? F.L + ext : F.L;
  }
  const core = X.bands.filter((b) => b.grp === 'core');
  const cs = core.length ? Math.max(...core.map((b) => b.xs)) : 0, ce = core.length ? Math.min(...core.map((b) => b.xe)) : F.L;
  return { X, F, ca, cb, cs, ce };
}
function bandPoly(e, Lay, b, x0, x1) {
  const { F } = Lay; const ref = F.W(F.L / 2, (b.y0 + b.y1) / 2);
  let poly = [F.W(x0, b.y0), F.W(x1, b.y0), F.W(x1, b.y1), F.W(x0, b.y1)];
  if (b.cutA && x0 <= b.xs + 1e-6) poly = clipHalf(poly, b.cutA, ref);
  if (b.cutB && x1 >= b.xe - 1e-6) poly = clipHalf(poly, b.cutB, ref);
  return poly;
}

export function studPositions(xs, xe, a) {
  const L = xe - xs; const out = [xs];
  for (let x = xs + a; x < xe - 50 - 1e-6; x += a) out.push(x);
  if (L > 60) out.push(xe);
  return out;
}
export function wallOutline(e) {
  const Lay = layout(e); const { X, F } = Lay;
  const x0 = Math.min(...X.bands.map((b) => b.xs), 0), x1 = Math.max(...X.bands.map((b) => b.xe), F.L);
  return [F.W(x0, X.y0), F.W(x1, X.y0), F.W(x1, X.y1), F.W(x0, X.y1)];
}

const LL = (id, e) => (state.doc.layers.some((l) => l.id === id) ? id : e.layer);
const cache = new WeakMap();
function joinKey(e) {
  const k = [];
  for (const end of ['a', 'b']) { const pj = partnerAt(e, end); if (pj) k.push(end, pj.role, pj.o.a, pj.o.b, pj.o.sys, pj.o.prof, pj.o.t, pj.o.nA, pj.o.nB, pj.o.gap, pj.o.just, pj.o.flip); }
  return k;
}

// Profilformen im Grundriss (lokale Punkte)
function studShapes(stud, x, yb0, d, open, F) {
  const W = (p) => F.W(p.x, p.y);
  if (stud === 'CW') return [cwProfile(x, yb0, d, open).map(W)];
  if (stud === 'CWD') return [cwProfile(x, yb0, d, open).map(W), cwProfile(x + 50 * open, yb0, d, -open).map(W)];
  if (stud === 'UWD') return [cwProfile(x + 40 * open, yb0, d, -open, 'UW').map(W), cwProfile(x + 41 * open, yb0, d, open, 'UW').map(W)];
  if (stud === 'CD') { // Rücken (60) an der Plattenseite (yb0 + d), Schenkel zur Wand
    const yb = yb0 + d, ya = yb0; const x0 = open < 0 ? x - 60 : x, x1 = x0 + 60;
    return [[{ x: x0 + 6, y: ya }, { x: x0, y: ya }, { x: x0, y: yb }, { x: x1, y: yb }, { x: x1, y: ya }, { x: x1 - 6, y: ya }].map(W)];
  }
  return [];
}

// Teile für Grundriss (Horizontalschnitt)
export function wallParts(e) {
  const key = JSON.stringify([e.a, e.b, e.sys, e.prof, e.t, e.nA, e.nB, e.ins, e.achs, e.just, e.flip, e.gap, e.board, e.layer, joinKey(e)]);
  const c = cache.get(e); if (c && c.key === key) return c.parts;
  const Lay = layout(e); const { X, F, cs, ce } = Lay;
  const out = [];
  if (F.L < 1) return out;
  const xs = X.S.stud === 'RIEGEL' || X.S.stud === 'NONE' ? [cs, ce] : studPositions(cs, ce, +e.achs);
  const hatch = (pts, pattern, olw, extra = {}) => out.push(Object.assign({ id: '_wp', type: 'hatch', layer: LL('L2', e), pts, pattern, scale: 1, angle: F.ang, outline: true, olw }, extra));
  for (const b of X.bands) {
    if (b.kind === 'board') hatch(bandPoly(e, Lay, b, b.xa, b.xb), 'gips', 0.35);
    if (b.kind === 'core' && b.inner) { const m = (b.y0 + b.y1) / 2; hatch(bandPoly(e, Lay, { ...b, y0: m - b.inner / 2, y1: m + b.inner / 2 }, b.xa, b.xb), 'gips', 0.25); }
    if ((b.kind === 'core' || b.kind === 'gap') && b.ins > 0) {
      const di = b.ins; const yi = b.kind === 'gap' ? b.y0 : b.y0 + (b.d - di) / 2;
      const parts = b.inner ? [[b.y0 + 1, (b.y0 + b.y1) / 2 - b.inner / 2], [(b.y0 + b.y1) / 2 + b.inner / 2, b.y1 - 1]] : [[yi, yi + di]];
      const fields = X.S.stud === 'RIEGEL' || X.S.stud === 'NONE' || b.kind === 'gap' ? [[cs, ce]] : xs.slice(0, -1).map((x, i) => [x + 0.6, xs[i + 1] - 0.6]);
      for (const [y0, y1] of parts) for (const [xa, xb] of fields) if (xb - xa > 5 && y1 - y0 > 2) hatch(bandPoly(e, Lay, { ...b, y0, y1 }, xa, xb), 'daemmung', 0.18, { angle: F.ang });
    }
  }
  for (const b of X.bands.filter((bb) => bb.kind === 'core')) {
    if (X.S.stud === 'RIEGEL') { // Riegel verdeckt, UW an den Enden
      for (const y of [b.y0, b.y1]) out.push({ id: '_wp', type: 'line', layer: LL('L6', e), a: F.W(cs, y), b: F.W(ce, y), lw: 0.25 });
      out.push({ id: '_wp', type: 'pline', layer: LL('L0', e), pts: cwProfile(cs, b.y0, b.d, 1, 'UW').map((p) => F.W(p.x, p.y)), closed: false, lw: 0.5 });
      out.push({ id: '_wp', type: 'pline', layer: LL('L0', e), pts: cwProfile(ce, b.y0, b.d, -1, 'UW').map((p) => F.W(p.x, p.y)), closed: false, lw: 0.5 });
      continue;
    }
    xs.forEach((x, i) => {
      const last = i === xs.length - 1 && i > 0;
      for (const sh of studShapes(b.stud, x, b.y0, b.d, last ? -1 : 1, F)) out.push({ id: '_wp', type: 'pline', layer: LL('L0', e), pts: sh, closed: false, lw: 0.5 });
    });
  }
  if (X.S.stud === 'NONE') { // Winkelprofile an den Enden
    for (const [x, o] of [[cs, 1], [ce, -1]]) out.push({ id: '_wp', type: 'pline', layer: LL('L0', e), pts: [F.W(x + o * 35, X.coreB), F.W(x, X.coreB), F.W(x, X.coreB - 50)], closed: false, lw: 0.5 });
  }
  cache.set(e, { key, parts: out });
  return out;
}

// Teile für 3D
export function wallParts3D(e) {
  const Lay = layout(e); const { X, F, cs, ce } = Lay; const H = +e.h;
  const out = []; if (F.L < 1) return out;
  const xs = X.S.stud === 'RIEGEL' || X.S.stud === 'NONE' ? [cs, ce] : studPositions(cs, ce, +e.achs);
  const P = (pts, pattern, ext, z0) => out.push({ id: '_w3', type: 'hatch', layer: e.layer, pts, pattern, scale: 1, angle: 0, outline: false, ext, z0 });
  for (const b of X.bands) {
    if (b.kind === 'board') {
      // in Felder teilen (saubere Sichtbarkeit)
      const cuts = [b.xa, ...xs.filter((x) => x > b.xs + 1 && x < b.xe - 1), b.xb];
      for (let i = 0; i < cuts.length - 1; i++) { const poly = bandPoly(e, Lay, b, cuts[i], cuts[i + 1]); if (poly.length > 2) P(poly, 'gips', H, 0); }
    }
    if (b.kind === 'core' && b.inner) { const m = (b.y0 + b.y1) / 2; P(bandPoly(e, Lay, { ...b, y0: m - b.inner / 2, y1: m + b.inner / 2 }, b.xa, b.xb), 'gips', H, 0); }
    if ((b.kind === 'core' || b.kind === 'gap') && b.ins > 0) {
      const yi = b.kind === 'gap' ? b.y0 : b.y0 + (b.d - b.ins) / 2;
      for (let i = 0; i < xs.length - 1; i++) P(bandPoly(e, Lay, { ...b, y0: yi, y1: yi + b.ins }, xs[i] + 1, xs[i + 1] - 1), 'daemmung', H - 80, 40);
    }
    if (b.kind === 'core') {
      if (X.S.stud === 'RIEGEL') { for (let z = 0; z <= H; z += 312.5) P(bandPoly(e, Lay, b, cs, ce), 'stahl', 2, Math.min(z, H - 2)); }
      else xs.forEach((x, i) => { const last = i === xs.length - 1 && i > 0; P(bandPoly(e, Lay, b, last ? x - 2 : x, last ? x : x + 2), 'stahl', H, 0); });
    }
  }
  return out;
}

export function wallLabel(e, sc) {
  const X = xsec(e); const F = frame(e);
  let a = Math.atan2(F.u.y, F.u.x); let flipTxt = false;
  if (a > Math.PI / 2 + 1e-6 || a <= -Math.PI / 2 + 1e-6) { a += Math.PI; flipTxt = true; }
  const side = flipTxt ? X.y0 - 4 * sc : X.y1 + 1.5 * sc;
  return { p: F.W(F.L / 2, side), ang: G.deg(a), text: `${e.name || 'Wand'} · ${e.sys} · ${profLabel(e.sys, e.prof)} · d = ${fmtNum(X.D, 1)}` };
}

// ---------- Massenermittlung ----------
function boardLen(board, H) { const B = BOARDS[board] || BOARDS.GKB; return B.L.find((l) => l >= H) || B.L[B.L.length - 1]; }
function strips(xs, xe, o, w) {
  const out = []; let s = xs + (o > 0 ? o - w : 0);
  for (; s < xe - 1e-6; s += w) { const x0 = Math.max(xs, s), x1 = Math.min(xe, s + w); if (x1 - x0 > 1) out.push([x0, x1]); }
  return out;
}
function screwTable(S, board, n) {
  if (S.screwFix) return S.screwFix;
  if (board === 'Massivbau' && n >= 2) return [300, 200];
  if (board === 'Silentboard' && n >= 2) return [600, 200];
  return SCREW_A[n] || SCREW_A[2];
}

export function wallTakeoff(e, p = {}) {
  const Lay = layout(e); const { X, F, cs, ce } = Lay; const S = X.S;
  const H = +e.h, a = +e.achs, P = +e.prof, t = +e.t;
  const Lc = Math.max(0, ce - cs);
  const conA = e.endA !== false && !Lay.ca, conB = e.endB !== false && !Lay.cb;
  const ends = (conA ? 1 : 0) + (conB ? 1 : 0);
  const warn = [];
  const mh = S.maxH ? (S.maxH[P] ?? null) : null;
  if (mh && a >= 625 && H / 1000 > mh) warn.push(`Wandhöhe ${fmtNum(H / 1000, 2)} m > ca. ${fmtNum(mh, 2)} m (${e.sys}, ${profLabel(e.sys, P)}) – Detailblatt prüfen`);
  if (!S.maxH && !S.noLimit) warn.push(`Max. Wandhöhe für ${e.sys} nicht hinterlegt – Detailblatt prüfen`);
  const span = typeof S.maxSpan === 'number' ? S.maxSpan : S.maxSpan?.[P];
  if (span && Lc > span) warn.push(`Spannweite ${fmtNum(Lc / 1000, 2)} m > ${fmtNum(span / 1000, 2)} m zulässig (${e.sys})`);
  if (S.stud !== 'CD' && S.stud !== 'NONE' && +e.ins > 0 && +e.ins < (MIN_INS[P] || 0) && S.sides === 2) warn.push(`Dämmung ${e.ins} mm unter Mindestdicke ${MIN_INS[P]} mm`);
  const q = { len: Lc, h: H, area: Lc * H / 1e6, d: X.D, items: [], warn };
  const add = (key, label, qty, unit, note) => q.items.push({ key, label, qty, unit, note });
  const stock = (list, l) => list.find((s) => s >= l);
  const cores = X.bands.filter((b) => b.kind === 'core');
  const rows = cores.length;
  const xsStud = S.stud === 'RIEGEL' || S.stud === 'NONE' ? [] : studPositions(cs, ce, a);
  const n = xsStud.length;
  // --- Unterkonstruktion
  const cwItem = (count, len, note) => { const s = stock(CW_STOCK, len); if (s) add(`CW${P}-${s}`, `CW-Profil ${P} × 50 × 0,6 – Lieferlänge ${s} mm`, count, 'Stk', note); else { add(`CW${P}-6000`, `CW-Profil ${P} × 50 × 0,6 – Lieferlänge 6000 mm`, count * Math.ceil(len / 6000), 'Stk', 'mit Profilstoß'); warn.push('Profillänge > 6 m – Stoß nach Detailblatt'); } };
  if (S.stud === 'CW') { cwItem(n * rows, H - 10, `Zuschnitt ${fmtNum(H - 10, 0)} mm`); add(`UW${P}`, `UW-Profil ${P} × 40 × 0,6`, 2 * Lc * rows / 1000, 'lfm', 'Boden + Decke'); }
  if (S.stud === 'CWD') { cwItem(2 * n, H - 10, 'Doppelprofil (2 je Ständer)'); add(`UW${P}`, `UW-Profil ${P} × 40 × 0,6`, 2 * Lc / 1000, 'lfm', 'Boden + Decke'); add('LN11', 'Blechschraube LN 3,5 × 11', n * (Math.floor(H / 500) + 1), 'Stk', 'Doppelprofil a ≤ 500 mm'); }
  if (S.stud === 'UWD') { add(`UW${P}`, `UW-Profil ${P} × 40 × 0,6`, (2 * Lc + 2 * n * (H - 10)) / 1000, 'lfm', 'Rand + Doppelständer'); add('LN11', 'Blechschraube LN 3,5 × 11', n * (Math.floor(H / 750) + 1), 'Stk', 'Doppelprofil a ≤ 750 mm'); }
  if (S.stud === 'CD') {
    const s = stock(CD_STOCK, H - 10) || 4000; add(`CD-${s}`, `CD-Profil 60/27 × 0,6 – Lieferlänge ${s} mm`, n * Math.ceil((H - 10) / s), 'Stk', `Zuschnitt ${fmtNum(H - 10, 0)} mm`);
    add('UD', 'UD-Profil 28/27 × 0,6', (2 * Lc + ends * H) / 1000, 'lfm', 'umlaufend');
    const hang = n * (Math.floor(H / (S.hanger || 1500)) + 1); add('DAH', 'Direktabhänger für CD 60/27', hang, 'Stk', `a ≤ ${S.hanger || 1500} mm`); q.hangers = hang;
  }
  if (S.stud === 'RIEGEL') {
    const nr = Math.floor(H / a) + 1; cwItem(nr, Lc - 10, `Riegel, Zuschnitt ${fmtNum(Lc - 10, 0)} mm, a = ${fmtNum(a, 1)} mm`);
    add(`UW${P}`, `UW-Profil ${P} × 40 × 0,6`, (2 * Lc + 2 * H) / 1000, 'lfm', 'umlaufend');
    q.riegel = nr;
  }
  if (S.stud === 'NONE') add('WP5035', 'Winkelprofil 50/35', (2 * Lc + 2 * H) / 1000, 'lfm', 'umlaufend');
  if (S.laschen) { const nl = n * Math.ceil(H / 900); const w = 2 * P + (+e.gap || 0); add('LASCHE', `Lasche aus Plattenstreifen 300 × ${fmtNum(w, 0)} mm`, nl, 'Stk', 'ca. alle 900 mm je Ständerpaar'); add('TN25', 'Schnellbauschraube TN 3,5 × 25', nl * 8, 'Stk', 'Laschen'); }
  // --- Beplankung, Schrauben, Fugen
  const bw = (BOARDS[e.board] || BOARDS.GKB).w;
  let jointsAll = 0, jointsOuter = 0, boardedSides = 0;
  for (const side of ['A', 'B']) {
    const bands = X.bands.filter((b) => b.kind === 'board' && b.grp === side);
    if (!bands.length) continue; boardedSides++;
    const nL = bands.length; const tab = screwTable(S, e.board, nL);
    for (const b of bands) {
      const i = b.idx; const xs = b.xs, xe = b.xe, Lb = Math.max(0, xe - xs);
      let count = 0, jl = 0;
      const bl = boardLen(e.board, S.hor ? Lb : H);
      if (S.hor) { // horizontal verlegt
        const rowsB = Math.ceil(H / bw - 1e-9), per = Math.ceil(Lb / bl - 1e-9);
        count = rowsB * per; jl = (rowsB - 1) * Lb / 1000 + (per - 1) * H / 1000;
        add(`B-${e.board}-${t}-${bl}`, `${BOARDS[e.board]?.label || e.board} ${fmtNum(t, 1)} mm – ${bw} × ${bl} mm`, count, 'Stk', 'horizontal verlegt');
      } else {
        const o = ((i + (side === 'B' ? 1 : 0)) % 2) * (bw >= 1250 ? 625 : 312.5);
        const st = strips(xs, xe, o, bw);
        let full = 0, part = 0; for (const [x0, x1] of st) { if (x1 - x0 >= bw - 1) full++; else part += x1 - x0; }
        const stack = H > 3000 ? Math.ceil(H / 3000) : 1;
        count = (full + Math.ceil(part / bw - 1e-9)) * stack;
        const joints = st.slice(1).map(([x0]) => x0);
        jl = joints.length * H / 1000 + (stack - 1) * Lb / 1000;
        add(`B-${e.board}-${t}-${stack > 1 ? 3000 : bl}`, `${BOARDS[e.board]?.label || e.board} ${fmtNum(t, 1)} mm – ${bw} × ${stack > 1 ? 3000 : bl} mm`, count, 'Stk');
        b._joints = joints;
      }
      jointsAll += jl; if (i === nL - 1) jointsOuter += jl;
      // Schrauben
      const sa = tab[i] || 250; const T = (i + 1) * t; const sl = SCREW_L.find((l) => l >= T + 10) || 90;
      let screws = 0;
      if (S.stud === 'NONE') screws = Math.ceil((2 * Lb + 2 * H) / sa);
      else if (S.stud === 'RIEGEL') screws = (q.riegel || 0) * (Math.floor(Lb / sa) + 1) + ((b._joints || []).length) * (q.riegel || 0);
      else { const perRow = Math.floor(H / sa) + 1; let r = 0; for (const x of xsStud) r += (b._joints || []).some((j) => Math.abs(j - x) < 1) ? 2 : 1; screws = r * perRow; }
      add(`TN${sl}`, `Schnellbauschraube TN 3,5 × ${sl}`, screws, 'Stk', `${i + 1}. Lage, a ≤ ${sa} mm`);
    }
  }
  if (S.inner) { add(`B-GKF-12.5-in`, `Feuerschutzplatte GKF 12,5 mm – eingestellt, 1250 × ${boardLen('GKF', H)} mm`, Math.ceil(Lc / 1250 - 1e-9), 'Stk', 'eingestellte Plattenlage'); }
  // --- Dämmung
  for (const b of X.bands) if (b.ins > 0) add(`MW${b.ins}`, `Mineralwolle ${fmtNum(b.ins, 0)} mm`, Lc * H / 1e6, 'm²');
  // --- Anschlüsse
  const rowsUW = S.stud === 'NONE' || S.stud === 'CD' ? 1 : rows;
  add(`DB${P || 50}`, `Anschlussdichtung ${S.stud === 'CD' ? 25 : Math.max(30, (P || 50) - 5)} mm`, (2 * Lc + ends * H) * rowsUW / 1000, 'lfm', 'unter Rand-/Anschlussprofilen');
  const dub = S.dub || 1000, nd = (len) => Math.max(3, Math.ceil(len / dub) + 1);
  let dow = (2 * nd(Lc) + ends * nd(H)) * rowsUW; if (q.hangers) dow += q.hangers;
  add('DUEB', 'Drehstiftdübel / Befestigungsmittel', dow, 'Stk', `Rand a ≤ ${dub} mm${q.hangers ? ' + je Direktabhänger 1' : ''}`);
  const tfLen = boardedSides * ((p.tfBoden === false ? 1 : 2) * Lc + ends * H) / 1000;
  add('TF', 'Trenn-Fix', tfLen, 'lfm', `${boardedSides === 2 ? 'beidseitig' : 'einseitig'} an Anschlüssen`);
  if (p.strip !== false) add('FDS', 'Fugendeckstreifen / Glasfaserbewehrung', jointsOuter, 'lfm', 'Fugen der Decklage');
  // Außenecke
  let corners = 0; for (const c of [Lay.ca, Lay.cb]) if (c && c.corner && c.corner.convexBoarded) corners++;
  if (corners) add('ESS', 'Eckschutzschiene / Kantenschutz', corners * H / 1000, 'lfm', 'Außenecken');
  const kg = jointsAll * (p.kgJoint ?? 0.25) + boardedSides * Lc * H / 1e6 * (p.kgArea ?? 0.15) + tfLen * 0.1 + corners * H / 1000 * 0.3;
  add('UNI', 'Fugenspachtel (z. B. Uniflott) – Schätzwert', kg, 'kg', 'Fugen aller Lagen + Q2 Decklage');
  return q;
}

export function takeoffAll(walls, p = {}) {
  const per = walls.map((w) => ({ w, q: wallTakeoff(w, p) }));
  const map = new Map();
  for (const { q } of per) for (const it of q.items) { const m = map.get(it.key) || { ...it, qty: 0 }; m.qty += it.qty; map.set(it.key, m); }
  const z = 1 + (p.zuschlag ?? 5) / 100;
  const ORDER = ['CW', 'UW', 'CD', 'UD', 'DAH', 'WP', 'LN', 'LASCHE', 'B-', 'TN', 'MW', 'DB', 'DUEB', 'TF', 'FDS', 'ESS', 'UNI'];
  const rank = (k) => { const i = ORDER.findIndex((o) => k.startsWith(o)); return i < 0 ? 99 : i; };
  const rows = [...map.values()].sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key, 'de', { numeric: true }));
  for (const r of rows) {
    if (r.unit === 'lfm' && ['UW', 'UD', 'WP'].some((k) => r.key.startsWith(k))) { r.lfm = r.qty; r.qty = Math.ceil(r.qty / (UW_STOCK / 1000) - 1e-9); r.unit = 'Stk'; r.label += ` – Lieferlänge ${UW_STOCK} mm`; r.note = `${fmtNum(r.lfm, 2)} lfm netto${r.note ? ', ' + r.note : ''}`; }
    else if (['TN', 'LN', 'DB', 'TF', 'FD', 'UN', 'MW', 'ESS'].some((k) => r.key.startsWith(k))) {
      r.qty = r.qty * z;
      if (r.unit === 'Stk') r.qty = Math.ceil(r.qty / 50) * 50;
    }
  }
  return { per, rows, area: per.reduce((s, x) => s + x.q.area, 0), zuschlag: p.zuschlag ?? 5 };
}
export function fmtQty(r) { if (r.unit === 'Stk') return String(Math.ceil(r.qty - 1e-9)); return fmtNum(r.qty, r.unit === 'kg' ? 1 : 2); }

// ---------- Wandansicht mit Plattenteilung ----------
export function elevationEnts(e, side, Lf) {
  const Lay = layout(e); const { X, cs, ce } = Lay; const S = X.S;
  const H = +e.h; const sc = state.doc.sheet.sc;
  const bands = X.bands.filter((b) => b.kind === 'board' && b.grp === side);
  if (!bands.length) side = side === 'A' ? 'B' : 'A';
  const sb = X.bands.filter((b) => b.kind === 'board' && b.grp === side);
  const outer = sb[sb.length - 1];
  const xs0 = outer ? outer.xs : cs, xe0 = outer ? outer.xe : ce;
  const sh = (x) => x - xs0; const L = xe0 - xs0;
  const out = [];
  const ln = (a, b, layer, x = {}) => out.push(Object.assign({ id: nid(), type: 'line', a, b, layer }, x));
  out.push({ id: nid(), type: 'hatch', pts: [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: H }, { x: 0, y: H }], pattern: 'fuellung', fillColor: '#f6f4ef', outline: true, olw: 0.5, layer: Lf('L2'), ext: 0 });
  const xsStud = S.stud === 'RIEGEL' || S.stud === 'NONE' ? [] : studPositions(cs, ce, +e.achs);
  xsStud.forEach((x, i) => {
    const last = i === xsStud.length - 1 && i > 0; const w = S.stud === 'CD' ? 60 : S.stud === 'CWD' ? 50 : 50;
    const x0 = sh(last ? x - w : x), x1 = sh(last ? x : x + w);
    ln({ x: x0, y: 0 }, { x: x0, y: H }, Lf('L6')); ln({ x: x1, y: 0 }, { x: x1, y: H }, Lf('L6'));
  });
  if (S.stud === 'RIEGEL') for (let z = 0; z <= H; z += +e.achs) { ln({ x: 0, y: z }, { x: L, y: z }, Lf('L6')); }
  else if (S.stud !== 'NONE') { const fl = S.stud === 'CD' ? 27 : 40; ln({ x: 0, y: fl }, { x: L, y: fl }, Lf('L6')); ln({ x: 0, y: H - fl }, { x: L, y: H - fl }, Lf('L6')); }
  const bw = (BOARDS[e.board] || BOARDS.GKB).w; const bl = boardLen(e.board, S.hor ? L : H);
  let jointsX = [];
  if (outer) {
    if (S.hor) {
      for (let y = bw; y < H - 1; y += bw) ln({ x: 0, y }, { x: L, y }, Lf('L0'), { lw: 0.35 });
      for (let y = 0; y < H - 1; y += bw) out.push({ id: nid(), type: 'text', p: { x: L / 2, y: y + Math.min(bw, H - y) / 2 }, text: `${fmtNum(Math.min(L, bl), 0)} × ${fmtNum(Math.min(bw, H - y), 0)}`, h: 2.5, angle: 0, align: 'c', layer: Lf('L4') });
    } else {
      const o = ((outer.idx + (side === 'B' ? 1 : 0)) % 2) * (bw >= 1250 ? 625 : 312.5);
      const st = strips(xs0, xe0, o, bw); const stackH = H > 3000 ? 3000 : null;
      jointsX = st.slice(1).map(([x0]) => sh(x0));
      for (const x of jointsX) ln({ x, y: 0 }, { x, y: H }, Lf('L0'), { lw: 0.35 });
      if (stackH) for (let y = stackH; y < H; y += stackH) ln({ x: 0, y }, { x: L, y }, Lf('L0'), { lw: 0.35 });
      for (const [x0, x1] of st) { const w = x1 - x0; out.push({ id: nid(), type: 'text', p: { x: sh((x0 + x1) / 2), y: H / 2 }, text: `${fmtNum(w, 0)} × ${stackH ? 3000 : Math.round(H)}${!stackH && bl > H ? ` (aus ${bl})` : ''}`, h: 2.5, angle: w < 700 ? 90 : 0, align: 'c', layer: Lf('L4') }); }
    }
  }
  const dimH = (x0, x1, y) => out.push({ id: nid(), type: 'dim', a: { x: x0, y: 0 }, b: { x: x1, y: 0 }, p: { x: 0, y }, mode: 'h', layer: Lf('L3') });
  const st2 = xsStud.map(sh);
  for (let i = 0; i < st2.length - 1; i++) dimH(st2[i], st2[i + 1], -8 * sc);
  dimH(0, L, -16 * sc);
  out.push({ id: nid(), type: 'dim', a: { x: 0, y: 0 }, b: { x: 0, y: H }, p: { x: -8 * sc, y: 0 }, mode: 'v', layer: Lf('L3') });
  const jd = [0, ...jointsX, L];
  if (jd.length > 2) for (let i = 0; i < jd.length - 1; i++) out.push({ id: nid(), type: 'dim', a: { x: jd[i], y: H }, b: { x: jd[i + 1], y: H }, p: { x: 0, y: H + 8 * sc }, mode: 'h', layer: Lf('L3') });
  const T = `Ansicht ${e.name || 'Wand'} – Seite ${side} · Knauf ${e.sys} · ${profLabel(e.sys, e.prof)}${S.stud === 'RIEGEL' ? ' Riegel' : ''}, a = ${fmtNum(+e.achs, 1)} mm · ${sb.length}× ${BOARDS[e.board]?.label || e.board} ${fmtNum(+e.t, 1)} mm`;
  out.push({ id: nid(), type: 'text', p: { x: 0, y: H + 16 * sc }, text: T + '\nPlattenstöße der Decklage, Unterkonstruktion verdeckt', h: 3.5, angle: 0, align: 'l', layer: Lf('L4') });
  out.forEach((x) => { x.no3d = true; });
  return out;
}

export function tableEnts(res, Lf) {
  const sc = state.doc.sheet.sc;
  const cw = [8, 118, 22, 12].map((x) => x * sc); const rh = 6 * sc, th = 2.5;
  const rows = [['Pos.', 'Bezeichnung', 'Menge', 'Einh.'], ...res.rows.map((r, i) => [String(i + 1), r.label, fmtQty(r), r.unit])];
  const W = cw.reduce((a, b) => a + b, 0), Ht = rows.length * rh;
  const out = [];
  const ln = (a, b, lw) => out.push({ id: nid(), type: 'line', a, b, layer: Lf('L1'), lw });
  out.push({ id: nid(), type: 'text', p: { x: 0, y: Ht + 4 * sc }, text: `Massenermittlung Trockenbau – ${fmtNum(res.area, 2)} m² Wandfläche, Zuschlag ${res.zuschlag} %`, h: 3.5, angle: 0, align: 'l', bold: true, layer: Lf('L4') });
  for (let i = 0; i <= rows.length; i++) ln({ x: 0, y: Ht - i * rh }, { x: W, y: Ht - i * rh }, i <= 1 || i === rows.length ? 0.35 : 0.18);
  let x = 0; ln({ x: 0, y: 0 }, { x: 0, y: Ht }, 0.35);
  cw.forEach((w) => { x += w; ln({ x, y: 0 }, { x, y: Ht }, x === W ? 0.35 : 0.18); });
  rows.forEach((r, i) => {
    let cx = 0;
    r.forEach((c, j) => {
      const right = j === 2;
      out.push({ id: nid(), type: 'text', p: { x: right ? cx + cw[j] - 1.5 * sc : cx + 1.5 * sc, y: Ht - (i + 1) * rh + 1.8 * sc }, text: c, h: th, angle: 0, align: right ? 'r' : 'l', bold: i === 0, layer: Lf('L4') });
      cx += cw[j];
    });
  });
  out.forEach((o) => { o.no3d = true; });
  return out;
}

// Alte Wände (vor Systemkatalog) ergänzen
export function migrateWall(e) { if (e.gap === undefined) e.gap = SYSTEMS[e.sys]?.def.gap ?? 0; return e; }
