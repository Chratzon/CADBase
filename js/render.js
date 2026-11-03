// Zeichen-Backends (Canvas, SVG) und Zerlegung der Elemente in Grundprimitive
import * as G from './geom.js';
import { styleOf, dimGeom, fmtDim, state } from './model.js';
import { genHatch } from './hatch.js';

export const FONT = 'Arial, "Helvetica Neue", Helvetica, sans-serif';
const mctx = document.createElement('canvas').getContext('2d');
mctx.font = `100px ${FONT}`;
// Breite eines Textes in Modelleinheiten bei Versalhöhe h
export function textWidth(str, h) { return mctx.measureText(str).width / 100 * h * 1.4; }

function gray(c) {
  if (!c || c[0] !== '#' || c.length < 7) return c;
  const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
  const l = Math.round(0.3 * r + 0.59 * g + 0.11 * b).toString(16).padStart(2, '0');
  return '#' + l + l + l;
}

export class CanvasB {
  constructor(ctx, vw, o) { this.ctx = ctx; this.vw = vw; this.o = o; this.k = o.sc * vw.z; }
  T(p) { const v = this.vw; return { x: (p.x - v.x) * v.z + v.w / 2, y: v.h / 2 - (p.y - v.y) * v.z }; }
  lwPx(lw) { return this.o.lwReal ? Math.max(0.5, lw * this.k) : Math.max(0.75, lw * 3.2); }
  col(c) { return this.o.color || (this.o.mono ? '#000' : c); }
  st(st) {
    const c = this.ctx;
    c.strokeStyle = this.col(st.color);
    c.lineWidth = (this.o.lwBoost || 0) + this.lwPx(st.lw);
    const d = st.dash && st.dash.length ? st.dash.map((x) => x * this.k) : [];
    c.setLineDash(d.length && d.reduce((a, b) => a + b, 0) > 5 ? d : []);
  }
  stroke(pts, closed, st) {
    if (pts.length < 2) return;
    const c = this.ctx; this.st(st); c.beginPath();
    let p = this.T(pts[0]); c.moveTo(p.x, p.y);
    for (let i = 1; i < pts.length; i++) { p = this.T(pts[i]); c.lineTo(p.x, p.y); }
    if (closed) c.closePath();
    c.stroke();
  }
  segs(list, st) {
    if (!list.length) return;
    const c = this.ctx; this.st(st); c.beginPath();
    for (const [a, b] of list) { const p = this.T(a), q = this.T(b); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); }
    c.stroke();
  }
  circle(cen, r, st) { const c = this.ctx; this.st(st); const p = this.T(cen); c.beginPath(); c.arc(p.x, p.y, Math.max(0.1, r * this.vw.z), 0, G.TAU); c.stroke(); }
  arc(cen, r, a0, a1, st) { const c = this.ctx; this.st(st); const p = this.T(cen); c.beginPath(); c.arc(p.x, p.y, Math.max(0.1, r * this.vw.z), -a0, -a1, true); c.stroke(); }
  fill(rings, color) {
    if (this.o.noFill) return;
    const c = this.ctx; c.fillStyle = this.o.color ? this.o.color : (this.o.mono ? gray(color) : color);
    if (this.o.color) c.globalAlpha = 0.25;
    c.beginPath();
    for (const r of rings) { r.forEach((q, i) => { const p = this.T(q); i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); }); c.closePath(); }
    c.fill('evenodd'); c.globalAlpha = 1;
  }
  dots(pts, rPaper, color) {
    const c = this.ctx; c.fillStyle = this.col(color);
    const r = Math.max(0.55, rPaper * this.k);
    if (r < 1.2) { const s = r * 1.6; for (const q of pts) { const p = this.T(q); c.fillRect(p.x - s / 2, p.y - s / 2, s, s); } return; }
    c.beginPath();
    for (const q of pts) { const p = this.T(q); c.moveTo(p.x + r, p.y); c.arc(p.x, p.y, r, 0, G.TAU); }
    c.fill();
  }
  disc(cen, r, color) { const c = this.ctx; c.fillStyle = this.col(color); const p = this.T(cen); c.beginPath(); c.arc(p.x, p.y, r * this.vw.z, 0, G.TAU); c.fill(); }
  tri(pts, color) { const c = this.ctx; c.fillStyle = this.col(color); c.beginPath(); pts.forEach((q, i) => { const p = this.T(q); i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); }); c.closePath(); c.fill(); }
  text(pt, str, h, angDeg, align, valign, color, bold) {
    const px = h * this.vw.z * 1.4;
    if (px < 2) return;
    const c = this.ctx; const p = this.T(pt);
    c.save(); c.translate(p.x, p.y); c.rotate(-G.rad(angDeg || 0));
    c.font = `${bold ? 'bold ' : ''}${px}px ${FONT}`;
    c.fillStyle = this.col(color);
    c.textAlign = align === 'c' ? 'center' : align === 'r' ? 'right' : 'left';
    c.textBaseline = 'alphabetic';
    const dy = valign === 'm' ? h * this.vw.z / 2 : valign === 't' ? h * this.vw.z : 0;
    c.fillText(str, 0, dy);
    c.restore();
  }
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f2 = (n) => Math.round(n * 1000) / 1000;

