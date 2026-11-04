// CADBase – Hauptsteuerung
import * as G from './geom.js';
import * as M from './model.js';
import { state, layerById, entBBox, snapPts, entSegs, hitDist, dimGeom, transformEnt, Tmove, cloneEnt, nid, fmtNum } from './model.js';
import { CanvasB, emit, setImageProvider } from './render.js';
import * as UL from './underlay.js'; // PDF-/Bild-Unterlagen
import { PATTERNS } from './hatch.js';
import { emitSheet, sheetMaps, paperSize, printSheet } from './print.js';
import { exportSVG, exportDXF, exportJSON } from './export.js';
import { View3D } from './view3d.js';
import * as T from './tools.js';
import * as GEN from './gen.js';
import * as DWUI from './drywall-ui.js'; // Trockenbau
const FEAT_DW = M.getPref('feat.drywall', true); // Trockenbau-Modul ein/aus

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const escH = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const cv = $('#cv'), ctx = cv.getContext('2d');
const view = { x: 0, y: 0, z: 1, w: 100, h: 100 };
let dpr = 1;
const sel = new Set();
let tool = null, toolName = 'select', lastTool = 'line';
let cursor = null, snapInfo = null, pointerType = 'mouse', hoverEnt = null;
let drag = null, boxRect = null;
const opts = {
  hatch: { pattern: 'daemmung', scale: 1, angle: 'auto', outline: true, fillColor: '#d0d0d0' },
  wall: { sys: 'W112', prof: 75, achs: 625, board: 'GKB', t: 12.5, h: 2750, ins: 60, just: 'M', gap: 0, layers: 2 }, // Trockenbau
  dimMode: 'auto', offset: 12.5, mirrorKeep: true, rotCopy: false, textH: 3.5, arrow: 'arrow', rectHatch: 'none',
};
Object.assign(opts, M.getPref('opts', {}));
opts.wall = Object.assign({ sys: 'W112', prof: 75, achs: 625, board: 'GKB', t: 12.5, h: 2750, ins: 60, just: 'M', gap: 0, layers: 2 }, opts.wall || {}); // Trockenbau
const tg = Object.assign({ snap: true, grid: false, ortho: false, polar: true, lwReal: false, showGrid: true }, M.getPref('toggles', {}));
const sk = Object.assign({ end: true, mid: true, cen: true, quad: true, int: true, perp: true, near: true }, M.getPref('snapKinds', {}));
let clipboard = null;
let mode3d = false;

// ---------- App-Schnittstelle für Werkzeuge ----------
const app = {
  get doc() { return state.doc; },
  sel, opts, view,
  render: () => requestRender(),
  commit: () => { M.commit(); requestRender(); refreshProps(); },
  prompt: (t) => { $('#prompt').textContent = t || ''; },
  chips: (list) => renderChips(list),
  setTool: (n, ...a) => setTool(n, ...a),
  tol: () => 10 / view.z,
  layerFor: (id) => (state.doc.layers.some((l) => l.id === id) && id !== undefined ? id : state.doc.cur),
  addEnts(list) {
    const out = list.map((e) => Object.assign({ id: nid(), layer: state.doc.cur }, e));
    for (const e of out) { if (!state.doc.layers.some((l) => l.id === e.layer)) e.layer = state.doc.cur; state.doc.ents.push(e); }
    return out;
  },
  removeEnts(ids) { const s = new Set(ids); state.doc.ents = state.doc.ents.filter((e) => !s.has(e.id)); ids.forEach((i) => sel.delete(i)); },
  pick: (p, filter) => pick(p, filter),
  visibleEnts: () => visibleEnts(),
  segsAll() { const s = []; for (const e of visibleEnts()) if (!['dim', 'text', 'leader'].includes(e.type)) s.push(...entSegs(e, true)); return s; },
  parsePoint: (s, b, c, o) => parsePoint(s, b, c, o),
  textDialog: (v, t) => textDialog(v, t),
  toast: (m) => toast(m),
  syncOpts: () => { renderOptbar(); saveOpts(); },
  refreshPanels: () => refreshAll(),
};

function saveOpts() { M.setPref('opts', opts); }
const visibleEnts = () => state.doc.ents.filter((e) => layerById(e.layer).vis);

// ---------- Ansicht ----------
const toScreen = (p) => ({ x: (p.x - view.x) * view.z + view.w / 2, y: view.h / 2 - (p.y - view.y) * view.z });
const toModel = (s) => ({ x: (s.x - view.w / 2) / view.z + view.x, y: (view.h / 2 - s.y) / view.z + view.y });

function resize() {
  const r = $('#stage').getBoundingClientRect();
  dpr = window.devicePixelRatio || 1;
  view.w = r.width; view.h = r.height;
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
  if (mode3d) { v3d.resize(); v3d.render(); }
  requestRender();
}

function zoomFit() {
  let b = M.docBBox();
  const sh = state.doc.sheet;
  if (!b && sh.show) { const S = sheetMaps(sh); b = G.bboxOf([S.toModel(0, 0), S.toModel(S.W, S.H)]); }
  if (!b) b = { x0: -500, y0: -300, x1: 500, y1: 300 };
  const w = Math.max(b.x1 - b.x0, 10), h = Math.max(b.y1 - b.y0, 10);
  view.z = Math.min(view.w / w, view.h / h) * 0.88;
  view.x = (b.x0 + b.x1) / 2; view.y = (b.y0 + b.y1) / 2;
  requestRender();
}
function zoomSheet() {
  const S = sheetMaps(state.doc.sheet);
  const w = S.W * state.doc.sheet.sc, h = S.H * state.doc.sheet.sc;
  view.z = Math.min(view.w / w, view.h / h) * 0.92; view.x = state.doc.sheet.cx; view.y = state.doc.sheet.cy; requestRender();
}
function zoomAt(s, f) {
  const before = toModel(s);
  view.z = Math.max(1e-4, Math.min(500, view.z * f));
  const after = toModel(s);
  view.x += before.x - after.x; view.y += before.y - after.y;
  requestRender();
}

// ---------- Zeichnen ----------
let pending = false;
function requestRender() { if (!pending) { pending = true; requestAnimationFrame(draw); } }

function drawGrid() {
  const g = +state.doc.settings.grid || 10;
  let step = g; while (step * view.z < 9) step *= (String(step)[0] === '2' ? 2.5 : 2);
  while (step * view.z > 60 && step / 2 >= 0.5) step /= 2;
  const tl = toModel({ x: 0, y: 0 }), br = toModel({ x: view.w, y: view.h });
  const i0 = Math.floor(tl.x / step), i1 = Math.ceil(br.x / step), j0 = Math.floor(br.y / step), j1 = Math.ceil(tl.y / step);
  if ((i1 - i0) * (j1 - j0) > 40000) return;
  ctx.fillStyle = 'rgba(40,60,90,0.18)';
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const p = toScreen({ x: i * step, y: j * step });
    const major = (i % 5 === 0 && j % 5 === 0);
    const s = major ? 2 : 1.2;
    ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
  }
}

function draw() {
  pending = false;
  const d = state.doc, sc = d.sheet.sc;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = d.sheet.show ? '#dfe3e8' : '#fbfbfa';
  ctx.fillRect(0, 0, view.w, view.h);
  if (d.sheet.show) {
    const S = sheetMaps(d.sheet); const a = toScreen(S.toModel(0, 0)), b = toScreen(S.toModel(S.W, S.H));
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.restore();
  }
  if (tg.showGrid) drawGrid();
  // Ursprung
  const o = toScreen({ x: 0, y: 0 });
  ctx.strokeStyle = 'rgba(211,47,47,0.5)'; ctx.lineWidth = 1; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + 18, o.y); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x, o.y - 18); ctx.stroke();

  const B = new CanvasB(ctx, view, { sc, lwReal: tg.lwReal });
  const vb = (() => { const a = toModel({ x: 0, y: view.h }), b = toModel({ x: view.w, y: 0 }); return { x0: a.x, y0: a.y, x1: b.x, y1: b.y }; })();
  for (const pass of [0, 1]) for (const e of d.ents) {
    if ((e.type === 'image') !== (pass === 0)) continue; // Unterlagen zuerst
    const L = layerById(e.layer); if (!L.vis) continue;
    if (!G.bboxOverlap(entBBox(e, sc), vb)) continue;
    if (drag && drag.type === 'move' && sel.has(e.id)) continue;
    emit(e, B, sc);
  }
  if (d.sheet.show) emitSheet(B, d.sheet);

  const HB = new CanvasB(ctx, view, { sc, color: '#1e6cff', lwBoost: 1.5, noFill: true });
  if (hoverEnt && !sel.has(hoverEnt.id) && (toolName === 'select' || tool?.wantsSelect)) {
    const HV = new CanvasB(ctx, view, { sc, color: 'rgba(30,108,255,0.45)', lwBoost: 1, noFill: true }); emit(hoverEnt, HV, sc);
  }
  for (const e of d.ents) if (sel.has(e.id)) {
    if (drag && drag.type === 'move') emit(transformEnt(JSON.parse(JSON.stringify(e)), Tmove(drag.dx || 0, drag.dy || 0)), HB, sc);
    else emit(e, HB, sc);
  }
  if (toolName === 'select' && sel.size && sel.size <= 40 && !(drag && drag.type === 'move')) {
    for (const e of d.ents) if (sel.has(e.id)) for (const g of grips(e)) {
      const p = toScreen(g.p); ctx.fillStyle = '#1e6cff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
      ctx.fillRect(p.x - 4.5, p.y - 4.5, 9, 9); ctx.strokeRect(p.x - 4.5, p.y - 4.5, 9, 9);
    }
  }
  if (tool) { const PB = new CanvasB(ctx, view, { sc, color: '#1e6cff', lwBoost: 0.3 }); tool.preview(PB, sc); }
  if (boxRect) {
    const a = toScreen(boxRect.a), b = toScreen(boxRect.b); const win = b.x > a.x;
    ctx.fillStyle = win ? 'rgba(30,108,255,0.08)' : 'rgba(46,160,67,0.08)'; ctx.strokeStyle = win ? '#1e6cff' : '#2ea043';
    ctx.setLineDash(win ? [] : [5, 4]); ctx.lineWidth = 1;
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.setLineDash([]);
  }
  if (cursor) {
    const p = toScreen(cursor);
    if (snapInfo?.track && tool?.base) {
      const b = toScreen(tool.base); const dx = p.x - b.x, dy = p.y - b.y, l = Math.hypot(dx, dy) || 1;
      ctx.strokeStyle = 'rgba(232,89,12,0.7)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + dx / l * 4000, b.y + dy / l * 4000); ctx.stroke(); ctx.setLineDash([]);
    }
    if (pointerType === 'mouse') {
      ctx.strokeStyle = 'rgba(30,40,55,0.55)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.x - 14, p.y); ctx.lineTo(p.x + 14, p.y); ctx.moveTo(p.x, p.y - 14); ctx.lineTo(p.x, p.y + 14); ctx.stroke();
    }
    if (snapInfo?.kind) drawSnapMarker(p, snapInfo.kind);
    if (tool?.base && toolName !== 'select') {
      const l = G.dist(tool.base, cursor), a = G.deg(G.ang(tool.base, cursor));
      const txt = `${fmtNum(l, 1)} mm  ${fmtNum((a + 360) % 360, 1)}°`;
      ctx.font = '12px system-ui, sans-serif'; const w = ctx.measureText(txt).width;
      ctx.fillStyle = 'rgba(29,39,51,0.88)'; ctx.fillRect(p.x + 16, p.y + 14, w + 10, 19);
      ctx.fillStyle = '#fff'; ctx.fillText(txt, p.x + 21, p.y + 28);
    }
  }
}

