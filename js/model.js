// Dokumentmodell, Layer, Elemente, Undo, Speicherung
import * as G from './geom.js';
import { wallOutline } from './drywall.js'; // Trockenbau

export const LTYPES = {
  solid:   { label: 'Volllinie', dash: [] },
  dashed:  { label: 'Strichlinie', dash: [3, 1.5] },
  dashdot: { label: 'Strichpunkt', dash: [8, 1.5, 0.5, 1.5] },
  dotted:  { label: 'Punktlinie', dash: [0.4, 1.2] },
  long:    { label: 'Lang gestrichelt', dash: [8, 2.5] },
};
export const LWS = [0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1.0, 1.4];
export const COLORS = ['#000000', '#d32f2f', '#1565c0', '#2e7d32', '#ef6c00', '#6a1b9a', '#00838f', '#7a7a7a', '#b0b0b0', '#8d6e63'];
export const FORMATS = { A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841], A0: [841, 1189] };
export const SCALES = [1, 2, 5, 10, 20, 25, 50, 100, 200];

let uid = 1;
export const nid = () => 'e' + (uid++).toString(36) + Math.random().toString(36).slice(2, 5);

export function defaultLayers() {
  return [
    { id: 'L0', name: 'Konstruktion', color: '#000000', lw: 0.5, lt: 'solid', vis: true, lock: false, print: true },
    { id: 'L1', name: 'Bauteile dünn', color: '#000000', lw: 0.25, lt: 'solid', vis: true, lock: false, print: true },
    { id: 'L2', name: 'Schraffur', color: '#000000', lw: 0.13, lt: 'solid', vis: true, lock: false, print: true },
    { id: 'L3', name: 'Bemaßung', color: '#1565c0', lw: 0.18, lt: 'solid', vis: true, lock: false, print: true },
    { id: 'L4', name: 'Text', color: '#000000', lw: 0.25, lt: 'solid', vis: true, lock: false, print: true },
    { id: 'L5', name: 'Achsen', color: '#d32f2f', lw: 0.18, lt: 'dashdot', vis: true, lock: false, print: true },
    { id: 'L6', name: 'Verdeckt', color: '#000000', lw: 0.25, lt: 'dashed', vis: true, lock: false, print: true },
    { id: 'L7', name: 'Hilfslinien', color: '#9e9e9e', lw: 0.13, lt: 'dotted', vis: true, lock: false, print: false },
  ];
}

export function newDoc(name = 'Neue Zeichnung') {
  return {
    v: 1, id: 'd' + Date.now().toString(36), name,
    layers: defaultLayers(), cur: 'L0',
    ents: [],
    settings: { dimUnit: 'mm', dimDec: 1, dimText: 2.5, dimTick: 'slash', grid: 10, textH: 3.5, ext3d: 300 },
    sheet: { fmt: 'A3', orient: 'quer', sc: 10, cx: 0, cy: 0, show: true, fold: true,
      tb: { firma: '', projekt: '', titel: 'Detail', plannr: '', index: '', gez: '', datum: new Date().toLocaleDateString('de-DE') } },
  };
}

export const state = { doc: newDoc() };
export const doc = () => state.doc;

export const layerById = (id) => state.doc.layers.find((l) => l.id === id) || state.doc.layers[0];

export function styleOf(e) {
  const L = layerById(e.layer);
  return {
    color: e.color || L.color,
    lw: e.lw || L.lw,
    dash: (LTYPES[e.lt || L.lt] || LTYPES.solid).dash,
    lt: e.lt || L.lt,
  };
}

// ---------- Undo ----------
const hist = { stack: [], idx: -1 };
export function resetHistory() { hist.stack = [JSON.stringify(state.doc)]; hist.idx = 0; }
export function commit() {
  hist.stack = hist.stack.slice(0, hist.idx + 1);
  hist.stack.push(JSON.stringify(state.doc));
  if (hist.stack.length > 150) hist.stack.shift();
  hist.idx = hist.stack.length - 1;
  autosave();
}
export function undo() { if (hist.idx > 0) { hist.idx--; state.doc = JSON.parse(hist.stack[hist.idx]); autosave(); return true; } return false; }
export function redo() { if (hist.idx < hist.stack.length - 1) { hist.idx++; state.doc = JSON.parse(hist.stack[hist.idx]); autosave(); return true; } return false; }

