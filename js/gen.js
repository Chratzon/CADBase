// Generatoren für typische Bauteile (Bezugspunkt 0,0 = links unten)
import { nid, fmtNum, state } from './model.js';

const R = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const hatch = (pts, pattern, layer, olw = 0.35, extra = {}) => Object.assign({ id: nid(), type: 'hatch', pts, pattern, scale: 1, angle: 'auto', outline: true, olw, layer }, extra);
const line = (a, b, layer, extra = {}) => Object.assign({ id: nid(), type: 'line', a, b, layer }, extra);
const pline = (pts, closed, layer, extra = {}) => Object.assign({ id: nid(), type: 'pline', pts, closed, layer }, extra);

export function cwProfile(x, y0, P, open = 1, kind = 'CW') {
  const f = kind === 'UW' ? 40 : 50, lip = kind === 'UW' ? 0 : 7;
  const pts = [];
  if (lip) pts.push({ x: x + open * f, y: y0 + lip });
  pts.push({ x: x + open * f, y: y0 }, { x, y: y0 }, { x, y: y0 + P }, { x: x + open * f, y: y0 + P });
  if (lip) pts.push({ x: x + open * f, y: y0 + P - lip });
  return pts;
}

export function breakLine(x, y0, y1, layer) {
  const m = (y0 + y1) / 2, z = Math.min((y1 - y0) * 0.12, 12), e = z * 0.6;
  return pline([{ x, y: y0 - e }, { x, y: m - z }, { x: x + z * 0.7, y: m - z * 0.25 }, { x: x - z * 0.7, y: m + z * 0.25 }, { x, y: m + z }, { x, y: y1 + e }], false, layer);
}

// Metallständerwand im Horizontalschnitt
export function staenderwand(o, Lf) {
  const P = +o.prof, t = +o.t, nA = +o.nA, nB = +o.nB, L = +o.len, a = +o.achs, di = Math.min(+o.daem || 0, P);
  const sc = state.doc.sheet.sc;
  const out = [];
  const y0 = nA * t, y1 = y0 + P, D = y1 + nB * t;
  const xs = []; for (let x = 0; x <= L - 50 + 1e-6; x += a) xs.push(x);
  if (di > 0) {
    const yi0 = y0 + (P - di) / 2;
    for (let i = 0; i < xs.length; i++) {
      const xa = xs[i] + 0.6, xb = i + 1 < xs.length ? xs[i + 1] : L;
      if (xb - xa > 5) out.push(hatch(R(xa, yi0, xb, yi0 + di), 'daemmung', Lf('L2'), 0.18, { angle: 0 }));
    }
  }
  for (let i = 0; i < nA; i++) out.push(hatch(R(0, i * t, L, (i + 1) * t), 'gips', Lf('L2')));
  for (let i = 0; i < nB; i++) out.push(hatch(R(0, y1 + i * t, L, y1 + (i + 1) * t), 'gips', Lf('L2')));
  for (const x of xs) out.push(pline(cwProfile(x, y0, P, 1), false, Lf('L0'), { lw: 0.5 }));
  if (o.bruch) out.push(breakLine(L, 0, D, Lf('L1')));
  if (o.mass) {
    const xd = -8 * sc, xt = -16 * sc;
    const ys = [0]; if (nA) ys.push(y0); ys.push(y1); if (nB) ys.push(D);
    for (let i = 0; i < ys.length - 1; i++) out.push({ id: nid(), type: 'dim', a: { x: 0, y: ys[i] }, b: { x: 0, y: ys[i + 1] }, p: { x: xd, y: 0 }, mode: 'v', layer: Lf('L3') });
    out.push({ id: nid(), type: 'dim', a: { x: 0, y: 0 }, b: { x: 0, y: D }, p: { x: xt, y: 0 }, mode: 'v', layer: Lf('L3') });
    if (xs.length > 1) out.push({ id: nid(), type: 'dim', a: { x: xs[0], y: D }, b: { x: xs[1], y: D }, p: { x: 0, y: D + 8 * sc }, mode: 'h', layer: Lf('L3') });
  }
  if (o.text) {
    const pl = (n) => n ? `${n}× ${fmtNum(t, 1)} mm ${o.typ}` : 'ohne';
    const txt = `Metallständerwand CW ${P} – Achsabstand ${fmtNum(a, 1)} mm\nSeite A: ${pl(nA)} · Seite B: ${pl(nB)}\n${di ? 'Mineralwolle ' + fmtNum(di, 0) + ' mm · ' : ''}Wanddicke d = ${fmtNum(D, 1)} mm`;
    out.push({ id: nid(), type: 'text', p: { x: 0, y: D + (o.mass ? 16 : 6) * sc + 2 * 3.5 * 1.6 * sc }, text: txt, h: 3.5, angle: 0, align: 'l', layer: Lf('L4') });
  }
  return out;
}

