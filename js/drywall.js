// ============================================================
// TROCKENBAU-MODUL (Test) – Metallständerwände nach Knauf W11
// Geometrie, Massenermittlung, Wandansicht.
// Zum Entfernen: diese Datei + drywall-ui.js löschen und die mit
// "Trockenbau" markierten Zeilen in main/model/render/view3d/tools.
// ============================================================
import * as G from './geom.js';
import { state, nid, fmtNum } from './model.js';
import { cwProfile } from './gen.js';

// Systemdaten (Knauf Detailblatt W11.de). Max. Wandhöhen in m bei Achsabstand 625 mm,
// vorsichtig angesetzt – im Zweifel immer das aktuelle Detailblatt prüfen.
export const SYSTEMS = {
  W111: { label: 'W111 – Einfachständerwerk, 1-lagig', layers: 1, maxH: { 50: 3.0, 75: 4.5, 100: 5.0 } },
  W112: { label: 'W112 – Einfachständerwerk, 2-lagig', layers: 2, maxH: { 50: 4.0, 75: 5.0, 100: 7.0 } },
  W113: { label: 'W113 – Einfachständerwerk, 3-lagig', layers: 3, maxH: null },
};
export const BOARDS = {
  GKB: 'GKB (Typ A)', GKF: 'GKF (Typ DF)', GKBI: 'GKBI (Typ H2)', GKFI: 'GKFI (Typ DFH2)', Diamant: 'Diamant (DFH2IR)', Silentboard: 'Silentboard',
};
export const PROFILES = [50, 75, 100];
export const MIN_INS = { 50: 40, 75: 60, 100: 80 };
const BOARD_W = 1250;
const BOARD_L = [2000, 2500, 2600, 2750, 3000];
const CW_STOCK = [2500, 2600, 2750, 3000, 3250, 3500, 4000, 4500, 5000, 6000];
const UW_STOCK = 4000;
const SCREW_L = [25, 35, 45, 55, 65];
// Schraubabstände je Lage (mm) nach Detailblatt: 1-lagig 250; 2-lagig 750/250; 3-lagig 750/500/250
const SCREW_A = { 1: [250], 2: [750, 250], 3: [750, 500, 250] };

export const WALL_DEFAULTS = { sys: 'W112', prof: 75, achs: 625, board: 'GKB', t: 12.5, h: 2750, ins: 60, just: 'M', endA: true, endB: true, label: true };

export function wallDims(e) {
  const P = +e.prof, t = +e.t, nA = +e.nA, nB = +e.nB;
  const D = nA * t + P + nB * t;
  const y0 = e.just === 'A' ? 0 : e.just === 'B' ? -D : -D / 2;
  return { P, t, nA, nB, D, y0 };
}
function frame(e) {
  const u = G.norm(G.sub(e.b, e.a)); let n = G.perp(u); if (e.flip) n = G.mul(n, -1);
  const L = G.dist(e.a, e.b);
  return { u, n, L, W: (x, y) => ({ x: e.a.x + u.x * x + n.x * y, y: e.a.y + u.y * x + n.y * y }), ang: G.deg(Math.atan2(u.y, u.x)) };
}
export function studPositions(L, a) {
  const xs = [0];
  for (let x = a; x < L - 50 - 1e-6; x += a) xs.push(x);
  if (L > 60) xs.push(L);
  return xs;
}
export function wallOutline(e) {
  const { D, y0 } = wallDims(e); const F = frame(e);
  return [F.W(0, y0), F.W(F.L, y0), F.W(F.L, y0 + D), F.W(0, y0 + D)];
}

const LL = (id, e) => (state.doc.layers.some((l) => l.id === id) ? id : e.layer);
const cache = new WeakMap();