// ---------- Speicherung ----------
const LS = (() => { try { const k = '__t'; localStorage.setItem(k, 1); localStorage.removeItem(k); return localStorage; } catch { return null; } })();
let saveT = 0;
export function autosave() {
  if (!LS) return;
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try {
      LS.setItem('cadbase.doc.' + state.doc.id, JSON.stringify(state.doc));
      LS.setItem('cadbase.current', state.doc.id);
      const idx = listDocs().filter((d) => d.id !== state.doc.id);
      idx.unshift({ id: state.doc.id, name: state.doc.name, t: Date.now(), n: state.doc.ents.length });
      LS.setItem('cadbase.index', JSON.stringify(idx));
    } catch (err) { console.warn('Speichern fehlgeschlagen', err); }
  }, 400);
}
export function listDocs() { if (!LS) return []; try { return JSON.parse(LS.getItem('cadbase.index') || '[]'); } catch { return []; } }
export function loadDoc(id) { if (!LS) return null; try { return JSON.parse(LS.getItem('cadbase.doc.' + id)); } catch { return null; } }
export function deleteDoc(id) {
  if (!LS) return;
  LS.removeItem('cadbase.doc.' + id);
  LS.setItem('cadbase.index', JSON.stringify(listDocs().filter((d) => d.id !== id)));
}
export function loadCurrent() { if (!LS) return null; const id = LS.getItem('cadbase.current'); return id ? loadDoc(id) : null; }
export function getPref(k, d) { if (!LS) return d; try { const v = LS.getItem('cadbase.pref.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } }
export function setPref(k, v) { if (LS) try { LS.setItem('cadbase.pref.' + k, JSON.stringify(v)); } catch {} }

export function fixDoc(d) {
  const n = newDoc();
  d.settings = Object.assign(n.settings, d.settings || {});
  d.sheet = Object.assign(n.sheet, d.sheet || {});
  d.sheet.tb = Object.assign(n.sheet.tb, d.sheet.tb || {});
  if (!d.layers?.length) d.layers = n.layers;
  if (!d.ents) d.ents = [];
  if (!d.id) d.id = n.id;
  return d;
}

// ---------- Element-Geometrie ----------
export function dimGeom(e) {
  let u;
  if (e.mode === 'h') u = { x: 1, y: 0 };
  else if (e.mode === 'v') u = { x: 0, y: 1 };
  else u = G.norm(G.sub(e.b, e.a));
  const n = G.perp(u);
  const fa = G.add(e.p, G.mul(u, G.dot(G.sub(e.a, e.p), u)));
  const fb = G.add(e.p, G.mul(u, G.dot(G.sub(e.b, e.p), u)));
  const val = Math.abs(G.dot(G.sub(e.b, e.a), u));
  return { u, n, fa, fb, val };
}

export function circleOf(e) { return e.type === 'circle' ? { c: e.c, r: e.r } : null; }

// Segmente (für Fang, Schnittpunkte, Flächenerkennung, Stutzen)
export function entSegs(e, fine = false) {
  switch (e.type) {
    case 'line': return [[e.a, e.b]];
    case 'pline': {
      const s = [];
      for (let i = 0; i < e.pts.length - 1; i++) s.push([e.pts[i], e.pts[i + 1]]);
      if (e.closed && e.pts.length > 2) s.push([e.pts[e.pts.length - 1], e.pts[0]]);
      return s;
    }
    case 'hatch': {
      if (!e.outline && !fine) return [];
      const s = [];
      for (const r of [e.pts, ...(e.holes || [])]) for (let i = 0; i < r.length; i++) s.push([r[i], r[(i + 1) % r.length]]);
      return s;
    }
    case 'wall': { const r = wallOutline(e); return r.map((p, i) => [p, r[(i + 1) % r.length]]); } // Trockenbau
    case 'circle': { const p = G.arcPts(e.c, e.r, 0, G.TAU, 96); return p.slice(1).map((q, i) => [p[i], q]); }
    case 'arc': { const p = G.arcPts(e.c, e.r, e.a0, e.a1); return p.slice(1).map((q, i) => [p[i], q]); }
    default: return [];
  }
}

export function entPts(e) {
  switch (e.type) {
    case 'line': return [e.a, e.b];
    case 'pline': case 'hatch': return e.pts;
    case 'circle': return [{ x: e.c.x - e.r, y: e.c.y - e.r }, { x: e.c.x + e.r, y: e.c.y + e.r }];
    case 'arc': return G.arcPts(e.c, e.r, e.a0, e.a1, 24);
    case 'dim': { const g = dimGeom(e); return [e.a, e.b, g.fa, g.fb]; }
    case 'leader': return e.pts;
    case 'text': return [e.p];
    case 'wall': return wallOutline(e); // Trockenbau
    default: return [];
  }
}

export function entBBox(e, sc = 1) {
  const b = G.bboxOf(entPts(e));
  if (e.type === 'text' || e.type === 'leader') {
    const h = (e.h || 3.5) * sc; const lines = String(e.text || '').split('\n');
    const w = Math.max(...lines.map((l) => l.length)) * h * 0.62;
    const p = e.type === 'text' ? e.p : e.pts[e.pts.length - 1];
    const tb = { x0: p.x - w, y0: p.y - h * lines.length * 1.5, x1: p.x + w, y1: p.y + h * lines.length * 1.6 };
    return G.bboxUnion(b, tb);
  }
  if (e.type === 'wall') return { x0: b.x0 - 8 * sc, y0: b.y0 - 8 * sc, x1: b.x1 + 8 * sc, y1: b.y1 + 8 * sc }; // Trockenbau
  if (e.type === 'dim') { const t = (state.doc.settings.dimText + 2) * sc; return { x0: b.x0 - t, y0: b.y0 - t, x1: b.x1 + t, y1: b.y1 + t }; }
  return b;
}

export function snapPts(e) {
  const out = [];
  const P = (p, k) => out.push({ p, k });
  switch (e.type) {
    case 'line': P(e.a, 'end'); P(e.b, 'end'); P(G.mid(e.a, e.b), 'mid'); break;
    case 'pline': case 'hatch': {
      if (e.type === 'hatch' && !e.outline) { for (const p of e.pts) P(p, 'end'); break; }
      const s = entSegs(e, true);
      for (const p of e.pts) P(p, 'end');
      for (const [a, b] of s) P(G.mid(a, b), 'mid');
      break;
    }
    case 'circle': P(e.c, 'cen'); for (let i = 0; i < 4; i++) P(G.polar(e.c, e.r, i * Math.PI / 2), 'quad'); break;
    case 'arc': P(e.c, 'cen'); P(G.polar(e.c, e.r, e.a0), 'end'); P(G.polar(e.c, e.r, e.a1), 'end');
      P(G.polar(e.c, e.r, e.a0 + G.normAng(e.a1 - e.a0) / 2), 'mid'); break;
    case 'dim': { const g = dimGeom(e); P(g.fa, 'end'); P(g.fb, 'end'); break; }
    case 'leader': for (const p of e.pts) P(p, 'end'); break;
    case 'text': P(e.p, 'end'); break;
    case 'wall': P(e.a, 'end'); P(e.b, 'end'); P(G.mid(e.a, e.b), 'mid'); for (const p of wallOutline(e)) P(p, 'end'); break; // Trockenbau
  }
  return out;
}

// Abstand Punkt -> Element
export function hitDist(e, p, sc = 1) {
  switch (e.type) {
    case 'circle': return Math.abs(G.dist(p, e.c) - e.r);
    case 'arc': {
      const a = Math.atan2(p.y - e.c.y, p.x - e.c.x);
      if (G.angInArc(a, e.a0, e.a1)) return Math.abs(G.dist(p, e.c) - e.r);
      return Math.min(G.dist(p, G.polar(e.c, e.r, e.a0)), G.dist(p, G.polar(e.c, e.r, e.a1)));
    }
    case 'wall': { const r = wallOutline(e); if (G.pointInPoly(p, r)) return 0.0001; let d = Infinity; for (let i = 0; i < 4; i++) d = Math.min(d, G.distPointSeg(p, r[i], r[(i + 1) % 4]).d); return d; } // Trockenbau
    case 'hatch': {
      if (G.pointInRings(p, [e.pts, ...(e.holes || [])])) return 0.0001 + 1e-9;
      let d = Infinity; for (const [a, b] of entSegs(e, true)) d = Math.min(d, G.distPointSeg(p, a, b).d); return d;
    }
    case 'text': case 'leader': {
      const b = entBBox(e, sc);
      let d = (p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1) ? 0 : Infinity;
      if (e.type === 'leader') d = Math.min(d, G.distPointSeg(p, e.pts[0], e.pts[1]).d);
      return d;
    }
    case 'dim': {
      const g = dimGeom(e);
      return Math.min(G.distPointSeg(p, g.fa, g.fb).d, G.distPointSeg(p, e.a, g.fa).d, G.distPointSeg(p, e.b, g.fb).d);
    }
    default: {
      let d = Infinity; for (const [a, b] of entSegs(e)) d = Math.min(d, G.distPointSeg(p, a, b).d); return d;
    }
  }
}

// Transformation: fn(p) für Punkte, plus Winkel-Infos für Kreise/Bögen/Text
export function transformEnt(e, T) {
  const f = T.f;
  const mapArr = (arr) => arr.map(f);
  switch (e.type) {
    case 'line': e.a = f(e.a); e.b = f(e.b); break;
    case 'pline': e.pts = mapArr(e.pts); break;
    case 'hatch': e.pts = mapArr(e.pts); if (e.holes) e.holes = e.holes.map(mapArr);
      if (T.rot && e.angle !== null && e.angle !== undefined && e.angle !== 'auto') e.angle = +e.angle + G.deg(T.rot); break;
    case 'circle': e.c = f(e.c); if (T.s) e.r *= T.s; break;
    case 'arc': {
      const p0 = f(G.polar(e.c, e.r, e.a0)), p1 = f(G.polar(e.c, e.r, e.a1));
      e.c = f(e.c); if (T.s) e.r *= T.s;
      let a0 = G.ang(e.c, p0), a1 = G.ang(e.c, p1);
      if (T.mirror) [a0, a1] = [a1, a0];
      e.a0 = G.normAng(a0); e.a1 = G.normAng(a1);
      break;
    }
    case 'dim': e.a = f(e.a); e.b = f(e.b); e.p = f(e.p);
      if (T.rot && e.mode !== 'aligned') {
        const q = Math.round(G.normAng(T.rot) / (Math.PI / 2)) % 2; const exact = Math.abs(G.normAng(T.rot) % (Math.PI / 2)) < 1e-6;
        if (!exact) e.mode = 'aligned'; else if (q === 1) e.mode = e.mode === 'h' ? 'v' : 'h';
      }
      break;
    case 'leader': e.pts = mapArr(e.pts); break;
    case 'text': e.p = f(e.p); if (T.rot) e.angle = ((e.angle || 0) + G.deg(T.rot)) % 360; break;
    case 'wall': e.a = f(e.a); e.b = f(e.b); if (T.mirror) e.flip = !e.flip; break; // Trockenbau
  }
  return e;
}

export const Tmove = (dx, dy) => ({ f: (p) => ({ x: p.x + dx, y: p.y + dy }) });
export const Trot = (c, a) => ({ f: (p) => G.rot(p, c, a), rot: a });
export const Tmirror = (a, b) => ({ f: (p) => G.mirrorPt(p, a, b), mirror: true });
export const Tscale = (c, s) => ({ f: (p) => ({ x: c.x + (p.x - c.x) * s, y: c.y + (p.y - c.y) * s }), s });

export function cloneEnt(e) { const c = JSON.parse(JSON.stringify(e)); c.id = nid(); return c; }

export function docBBox(onlyVisible = true) {
  let b = null;
  const sc = state.doc.sheet.sc;
  for (const e of state.doc.ents) {
    if (onlyVisible && !layerById(e.layer).vis) continue;
    b = G.bboxUnion(b, entBBox(e, sc));
  }
  return b;
}

export function fmtNum(v, dec = 1) {
  const r = Math.round(v * 10 ** dec) / 10 ** dec;
  let s = r.toFixed(dec);
  if (dec > 0) s = s.replace(/\.?0+$/, '');
  return s.replace('.', ',');
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
export function fmtDim(v) {
  const s = state.doc.settings;
  switch (s.dimUnit) {
    case 'cm': return fmtNum(v / 10, s.dimDec);
    case 'm': return fmtNum(v / 1000, Math.max(2, s.dimDec + 2));
    case 'cmhoch': {
      const mm = Math.round(v); const cm = Math.floor(mm / 10), r = mm % 10;
      return String(cm) + (r ? SUP[r] : '');
    }
    default: return fmtNum(v, s.dimDec);
  }
}