// Allgemeiner Schichtenaufbau
export function schichten(o, Lf) {
  const rows = o.rows.filter((r) => +r.d > 0);
  const L = +o.len; const sc = state.doc.sheet.sc;
  const D = rows.reduce((s, r) => s + +r.d, 0);
  const out = [], mids = [], bounds = [o.dir === 'h' ? D : 0];
  let acc = 0;
  for (const r of rows) {
    const d = +r.d;
    let rect, midA, midB;
    if (o.dir === 'h') { const top = D - acc, bot = top - d; rect = R(0, bot, L, top); midA = { x: 0, y: (top + bot) / 2 }; bounds.push(D - acc - d); }
    else { const x0 = acc, x1 = acc + d; rect = R(x0, 0, x1, L); midA = { x: (x0 + x1) / 2, y: 0 }; bounds.push(acc + d); }
    if (d / sc < 0.5 || r.pat === 'folie') {
      const a = o.dir === 'h' ? { x: 0, y: midA.y } : { x: midA.x, y: 0 }, b = o.dir === 'h' ? { x: L, y: midA.y } : { x: midA.x, y: L };
      out.push(line(a, b, Lf('L0'), { lw: 0.7 }));
    } else out.push(hatch(rect, r.pat, Lf('L2'), 0.35));
    mids.push({ r, mid: midA });
    acc += d;
  }
  if (o.legend && rows.length) {
    const h = 3.5, sp = Math.max(h * 2.1 * sc, 1);
    const n = rows.length;
    mids.forEach((m, i) => {
      let tip, knee;
      if (o.dir === 'h') {
        tip = { x: L * 0.8, y: m.mid.y };
        knee = { x: L + 14 * sc, y: D / 2 + ((n - 1) / 2 - i) * sp };
      } else {
        tip = { x: m.mid.x, y: L * 0.8 };
        knee = { x: D + 14 * sc, y: L * 0.8 + 10 * sc + ((n - 1) - i) * sp };
      }
      const txt = `${m.r.name}${m.r.name ? ' ' : ''}${fmtNum(+m.r.d, 1)} mm`;
      out.push({ id: nid(), type: 'leader', pts: [tip, knee], text: txt, h, arrow: 'dot', layer: Lf('L4') });
    });
  }
  if (o.mass) {
    const kept = [bounds[0]];
    for (let i = 1; i < bounds.length; i++) { if (Math.abs(bounds[i] - kept[kept.length - 1]) >= 1) kept.push(bounds[i]); else if (i === bounds.length - 1) kept[kept.length - 1] = bounds[i]; }
    bounds.length = 0; bounds.push(...kept);
    for (let i = 0; i < bounds.length - 1; i++) {
      if (o.dir === 'h') out.push({ id: nid(), type: 'dim', a: { x: 0, y: bounds[i] }, b: { x: 0, y: bounds[i + 1] }, p: { x: -8 * sc, y: 0 }, mode: 'v', layer: Lf('L3') });
      else out.push({ id: nid(), type: 'dim', a: { x: bounds[i], y: 0 }, b: { x: bounds[i + 1], y: 0 }, p: { x: 0, y: -8 * sc }, mode: 'h', layer: Lf('L3') });
    }
    if (o.dir === 'h') out.push({ id: nid(), type: 'dim', a: { x: 0, y: 0 }, b: { x: 0, y: D }, p: { x: -16 * sc, y: 0 }, mode: 'v', layer: Lf('L3') });
    else out.push({ id: nid(), type: 'dim', a: { x: 0, y: 0 }, b: { x: D, y: 0 }, p: { x: 0, y: -16 * sc }, mode: 'h', layer: Lf('L3') });
  }
  if (o.bruch) {
    if (o.dir === 'h') out.push(breakLine(L, 0, D, Lf('L1')));
    else { const bl = breakLine(0, 0, D, Lf('L1')); bl.pts = bl.pts.map((p) => ({ x: p.y, y: L + p.x })); out.push(bl); }
  }
  return out;
}