function drawSnapMarker(p, k) {
  ctx.strokeStyle = '#e8590c'; ctx.lineWidth = 2; ctx.setLineDash([]); ctx.beginPath();
  const s = 7;
  switch (k) {
    case 'end': ctx.rect(p.x - s, p.y - s, 2 * s, 2 * s); break;
    case 'mid': ctx.moveTo(p.x, p.y - s); ctx.lineTo(p.x + s, p.y + s); ctx.lineTo(p.x - s, p.y + s); ctx.closePath(); break;
    case 'cen': ctx.arc(p.x, p.y, s, 0, G.TAU); break;
    case 'quad': ctx.moveTo(p.x, p.y - s); ctx.lineTo(p.x + s, p.y); ctx.lineTo(p.x, p.y + s); ctx.lineTo(p.x - s, p.y); ctx.closePath(); break;
    case 'int': ctx.moveTo(p.x - s, p.y - s); ctx.lineTo(p.x + s, p.y + s); ctx.moveTo(p.x + s, p.y - s); ctx.lineTo(p.x - s, p.y + s); break;
    case 'perp': ctx.moveTo(p.x - s, p.y + s); ctx.lineTo(p.x + s, p.y + s); ctx.moveTo(p.x - s, p.y + s); ctx.lineTo(p.x - s, p.y - s); ctx.moveTo(p.x - s, p.y); ctx.lineTo(p.x, p.y); ctx.lineTo(p.x, p.y + s); break;
    case 'near': ctx.moveTo(p.x - s, p.y - s); ctx.lineTo(p.x + s, p.y - s); ctx.lineTo(p.x - s, p.y + s); ctx.lineTo(p.x + s, p.y + s); ctx.closePath(); break;
    case 'grid': ctx.moveTo(p.x - s, p.y); ctx.lineTo(p.x + s, p.y); ctx.moveTo(p.x, p.y - s); ctx.lineTo(p.x, p.y + s); break;
  }
  ctx.stroke();
  const names = { end: 'Endpunkt', mid: 'Mitte', cen: 'Zentrum', quad: 'Quadrant', int: 'Schnittpunkt', perp: 'Lot', near: 'Auf Objekt', grid: 'Raster' };
  ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = '#e8590c'; ctx.fillText(names[k] || '', p.x + 10, p.y - 10);
}

// ---------- Fang ----------
function entInts(e1, e2) {
  const circ = (e) => e.type === 'circle' || e.type === 'arc';
  const onArc = (e, q) => e.type !== 'arc' || G.angInArc(G.ang(e.c, q), e.a0, e.a1);
  const out = [];
  if (circ(e1) && circ(e2)) { for (const q of G.circleCircleInt(e1.c, e1.r, e2.c, e2.r)) if (onArc(e1, q) && onArc(e2, q)) out.push(q); return out; }
  if (circ(e1) || circ(e2)) {
    const c = circ(e1) ? e1 : e2, o = circ(e1) ? e2 : e1;
    for (const [a, b] of entSegs(o)) for (const q of G.lineCircleInt(a, b, c.c, c.r)) if (q.t >= -1e-9 && q.t <= 1 + 1e-9 && onArc(c, q)) out.push(q);
    return out;
  }
  const s1 = entSegs(e1), s2 = entSegs(e2);
  for (const [a, b] of s1) for (const [c, d] of s2) { const I = G.segSegInt(a, b, c, d); if (I) out.push(I); }
  return out;
}

function snapAt(sp, ev, exclude) {
  const raw = toModel(sp);
  const tol = 10 / view.z;
  const base = drag?.base || tool?.base;
  let best = null;
  const cand = (p, k, rank) => { const d = G.dist(p, raw); if (d > tol) return; if (!best || rank < best.rank || (rank === best.rank && d < best.d)) best = { p: { x: p.x, y: p.y }, k, rank, d }; };
  if (tg.snap) {
    const sc = state.doc.sheet.sc;
    const near = visibleEnts().filter((e) => !(exclude && exclude.has(e.id)) && G.bboxHit(entBBox(e, sc), raw, tol));
    for (const e of near) for (const s of snapPts(e)) if (sk[s.k]) cand(s.p, s.k, s.k === 'mid' ? 1 : 0);
    if (sk.int && near.length < 80) {
      const lin = near.filter((e) => !['dim', 'text', 'leader'].includes(e.type));
      for (let i = 0; i < lin.length; i++) for (let j = i + 1; j < lin.length; j++) for (const q of entInts(lin[i], lin[j])) cand(q, 'int', 0);
      for (const e of lin) if (e.type === 'pline' || (e.type === 'hatch' && e.outline)) { const s = entSegs(e); for (let i = 0; i < s.length; i++) for (let j = i + 2; j < s.length; j++) { const I = G.segSegInt(s[i][0], s[i][1], s[j][0], s[j][1]); if (I) cand(I, 'int', 0); } }
    }
    if (sk.perp && base) for (const e of near) for (const [a, b] of entSegs(e)) { const f = G.footOnLine(base, a, b); if (f.t > -1e-9 && f.t < 1 + 1e-9) cand(f.q, 'perp', 2); }
    if (sk.near && !best) for (const e of near) {
      if (e.type === 'circle' || e.type === 'arc') { const a = G.ang(e.c, raw); if (e.type === 'circle' || G.angInArc(a, e.a0, e.a1)) cand(G.polar(e.c, e.r, a), 'near', 3); continue; }
      for (const [a, b] of entSegs(e)) cand(G.distPointSeg(raw, a, b).q, 'near', 3);
    }
  }
  if (best) return { p: best.p, kind: best.k, raw };
  let p = { x: raw.x, y: raw.y }, kind = null, track = false;
  const g = +state.doc.settings.grid || 10;
  const orth = tg.ortho !== !!(ev && ev.shiftKey);
  if (base && orth) {
    if (Math.abs(p.x - base.x) >= Math.abs(p.y - base.y)) p.y = base.y; else p.x = base.x;
    if (tg.grid) { if (p.y === base.y) p.x = base.x + Math.round((p.x - base.x) / g) * g; else p.y = base.y + Math.round((p.y - base.y) / g) * g; kind = 'grid'; }
    track = true;
  } else if (base && tg.polar) {
    const a = G.ang(base, p), step = G.rad(15);
    const as = Math.round(a / step) * step;
    if (Math.abs(a - as) < G.rad(2.5)) {
      const l = G.dist(base, p); const L = tg.grid ? Math.round(l / g) * g : l;
      p = G.polar(base, L, as); track = true; if (tg.grid) kind = 'grid';
    } else if (tg.grid) { p = { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g }; kind = 'grid'; }
  } else if (tg.grid) { p = { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g }; kind = 'grid'; }
  return { p, kind, raw, track };
}

function pick(p, filter) {
  const tol = 10 / view.z; const sc = state.doc.sheet.sc;
  let best = null, bd = Infinity;
  for (let i = state.doc.ents.length - 1; i >= 0; i--) {
    const e = state.doc.ents[i]; const L = layerById(e.layer);
    if (!L.vis || L.lock) continue;
    if (filter && !filter(e)) continue;
    if (!G.bboxHit(entBBox(e, sc), p, tol)) continue;
    let d = hitDist(e, p, sc);
    if ((e.type === 'hatch' || e.type === 'wall') && d < 0.001) d = tol * 0.85;
    if (e.type === 'image' && d < 0.001) d = tol * 0.97;
    if ((e.type === 'text' || e.type === 'leader') && d === 0) d = tol * 0.5;
    if (d < tol && d < bd) { bd = d; best = e; }
  }
  return best;
}

function grips(e) {
  const g = []; const A = (p, f, base) => g.push({ p, f, base });
  switch (e.type) {
    case 'line': A(e.a, (q) => { e.a = q; }, e.b); A(e.b, (q) => { e.b = q; }, e.a);
      A(G.mid(e.a, e.b), (q) => { const m = G.mid(e.a, e.b); const d = G.sub(q, m); e.a = G.add(e.a, d); e.b = G.add(e.b, d); }); break;
    case 'pline': case 'hatch': e.pts.forEach((p, i) => A(p, (q) => { e.pts[i] = q; }, e.pts[i - 1] || e.pts[i + 1])); break;
    case 'circle': A(e.c, (q) => { e.c = q; }); A(G.polar(e.c, e.r, 0), (q) => { e.r = Math.max(0.01, G.dist(e.c, q)); }, e.c); break;
    case 'arc': A(e.c, (q) => { e.c = q; });
      A(G.polar(e.c, e.r, e.a0), (q) => { e.a0 = G.normAng(G.ang(e.c, q)); }, e.c);
      A(G.polar(e.c, e.r, e.a1), (q) => { e.a1 = G.normAng(G.ang(e.c, q)); }, e.c);
      A(G.polar(e.c, e.r, e.a0 + G.normAng(e.a1 - e.a0) / 2), (q) => { e.r = Math.max(0.01, G.dist(e.c, q)); }, e.c); break;
    case 'dim': { const gg = dimGeom(e); A(e.a, (q) => { e.a = q; }); A(e.b, (q) => { e.b = q; }); A(G.mid(gg.fa, gg.fb), (q) => { e.p = q; }); break; }
    case 'leader': e.pts.forEach((p, i) => A(p, (q) => { e.pts[i] = q; })); break;
    case 'text': A(e.p, (q) => { e.p = q; }); break;
    case 'image': A(e.p, (q) => { e.p = q; }); break;
    case 'wall': A(e.a, (q) => { DWUI.moveJoint(e, 'a', q); e.a = q; }, e.b); A(e.b, (q) => { DWUI.moveJoint(e, 'b', q); e.b = q; }, e.a); A(G.mid(e.a, e.b), (q) => { const m = G.mid(e.a, e.b); const d = G.sub(q, m); e.a = G.add(e.a, d); e.b = G.add(e.b, d); }); break; // Trockenbau
  }
  return g;
}