export class SvgB {
  // T: Modell -> Papier-mm (y nach unten)
  constructor(T, sc, o = {}) { this.Tf = T; this.sc = sc; this.o = o; this.out = []; }
  T(p) { return this.Tf(p); }
  col(c) { return this.o.mono ? '#000' : c; }
  sa(st) {
    const d = st.dash && st.dash.length ? ` stroke-dasharray="${st.dash.map(f2).join(' ')}"` : '';
    return `fill="none" stroke="${this.col(st.color)}" stroke-width="${f2(st.lw)}" stroke-linecap="round" stroke-linejoin="round"${d}`;
  }
  path(pts, closed) { return pts.map((q, i) => { const p = this.T(q); return (i ? 'L' : 'M') + f2(p.x) + ' ' + f2(p.y); }).join('') + (closed ? 'Z' : ''); }
  stroke(pts, closed, st) { if (pts.length > 1) this.out.push(`<path d="${this.path(pts, closed)}" ${this.sa(st)}/>`); }
  segs(list, st) { if (list.length) this.out.push(`<path d="${list.map(([a, b]) => this.path([a, b])).join('')}" ${this.sa(st)}/>`); }
  circle(c, r, st) { const p = this.T(c); this.out.push(`<circle cx="${f2(p.x)}" cy="${f2(p.y)}" r="${f2(r / this.sc)}" ${this.sa(st)}/>`); }
  arc(c, r, a0, a1, st) {
    const p0 = this.T(G.polar(c, r, a0)), p1 = this.T(G.polar(c, r, a1));
    const span = G.normAng(a1 - a0); const R = f2(r / this.sc);
    this.out.push(`<path d="M${f2(p0.x)} ${f2(p0.y)}A${R} ${R} 0 ${span > Math.PI ? 1 : 0} 0 ${f2(p1.x)} ${f2(p1.y)}" ${this.sa(st)}/>`);
  }
  fill(rings, color) { this.out.push(`<path d="${rings.map((r) => this.path(r, true)).join('')}" fill="${this.o.mono ? gray(color) : color}" fill-rule="evenodd" stroke="none"/>`); }
  dots(pts, rPaper, color) {
    if (!pts.length) return;
    const r = f2(Math.max(0.08, rPaper));
    this.out.push(`<g fill="${this.col(color)}">` + pts.map((q) => { const p = this.T(q); return `<circle cx="${f2(p.x)}" cy="${f2(p.y)}" r="${r}"/>`; }).join('') + '</g>');
  }
  disc(c, r, color) { const p = this.T(c); this.out.push(`<circle cx="${f2(p.x)}" cy="${f2(p.y)}" r="${f2(r / this.sc)}" fill="${this.col(color)}"/>`); }
  tri(pts, color) { this.out.push(`<path d="${this.path(pts, true)}" fill="${this.col(color)}"/>`); }
  text(pt, str, h, angDeg, align, valign, color, bold) {
    const p = this.T(pt); const hp = h / this.sc;
    const anchor = align === 'c' ? 'middle' : align === 'r' ? 'end' : 'start';
    const dy = valign === 'm' ? hp / 2 : valign === 't' ? hp : 0;
    this.out.push(`<text x="0" y="${f2(dy)}" transform="translate(${f2(p.x)} ${f2(p.y)}) rotate(${f2(-(angDeg || 0))})" font-family="Arial, Helvetica, sans-serif" font-size="${f2(hp * 1.4)}"${bold ? ' font-weight="bold"' : ''} text-anchor="${anchor}" fill="${this.col(color)}" stroke="none" xml:space="preserve">${esc(str)}</text>`);
  }
}