// Teile für Grundriss (Horizontalschnitt) und 3D
export function wallParts(e) {
  const key = JSON.stringify([e.a, e.b, e.prof, e.t, e.nA, e.nB, e.ins, e.achs, e.just, e.flip, e.layer]);
  const c = cache.get(e); if (c && c.key === key) return c.parts;
  const { P, t, nA, nB, y0 } = wallDims(e); const F = frame(e); const L = F.L;
  const out = [];
  if (L < 1) return out;
  const R = (x0, ya, x1, yb) => [F.W(x0, ya), F.W(x1, ya), F.W(x1, yb), F.W(x0, yb)];
  const yc0 = y0 + nA * t, yc1 = yc0 + P;
  const xs = studPositions(L, +e.achs);
  if (+e.ins > 0) {
    const di = Math.min(+e.ins, P), yi = yc0 + (P - di) / 2;
    for (let i = 0; i < xs.length - 1; i++) {
      const xa = xs[i] + 0.6, xb = xs[i + 1] - (i + 1 === xs.length - 1 ? 0.6 : 0);
      if (xb - xa > 5) out.push({ id: '_wp', type: 'hatch', layer: LL('L2', e), pts: R(xa, yi, xb, yi + di), pattern: 'daemmung', scale: 1, angle: F.ang, outline: true, olw: 0.18, _ins: true });
    }
  }
  for (let i = 0; i < nA; i++) out.push({ id: '_wp', type: 'hatch', layer: LL('L2', e), pts: R(0, y0 + i * t, L, y0 + (i + 1) * t), pattern: 'gips', scale: 1, angle: F.ang, outline: true, olw: 0.35 });
  for (let i = 0; i < nB; i++) out.push({ id: '_wp', type: 'hatch', layer: LL('L2', e), pts: R(0, yc1 + i * t, L, yc1 + (i + 1) * t), pattern: 'gips', scale: 1, angle: F.ang, outline: true, olw: 0.35 });
  xs.forEach((x, i) => {
    const last = i === xs.length - 1 && i > 0;
    const loc = cwProfile(x, yc0, P, last ? -1 : 1);
    out.push({ id: '_wp', type: 'pline', layer: LL('L0', e), pts: loc.map((p) => F.W(p.x, p.y)), closed: false, lw: 0.5, _stud: true });
  });
  cache.set(e, { key, parts: out });
  return out;
}

// Teile für 3D: Platten in Ständerfelder unterteilt (saubere Sichtbarkeit)
export function wallParts3D(e) {
  const { P, t, nA, nB, y0 } = wallDims(e); const F = frame(e); const L = F.L;
  const out = []; if (L < 1) return out;
  const R = (x0, ya, x1, yb) => [F.W(x0, ya), F.W(x1, ya), F.W(x1, yb), F.W(x0, yb)];
  const yc0 = y0 + nA * t, yc1 = yc0 + P;
  const xs = studPositions(L, +e.achs);
  const H = +e.h;
  for (let k = 0; k < xs.length - 1; k++) {
    const xa = xs[k], xb = xs[k + 1];
    for (let i = 0; i < nA; i++) out.push({ pts: R(xa, y0 + i * t, xb, y0 + (i + 1) * t), pattern: 'gips', ext: H, z0: 0 });
    for (let i = 0; i < nB; i++) out.push({ pts: R(xa, yc1 + i * t, xb, yc1 + (i + 1) * t), pattern: 'gips', ext: H, z0: 0 });
    if (+e.ins > 0) { const di = Math.min(+e.ins, P), yi = yc0 + (P - di) / 2; out.push({ pts: R(xa + 0.6, yi, xb - 0.6, yi + di), pattern: 'daemmung', ext: H - 80, z0: 40 }); }
  }
  // Ständer als schmale Körper (Steg)
  xs.forEach((x, i) => { const last = i === xs.length - 1 && i > 0; const x0 = last ? x - 2 : x, x1 = last ? x : x + 2; out.push({ pts: R(x0, yc0, x1, yc1), pattern: 'stahl', ext: H, z0: 0 }); });
  return out.map((p) => Object.assign({ id: '_w3', type: 'hatch', layer: e.layer, scale: 1, angle: 0, outline: false }, p));
}