function selectBox(a, b, add) {
  const win = b.x > a.x;
  const r = { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
  const sc = state.doc.sheet.sc;
  if (!add) sel.clear();
  for (const e of state.doc.ents) {
    const L = layerById(e.layer); if (!L.vis || L.lock) continue;
    const bb = entBBox(e, sc);
    let hit = false;
    if (win) hit = G.bboxInside(bb, r);
    else if (G.bboxOverlap(bb, r)) {
      const segs = entSegs(e, true);
      if (segs.length && !['text', 'leader', 'dim'].includes(e.type)) hit = segs.some(([p, q]) => G.segHitsRect(p, q, r)) || (e.type === 'hatch' && G.pointInRings({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 }, [e.pts]));
      else hit = true;
    }
    if (hit) sel.add(e.id);
  }
  selChanged();
}

function selChanged() { refreshProps(); requestRender(); if (tool && tool.wantsSelect) tool.update(); }

// ---------- Eingabe parsen ----------
function parsePoint(str, base, cur, o = {}) {
  let s = String(str).trim(); if (!s) return null;
  let abs = false; if (s[0] === '#') { abs = true; s = s.slice(1).trim(); }
  if (s[0] === '@') s = s.slice(1).trim();
  const num = (x) => { const v = parseFloat(String(x).replace(',', '.')); return isNaN(v) ? null : v; };
  let m = s.match(/^(-?[\d.,]+)\s*<\s*(-?[\d.,]+)$/);
  if (m && base) { const l = num(m[1]), a = num(m[2]); if (l !== null && a !== null) return G.polar(base, l, G.rad(a)); }
  m = s.match(/^(-?[\d.,]+)\s*[x×*;\s]\s*(-?[\d.,]+)$/i);
  if (m) {
    let dx = num(m[1]), dy = num(m[2]); if (dx === null || dy === null) return null;
    if (abs || !base) return { x: dx, y: dy };
    if (o.signFromCursor && cur) { dx = cur.x < base.x ? -Math.abs(dx) : Math.abs(dx); dy = cur.y < base.y ? -Math.abs(dy) : Math.abs(dy); }
    return { x: base.x + dx, y: base.y + dy };
  }
  if (/^-?[\d.,]+$/.test(s) && base) {
    const l = num(s); if (l === null) return null;
    let d = cur ? G.sub(cur, base) : { x: 1, y: 0 }; if (G.len(d) < 1e-9) d = { x: 1, y: 0 };
    return G.add(base, G.mul(G.norm(d), l));
  }
  return null;
}

// ---------- Werkzeuge ----------
const TOOLS = {
  select: { label: 'Auswahl', key: 'Escape', icon: '<path d="M5 3l11 6.5-4.8 1.3 3 5.4-2 1.1-3-5.4L5.6 15z"/>' },
  line: { label: 'Linie', key: 'L', cls: T.LineTool, icon: '<path d="M4 16L16 4"/><circle cx="4" cy="16" r="1.6"/><circle cx="16" cy="4" r="1.6"/>' },
  pline: { label: 'Polylinie', key: 'P', cls: T.PlineTool, icon: '<path d="M3 15l4-8 5 5 5-8"/>' },
  rect: { label: 'Rechteck', key: 'R', cls: T.RectTool, icon: '<rect x="3.5" y="5.5" width="13" height="9"/>' },
  circle: { label: 'Kreis', key: 'C', cls: T.CircleTool, icon: '<circle cx="10" cy="10" r="6.5"/><circle cx="10" cy="10" r="0.8"/>' },
  arc: { label: 'Bogen', key: 'A', cls: T.ArcTool, icon: '<path d="M3.5 15A7.5 7.5 0 0 1 16.5 15"/>' },
  hatch: { label: 'Schraffur', key: 'H', cls: T.HatchTool, icon: '<rect x="3.5" y="3.5" width="13" height="13"/><path d="M3.5 9.5l6-6M3.5 15.5l12-12M9.5 16.5l7-7"/>' },
  dim: { label: 'Bemaßung', key: 'D', cls: T.DimTool, icon: '<path d="M3 11h14M3 6v9M17 6v9M2 13l2-4M16 13l2-4"/>' },
  text: { label: 'Text', key: 'T', cls: T.TextTool, icon: '<path d="M5 5h10M10 5v11M8 16h4"/>' },
  leader: { label: 'Beschriftung', key: 'B', cls: T.LeaderTool, icon: '<path d="M4 16l6-6h7M4 16l1-3.2M4 16l3.2-1"/>' },
  move: { label: 'Verschieben', key: 'M', cls: T.MoveTool, icon: '<path d="M10 2v16M2 10h16M10 2l-2.5 2.5M10 2l2.5 2.5M10 18l-2.5-2.5M10 18l2.5-2.5M2 10l2.5-2.5M2 10l2.5 2.5M18 10l-2.5-2.5M18 10l-2.5 2.5"/>' },
  copy: { label: 'Kopieren', key: 'K', cls: T.MoveTool, arg: true, icon: '<rect x="3" y="3" width="9.5" height="9.5"/><rect x="7.5" y="7.5" width="9.5" height="9.5"/>' },
  rotate: { label: 'Drehen', key: 'Q', cls: T.RotateTool, icon: '<path d="M15.5 6.5A6.5 6.5 0 1 0 16.5 11"/><path d="M15.8 2.8v4h-4"/>' },
  mirror: { label: 'Spiegeln', key: 'S', cls: T.MirrorTool, icon: '<path d="M10 2v16" stroke-dasharray="2 2"/><path d="M8 5L3 15h5zM12 5l5 10h-5z"/>' },
  offset: { label: 'Versatz', key: 'O', cls: T.OffsetTool, icon: '<path d="M3 13c3-6 9-6 14-8M3 17c3-6 9-6 14-8"/>' },
  trim: { label: 'Stutzen', key: 'X', cls: T.TrimTool, icon: '<path d="M10 2v16M2 10h5" /><path d="M12 10h6" stroke-dasharray="1.5 2"/>' },
  extend: { label: 'Dehnen', key: 'E', cls: T.ExtendTool, icon: '<path d="M17 3v14M3 10h8"/><path d="M11 10h5M13.5 7.5L16 10l-2.5 2.5" stroke-dasharray="0"/>' },
  wall: { label: 'Wand (Trockenbau)', key: 'W', cls: DWUI.WallTool, icon: '<rect x="2.5" y="7" width="15" height="6"/><path d="M6 7v6M10 7v6M14 7v6" stroke-dasharray="1.5 1.5"/>' }, // Trockenbau
  calib: { label: 'Plan kalibrieren', cls: UL.CalibTool, icon: '<path d="M3 15L15 3"/><circle cx="3.5" cy="14.5" r="1.6"/><circle cx="14.5" cy="3.5" r="1.6"/><path d="M11 16.5l2 2 4-5"/>' },
  measure: { label: 'Messen', key: 'I', cls: T.MeasureTool, icon: '<path d="M2.5 13.5l11-11 4 4-11 11z"/><path d="M6 10l1.5 1.5M8.5 7.5l1.5 1.5M11 5l1.5 1.5"/>' },
};
const CMDS = {
  explode: { label: 'Auflösen', icon: '<path d="M10 3v4M10 13v4M3 10h4M13 10h4M5 5l2.5 2.5M12.5 12.5L15 15M15 5l-2.5 2.5M7.5 12.5L5 15"/>', f: () => explodeSel() },
  dwmass: { label: 'Massen (Trockenbau)', icon: '<rect x="3" y="3" width="14" height="14" rx="1.5"/><path d="M6 7h8M6 10h8M6 13h5"/>', f: () => DWUI.massDialog(state.doc.ents.filter((e) => sel.has(e.id) && e.type === 'wall')) }, // Trockenbau
  plan: { label: 'PDF-Plan einlesen', icon: '<path d="M5 2.5h7l3.5 3.5v11.5H5z"/><path d="M12 2.5V6h3.5"/><path d="M7.5 11h5M7.5 14h5"/>', f: () => $('#pdfIn').click() },
  del: { label: 'Löschen (Entf)', icon: '<path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11"/>', f: () => deleteSel() },
};
const GROUPS = [['select'], ['line', 'pline', 'rect', 'circle', 'arc'], ['hatch', 'dim', 'text', 'leader'], ['move', 'copy', 'rotate', 'mirror', 'offset', 'trim', 'extend', 'explode', 'del'], ...(FEAT_DW ? [['wall', 'dwmass']] : []), ['plan', 'calib'], ['measure']]; // Trockenbau-Gruppe

function buildToolbar() {
  const nav = $('#tools'); nav.innerHTML = '';
  for (const grp of GROUPS) {
    const g = document.createElement('div'); g.className = 'tgroup';
    for (const k of grp) {
      const d = TOOLS[k] || CMDS[k];
      const b = document.createElement('button'); b.className = 'tool'; b.dataset.tool = k;
      b.title = d.label + (d.key && d.key !== 'Escape' ? ` (${d.key})` : '');
      b.innerHTML = `<svg viewBox="0 0 20 20">${d.icon}</svg><span>${d.label.replace(/ \(.*/, '')}</span>`;
      b.onclick = () => { if (CMDS[k]) CMDS[k].f(); else setTool(k); closePanelMobile(); };
      g.appendChild(b);
    }
    nav.appendChild(g);
  }
}

function setTool(name, ...args) {
  if (mode3d) set3d(false);
  if (name instanceof T.PlaceTool || typeof name === 'object') { tool = name; toolName = 'place'; }
  else {
    const d = TOOLS[name]; if (!d) return;
    toolName = name;
    if (name !== 'select') lastTool = name;
    if (['line', 'pline', 'rect', 'circle', 'arc', 'hatch', 'dim', 'text', 'leader', 'measure', 'wall'].includes(name) && sel.size) { sel.clear(); refreshProps(); }
    tool = d.cls ? new d.cls(app, d.arg ?? args[0]) : null;
  }
  $$('#tools .tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === toolName));
  if (tool) tool.start();
  else { app.prompt(sel.size ? `${sel.size} Objekt(e) gewählt – Griffe ziehen zum Ändern, Entf = löschen` : 'Auswahl: Objekt anklicken oder Rahmen ziehen · Taste L/P/R/C… für Werkzeuge'); renderChips([]); }
  renderOptbar();
  requestRender();
}

function renderChips(list) {
  const el = $('#chips'); el.innerHTML = '';
  const all = [...(list || [])];
  if (pointerType !== 'mouse' && tool) all.push({ t: 'Abbrechen', f: () => tool.esc() });
  for (const c of all) {
    const b = document.createElement('button'); b.textContent = c.t; if (c.main) b.className = 'main';
    b.onclick = (e) => { e.stopPropagation(); c.f(); };
    el.appendChild(b);
  }
}

// ---------- Ändern-Befehle ----------
function deleteSel() {
  if (!sel.size) return toast('Nichts gewählt');
  state.doc.ents = state.doc.ents.filter((e) => !sel.has(e.id)); sel.clear(); app.commit(); setTool('select');
}
function explodeSel() {
  if (!sel.size) return toast('Erst Polylinien/Rechtecke wählen, dann „Auflösen"');
  const out = []; let n = 0;
  for (const e of state.doc.ents) {
    if (sel.has(e.id) && e.type === 'pline') { n++; for (const [a, b] of entSegs(e)) out.push({ id: nid(), type: 'line', layer: e.layer, color: e.color, lw: e.lw, lt: e.lt, a: G.clone(a), b: G.clone(b) }); }
    else if (sel.has(e.id) && e.type === 'hatch' && e.outline) { n++; out.push(Object.assign(cloneEnt(e), { outline: false })); for (const r of [e.pts, ...(e.holes || [])]) for (let i = 0; i < r.length; i++) out.push({ id: nid(), type: 'line', layer: e.layer, lw: e.olw || 0.35, a: G.clone(r[i]), b: G.clone(r[(i + 1) % r.length]) }); }
    else out.push(e);
  }
  state.doc.ents = out; sel.clear(); app.commit(); toast(n ? `${n} Objekt(e) aufgelöst` : 'Nur Polylinien und umrandete Schraffuren lassen sich auflösen');
}
function copySel() {
  if (!sel.size) return;
  const ents = state.doc.ents.filter((e) => sel.has(e.id));
  const b = ents.reduce((acc, e) => G.bboxUnion(acc, G.bboxOf(M.entPts(e))), null);
  clipboard = ents.map((e) => transformEnt(cloneEnt(e), Tmove(-b.x0, -b.y0)));
  toast(`${ents.length} Objekt(e) kopiert`);
}
function paste() { if (clipboard) setTool(new T.PlaceTool(app, JSON.parse(JSON.stringify(clipboard)), 'Einfügen')); }

// ---------- Zeiger ----------
const ptrs = new Map(); let pinch = null;
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId);
  pointerType = e.pointerType;
  ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    drag = null; boxRect = null; requestRender(); return;
  }
  if (ptrs.size > 2) return;
  const sp = { x: e.offsetX, y: e.offsetY };
  if (e.button === 1 || (e.button === 0 && spaceDown)) { drag = { type: 'pan', last: sp }; return; }
  if (e.button === 2) { drag = { type: 'right', start: sp }; return; }
  const selecting = toolName === 'select' || tool?.wantsSelect;
  const raw = toModel(sp);
  if (toolName === 'select' && sel.size && sel.size <= 40) {
    const tolPx = pointerType === 'mouse' ? 7 : 16;
    for (const ent of state.doc.ents) if (sel.has(ent.id)) {
      const gs = grips(ent);
      for (let gi = 0; gi < gs.length; gi++) {
        const p = toScreen(gs[gi].p);
        if (Math.abs(p.x - sp.x) < tolPx && Math.abs(p.y - sp.y) < tolPx) { drag = { type: 'grip', ent, gi, orig: JSON.stringify(ent), base: gs[gi].base || gs[gi].p, start: sp, moved: false }; return; }
      }
    }
  }
  if (selecting) {
    const hit = pick(raw);
    if (hit && sel.has(hit.id) && toolName === 'select') drag = { type: 'movePending', start: sp, hit };
    else drag = { type: 'boxPending', start: sp, startM: raw, hit, shift: e.shiftKey || e.ctrlKey };
  } else drag = { type: 'click', start: sp, ev: e };
  updateCursor(sp, e);
});

cv.addEventListener('pointermove', (e) => {
  pointerType = e.pointerType;
  const sp = { x: e.offsetX, y: e.offsetY };
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, sp);
  if (pinch && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    view.x -= (m.x - pinch.m.x) / view.z; view.y += (m.y - pinch.m.y) / view.z;
    if (pinch.d > 0) zoomAt(m, d / pinch.d);
    pinch = { d, m }; requestRender(); return;
  }
  if (drag?.type === 'pan') { view.x -= (sp.x - drag.last.x) / view.z; view.y += (sp.y - drag.last.y) / view.z; drag.last = sp; requestRender(); return; }
  const moved = drag?.start && Math.hypot(sp.x - drag.start.x, sp.y - drag.start.y) > (pointerType === 'mouse' ? 4 : 10);
  if (drag?.type === 'boxPending' && moved) { drag.type = 'box'; }
  if (drag?.type === 'movePending' && moved) {
    const s = snapAt(drag.start, e, null);
    drag = { type: 'move', base: s.p, dx: 0, dy: 0 };
  }
  if (drag?.type === 'box') { boxRect = { a: drag.startM, b: toModel(sp) }; requestRender(); return; }
  if (drag?.type === 'move') {
    const s = snapAt(sp, e, sel); cursor = s.p; snapInfo = s;
    drag.dx = s.p.x - drag.base.x; drag.dy = s.p.y - drag.base.y; requestRender(); showCoords(); return;
  }
  if (drag?.type === 'grip') {
    if (moved) drag.moved = true;
    const s = snapAt(sp, e, new Set([drag.ent.id])); cursor = s.p; snapInfo = s;
    Object.assign(drag.ent, JSON.parse(drag.orig));
    grips(drag.ent)[drag.gi].f(s.p);
    requestRender(); showCoords(); return;
  }
  updateCursor(sp, e);
});