// ---------- Elemente zerlegen ----------
export function emit(e, B, sc) {
  const st = styleOf(e);
  switch (e.type) {
    case 'line': B.stroke([e.a, e.b], false, st); break;
    case 'pline': B.stroke(e.pts, e.closed, st); break;
    case 'circle': B.circle(e.c, e.r, st); break;
    case 'arc': B.arc(e.c, e.r, e.a0, e.a1, st); break;
    case 'hatch': {
      const g = genHatch(e, sc);
      if (g.fill) B.fill(g.rings, e.pattern === 'fuellung' ? (e.fillColor || g.fill) : g.fill);
      if (g.segs.length) B.segs(g.segs, { color: st.color, lw: st.lw, dash: [] });
      if (g.dots.length) B.dots(g.dots, g.dotR, st.color);
      if (e.outline) { const os = { color: st.color, lw: e.olw || 0.35, dash: [] }; for (const r of g.rings) B.stroke(r, true, os); }
      break;
    }
    case 'dim': emitDim(e, B, sc, st); break;
    case 'leader': emitLeader(e, B, sc, st); break;
    case 'text': emitText(e, B, sc, st); break;
  }
}

function readable(u) {
  let a = Math.atan2(u.y, u.x);
  if (a > Math.PI / 2 + 1e-6 || a <= -Math.PI / 2 + 1e-6) a += Math.PI;
  return a;
}