// Wandbeschriftung im Grundriss
export function wallLabel(e, sc) {
  const { D, y0, P } = wallDims(e); const F = frame(e);
  let a = Math.atan2(F.u.y, F.u.x); let flipTxt = false;
  if (a > Math.PI / 2 + 1e-6 || a <= -Math.PI / 2 + 1e-6) { a += Math.PI; flipTxt = true; }
  const yOut = y0 + D + 1.5 * sc;
  const yIn = y0 - 1.5 * sc - 2.5 * sc;
  const side = flipTxt ? yIn : yOut;
  const p = F.W(F.L / 2, side);
  return { p, ang: G.deg(a), text: `${e.name || 'Wand'} · ${e.sys} · CW ${P} · d = ${fmtNum(D, 1)}` };
}

// ---------- Massenermittlung ----------
function boardLen(H) { return BOARD_L.find((l) => l >= H) || BOARD_L[BOARD_L.length - 1]; }
function strips(L, o) {
  const out = []; let s = o > 0 ? o - BOARD_W : 0;
  for (; s < L - 1e-6; s += BOARD_W) { const x0 = Math.max(0, s), x1 = Math.min(L, s + BOARD_W); if (x1 - x0 > 1) out.push([x0, x1]); }
  return out;
}

export function wallTakeoff(e, p = {}) {
  const { P, t, nA, nB, D } = wallDims(e);
  const L = G.dist(e.a, e.b), H = +e.h, a = +e.achs;
  const ends = (e.endA ? 1 : 0) + (e.endB ? 1 : 0);
  const warn = [];
  const sys = SYSTEMS[e.sys];
  if (sys?.maxH && sys.maxH[P] && a >= 625 && H / 1000 > sys.maxH[P]) warn.push(`Wandhöhe ${fmtNum(H / 1000, 2)} m > ca. ${fmtNum(sys.maxH[P], 2)} m für ${e.sys} CW ${P} – Detailblatt prüfen`);
  if (+e.ins > 0 && +e.ins < (MIN_INS[P] || 0)) warn.push(`Dämmung ${e.ins} mm unter Mindestdicke ${MIN_INS[P]} mm (Schallschutz)`);
  const xs = studPositions(L, a);
  const q = { len: L, h: H, area: L * H / 1e6, d: D, items: [], warn };
  const add = (key, label, qty, unit, note) => q.items.push({ key, label, qty, unit, note });
  // Profile
  const cwLen = H - 10;
  const stock = CW_STOCK.find((s) => s >= cwLen);
  if (stock) add(`CW${P}-${stock}`, `CW-Profil ${P} × 50 × 0,6 – Lieferlänge ${stock} mm`, xs.length, 'Stk', `Zuschnitt ${fmtNum(cwLen, 0)} mm`);
  else { add(`CW${P}-6000`, `CW-Profil ${P} × 50 × 0,6 – Lieferlänge 6000 mm`, xs.length * Math.ceil(cwLen / 6000), 'Stk', 'mit Profilstoß'); warn.push('CW-Profil länger als 6 m – Stoß nach Detailblatt ausbilden'); }
  add(`UW${P}`, `UW-Profil ${P} × 40 × 0,6`, 2 * L / 1000, 'lfm', 'Boden + Decke');
  // Platten, Schrauben, Fugen
  const sides = [nA, nB];
  const bl = boardLen(H); const stack = H > 3000 ? Math.ceil(H / 3000) : 1;
  let jointsAll = 0, jointsOuter = 0;
  sides.forEach((nL, s) => {
    for (let i = 0; i < nL; i++) {
      const o = ((i + s) % 2) * 625;
      const st = strips(L, o);
      let full = 0, part = 0;
      for (const [x0, x1] of st) { if (x1 - x0 >= BOARD_W - 1) full++; else part += x1 - x0; }
      const n = (full + Math.ceil(part / BOARD_W - 1e-9)) * stack;
      add(`B-${e.board}-${t}-${stack > 1 ? 3000 : bl}`, `${BOARDS[e.board] || e.board} ${fmtNum(t, 1)} mm – 1250 × ${stack > 1 ? 3000 : bl} mm`, n, 'Stk');
      const joints = st.slice(1).map(([x0]) => x0);
      const jl = joints.length * H / 1000 + (stack - 1) * L / 1000;
      jointsAll += jl; if (i === nL - 1) jointsOuter += jl;
      // Schrauben
      const sa = (SCREW_A[nL] || SCREW_A[2])[i] || 250;
      const perRow = Math.floor(H / sa) + 1;
      let rows = 0;
      for (const x of xs) rows += joints.some((j) => Math.abs(j - x) < 1) ? 2 : 1;
      const T = (i + 1) * t; const sl = SCREW_L.find((l) => l >= T + 10) || 65;
      add(`TN${sl}`, `Schnellbauschraube TN 3,5 × ${sl}`, rows * perRow, 'Stk', `${i + 1}. Lage, a ≤ ${sa} mm`);
    }
  });
  if (+e.ins > 0) add(`MW${e.ins}`, `Mineralwolle ${e.ins} mm`, L * H / 1e6, 'm²');
  add(`DB${P}`, `Anschlussdichtung ${P - 5} mm`, (2 * L + ends * H) / 1000, 'lfm', 'unter UW + Wandanschluss-CW');
  const dowUW = Math.max(3, Math.ceil(L / 1000) + 1) * 2, dowCW = ends * Math.max(3, Math.ceil(H / 1000) + 1);
  add('DUEB', 'Drehstiftdübel / Befestigungsmittel', dowUW + dowCW, 'Stk', 'a ≤ 1000 mm, je Profil ≥ 3');
  const tfLen = 2 * ((p.tfBoden === false ? 1 : 2) * L + ends * H) / 1000;
  add('TF', 'Trenn-Fix', tfLen, 'lfm', 'beidseitig an Anschlüssen');
  if (p.strip !== false) add('FDS', 'Fugendeckstreifen / Glasfaserbewehrung', jointsOuter, 'lfm', 'Fugen der Decklage');
  const kg = jointsAll * (p.kgJoint ?? 0.25) + 2 * L * H / 1e6 * (p.kgArea ?? 0.15) + tfLen * 0.1;
  add('UNI', 'Fugenspachtel (z. B. Uniflott) – Schätzwert', kg, 'kg', 'Fugen aller Lagen + Q2 Decklage');
  return q;
}