function updateCursor(sp, e) {
  const s = snapAt(sp, e, null);
  cursor = s.p; snapInfo = s;
  if (tool) tool.move(s.p);
  hoverEnt = (toolName === 'select' || tool?.wantsSelect) && pointerType === 'mouse' ? pick(s.raw) : null;
  showCoords(); requestRender();
}
function showCoords() { if (cursor) $('#coords').textContent = `X ${fmtNum(cursor.x, 1)}  Y ${fmtNum(cursor.y, 1)}`; }

function endPointer(e) {
  ptrs.delete(e.pointerId);
  if (pinch) { if (ptrs.size < 2) pinch = null; drag = null; return; }
  if (!drag) return;
  const sp = { x: e.offsetX, y: e.offsetY };
  const d = drag; drag = null;
  if (e.type === 'pointercancel') { boxRect = null; requestRender(); return; }
  switch (d.type) {
    case 'right': if (Math.hypot(sp.x - d.start.x, sp.y - d.start.y) < 5) { if (tool) tool.enter(); else if (sel.size) { sel.clear(); selChanged(); } else setTool(lastTool); } break;
    case 'box': selectBox(boxRect.a, boxRect.b, d.shift); boxRect = null; break;
    case 'move':
      if (Math.abs(d.dx) + Math.abs(d.dy) > 0) { for (const ent of state.doc.ents) if (sel.has(ent.id)) transformEnt(ent, Tmove(d.dx, d.dy)); app.commit(); }
      break;
    case 'grip': if (d.moved) app.commit(); else { Object.assign(d.ent, JSON.parse(d.orig)); } break;
    case 'movePending': case 'boxPending': {
      const raw = toModel(sp);
      const hit = pick(raw);
      const add = e.shiftKey || e.ctrlKey || (tool?.wantsSelect);
      if (hit) { if (add && sel.has(hit.id)) sel.delete(hit.id); else { if (!add) sel.clear(); sel.add(hit.id); } }
      else if (!add) sel.clear();
      selChanged();
      if (toolName === 'select') setTool('select');
      break;
    }
    case 'click': {
      const s = snapAt(sp, e, null); cursor = s.p; snapInfo = s;
      const p = tool?.rawClick?.() ? s.raw : s.p;
      if (tool) tool.click(p, { raw: s.raw, kind: s.kind });
      break;
    }
  }
  requestRender();
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('pointerleave', () => { if (pointerType === 'mouse' && !drag) { cursor = null; hoverEnt = null; requestRender(); } });
cv.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt({ x: e.offsetX, y: e.offsetY }, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0016))); }, { passive: false });
cv.addEventListener('dblclick', (e) => { if (e.button === 1) zoomFit(); });
cv.addEventListener('auxclick', (e) => { if (e.button === 1 && e.detail === 2) zoomFit(); });

// ---------- Tastatur ----------
let spaceDown = false;
const KEYMAP = Object.fromEntries(Object.entries(TOOLS).filter(([k, v]) => v.key && v.key.length === 1 && (FEAT_DW || k !== 'wall')).map(([k, v]) => [v.key, k]));
window.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });
window.addEventListener('keydown', (e) => {
  const tgt = e.target; const inField = tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT');
  if (!$('#modal').hidden) { if (e.key === 'Escape') closeModal(null); return; }
  if (inField) {
    if (tgt.id === 'cmd') {
      if (e.key === 'Enter') { e.preventDefault(); submitCmd(); }
      else if (e.key === 'Escape') { tgt.value = ''; tgt.blur(); if (tool) tool.esc(); }
    }
    return;
  }
  const k = e.key; const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl) {
    const kl = k.toLowerCase();
    if (kl === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); }
    else if (kl === 'y' || (kl === 'z' && e.shiftKey)) { e.preventDefault(); doRedo(); }
    else if (kl === 's') { e.preventDefault(); exportJSON(); }
    else if (kl === 'a') { e.preventDefault(); visibleEnts().forEach((x) => { if (!layerById(x.layer).lock) sel.add(x.id); }); selChanged(); }
    else if (kl === 'c') { copySel(); }
    else if (kl === 'v') { paste(); }
    else if (kl === 'p') { e.preventDefault(); openPrint(); }
    return;
  }
  if (k === 'Escape') { if (tool) tool.esc(); else { sel.clear(); selChanged(); setTool('select'); } return; }
  if (k === 'Enter' || (k === ' ' && !e.repeat && toolName !== 'select')) { e.preventDefault(); if (tool) tool.enter(); else setTool(lastTool); return; }
  if (k === ' ') { spaceDown = true; if (toolName === 'select' && !sel.size) { e.preventDefault(); setTool(lastTool); } return; }
  if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); deleteSel(); return; }
  if (k === 'F3') { e.preventDefault(); toggle('snap'); return; }
  if (k === 'F7') { e.preventDefault(); toggle('grid'); return; }
  if (k === 'F8') { e.preventDefault(); toggle('ortho'); return; }
  if (k === 'F10') { e.preventDefault(); toggle('polar'); return; }
  if (/^[0-9.,\-@#<]$/.test(k)) { const c = $('#cmd'); c.focus(); c.value += k; e.preventDefault(); return; }
  if (k.toUpperCase() === 'Z') { zoomFit(); return; }
  const t = KEYMAP[k.toUpperCase()];
  if (t) { setTool(t); }
});

function submitCmd() {
  const c = $('#cmd'); const s = c.value.trim(); if (!s) { if (tool) tool.enter(); return; }
  if (tool && tool.input(s)) { c.value = ''; requestRender(); }
  else toast('Eingabe nicht verstanden – z. B. 500 · 600x300 · 500<30 · #x;y');
  if (pointerType === 'mouse') c.blur();
}

function doUndo() { if (M.undo()) { sel.clear(); afterDocChange(); } }
function doRedo() { if (M.redo()) { sel.clear(); afterDocChange(); } }
function afterDocChange() { if (tool && tool.pts) { tool.pts = []; } refreshAll(); requestRender(); if (mode3d) { v3d.build(); v3d.render(); } }

function toggle(k) { tg[k] = !tg[k]; M.setPref('toggles', tg); renderToggles(); requestRender(); }
function renderToggles() {
  $$('#toggles button').forEach((b) => b.classList.toggle('on', !!tg[b.dataset.t]));
}

// ---------- Toast ----------
let toastT = 0;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200); }

// ---------- Dialoge ----------
let modalResolve = null;
function dialog(title, html, buttons, onOpen) {
  const m = $('#modal');
  $('h3', m).textContent = title;
  const body = $('.body', m); body.innerHTML = html;
  const bt = $('.btns', m); bt.innerHTML = '';
  return new Promise((res) => {
    modalResolve = res;
    for (const b of buttons) {
      const el = document.createElement('button'); el.textContent = b.t; if (b.primary) el.className = 'primary'; if (b.danger) el.className = 'danger';
      el.onclick = () => closeModal(b.v === undefined ? null : b.v);
      bt.appendChild(el);
    }
    m.hidden = false;
    if (onOpen) onOpen(body);
    const f = $('input:not([type=checkbox]),textarea', body); if (f && pointerType === 'mouse') setTimeout(() => f.focus(), 30);
    $$('input', body).forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const pb = buttons.find((x) => x.primary); closeModal(pb ? pb.v : null); } }));
  });
}
function closeModal(v) {
  const m = $('#modal'); if (m.hidden) return;
  const data = {};
  $$('[name]', m).forEach((el) => { data[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
  m.hidden = true;
  const r = modalResolve; modalResolve = null;
  if (r) r(v === null ? null : { v, data });
}

const QUICK = ['GKB 12,5 mm', 'GKF 12,5 mm', 'GKFI 12,5 mm', '2× GKB 12,5 mm', 'CW-Profil 75', 'UW-Profil 75', 'Mineralwolle 60 mm', 'Anschlussdichtung', 'Trennstreifen', 'Fugenspachtel + Bewehrungsstreifen', 'Dampfbremse', 'OSB 15 mm', 'Kantholz 60/80', 'Dübel / Schraube', 'Silikon / Acryl', 'Rohdecke', 'Estrich'];
async function textDialog(v, title) {
  const hs = [1.8, 2.5, 3.5, 5, 7, 10];
  const html = `
    <label class="full">Text<textarea name="text" rows="3" placeholder="Text eingeben (Zeilenumbruch erlaubt)">${escH(v.text)}</textarea></label>
    <div class="qchips">${QUICK.map((q) => `<button type="button" data-q="${escH(q)}">${escH(q)}</button>`).join('')}</div>
    <div class="row3">
      <label>Schrifthöhe (Papier-mm)<select name="h">${hs.map((h) => `<option ${+v.h === h ? 'selected' : ''}>${String(h).replace('.', ',')}</option>`).join('')}</select></label>
      ${v.leader ? `<label>Pfeil<select name="arrow"><option value="arrow" ${v.arrow === 'arrow' ? 'selected' : ''}>Pfeil</option><option value="dot" ${v.arrow === 'dot' ? 'selected' : ''}>Punkt</option><option value="none" ${v.arrow === 'none' ? 'selected' : ''}>ohne</option></select></label>`
    : `<label>Winkel °<input name="angle" value="${v.angle || 0}" inputmode="decimal"></label>
         <label>Ausrichtung<select name="align"><option value="l">links</option><option value="c" ${v.align === 'c' ? 'selected' : ''}>mittig</option><option value="r" ${v.align === 'r' ? 'selected' : ''}>rechts</option></select></label>`}
    </div>
    ${v.leader ? '' : `<label class="chk"><input type="checkbox" name="bold" ${v.bold ? 'checked' : ''}> fett</label>`}`;
  const r = await dialog(title, html, [{ t: 'Abbrechen' }, { t: 'Übernehmen', v: 1, primary: true }], (body) => {
    const ta = $('textarea', body);
    $$('.qchips button', body).forEach((b) => b.onclick = () => { ta.value = ta.value ? ta.value + '\n' + b.dataset.q : b.dataset.q; ta.focus(); });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) closeModal(1); });
  });
  if (!r) return null;
  const D = r.data;
  return { text: D.text, h: parseFloat(String(D.h).replace(',', '.')), angle: parseFloat(String(D.angle || 0).replace(',', '.')) || 0, align: D.align || 'l', bold: !!D.bold, arrow: D.arrow };
}