export function kantholz(o, Lf) {
  const b = +o.b, h = +o.h; const sc = state.doc.sheet.sc;
  const out = [hatch(R(0, 0, b, h), 'holz_quer', Lf('L2'), 0.5, { angle: 0 })];
  if (o.text) out.push({ id: nid(), type: 'text', p: { x: b / 2, y: -6 * sc }, text: `${fmtNum(b, 0)}/${fmtNum(h, 0)}`, h: 3.5, angle: 0, align: 'c', layer: Lf('L4') });
  return out;
}

export function profil(o, Lf) {
  const P = +o.prof;
  return [pline(cwProfile(0, 0, P, 1, o.kind), false, Lf('L0'), { lw: 0.5 })];
}

export function hoehenkote(o, Lf) {
  const sc = state.doc.sheet.sc; const s = 2.5 * sc;
  const tri = [{ x: 0, y: 0 }, { x: -s * 0.65, y: s }, { x: s * 0.65, y: s }];
  const out = [];
  if (o.voll) out.push(hatch(tri, 'stahl', Lf('L4'), 0.25, { angle: 0 }));
  else out.push(pline(tri, true, Lf('L4')));
  out.push(line({ x: -s * 0.65, y: s }, { x: 14 * sc, y: s }, Lf('L4')));
  out.push({ id: nid(), type: 'text', p: { x: s * 0.9, y: s + 1 * sc }, text: o.wert || '±0,00', h: 3.5, angle: 0, align: 'l', layer: Lf('L4') });
  if (o.bez) out.push({ id: nid(), type: 'text', p: { x: s * 0.9, y: s - 4.5 * sc }, text: o.bez, h: 2.5, angle: 0, align: 'l', layer: Lf('L4') });
  return out;
}

export function bruch(o, Lf) { const l = +o.len; const bl = breakLine(0, 0, l, Lf('L1')); bl.pts = bl.pts.map((p) => ({ x: p.y, y: -p.x })); return [bl]; }

export const PRESETS = {
  'Schwimmender Estrich': [
    { name: 'Bodenbelag', d: 10, pat: 'holzwerkstoff' }, { name: 'Zementestrich CT-C25-F4', d: 50, pat: 'estrich' }, { name: 'PE-Folie', d: 0.2, pat: 'folie' },
    { name: 'Trittschalldämmung', d: 30, pat: 'daemmung' }, { name: 'Stahlbetondecke', d: 200, pat: 'stahlbeton' }, { name: 'Putz', d: 15, pat: 'putz' }],
  'Trockenestrich auf Holzbalkendecke': [
    { name: 'Trockenestrichelement 2× 12,5', d: 25, pat: 'gips' }, { name: 'Holzfaserdämmplatte', d: 20, pat: 'daemmung_hart' }, { name: 'Ausgleichsschüttung', d: 30, pat: 'kies' },
    { name: 'OSB/3', d: 22, pat: 'holzwerkstoff' }, { name: 'Holzbalken / Dämmung', d: 200, pat: 'daemmung' }, { name: 'Federschiene', d: 27, pat: 'keine' }, { name: 'GKF', d: 12.5, pat: 'gips' }],
  'Holzständerwand außen': [
    { name: 'Putzsystem', d: 10, pat: 'putz' }, { name: 'Holzfaserdämmplatte', d: 60, pat: 'daemmung_hart' }, { name: 'Ständer 60/160 + Dämmung', d: 160, pat: 'daemmung' },
    { name: 'OSB/3 (luftdicht)', d: 15, pat: 'holzwerkstoff' }, { name: 'Installationsebene', d: 40, pat: 'daemmung' }, { name: 'GKB', d: 12.5, pat: 'gips' }],
  'Steildach Zwischensparren': [
    { name: 'Dachlattung / Konterlattung', d: 54, pat: 'keine' }, { name: 'Unterdeckbahn', d: 0.5, pat: 'folie' }, { name: 'Sparren + Mineralwolle', d: 200, pat: 'daemmung' },
    { name: 'Dampfbremse sd variabel', d: 0.2, pat: 'folie' }, { name: 'Lattung', d: 24, pat: 'keine' }, { name: 'GKB', d: 12.5, pat: 'gips' }],
  'Vorsatzschale freistehend': [
    { name: 'Mauerwerk', d: 175, pat: 'mauerwerk' }, { name: 'Abstand', d: 10, pat: 'keine' }, { name: 'CW 50 + Mineralwolle 40', d: 50, pat: 'daemmung' }, { name: 'GKB', d: 12.5, pat: 'gips' }, { name: 'GKB', d: 12.5, pat: 'gips' }],
  'Leer': [{ name: 'Schicht 1', d: 20, pat: 'keine' }],
};