export function takeoffAll(walls, p = {}) {
  const per = walls.map((w) => ({ w, q: wallTakeoff(w, p) }));
  const map = new Map();
  for (const { q } of per) for (const it of q.items) {
    const m = map.get(it.key) || { ...it, qty: 0 };
    m.qty += it.qty; map.set(it.key, m);
  }
  const z = 1 + (p.zuschlag ?? 5) / 100;
  const ORDER = ['CW', 'UW', 'B-', 'TN', 'MW', 'DB', 'DUEB', 'TF', 'FDS', 'UNI'];
  const rank = (k) => { const i = ORDER.findIndex((o) => k.startsWith(o)); return i < 0 ? 99 : i; };
  const rows = [...map.values()].sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key, 'de', { numeric: true }));
  for (const r of rows) {
    if (r.key.startsWith('UW')) { r.lfm = r.qty; r.qty = Math.ceil(r.qty / (UW_STOCK / 1000) - 1e-9); r.unit = 'Stk'; r.label += ` – Lieferlänge ${UW_STOCK} mm`; r.note = `${fmtNum(r.lfm, 2)} lfm netto`; }
    else if (['TN', 'DB', 'TF', 'FD', 'UN', 'MW'].some((k) => r.key.startsWith(k))) {
      r.qty = r.qty * z;
      if (r.unit === 'Stk') r.qty = Math.ceil(r.qty / 50) * 50;
    }
  }
  const area = per.reduce((s, x) => s + x.q.area, 0);
  return { per, rows, area, zuschlag: p.zuschlag ?? 5 };
}

export function fmtQty(r) {
  if (r.unit === 'Stk') return String(Math.ceil(r.qty - 1e-9));
  return fmtNum(r.qty, r.unit === 'kg' ? 1 : 2);
}