// ---------- Optionsleiste ----------
const patOptions = (cur) => Object.entries(PATTERNS).map(([k, p]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${p.label}</option>`).join('');
function renderOptbar() {
  const d = state.doc; const bar = $('#optbar');
  let h = `<label class="ob">Layer <select data-o="layer">${d.layers.map((l) => `<option value="${l.id}" ${l.id === d.cur ? 'selected' : ''}>${escH(l.name)}</option>`).join('')}</select></label>`;
  switch (toolName) {
    case 'hatch': {
      const o = opts.hatch;
      h += `<label class="ob">Muster <select data-o="h.pattern">${patOptions(o.pattern)}</select></label>
        <label class="ob">Faktor <input data-o="h.scale" value="${String(o.scale).replace('.', ',')}" size="3" inputmode="decimal"></label>
        <label class="ob">Winkel <select data-o="h.angle">${['auto', 0, 15, 30, 45, 60, 90, 135].map((a) => `<option value="${a}" ${String(o.angle) === String(a) ? 'selected' : ''}>${a === 'auto' ? 'auto' : a + '°'}</option>`).join('')}</select></label>
        ${o.pattern === 'fuellung' ? `<label class="ob">Farbe <input type="color" data-o="h.fillColor" value="${o.fillColor}"></label>` : ''}
        <label class="ob chk"><input type="checkbox" data-o="h.outline" ${o.outline ? 'checked' : ''}> Umriss bei Polygon</label>`;
      break;
    }
    case 'rect':
      h += `<label class="ob">Als Bauteil <select data-o="rectHatch"><option value="none">nur Rechteck</option>${patOptions(opts.rectHatch)}</select></label><span class="hint">Maße tippen: 1250x12,5</span>`;
      break;
    case 'dim': {
      const s = d.settings;
      h += `<div class="seg sm" data-o="dimMode">${[['auto', 'Auto'], ['h', 'Horizontal'], ['v', 'Vertikal'], ['aligned', 'Ausgerichtet']].map(([k, l]) => `<button data-val="${k}" class="${opts.dimMode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <label class="ob">Einheit <select data-o="s.dimUnit">${[['mm', 'mm'], ['cm', 'cm'], ['cmhoch', 'cm mit hochgest. mm'], ['m', 'm']].map(([k, l]) => `<option value="${k}" ${s.dimUnit === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="ob">Nachk. <select data-o="s.dimDec">${[0, 1, 2].map((n) => `<option ${+s.dimDec === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="ob">Begrenzung <select data-o="s.dimTick"><option value="slash" ${s.dimTick === 'slash' ? 'selected' : ''}>Schrägstrich</option><option value="arrow" ${s.dimTick === 'arrow' ? 'selected' : ''}>Pfeil</option><option value="dot" ${s.dimTick === 'dot' ? 'selected' : ''}>Punkt</option></select></label>
        <label class="ob">Schrift <select data-o="s.dimText">${[1.8, 2.5, 3.5, 5].map((n) => `<option value="${n}" ${+s.dimText === n ? 'selected' : ''}>${String(n).replace('.', ',')}</option>`).join('')}</select></label>`;
      break;
    }
    case 'offset':
      h += `<label class="ob">Abstand mm <input data-o="offset" value="${String(opts.offset).replace('.', ',')}" size="5" inputmode="decimal"></label>
        ${[12.5, 15, 18, 25, 50, 75, 100].map((v) => `<button class="mini" data-off="${v}">${String(v).replace('.', ',')}</button>`).join('')}`;
      break;
    case 'wall': h += DWUI.optbarHtml(opts.wall); break; // Trockenbau
    case 'text': case 'leader':
      h += `<span class="hint">Schrifthöhe wird im Dialog gewählt (Papier-mm, maßstabsunabhängig)</span>`;
      break;
  }
  bar.innerHTML = h;
}
$('#optbar').addEventListener('change', (e) => {
  const k = e.target.dataset.o; if (!k) return;
  const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  const num = (x) => parseFloat(String(x).replace(',', '.'));
  if (k === 'layer') { state.doc.cur = v; M.autosave(); refreshLayers(); }
  else if (k.startsWith('w.')) { if (DWUI.optbarChange(opts.wall, k.slice(2), v) === 'rerender') renderOptbar(); if (tool) tool.update(); } // Trockenbau
  else if (k.startsWith('h.')) { const kk = k.slice(2); opts.hatch[kk] = kk === 'scale' ? (num(v) || 1) : v; if (kk === 'pattern') renderOptbar(); }
  else if (k.startsWith('s.')) { const kk = k.slice(2); state.doc.settings[kk] = ['dimDec', 'dimText'].includes(kk) ? num(v) : v; M.commit(); }
  else if (k === 'offset') { opts.offset = num(v) || opts.offset; if (tool) tool.update(); }
  else opts[k] = v;
  saveOpts(); requestRender();
});
$('#optbar').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.off) { opts.offset = +b.dataset.off; saveOpts(); renderOptbar(); if (tool) tool.update(); }
  const seg = b.closest('.seg'); if (seg && seg.dataset.o === 'dimMode') { opts.dimMode = b.dataset.val; saveOpts(); renderOptbar(); }
});

// ---------- Panels ----------
function refreshAll() { refreshProps(); refreshLayers(); refreshSheet(); renderOptbar(); updateHeader(); }
function updateHeader() {
  const sh = state.doc.sheet;
  $('#btnSheet').textContent = `${sh.fmt} ${sh.orient} · 1:${sh.sc}`;
  $('#docName').textContent = state.doc.name;
  document.title = state.doc.name + ' – CADBase';
}

const TYPE_DE = { image: 'Plan-Unterlage', wall: 'Trockenbauwand', line: 'Linie', pline: 'Polylinie', circle: 'Kreis', arc: 'Bogen', hatch: 'Schraffur', dim: 'Bemaßung', text: 'Text', leader: 'Beschriftung' };
function refreshProps() {
  const el = $('#tab-props'); const d = state.doc;
  const ents = d.ents.filter((e) => sel.has(e.id));
  if (!ents.length) {
    el.innerHTML = `<div class="empty"><p><b>Nichts gewählt.</b></p><p>Objekt anklicken oder Rahmen ziehen:<br>links→rechts = vollständig innen, rechts→links = berührt.</p>
      <h4>Schnell-Eingabe</h4><ul class="help">
      <li><kbd>500</kbd> Länge in Mausrichtung</li><li><kbd>600x300</kbd> relativ Δx, Δy</li><li><kbd>500&lt;30</kbd> Länge unter Winkel</li><li><kbd>#100;200</kbd> absolute Koordinate</li>
      <li><kbd>Shift</kbd> Ortho kurzzeitig · <kbd>Rechtsklick</kbd> = Enter</li><li><kbd>Z</kbd> alles zeigen · <kbd>Leertaste</kbd> letztes Werkzeug</li></ul>
      <h4>Zeichnung</h4><p>${d.ents.length} Objekte · Maßstab 1:${d.sheet.sc}</p></div>`;
    return;
  }
  const types = [...new Set(ents.map((e) => e.type))];
  const one = types.length === 1 ? types[0] : null;
  const e0 = ents[0];
  const common = (k) => { const v = e0[k]; return ents.every((e) => e[k] === v) ? v : undefined; };
  const lay = common('layer');
  let h = `<div class="ptitle">${ents.length === 1 ? TYPE_DE[e0.type] : `${ents.length} Objekte (${types.map((t) => TYPE_DE[t]).join(', ')})`}</div>`;
  h += row('Layer', `<select data-k="layer">${lay === undefined ? '<option value="">– verschieden –</option>' : ''}${d.layers.map((l) => `<option value="${l.id}" ${l.id === lay ? 'selected' : ''}>${escH(l.name)}</option>`).join('')}</select>`);
  const col = common('color');
  h += row('Farbe', `<select data-k="color"><option value="">VonLayer</option>${M.COLORS.map((c) => `<option value="${c}" ${c === col ? 'selected' : ''} style="color:${c}">■ ${c}</option>`).join('')}</select>`);
  const lw = common('lw');
  h += row('Strichstärke', `<select data-k="lw" data-num="1"><option value="">VonLayer</option>${M.LWS.map((w) => `<option value="${w}" ${w === lw ? 'selected' : ''}>${String(w).replace('.', ',')} mm</option>`).join('')}</select>`);
  const lt = common('lt');
  h += row('Linientyp', `<select data-k="lt"><option value="">VonLayer</option>${Object.entries(M.LTYPES).map(([k, v]) => `<option value="${k}" ${k === lt ? 'selected' : ''}>${v.label}</option>`).join('')}</select>`);
  const num = (k, label, v, step) => row(label, `<input data-k="${k}" data-num="1" value="${v === undefined || v === null ? '' : String(Math.round(v * 1000) / 1000).replace('.', ',')}" inputmode="decimal" ${step ? `placeholder="${step}"` : ''}>`);
  if (one === 'hatch') {
    h += row('Muster', `<select data-k="pattern">${patOptions(common('pattern'))}</select>`);
    h += num('scale', 'Musterfaktor', common('scale') ?? 1);
    const a = common('angle');
    h += row('Winkel', `<input data-k="angle" value="${a === undefined ? '' : (a === 'auto' || a === null ? 'auto' : String(a).replace('.', ','))}" placeholder="auto oder Grad">`);
    if (common('pattern') === 'fuellung') h += row('Füllfarbe', `<input type="color" data-k="fillColor" value="${common('fillColor') || '#d0d0d0'}">`);
    h += row('Umriss', `<input type="checkbox" data-k="outline" ${common('outline') ? 'checked' : ''}>`);
    h += row('Umriss-Stärke', `<select data-k="olw" data-num="1">${M.LWS.map((w) => `<option value="${w}" ${w === (common('olw') || 0.35) ? 'selected' : ''}>${String(w).replace('.', ',')} mm</option>`).join('')}</select>`);
    h += `<div class="psec">3D</div>` + num('ext', '3D-Höhe (leer = Standard)', common('ext')) + num('z0', 'Höhe Unterkante', common('z0'));
    if (ents.length === 1) h += `<div class="pinfo">Fläche ${fmtNum(Math.abs(G.polyArea(e0.pts)) / 1e6 - (e0.holes || []).reduce((s, r) => s + Math.abs(G.polyArea(r)), 0) / 1e6, 4)} m²</div>`;
  }
  if (one === 'pline') {
    h += row('Geschlossen', `<input type="checkbox" data-k="closed" ${common('closed') ? 'checked' : ''}>`);
    h += `<div class="psec">3D</div>` + num('ext', '3D-Höhe (geschlossen)', common('ext')) + num('z0', 'Höhe Unterkante', common('z0'));
    if (ents.length === 1) { let L = 0; for (const [a, b] of entSegs(e0)) L += G.dist(a, b); h += `<div class="pinfo">Länge ${fmtNum(L, 1)} mm${e0.closed ? ` · Fläche ${fmtNum(Math.abs(G.polyArea(e0.pts)) / 1e6, 4)} m²` : ''}</div>`; }
  }
  if (one === 'line' && ents.length === 1) {
    h += num('_len', 'Länge (mm)', G.dist(e0.a, e0.b)) + num('_ang', 'Winkel (°)', (G.deg(G.ang(e0.a, e0.b)) + 360) % 360);
    h += `<div class="pinfo">Δx ${fmtNum(e0.b.x - e0.a.x, 2)} · Δy ${fmtNum(e0.b.y - e0.a.y, 2)}</div>`;
  }
  if (one === 'circle') { h += num('r', 'Radius', common('r')); h += `<div class="psec">3D</div>` + num('ext', '3D-Höhe', common('ext')); }
  if (one === 'arc' && ents.length === 1) h += num('r', 'Radius', e0.r);
  if (one === 'text' || one === 'leader') {
    if (ents.length === 1) h += `<label class="full">Text<textarea data-k="text" rows="3">${escH(e0.text)}</textarea></label>`;
    h += row('Schrifthöhe', `<select data-k="h" data-num="1">${[1.8, 2.5, 3.5, 5, 7, 10].map((n) => `<option value="${n}" ${n === common('h') ? 'selected' : ''}>${String(n).replace('.', ',')} mm</option>`).join('')}</select>`);
    if (one === 'text') {
      h += num('angle', 'Winkel °', common('angle') || 0);
      h += row('Ausrichtung', `<select data-k="align">${[['l', 'links'], ['c', 'mittig'], ['r', 'rechts']].map(([k, l]) => `<option value="${k}" ${k === (common('align') || 'l') ? 'selected' : ''}>${l}</option>`).join('')}</select>`);
      h += row('Fett', `<input type="checkbox" data-k="bold" ${common('bold') ? 'checked' : ''}>`);
    } else h += row('Pfeil', `<select data-k="arrow">${[['arrow', 'Pfeil'], ['dot', 'Punkt'], ['none', 'ohne']].map(([k, l]) => `<option value="${k}" ${k === (common('arrow') || 'arrow') ? 'selected' : ''}>${l}</option>`).join('')}</select>`);
  }
  if (one === 'dim') {
    h += row('Art', `<select data-k="mode">${[['h', 'Horizontal'], ['v', 'Vertikal'], ['aligned', 'Ausgerichtet']].map(([k, l]) => `<option value="${k}" ${k === common('mode') ? 'selected' : ''}>${l}</option>`).join('')}</select>`);
    h += row('Maßtext', `<input data-k="txt" value="${escH(common('txt') || '')}" placeholder="leer = Messwert, <> = Wert">`);
    h += num('h', 'Schrifthöhe (leer = Standard)', common('h'));
    h += num('tofs', 'Text verschieben (mm)', common('tofs'));
    if (ents.length === 1) h += `<div class="pinfo">Messwert ${fmtNum(dimGeom(e0).val, 2)} mm</div>`;
  }
  if (one === 'wall') h += DWUI.propsHtml(ents, common, row); // Trockenbau
  if (one === 'image') h += UL.propsHtml(ents, common, row);
  if (!ents.every((e) => e.iso) && types.some((t) => !['dim', 'text', 'leader'].includes(t))) h += row('In 3D ausblenden', `<input type="checkbox" data-k="no3d" ${common('no3d') ? 'checked' : ''}>`);
  h += `<div class="pbtns"><button data-act="front">Nach vorne</button><button data-act="back">Nach hinten</button><button data-act="del" class="danger">Löschen</button></div>`;
  el.innerHTML = h;
}
const row = (l, c) => `<label class="prow"><span>${l}</span>${c}</label>`;

$('#tab-props').addEventListener('change', (ev) => {
  const t = ev.target; const k = t.dataset.k; if (!k) return;
  let v = t.type === 'checkbox' ? t.checked : t.value;
  const ents = state.doc.ents.filter((e) => sel.has(e.id));
  if (k === 'layer' && !v) return;
  for (const e of ents) {
    if (k === '_len' || k === '_ang') {
      const L = k === '_len' ? parseFloat(String(v).replace(',', '.')) : G.dist(e.a, e.b);
      const A = k === '_ang' ? G.rad(parseFloat(String(v).replace(',', '.'))) : G.ang(e.a, e.b);
      if (!isNaN(L) && !isNaN(A)) e.b = G.polar(e.a, L, A); continue;
    }
    if (k === 'angle' && e.type === 'hatch') { const s = String(v).trim().toLowerCase(); e.angle = (s === '' || s === 'auto') ? 'auto' : parseFloat(s.replace(',', '.')) || 0; continue; }
    if (v === '' && t.type !== 'checkbox') { delete e[k]; continue; }
    if (k === 'no3d' && !v) { delete e.no3d; continue; }
    if (e.type === 'wall') DWUI.propChanged(e, k, v); // Trockenbau
    if (t.dataset.num || ['r', 'scale', 'ext', 'z0', 'angle', 'tofs', 'h'].includes(k)) { const n = parseFloat(String(v).replace(',', '.')); if (!isNaN(n)) e[k] = n; }
    else e[k] = v;
  }
  app.commit(); if (mode3d) { v3d.build(); v3d.render(); }
});
$('#tab-props').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-act]'); if (!b) return;
  const a = b.dataset.act; const d = state.doc;
  if (a === 'del') return deleteSel();
  if (a.startsWith('dw')) return DWUI.propAction(a, d.ents.filter((e) => sel.has(e.id))); // Trockenbau
  if (a.startsWith('ul')) return UL.propAction(a);
  const s = d.ents.filter((e) => sel.has(e.id)), r = d.ents.filter((e) => !sel.has(e.id));
  d.ents = a === 'front' ? r.concat(s) : s.concat(r);
  app.commit();
});