export function emitDim(e, B, sc, st) {
  const S = state.doc.settings;
  const g = dimGeom(e);
  if (g.val < 1e-9) return;
  const k = sc;
  const thin = { color: st.color, lw: st.lw, dash: [] };
  for (const [p, f] of [[e.a, g.fa], [e.b, g.fb]]) {
    const v = G.sub(f, p); const l = G.len(v);
    const d = l > 1e-9 ? G.mul(v, 1 / l) : G.perp(g.u);
    const s = G.add(p, G.mul(d, Math.min(1.5 * k, l * 0.5)));
    const t = G.add(f, G.mul(d, 2 * k));
    if (l > 1.5 * k || true) B.stroke([s, t], false, thin);
  }
  const uu = G.norm(G.sub(g.fb, g.fa));
  const tick = S.dimTick || 'slash';
  const over = tick === 'slash' ? 2 * k : 0;
  B.stroke([G.sub(g.fa, G.mul(uu, over)), G.add(g.fb, G.mul(uu, over))], false, thin);
  for (const [f, sgn] of [[g.fa, 1], [g.fb, -1]]) {
    if (tick === 'slash') {
      const d = G.rot(uu, { x: 0, y: 0 }, Math.PI / 4);
      B.stroke([G.sub(f, G.mul(d, 1.4 * k)), G.add(f, G.mul(d, 1.4 * k))], false, { color: st.color, lw: Math.max(0.35, st.lw * 2), dash: [] });
    } else if (tick === 'dot') {
      B.disc(f, 0.55 * k, st.color);
    } else {
      const L = 2.6 * k, w = 0.75 * k; const b = G.add(f, G.mul(uu, L * sgn)); const n = G.perp(uu);
      B.tri([f, G.add(b, G.mul(n, w)), G.sub(b, G.mul(n, w))], st.color);
    }
  }
  const a = readable(uu);
  const r = { x: Math.cos(a), y: Math.sin(a) };
  const up = G.perp(r);
  const h = (e.h || S.dimText) * k;
  let txt = fmtDim(g.val);
  if (e.txt) txt = e.txt.replace(/<>/g, txt);
  let pos = G.add(G.mid(g.fa, g.fb), G.mul(up, 0.9 * k));
  const tw = textWidth(txt, h), L = G.dist(g.fa, g.fb);
  if (e.tofs) pos = G.add(pos, G.mul(r, e.tofs));
  else if (tw + 0.4 * k > L) {
    // zu klein: Text neben das Maß setzen – auf die Seite ohne Nachbarmaß
    const ends = G.dot(G.sub(g.fb, g.fa), r) >= 0 ? [g.fb, g.fa] : [g.fa, g.fb];
    const busy = (q) => state.doc.ents.some((o) => o !== e && o.type === 'dim' && o.id !== e.id && (() => { const og = dimGeom(o); return G.dist(og.fa, q) < 0.01 * k || G.dist(og.fb, q) < 0.01 * k; })());
    const b0 = busy(ends[0]), b1 = busy(ends[1]);
    if (b0 && b1) {
      // beidseitig Nachbarn: Text auf die andere Seite der Maßlinie
      pos = G.sub(G.mid(g.fa, g.fb), G.mul(up, 0.9 * k + h));
    } else {
      const far = b0 ? ends[1] : ends[0];
      const rr = G.mul(r, far === ends[0] ? 1 : -1);
      pos = G.add(G.add(far, G.mul(up, 0.9 * k)), G.mul(rr, tw / 2 + 2.6 * k));
      B.stroke([far, G.add(far, G.mul(rr, 1.8 * k))], false, thin);
    }
  }
  B.text(pos, txt, h, G.deg(a), 'c', 'b', st.color);
}

export function leaderLayout(e, sc) {
  const h = (e.h || 3.5) * sc;
  const lines = String(e.text || '').split('\n');
  const tip = e.pts[0], knee = e.pts[e.pts.length - 1];
  const right = knee.x >= tip.x;
  const w = Math.max(...lines.map((l) => textWidth(l, h)), h) + 1.2 * sc;
  const end = { x: knee.x + (right ? w : -w), y: knee.y };
  return { h, lines, right, w, end, tip, knee };
}

export function emitLeader(e, B, sc, st) {
  const L = leaderLayout(e, sc);
  const ls = { color: st.color, lw: Math.min(st.lw, 0.25), dash: [] };
  B.stroke([...e.pts, L.end], false, ls);
  const nxt = e.pts[1];
  const d = G.norm(G.sub(nxt, L.tip)); const n = G.perp(d);
  if (e.arrow === 'dot') B.disc(L.tip, 0.6 * sc, st.color);
  else if (e.arrow !== 'none') {
    const b = G.add(L.tip, G.mul(d, 2.6 * sc));
    B.tri([L.tip, G.add(b, G.mul(n, 0.7 * sc)), G.sub(b, G.mul(n, 0.7 * sc))], st.color);
  }
  const x = L.knee.x + (L.right ? 0.6 * sc : -0.6 * sc);
  const n2 = L.lines.length;
  L.lines.forEach((t, i) => {
    const y = L.knee.y + 0.9 * sc + (n2 - 1 - i) * L.h * 1.6;
    B.text({ x, y }, t, L.h, 0, L.right ? 'l' : 'r', 'b', st.color);
  });
}

export function emitText(e, B, sc, st) {
  const h = (e.h || 3.5) * sc;
  const lines = String(e.text || '').split('\n');
  const a = G.rad(e.angle || 0);
  const down = { x: Math.sin(a), y: -Math.cos(a) };
  lines.forEach((t, i) => {
    const p = G.add(e.p, G.mul(down, i * h * 1.6));
    B.text(p, t, h, e.angle || 0, e.align || 'l', 'b', st.color, e.bold);
  });
}