// ---------- Wandansicht mit Plattenteilung ----------
export function elevationEnts(e, side, Lf) {
  const { P, t, nA, nB } = wallDims(e);
  const L = G.dist(e.a, e.b), H = +e.h; const sc = state.doc.sheet.sc;
  const out = [];
  const ln = (a, b, layer, x = {}) => out.push(Object.assign({ id: nid(), type: 'line', a, b, layer }, x));
  const rect = [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: H }, { x: 0, y: H }];
  // Ständer (verdeckt)
  const xs = studPositions(L, +e.achs);
  xs.forEach((x, i) => {
    const last = i === xs.length - 1 && i > 0; const x0 = last ? x - 50 : x, x1 = last ? x : x + 50;
    ln({ x: x0, y: 0 }, { x: x0, y: H }, Lf('L6')); ln({ x: x1, y: 0 }, { x: x1, y: H }, Lf('L6'));
  });
  ln({ x: 0, y: 40 }, { x: L, y: 40 }, Lf('L6')); ln({ x: 0, y: H - 40 }, { x: L, y: H - 40 }, Lf('L6'));
  // Decklage der gewählten Seite
  const s = side === 'B' ? 1 : 0; const nL = s ? nB : nA;
  const o = (((nL - 1) + s) % 2) * 625;
  const st = strips(L, o);
  const bl = boardLen(H); const stackH = H > 3000 ? 3000 : null;
  out.push({ id: nid(), type: 'hatch', pts: rect, pattern: 'fuellung', fillColor: '#f6f4ef', outline: true, olw: 0.5, layer: Lf('L2'), ext: 0, no3d: true });
  for (const [x0, x1] of st.slice(1).map((v) => v)) ln({ x: x0, y: 0 }, { x: x0, y: H }, Lf('L0'), { lw: 0.35 });
  if (stackH) for (let y = stackH, k = 0; y < H; y += stackH, k++) ln({ x: 0, y }, { x: L, y }, Lf('L0'), { lw: 0.35 });
  for (const [x0, x1] of st) {
    const w = x1 - x0; const vertical = w < 700;
    out.push({ id: nid(), type: 'text', p: { x: (x0 + x1) / 2, y: H / 2 }, text: `${fmtNum(w, 0)} × ${stackH ? 3000 : Math.round(H)}${!stackH && bl > H ? ` (aus ${bl})` : ''}`, h: 2.5, angle: vertical ? 90 : 0, align: 'c', layer: Lf('L4') });
  }
  // Maße
  for (let i = 0; i < xs.length - 1; i++) out.push({ id: nid(), type: 'dim', a: { x: xs[i], y: 0 }, b: { x: xs[i + 1], y: 0 }, p: { x: 0, y: -8 * sc }, mode: 'h', layer: Lf('L3') });
  out.push({ id: nid(), type: 'dim', a: { x: 0, y: 0 }, b: { x: L, y: 0 }, p: { x: 0, y: -16 * sc }, mode: 'h', layer: Lf('L3') });
  out.push({ id: nid(), type: 'dim', a: { x: 0, y: 0 }, b: { x: 0, y: H }, p: { x: -8 * sc, y: 0 }, mode: 'v', layer: Lf('L3') });
  const jointsDim = [0, ...st.slice(1).map(([x0]) => x0), L];
  for (let i = 0; i < jointsDim.length - 1; i++) out.push({ id: nid(), type: 'dim', a: { x: jointsDim[i], y: H }, b: { x: jointsDim[i + 1], y: H }, p: { x: 0, y: H + 8 * sc }, mode: 'h', layer: Lf('L3') });
  const T = `Ansicht ${e.name || 'Wand'} – Seite ${side} · Knauf ${e.sys} · CW ${P}, a = ${fmtNum(+e.achs, 1)} mm · ${nL}× ${BOARDS[e.board] || e.board} ${fmtNum(t, 1)} mm`;
  out.push({ id: nid(), type: 'text', p: { x: 0, y: H + 16 * sc }, text: T + '\nPlattenstöße der Decklage, Ständer und UW verdeckt', h: 3.5, angle: 0, align: 'l', layer: Lf('L4') });
  out.forEach((x) => { x.no3d = true; });
  return out;
}

// Tabelle als Zeichnungselemente
export function tableEnts(res, Lf) {
  const sc = state.doc.sheet.sc;
  const cw = [8, 110, 22, 12].map((x) => x * sc); const rh = 6 * sc, th = 2.5;
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
  out.forEach((x) => { x.no3d = true; });
  return out;
}