function refreshLayers() {
  const d = state.doc; const el = $('#tab-layers');
  const cnt = {}; for (const e of d.ents) cnt[e.layer] = (cnt[e.layer] || 0) + 1;
  el.innerHTML = `<div class="layers">${d.layers.map((l) => `
    <div class="lrow ${l.id === d.cur ? 'cur' : ''}" data-id="${l.id}">
      <button class="lb" data-a="cur" title="Aktueller Layer">${l.id === d.cur ? '●' : '○'}</button>
      <button class="lb ${l.vis ? '' : 'off'}" data-a="vis" title="Sichtbar">${l.vis ? '👁' : '–'}</button>
      <button class="lb ${l.lock ? 'on' : ''}" data-a="lock" title="Gesperrt">${l.lock ? '🔒' : '🔓'}</button>
      <button class="lb ${l.print === false ? 'off' : ''}" data-a="print" title="Drucken">${l.print === false ? '⎙̸' : '⎙'}</button>
      <input class="lname" data-a="name" value="${escH(l.name)}">
      <span class="lcnt">${cnt[l.id] || 0}</span>
      <div class="lprops">
        <select data-a="color">${M.COLORS.map((c) => `<option value="${c}" ${c === l.color ? 'selected' : ''} style="color:${c}">■ ${c}</option>`).join('')}${M.COLORS.includes(l.color) ? '' : `<option selected value="${l.color}">${l.color}</option>`}</select>
        <select data-a="lw">${M.LWS.map((w) => `<option value="${w}" ${w === l.lw ? 'selected' : ''}>${String(w).replace('.', ',')}</option>`).join('')}</select>
        <select data-a="lt">${Object.entries(M.LTYPES).map(([k, v]) => `<option value="${k}" ${k === l.lt ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
        <button class="lb" data-a="del" title="Layer löschen">🗑</button>
      </div>
    </div>`).join('')}</div>
    <div class="pbtns"><button data-a="add">+ Neuer Layer</button><button data-a="selLayer">Objekte des aktuellen Layers wählen</button></div>`;
}
$('#tab-layers').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-a]'); if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
  const d = state.doc; const id = b.closest('.lrow')?.dataset.id; const L = d.layers.find((l) => l.id === id);
  switch (b.dataset.a) {
    case 'cur': d.cur = id; break;
    case 'vis': L.vis = !L.vis; break;
    case 'lock': L.lock = !L.lock; break;
    case 'print': L.print = L.print === false; break;
    case 'del': {
      if (d.layers.length < 2) return toast('Mindestens ein Layer nötig');
      const n = d.ents.filter((e) => e.layer === id).length;
      const target = d.layers.find((l) => l.id !== id);
      d.ents.forEach((e) => { if (e.layer === id) e.layer = target.id; });
      d.layers = d.layers.filter((l) => l.id !== id); if (d.cur === id) d.cur = target.id;
      if (n) toast(`${n} Objekt(e) auf „${target.name}" verschoben`);
      break;
    }
    case 'add': { const nl = { id: 'L' + Date.now().toString(36), name: 'Layer ' + (d.layers.length + 1), color: '#000000', lw: 0.25, lt: 'solid', vis: true, lock: false, print: true }; d.layers.push(nl); d.cur = nl.id; break; }
    case 'selLayer': sel.clear(); d.ents.forEach((e) => { if (e.layer === d.cur) sel.add(e.id); }); selChanged(); return;
    default: return;
  }
  app.commit(); refreshLayers(); renderOptbar();
});
$('#tab-layers').addEventListener('change', (ev) => {
  const t = ev.target; const a = t.dataset.a; const id = t.closest('.lrow')?.dataset.id; const L = state.doc.layers.find((l) => l.id === id); if (!L) return;
  if (a === 'name') L.name = t.value.trim() || L.name;
  else if (a === 'lw') L.lw = +t.value; else if (a === 'color') L.color = t.value; else if (a === 'lt') L.lt = t.value;
  app.commit(); renderOptbar();
});

function refreshSheet() {
  const sh = state.doc.sheet; const tb = sh.tb; const el = $('#tab-sheet');
  const pr = M.getPref('print', { mono: true, fit: 'same' });
  const [W, H] = paperSize(sh);
  el.innerHTML = `
    <div class="psec">Blatt</div>
    ${row('Format', `<select data-s="fmt">${Object.keys(M.FORMATS).map((f) => `<option ${f === sh.fmt ? 'selected' : ''}>${f}</option>`).join('')}</select>`)}
    ${row('Ausrichtung', `<select data-s="orient"><option value="quer" ${sh.orient === 'quer' ? 'selected' : ''}>Querformat</option><option value="hoch" ${sh.orient === 'hoch' ? 'selected' : ''}>Hochformat</option></select>`)}
    ${row('Maßstab 1:', `<input data-s="sc" list="scales" value="${sh.sc}" inputmode="decimal"><datalist id="scales">${M.SCALES.map((s) => `<option value="${s}">`).join('')}</datalist>`)}
    ${row('Blatt anzeigen', `<input type="checkbox" data-s="show" ${sh.show ? 'checked' : ''}>`)}
    ${row('Faltmarken DIN 824', `<input type="checkbox" data-s="fold" ${sh.fold !== false ? 'checked' : ''}>`)}
    <div class="pinfo">Papier ${W} × ${H} mm · Zeichenfläche ca. ${fmtNum((W - 25) * sh.sc / 1000, 2)} × ${fmtNum((H - 10) * sh.sc / 1000, 2)} m (Natur)</div>
    <div class="pbtns"><button data-act="place">Blatt positionieren</button><button data-act="center">Auf Zeichnung zentrieren</button><button data-act="zoom">Blatt zeigen</button><button data-act="autoscale">Passenden Maßstab wählen</button></div>
    <div class="psec">Schriftfeld</div>
    <label class="full">Verfasser / Firma<textarea data-tb="firma" rows="2">${escH(tb.firma)}</textarea></label>
    ${[['projekt', 'Projekt'], ['titel', 'Planinhalt'], ['plannr', 'Plan-Nr.'], ['index', 'Index'], ['gez', 'Gezeichnet'], ['datum', 'Datum']].map(([k, l]) => row(l, `<input data-tb="${k}" value="${escH(tb[k])}">`)).join('')}
    <div class="psec">Druck</div>
    ${row('Schwarz-Weiß', `<input type="checkbox" data-p="mono" ${pr.mono ? 'checked' : ''}>`)}
    ${row('Ausgabe auf', `<select data-p="fit"><option value="same">${sh.fmt} (maßstäblich)</option>${Object.keys(M.FORMATS).filter((f) => f !== sh.fmt).map((f) => `<option value="${f}" ${pr.fit === f ? 'selected' : ''}>${f} (verkleinert/vergrößert)</option>`).join('')}</select>`)}
    <div class="pbtns"><button data-act="print" class="primary">Drucken / PDF</button><button data-act="svg">SVG exportieren</button><button data-act="dxf">DXF exportieren</button></div>
    <p class="hint">Im Druckdialog „Ränder: Keine" und „Skalierung: 100 %" bzw. „Tatsächliche Größe" wählen. Für PDF als Drucker „Als PDF speichern" nehmen.</p>`;
}
$('#tab-sheet').addEventListener('change', (ev) => {
  const t = ev.target; const sh = state.doc.sheet;
  if (t.dataset.s) {
    const k = t.dataset.s;
    if (k === 'show') sh.show = t.checked;
    else if (k === 'fold') sh.fold = t.checked;
    else if (k === 'sc') { const v = parseFloat(t.value.replace(',', '.')); if (v > 0) sh.sc = v; }
    else sh[k] = t.value;
    app.commit(); refreshSheet(); updateHeader();
  } else if (t.dataset.tb) { sh.tb[t.dataset.tb] = t.value; app.commit(); }
  else if (t.dataset.p) { const pr = M.getPref('print', { mono: true, fit: 'same' }); pr[t.dataset.p] = t.type === 'checkbox' ? t.checked : t.value; M.setPref('print', pr); }
});
$('#tab-sheet').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-act]'); if (!b) return;
  const sh = state.doc.sheet;
  switch (b.dataset.act) {
    case 'place': setTool(new T.SheetTool(app)); closePanelMobile(); break;
    case 'center': centerSheet(); app.commit(); zoomSheet(); break;
    case 'zoom': zoomSheet(); closePanelMobile(); break;
    case 'autoscale': autoScale(); break;
    case 'print': openPrint(); break;
    case 'svg': exportSVG(M.getPref('print', { mono: true }).mono); break;
    case 'dxf': exportDXF(); break;
  }
});
function centerSheet() {
  const sh = state.doc.sheet; const b = M.docBBox(true, true) || M.docBBox(); if (!b) return;
  const [W, H] = paperSize(sh);
  // Zeichenfläche: Rahmen minus Schriftfeld -> Mitte etwas nach links/oben
  const cxp = (20 + (W - 5)) / 2, cyp = (5 + (H - 5 - 32)) / 2;
  sh.cx = (b.x0 + b.x1) / 2 - (cxp - W / 2) * sh.sc;
  sh.cy = (b.y0 + b.y1) / 2 + (cyp - H / 2) * sh.sc;
  sh.show = true;
}
function autoScale() {
  const sh = state.doc.sheet; const b = M.docBBox(true, true) || M.docBBox(); if (!b) return toast('Zeichnung ist leer');
  const [W, H] = paperSize(sh);
  const aw = W - 30, ah = H - 50;
  const need = Math.max((b.x1 - b.x0) / aw, (b.y1 - b.y0) / ah);
  sh.sc = M.SCALES.find((s) => s >= need) || 500;
  centerSheet(); app.commit(); refreshSheet(); updateHeader(); zoomSheet();
  toast(`Maßstab 1:${sh.sc} gewählt`);
}

async function openPrint() {
  const sh = state.doc.sheet;
  if (!sh.show) { sh.show = true; centerSheet(); app.commit(); }
  const pr = M.getPref('print', { mono: true, fit: 'same' });
  const imgData = await UL.imageDataMap(state.doc.ents.filter((e) => e.type === 'image' && layerById(e.layer).vis && layerById(e.layer).print !== false));
  printSheet({ mono: pr.mono, fit: pr.fit === 'same' ? null : pr.fit, imgData });
}

// ---------- Aufbauten ----------
function refreshLib() {
  $('#tab-lib').innerHTML = `
    <div class="lib">
      <button data-g="wand"><b>Metallständerwand</b><small>Horizontalschnitt mit CW-Profilen, Beplankung, Dämmung, Maßen</small></button>
      <button data-g="schicht"><b>Schichtenaufbau</b><small>Boden, Decke, Dach, Wand – mit Beschriftung und Maßkette</small></button>
      <button data-g="holz"><b>Kantholz / Balken</b><small>Querschnitt b/h mit Holzschraffur</small></button>
      <button data-g="profil"><b>CW- / UW-Profil</b><small>Einzelprofil im Schnitt</small></button>
      <button data-g="kote"><b>Höhenkote</b><small>z. B. ±0,00 OKFF</small></button>
      <button data-g="bruch"><b>Bruchlinie</b><small>Abbruchkante für Ausschnitte</small></button>
    </div>
    <p class="hint">Nach dem Bestätigen hängt das Bauteil am Cursor. „Drehen 90°" stellt es senkrecht. Maße in mm.</p>`;
}
$('#tab-lib').addEventListener('click', async (ev) => {
  const b = ev.target.closest('button[data-g]'); if (!b) return;
  const g = b.dataset.g; const Lf = app.layerFor;
  const place = (ents, label) => { if (ents && ents.length) { setTool(new T.PlaceTool(app, ents, label)); closePanelMobile(); } };
  const P = M.getPref('gen.' + g, {});
  const sv = (d) => M.setPref('gen.' + g, d);
  if (g === 'wand') {
    const o = Object.assign({ prof: 75, nA: 2, nB: 2, t: 12.5, typ: 'GKB', daem: 60, achs: 625, len: 1500, bruch: true, mass: true, text: true }, P);
    const sOpt = (arr, cur) => arr.map((v) => `<option ${String(v) === String(cur) ? 'selected' : ''}>${v}</option>`).join('');
    const r = await dialog('Metallständerwand', `
      <div class="row3">
        <label>Profil CW<select name="prof">${sOpt([50, 75, 100, 125, 150], o.prof)}</select></label>
        <label>Achsabstand<select name="achs">${sOpt([625, 417, 312.5], o.achs)}</select></label>
        <label>Wandlänge mm<input name="len" value="${o.len}" inputmode="decimal"></label>
      </div>
      <div class="row3">
        <label>Lagen Seite A<select name="nA">${sOpt([0, 1, 2, 3], o.nA)}</select></label>
        <label>Lagen Seite B<select name="nB">${sOpt([0, 1, 2, 3], o.nB)}</select></label>
        <label>Plattendicke<select name="t">${sOpt([9.5, 12.5, 15, 18, 20, 25], o.t)}</select></label>
      </div>
      <div class="row3">
        <label>Plattentyp<select name="typ">${sOpt(['GKB', 'GKF', 'GKFI', 'GKBI', 'Gipsfaser', 'Zementplatte'], o.typ)}</select></label>
        <label>Dämmung mm (0 = ohne)<input name="daem" value="${o.daem}" inputmode="decimal"></label>
        <span></span>
      </div>
      <label class="chk"><input type="checkbox" name="mass" ${o.mass ? 'checked' : ''}> Maßkette</label>
      <label class="chk"><input type="checkbox" name="bruch" ${o.bruch ? 'checked' : ''}> Bruchlinie am Ende</label>
      <label class="chk"><input type="checkbox" name="text" ${o.text ? 'checked' : ''}> Beschreibungstext</label>`, [{ t: 'Abbrechen' }, { t: 'Einfügen', v: 1, primary: true }]);
    if (!r) return; sv(r.data);
    const D = Object.fromEntries(Object.entries(r.data).map(([k, v]) => [k, typeof v === 'string' && /^[\d.,]+$/.test(v) ? parseFloat(v.replace(',', '.')) : v]));
    place(GEN.staenderwand(D, Lf), 'Ständerwand');
  }
  if (g === 'schicht') {
    let rows = (P.rows && P.rows.length) ? P.rows : JSON.parse(JSON.stringify(GEN.PRESETS['Schwimmender Estrich']));
    const o = Object.assign({ len: 600, dir: 'h', legend: true, mass: true, bruch: true }, P);
    const rowsHtml = () => rows.map((r, i) => `<div class="srow" data-i="${i}"><input data-f="name" value="${escH(r.name)}" placeholder="Bezeichnung"><input data-f="d" value="${String(r.d).replace('.', ',')}" inputmode="decimal" class="sd"><select data-f="pat">${patOptions(r.pat)}</select><button type="button" data-x="up" title="nach oben">↑</button><button type="button" data-x="del" title="entfernen">✕</button></div>`).join('');
    const r = await dialog('Schichtenaufbau', `
      <label class="full">Vorlage<select id="sPreset"><option value="">– Vorlage laden –</option>${Object.keys(GEN.PRESETS).map((k) => `<option>${k}</option>`).join('')}</select></label>
      <div class="shead"><span>Schicht (von oben / außen)</span><span>Dicke mm</span><span>Muster</span></div>
      <div id="sRows">${rowsHtml()}</div>
      <button type="button" id="sAdd" class="mini">+ Schicht</button> <span id="sSum" class="hint"></span>
      <div class="row3">
        <label>Länge mm<input name="len" value="${o.len}" inputmode="decimal"></label>
        <label>Richtung<select name="dir"><option value="h" ${o.dir === 'h' ? 'selected' : ''}>waagerecht (Boden/Decke)</option><option value="v" ${o.dir === 'v' ? 'selected' : ''}>senkrecht (Wand)</option></select></label>
        <span></span>
      </div>
      <label class="chk"><input type="checkbox" name="legend" ${o.legend ? 'checked' : ''}> Beschriftung mit Hinweislinien</label>
      <label class="chk"><input type="checkbox" name="mass" ${o.mass ? 'checked' : ''}> Maßkette</label>
      <label class="chk"><input type="checkbox" name="bruch" ${o.bruch ? 'checked' : ''}> Bruchlinie</label>`,
    [{ t: 'Abbrechen' }, { t: 'Einfügen', v: 1, primary: true }], (body) => {
      const box = $('#sRows', body);
      const sum = () => { $('#sSum', body).textContent = 'Gesamt: ' + fmtNum(rows.reduce((s, x) => s + (+x.d || 0), 0), 1) + ' mm'; };
      const redraw = () => { box.innerHTML = rowsHtml(); sum(); };
      sum();
      box.addEventListener('input', (e) => { const i = +e.target.closest('.srow').dataset.i; const f = e.target.dataset.f; rows[i][f] = f === 'd' ? (parseFloat(e.target.value.replace(',', '.')) || 0) : e.target.value; sum(); });
      box.addEventListener('change', (e) => { const i = +e.target.closest('.srow').dataset.i; const f = e.target.dataset.f; if (f === 'pat') rows[i].pat = e.target.value; });
      box.addEventListener('click', (e) => { const x = e.target.dataset.x; if (!x) return; const i = +e.target.closest('.srow').dataset.i; if (x === 'del') rows.splice(i, 1); if (x === 'up' && i > 0) [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; redraw(); });
      $('#sAdd', body).onclick = () => { rows.push({ name: '', d: 10, pat: 'keine' }); redraw(); };
      $('#sPreset', body).onchange = (e) => { if (e.target.value) { rows = JSON.parse(JSON.stringify(GEN.PRESETS[e.target.value])); redraw(); } };
    });
    if (!r) return;
    const D = { len: parseFloat(String(r.data.len).replace(',', '.')) || 600, dir: r.data.dir, legend: r.data.legend, mass: r.data.mass, bruch: r.data.bruch, rows };
    sv(D);
    place(GEN.schichten(D, Lf), 'Schichtenaufbau');
  }
  if (g === 'holz') {
    const o = Object.assign({ b: 60, h: 120, text: true }, P);
    const r = await dialog('Kantholz / Balken', `<div class="row3"><label>Breite b mm<input name="b" value="${o.b}" inputmode="decimal"></label><label>Höhe h mm<input name="h" value="${o.h}" inputmode="decimal"></label><span></span></div><label class="chk"><input type="checkbox" name="text" ${o.text ? 'checked' : ''}> Maßangabe b/h darunter</label>`, [{ t: 'Abbrechen' }, { t: 'Einfügen', v: 1, primary: true }]);
    if (!r) return; sv(r.data);
    place(GEN.kantholz({ b: parseFloat(String(r.data.b).replace(',', '.')), h: parseFloat(String(r.data.h).replace(',', '.')), text: r.data.text }, Lf), 'Kantholz');
  }
  if (g === 'profil') {
    const o = Object.assign({ kind: 'CW', prof: 75 }, P);
    const r = await dialog('CW- / UW-Profil', `<div class="row3"><label>Typ<select name="kind"><option ${o.kind === 'CW' ? 'selected' : ''}>CW</option><option ${o.kind === 'UW' ? 'selected' : ''}>UW</option></select></label><label>Größe<select name="prof">${[50, 75, 100, 125, 150].map((v) => `<option ${+o.prof === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label><span></span></div>`, [{ t: 'Abbrechen' }, { t: 'Einfügen', v: 1, primary: true }]);
    if (!r) return; sv(r.data);
    place(GEN.profil(r.data, Lf), r.data.kind + '-Profil');
  }
  if (g === 'kote') {
    const o = Object.assign({ wert: '±0,00', bez: 'OKFF', voll: true }, P);
    const r = await dialog('Höhenkote', `<div class="row3"><label>Wert<input name="wert" value="${escH(o.wert)}"></label><label>Bezeichnung<input name="bez" value="${escH(o.bez)}" placeholder="z. B. OKFF, OKRD"></label><span></span></div><label class="chk"><input type="checkbox" name="voll" ${o.voll ? 'checked' : ''}> gefülltes Dreieck (Fertigmaß)</label>`, [{ t: 'Abbrechen' }, { t: 'Einfügen', v: 1, primary: true }]);
    if (!r) return; sv(r.data);
    place(GEN.hoehenkote(r.data, Lf), 'Höhenkote');
  }
  if (g === 'bruch') {
    const o = Object.assign({ len: 300 }, P);
    const r = await dialog('Bruchlinie', `<label class="full">Länge mm<input name="len" value="${o.len}" inputmode="decimal"></label>`, [{ t: 'Abbrechen' }, { t: 'Einfügen', v: 1, primary: true }]);
    if (!r) return; sv(r.data);
    place(GEN.bruch({ len: parseFloat(String(r.data.len).replace(',', '.')) || 300 }, Lf), 'Bruchlinie');
  }
});

// ---------- Datei-Menü ----------
function openMenu(btn, items) {
  const m = $('#menu'); m.innerHTML = '';
  for (const it of items) {
    if (it === '-') { const s = document.createElement('div'); s.className = 'msep'; m.appendChild(s); continue; }
    const b = document.createElement('button'); b.innerHTML = `${it.t}${it.k ? `<kbd>${it.k}</kbd>` : ''}`;
    b.onclick = () => { m.hidden = true; it.f(); };
    m.appendChild(b);
  }
  const r = btn.getBoundingClientRect();
  m.style.left = Math.min(r.left, window.innerWidth - 250) + 'px'; m.style.top = r.bottom + 4 + 'px';
  m.hidden = false;
}
document.addEventListener('pointerdown', (e) => { const m = $('#menu'); if (!m.hidden && !m.contains(e.target) && e.target.id !== 'btnFile') m.hidden = true; });

$('#btnFile').onclick = (e) => openMenu(e.currentTarget, [
  { t: 'Neue Zeichnung', f: newDrawing },
  { t: 'Zeichnungen öffnen …', f: openDrawings },
  { t: 'Umbenennen …', f: renameDoc },
  '-',
  { t: 'PDF-Plan / Bild als Unterlage …', f: () => $('#pdfIn').click() },
  { t: 'Datei laden (.json) …', f: () => $('#fileIn').click() },
  { t: 'Als Datei speichern (.json)', k: 'Strg+S', f: exportJSON },
  '-',
  { t: 'Drucken / PDF', k: 'Strg+P', f: openPrint },
  { t: 'Export SVG', f: () => exportSVG(M.getPref('print', { mono: true }).mono) },
  { t: 'Export DXF (für CAD)', f: exportDXF },
  '-',
  ...(FEAT_DW ? [{ t: 'Massenermittlung Trockenbau …', f: () => DWUI.massDialog([]) }] : []), // Trockenbau
  { t: `Trockenbau-Modul (Test): ${FEAT_DW ? 'ausschalten' : 'einschalten'}`, f: () => { M.setPref('feat.drywall', !FEAT_DW); location.reload(); } }, // Trockenbau
  '-',
  { t: 'Tastenkürzel & Hilfe', f: showHelp },
]);
$('#fileIn').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { const d = M.fixDoc(await UL.restoreImages(JSON.parse(await f.text()))); d.id = 'd' + Date.now().toString(36); loadDocument(d); toast('Datei geladen'); }
  catch { toast('Datei konnte nicht gelesen werden'); }
  e.target.value = '';
});

function loadDocument(d) {
  state.doc = M.fixDoc(d); sel.clear(); M.resetHistory(); M.autosave();
  setTool('select'); refreshAll(); zoomFit();
}
async function newDrawing() {
  const r = await dialog('Neue Zeichnung', `<label class="full">Name<input name="name" value="Detail ${new Date().toLocaleDateString('de-DE')}"></label>
    <div class="row3"><label>Format<select name="fmt">${Object.keys(M.FORMATS).map((f) => `<option ${f === 'A3' ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
    <label>Ausrichtung<select name="orient"><option value="quer">quer</option><option value="hoch">hoch</option></select></label>
    <label>Maßstab 1:<select name="sc">${M.SCALES.map((s) => `<option ${s === 10 ? 'selected' : ''}>${s}</option>`).join('')}</select></label></div>`,
  [{ t: 'Abbrechen' }, { t: 'Anlegen', v: 1, primary: true }]);
  if (!r) return;
  const d = M.newDoc(r.data.name || 'Neue Zeichnung');
  const prev = state.doc.sheet.tb;
  Object.assign(d.sheet, { fmt: r.data.fmt, orient: r.data.orient, sc: +r.data.sc });
  d.sheet.tb.firma = prev.firma; d.sheet.tb.gez = prev.gez; d.sheet.tb.projekt = prev.projekt;
  d.sheet.tb.titel = r.data.name;
  loadDocument(d); zoomSheet();
}
async function openDrawings() {
  const list = M.listDocs();
  const html = list.length ? `<div class="dlist">${list.map((x) => `<div class="ditem" data-id="${x.id}"><button data-open="${x.id}"><b>${escH(x.name)}</b><small>${new Date(x.t).toLocaleString('de-DE')} · ${x.n} Objekte</small></button><button class="danger mini" data-del="${x.id}">Löschen</button></div>`).join('')}</div>`
    : '<p>Noch keine gespeicherten Zeichnungen.</p>';
  dialog('Zeichnungen (im Browser gespeichert)', html + '<p class="hint">Zeichnungen werden automatisch in diesem Browser gespeichert. Für die Ablage im Büro „Als Datei speichern" nutzen.</p>', [{ t: 'Schließen' }], (body) => {
    body.addEventListener('click', (e) => {
      const o = e.target.closest('[data-open]'), dl = e.target.closest('[data-del]');
      if (o) { const d = M.loadDoc(o.dataset.open); closeModal(null); if (d) loadDocument(d); }
      if (dl) { if (dl.dataset.confirm) { M.deleteDoc(dl.dataset.del); dl.closest('.ditem').remove(); } else { dl.dataset.confirm = 1; dl.textContent = 'Wirklich?'; } }
    });
  });
}
async function renameDoc() {
  const r = await dialog('Zeichnung umbenennen', `<label class="full">Name<input name="name" value="${escH(state.doc.name)}"></label>`, [{ t: 'Abbrechen' }, { t: 'OK', v: 1, primary: true }]);
  if (r && r.data.name.trim()) { state.doc.name = r.data.name.trim(); app.commit(); updateHeader(); }
}
function showHelp() {
  dialog('Tastenkürzel & Hilfe', `<div class="helpgrid">
    ${Object.entries(TOOLS).filter(([, v]) => v.key && v.key.length === 1).map(([, v]) => `<div><kbd>${v.key}</kbd> ${v.label}</div>`).join('')}
    <div><kbd>Esc</kbd> Abbrechen / Auswahl</div><div><kbd>Enter</kbd> / Rechtsklick: fertig</div><div><kbd>Leertaste</kbd> letztes Werkzeug</div><div><kbd>Entf</kbd> Löschen</div>
    <div><kbd>Z</kbd> Alles zeigen</div><div><kbd>Strg+Z / Y</kbd> Rückgängig / Wiederholen</div><div><kbd>Strg+C / V</kbd> Kopieren / Einfügen</div><div><kbd>Strg+A</kbd> Alles wählen</div>
    <div><kbd>F3</kbd> Objektfang</div><div><kbd>F7</kbd> Rasterfang</div><div><kbd>F8</kbd> Ortho</div><div><kbd>F10</kbd> Polar 15°</div><div><kbd>Shift</kbd> Ortho kurzzeitig</div><div><kbd>Mausrad</kbd> Zoom · Mittelklick ziehen = verschieben</div>
    </div>
    <h4>Werte eintippen (während ein Werkzeug aktiv ist)</h4>
    <ul class="help"><li><kbd>500</kbd> – Länge in Cursor-Richtung (mit Ortho exakt waagerecht/senkrecht)</li><li><kbd>600x300</kbd> oder <kbd>600 300</kbd> – relativ Δx / Δy</li><li><kbd>500&lt;30</kbd> – 500 mm unter 30°</li><li><kbd>#100;200</kbd> – absolute Koordinate</li><li>Komma als Dezimaltrenner: <kbd>12,5</kbd></li></ul>
    <h4>Touch (Tablet / Handy)</h4>
    <ul class="help"><li>Ein Finger: zeichnen – Finger ziehen zeigt den Fangpunkt, Loslassen setzt den Punkt</li><li>Zwei Finger: zoomen und verschieben</li><li>Knöpfe unten im Bild: Fertig / Schließen / Abbrechen</li></ul>
    <h4>Grundprinzip</h4>
    <p>Gezeichnet wird immer in Naturmaß (mm). Der Maßstab gehört zum Blatt: Schrift-, Maß- und Schraffurgrößen werden in Papier-mm angegeben und passen sich dem Maßstab an.</p>`, [{ t: 'OK', primary: true }]);
}

// ---------- 3D ----------
const v3d = new View3D($('#cv3d'));
function set3d(on) {
  mode3d = on;
  $('#cv3d').hidden = !on; $('#v3dbar').hidden = !on; cv.hidden = on; $('#chips').hidden = on;
  $$('#viewSeg button').forEach((b) => b.classList.toggle('on', (b.dataset.v === '3d') === on));
  if (on) {
    $('#ext3d').value = state.doc.settings.ext3d;
    v3d.build(); v3d.resize(); v3d.render();
    app.prompt('3D: ziehen = drehen · Shift/Rechts/2 Finger = verschieben · Rad = Zoom. Schraffuren werden mit Standardhöhe extrudiert.');
  } else { resize(); setTimeout(() => app.prompt(''), 0); }
}
$('#viewSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) set3d(b.dataset.v === '3d'); });
$('#v3dbar').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.view) { v3d.setView(b.dataset.view); v3d.zoom = 1; v3d.pan = { x: 0, y: 0 }; v3d.render(); }
  if (b.id === 'ins3d') {
    let lid = state.doc.layers.find((l) => l.name === '3D-Ansicht')?.id;
    if (!lid) { lid = 'L3d' + Date.now().toString(36); state.doc.layers.push({ id: lid, name: '3D-Ansicht', color: '#000000', lw: 0.18, lt: 'solid', vis: true, lock: false, print: true }); }
    const ents = v3d.toEntities({ x: 0, y: 0 }, lid);
    if (!ents.length) return toast('Nichts zum Einfügen');
    const bb = ents.reduce((a, e) => G.bboxUnion(a, G.bboxOf(M.entPts(e))), null);
    set3d(false);
    setTool(new T.PlaceTool(app, ents.map((e) => transformEnt(e, Tmove(-bb.x0, -bb.y0))), 'Isometrie'));
    toast('Isometrie hängt am Cursor – Einfügepunkt wählen');
  }
});
$('#ext3d').addEventListener('change', (e) => { const v = parseFloat(e.target.value.replace(',', '.')); if (v > 0) { state.doc.settings.ext3d = v; M.commit(); v3d.build(); v3d.render(); } });

// ---------- Panel / Mobile ----------
$$('#panel .tabs button').forEach((b) => b.onclick = () => openTab(b.dataset.tab));
function openTab(t) {
  $$('#panel .tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === t));
  $$('#panel .tab').forEach((x) => x.classList.toggle('on', x.id === 'tab-' + t));
}
$('#btnPanel').onclick = () => document.body.classList.toggle('panel-open');
function closePanelMobile() { document.body.classList.remove('panel-open'); }
$('#btnSheet').onclick = () => { openTab('sheet'); document.body.classList.add('panel-open'); };
$('#btnPrint').onclick = openPrint;
$('#btnUndo').onclick = doUndo;
$('#btnRedo').onclick = doRedo;
$('#btnFit').onclick = zoomFit;
$('#docName').onclick = renameDoc;
$('#btnCmdOk').onclick = submitCmd;
$$('#toggles button').forEach((b) => b.onclick = () => toggle(b.dataset.t));
$('#btnSnapCfg').onclick = (e) => openMenu(e.currentTarget, [
  ...[['end', 'Endpunkt'], ['mid', 'Mitte'], ['cen', 'Zentrum'], ['quad', 'Quadrant'], ['int', 'Schnittpunkt'], ['perp', 'Lot'], ['near', 'Auf Objekt']].map(([k, l]) => ({ t: `${sk[k] ? '☑' : '☐'} ${l}`, f: () => { sk[k] = !sk[k]; M.setPref('snapKinds', sk); } })),
  '-',
  { t: `Rasterweite: ${fmtNum(state.doc.settings.grid, 1)} mm …`, f: async () => { const r = await dialog('Rasterweite', `<label class="full">Raster mm<input name="g" value="${state.doc.settings.grid}" inputmode="decimal"></label>`, [{ t: 'Abbrechen' }, { t: 'OK', v: 1, primary: true }]); if (r) { const v = parseFloat(r.data.g.replace(',', '.')); if (v > 0) { state.doc.settings.grid = v; M.commit(); requestRender(); } } } },
  { t: `${tg.showGrid ? '☑' : '☐'} Raster anzeigen`, f: () => toggle('showGrid') },
  { t: `${tg.lwReal ? '☑' : '☐'} Strichstärken maßstäblich`, f: () => toggle('lwReal') },
]);

window.addEventListener('resize', resize);
new ResizeObserver(resize).observe($('#stage'));

// ---------- Start ----------
DWUI.initDrywall({ app, dialog, setTool, toast, getPref: M.getPref, setPref: M.setPref }); // Trockenbau
UL.initUnderlay({ app, dialog, setTool, toast, getPref: M.getPref, setPref: M.setPref, refreshPanels: () => refreshAll() });
setImageProvider(UL.imageFor);
$('#pdfIn').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) UL.importFile(f); });
$('#stage').addEventListener('dragover', (e) => { e.preventDefault(); });
$('#stage').addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (!f) return; if (/\.json$/i.test(f.name)) { const dt = new DataTransfer(); dt.items.add(f); $('#fileIn').files = dt.files; $('#fileIn').dispatchEvent(new Event('change')); } else UL.importFile(f); });
function init() {
  const saved = M.loadCurrent();
  if (saved) state.doc = M.fixDoc(saved);
  else {
    state.doc = M.newDoc('Detail ' + new Date().toLocaleDateString('de-DE'));
  }
  M.resetHistory();
  buildToolbar(); refreshLib(); renderToggles();
  resize();
  setTool('select'); refreshAll();
  if (state.doc.ents.length) zoomFit(); else zoomSheet();
  if (!saved) toast(matchMedia('(pointer: coarse)').matches ? 'Willkommen! Werkzeuge unten, Aufbauten im Menü ☰. Zwei Finger = zoomen.' : 'Willkommen! L = Linie, R = Rechteck, H = Schraffur, D = Bemaßung. Aufbauten rechts im Panel.');
}
init();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// für Tests
window.__cad = { state, app, view, sel, setTool, zoomFit, M, get tool() { return tool; } };
