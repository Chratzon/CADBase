// Interaktive Werkzeuge
import * as G from './geom.js';
import { state, nid, entSegs, transformEnt, Tmove, Trot, Tmirror, cloneEnt, dimGeom, hitDist, fmtNum } from './model.js';
import { emit } from './render.js';
import { sheetMaps, frameRect } from './print.js';

const PREV = { color: '#1e6cff', lw: 0.25, dash: [] };
const RUB = { color: '#1e6cff', lw: 0.13, dash: [1.5, 1] };

class Tool {
  constructor(app) { this.app = app; this.pts = []; this.cur = null; }
  get base() { return this.pts.length ? this.pts[this.pts.length - 1] : null; }
  start() { this.update(); }
  move(p) { this.cur = p; }
  click() {}
  preview() {}
  input(s) { const p = this.app.parsePoint(s, this.base, this.cur); if (p) { this.click(p); return true; } return false; }
  enter() { this.app.setTool('select'); }
  esc() { if (this.pts.length) { this.pts = []; this.update(); } else this.app.setTool('select'); }
  chips() { return []; }
  msg() { return ''; }
  update() { this.app.prompt(this.msg()); this.app.chips(this.chips()); this.app.render(); }
  tmp(e) { return Object.assign({ id: '_tmp', layer: state.doc.cur }, e); }
}

// ---------- Linie ----------
export class LineTool extends Tool {
  constructor(app) { super(app); this.made = []; }
  msg() { return this.pts.length ? 'Nächster Punkt – Länge tippen (z. B. 500, 500<30, 300x200) · Enter = fertig' : 'Linie: Startpunkt wählen'; }
  click(p) {
    if (this.pts.length) {
      const e = this.app.addEnts([{ type: 'line', a: G.clone(this.base), b: G.clone(p) }])[0];
      this.made.push({ id: e.id, p: this.base });
      this.app.commit();
    }
    this.pts.push(p); this.update();
  }
  preview(B, sc) { if (this.base && this.cur) emit(this.tmp({ type: 'line', a: this.base, b: this.cur }), B, sc); }
  chips() {
    const c = [];
    if (this.made.length) c.push({ t: 'Zurück', f: () => { const m = this.made.pop(); this.app.removeEnts([m.id]); this.pts.pop(); this.app.commit(); this.update(); } });
    if (this.made.length >= 2) c.push({ t: 'Schließen', f: () => { this.click(this.pts[0]); this.finish(); } });
    if (this.pts.length) c.push({ t: 'Fertig', f: () => this.finish(), main: true });
    return c;
  }
  finish() { this.pts = []; this.made = []; this.update(); }
  enter() { if (this.pts.length) this.finish(); else super.enter(); }
  esc() { if (this.pts.length) this.finish(); else super.esc(); }
}

// ---------- Polylinie ----------
export class PlineTool extends Tool {
  msg() { return this.pts.length ? `Punkt ${this.pts.length + 1} – Enter = fertig, auf Startpunkt klicken = schließen` : 'Polylinie: Startpunkt wählen'; }
  click(p) {
    if (this.pts.length > 2 && G.dist(p, this.pts[0]) < this.app.tol()) return this.finish(true);
    this.pts.push(p); this.update();
  }
  finish(closed) {
    if (this.pts.length >= 2) { this.app.addEnts([{ type: 'pline', pts: this.pts.map(G.clone), closed: !!closed && this.pts.length > 2 }]); this.app.commit(); }
    this.pts = []; this.update();
  }
  preview(B, sc) {
    if (!this.pts.length) return;
    const pts = this.cur ? [...this.pts, this.cur] : this.pts;
    emit(this.tmp({ type: 'pline', pts, closed: false }), B, sc);
  }
  chips() {
    const c = [];
    if (this.pts.length) c.push({ t: 'Zurück', f: () => { this.pts.pop(); this.update(); } });
    if (this.pts.length > 2) c.push({ t: 'Schließen', f: () => this.finish(true) });
    if (this.pts.length > 1) c.push({ t: 'Fertig', f: () => this.finish(false), main: true });
    return c;
  }
  enter() { if (this.pts.length > 1) this.finish(false); else super.enter(); }
  esc() { if (this.pts.length > 1) this.finish(false); else super.esc(); }
}

// ---------- Rechteck ----------
export class RectTool extends Tool {
  msg() { return this.pts.length ? 'Gegenüberliegende Ecke – oder Maße tippen: Breite x Höhe (z. B. 600x12,5)' : 'Rechteck: erste Ecke wählen'; }
  rect(a, b) { return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }]; }
  click(p) {
    if (!this.pts.length) { this.pts.push(p); return this.update(); }
    const a = this.pts[0];
    if (Math.abs(p.x - a.x) < 1e-9 || Math.abs(p.y - a.y) < 1e-9) return;
    const h = this.app.opts.rectHatch;
    if (h && h !== 'none') this.app.addEnts([{ type: 'hatch', pts: this.rect(a, p).map(G.clone), pattern: h, scale: 1, angle: 'auto', outline: true, olw: 0.35, layer: this.app.layerFor('L2') }]);
    else this.app.addEnts([{ type: 'pline', pts: this.rect(a, p).map(G.clone), closed: true }]);
    this.app.commit(); this.pts = []; this.update();
  }
  input(s) {
    if (!this.pts.length) return super.input(s);
    const p = this.app.parsePoint(s, this.base, this.cur, { signFromCursor: true });
    if (p) { this.click(p); return true; }
    return false;
  }
  preview(B, sc) { if (this.pts.length && this.cur) emit(this.tmp({ type: 'pline', pts: this.rect(this.pts[0], this.cur), closed: true }), B, sc); }
}

// ---------- Kreis ----------
export class CircleTool extends Tool {
  msg() { return this.pts.length ? 'Radius: Punkt wählen oder Wert tippen (d=… für Durchmesser)' : 'Kreis: Mittelpunkt wählen'; }
  click(p) {
    if (!this.pts.length) { this.pts.push(p); return this.update(); }
    this.make(G.dist(this.pts[0], p));
  }
  make(r) { if (r > 1e-6) { this.app.addEnts([{ type: 'circle', c: G.clone(this.pts[0]), r }]); this.app.commit(); } this.pts = []; this.update(); }
  input(s) {
    if (!this.pts.length) return super.input(s);
    const m = s.trim().match(/^(d\s*=?\s*)?(-?[\d.,]+)$/i);
    if (m) { const v = parseFloat(m[2].replace(',', '.')); if (v > 0) { this.make(m[1] ? v / 2 : v); return true; } }
    return super.input(s);
  }
  preview(B, sc) { if (this.pts.length && this.cur) { emit(this.tmp({ type: 'circle', c: this.pts[0], r: G.dist(this.pts[0], this.cur) }), B, sc); B.stroke([this.pts[0], this.cur], false, RUB); } }
}

// ---------- Bogen (3 Punkte) ----------
export class ArcTool extends Tool {
  msg() { return ['Bogen: Startpunkt', 'Punkt auf dem Bogen', 'Endpunkt'][this.pts.length]; }
  arcFrom(p1, p2, p3) {
    const C = G.circle3(p1, p2, p3); if (!C) return null;
    let a0 = G.ang(C.c, p1), a1 = G.ang(C.c, p3); const am = G.ang(C.c, p2);
    if (!G.angInArc(am, a0, a1)) [a0, a1] = [a1, a0];
    return { type: 'arc', c: C.c, r: C.r, a0: G.normAng(a0), a1: G.normAng(a1) };
  }
  click(p) {
    this.pts.push(p);
    if (this.pts.length === 3) { const a = this.arcFrom(...this.pts); if (a) { this.app.addEnts([a]); this.app.commit(); } this.pts = []; }
    this.update();
  }
  preview(B, sc) {
    if (!this.cur) return;
    if (this.pts.length === 1) B.stroke([this.pts[0], this.cur], false, RUB);
    if (this.pts.length === 2) { const a = this.arcFrom(this.pts[0], this.pts[1], this.cur); if (a) emit(this.tmp(a), B, sc); }
  }
}

// ---------- Schraffur ----------
export class HatchTool extends Tool {
  constructor(app) { super(app); this.poly = false; }
  msg() { return this.poly ? (this.pts.length ? 'Weitere Umrisspunkte – Enter schließt die Fläche' : 'Umriss: ersten Punkt wählen') : 'In eine geschlossene Fläche klicken (Muster oben wählen)'; }
  props() { const o = this.app.opts.hatch; return { pattern: o.pattern, scale: o.scale, angle: o.angle, fillColor: o.fillColor, layer: this.app.layerFor('L2') }; }
  click(p) {
    if (this.poly) { this.pts.push(p); return this.update(); }
    const segs = this.app.segsAll();
    const f = G.findFace(segs, p);
    if (!f) { this.app.toast('Keine geschlossene Fläche gefunden. Tipp: „Umriss zeichnen" verwenden.'); return; }
    this.app.addEnts([Object.assign(this.props(), { type: 'hatch', pts: f.pts.map(G.clone), holes: f.holes, outline: false })]);
    this.app.commit(); this.update();
  }
  rawClick() { return !this.poly; }
  finish() {
    if (this.pts.length > 2) { this.app.addEnts([Object.assign(this.props(), { type: 'hatch', pts: this.pts.map(G.clone), outline: !!this.app.opts.hatch.outline, olw: 0.35 })]); this.app.commit(); }
    this.pts = []; this.update();
  }
  enter() { if (this.poly && this.pts.length > 2) this.finish(); else super.enter(); }
  chips() {
    const c = [{ t: this.poly ? 'Per Klick in Fläche' : 'Umriss zeichnen', f: () => { this.poly = !this.poly; this.pts = []; this.update(); } }];
    if (this.poly && this.pts.length) c.push({ t: 'Zurück', f: () => { this.pts.pop(); this.update(); } });
    if (this.poly && this.pts.length > 2) c.push({ t: 'Fläche schließen', f: () => this.finish(), main: true });
    return c;
  }
  preview(B, sc) {
    if (this.poly && this.pts.length) {
      const pts = this.cur ? [...this.pts, this.cur] : this.pts;
      if (pts.length > 2) emit(this.tmp(Object.assign(this.props(), { type: 'hatch', pts, outline: true })), B, sc);
      else B.stroke(pts, false, PREV);
    }
  }
}

// ---------- Bemaßung ----------
export class DimTool extends Tool {
  constructor(app) { super(app); this.last = null; }
  msg() {
    if (this.last) return 'Kettenmaß: nächsten Punkt wählen · Enter/Esc = Kette beenden';
    return ['Bemaßung: ersten Punkt wählen (oder Linie anklicken)', 'Zweiten Punkt wählen', 'Lage der Maßlinie wählen (Abstand tippen möglich)'][this.pts.length];
  }
  mode(a, b, p) {
    const m = this.app.opts.dimMode;
    if (m !== 'auto') return m;
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    const inX = p.x > x0 && p.x < x1, inY = p.y > y0 && p.y < y1;
    if (inX && !inY) return 'h';
    if (inY && !inX) return 'v';
    if (Math.abs(b.x - a.x) < 1e-6) return 'v';
    if (Math.abs(b.y - a.y) < 1e-6) return 'h';
    const dx = Math.max(x0 - p.x, p.x - x1, 0), dy = Math.max(y0 - p.y, p.y - y1, 0);
    return dy >= dx ? 'h' : 'v';
  }
  click(p, info) {
    if (this.last) {
      const L = this.last;
      const e = { type: 'dim', a: G.clone(L.b), b: G.clone(p), p: G.clone(L.p), mode: L.mode, layer: this.app.layerFor('L3') };
      if (L.mode === 'aligned') { const g = dimGeom(L); const u = G.norm(G.sub(p, L.b)); const off = G.dot(G.sub(L.p, L.b), G.perp(g.u)); e.p = G.add(L.b, G.mul(G.perp(u), off)); }
      this.app.addEnts([e]); this.app.commit(); this.last = e; return this.update();
    }
    if (this.pts.length === 0 && info && (!info.kind || info.kind === 'near' || info.kind === 'grid')) {
      const hit = this.app.pick(info.raw || p, (e) => e.type === 'line' || e.type === 'pline');
      if (hit) {
        let a, b;
        if (hit.type === 'line') { a = hit.a; b = hit.b; }
        else { let best = null; for (const [s, t] of entSegs(hit)) { const d = G.distPointSeg(p, s, t).d; if (!best || d < best.d) best = { d, s, t }; } a = best.s; b = best.t; }
        this.pts = [G.clone(a), G.clone(b)]; return this.update();
      }
    }
    this.pts.push(p);
    if (this.pts.length === 3) {
      const [a, b] = this.pts;
      if (G.dist(a, b) > 1e-6) {
        const e = { type: 'dim', a: G.clone(a), b: G.clone(b), p: G.clone(p), mode: this.mode(a, b, p), layer: this.app.layerFor('L3') };
        this.app.addEnts([e]); this.app.commit(); this.last = e;
      }
      this.pts = [];
    }
    this.update();
  }
  input(s) {
    if (this.pts.length === 2 && this.cur) {
      const v = parseFloat(s.replace(',', '.'));
      if (!isNaN(v)) {
        const [a, b] = this.pts; const md = this.mode(a, b, this.cur);
        const u = md === 'h' ? { x: 1, y: 0 } : md === 'v' ? { x: 0, y: 1 } : G.norm(G.sub(b, a));
        const n = G.perp(u); const sgn = Math.sign(G.dot(G.sub(this.cur, a), n)) || 1;
        const ref = md === 'h' ? (sgn > 0 ? (a.y > b.y ? a : b) : (a.y < b.y ? a : b)) : md === 'v' ? (sgn > 0 ? (a.x < b.x ? a : b) : (a.x > b.x ? a : b)) : a;
        this.click(G.add(ref, G.mul(n, sgn * Math.abs(v))));
        return true;
      }
    }
    return super.input(s);
  }
  endChain() { this.last = null; this.pts = []; this.update(); }
  enter() { if (this.last || this.pts.length) this.endChain(); else super.enter(); }
  esc() { if (this.last || this.pts.length) this.endChain(); else super.esc(); }
  chips() { return this.last ? [{ t: 'Kette beenden', f: () => this.endChain(), main: true }] : []; }
  preview(B, sc) {
    if (!this.cur) return;
    if (this.last) { emit(this.tmp({ type: 'dim', a: this.last.b, b: this.cur, p: this.last.p, mode: this.last.mode, layer: this.app.layerFor('L3') }), B, sc); return; }
    if (this.pts.length === 1) B.stroke([this.pts[0], this.cur], false, RUB);
    if (this.pts.length === 2) { const [a, b] = this.pts; emit(this.tmp({ type: 'dim', a, b, p: this.cur, mode: this.mode(a, b, this.cur), layer: this.app.layerFor('L3') }), B, sc); }
  }
}

// ---------- Text ----------
export class TextTool extends Tool {
  msg() { return 'Text: Einfügepunkt wählen'; }
  async click(p) {
    const r = await this.app.textDialog({ text: '', h: this.app.opts.textH, angle: 0, align: 'l' }, 'Text einfügen');
    if (r && r.text.trim()) { this.app.opts.textH = r.h; this.app.addEnts([{ type: 'text', p: G.clone(p), text: r.text, h: r.h, angle: r.angle, align: r.align, bold: r.bold, layer: this.app.layerFor('L4') }]); this.app.commit(); }
    this.update();
  }
}

// ---------- Beschriftung mit Hinweislinie ----------
export class LeaderTool extends Tool {
  msg() { return this.pts.length ? 'Lage der Beschriftung wählen' : 'Beschriftung: auf Bauteil zeigen (Pfeilspitze)'; }
  async click(p) {
    this.pts.push(p);
    if (this.pts.length === 2) {
      const pts = this.pts.map(G.clone); this.pts = [];
      const r = await this.app.textDialog({ text: '', h: this.app.opts.textH, leader: true, arrow: this.app.opts.arrow }, 'Beschriftung');
      if (r && r.text.trim()) { this.app.opts.textH = r.h; this.app.opts.arrow = r.arrow; this.app.addEnts([{ type: 'leader', pts, text: r.text, h: r.h, arrow: r.arrow, layer: this.app.layerFor('L4') }]); this.app.commit(); }
    }
    this.update();
  }
  preview(B) { if (this.pts.length && this.cur) B.stroke([this.pts[0], this.cur], false, PREV); }
}

// ---------- Ändern: Basis mit Auswahlphase ----------
class ModTool extends Tool {
  constructor(app) { super(app); this.phase = app.sel.size ? 1 : 0; }
  get wantsSelect() { return this.phase === 0; }
  selMsg() { return 'Objekte wählen (Klick oder Rahmen) – dann Enter / „Weiter"'; }
  enter() { if (this.phase === 0) { if (this.app.sel.size) { this.phase = 1; this.update(); } } else super.enter(); }
  chips() { return this.phase === 0 && this.app.sel.size ? [{ t: 'Weiter', f: () => this.enter(), main: true }] : []; }
  selected() { return state.doc.ents.filter((e) => this.app.sel.has(e.id)); }
  previewSel(B, sc, T) { for (const e of this.selected()) emit(transformEnt(JSON.parse(JSON.stringify(e)), T), B, sc); }
}

export class MoveTool extends ModTool {
  constructor(app, copy) { super(app); this.copy = copy; }
  msg() { return this.phase === 0 ? this.selMsg() : this.pts.length ? 'Zielpunkt wählen (Abstand tippen möglich)' : (this.copy ? 'Kopieren' : 'Verschieben') + ': Basispunkt wählen'; }
  click(p) {
    if (this.phase === 0) return;
    if (!this.pts.length) { this.pts.push(p); return this.update(); }
    const T = Tmove(p.x - this.pts[0].x, p.y - this.pts[0].y);
    if (this.copy) {
      const news = this.selected().map((e) => transformEnt(cloneEnt(e), T));
      state.doc.ents.push(...news); this.app.commit(); this.update();
    } else {
      for (const e of this.selected()) transformEnt(e, T);
      this.app.commit(); this.app.setTool('select');
    }
  }
  preview(B, sc) { if (this.phase && this.pts.length && this.cur) { B.stroke([this.pts[0], this.cur], false, RUB); this.previewSel(B, sc, Tmove(this.cur.x - this.pts[0].x, this.cur.y - this.pts[0].y)); } }
  chips() { const c = super.chips(); if (this.copy && this.pts.length) c.push({ t: 'Fertig', f: () => this.app.setTool('select'), main: true }); return c; }
}

export class RotateTool extends ModTool {
  msg() { return this.phase === 0 ? this.selMsg() : this.pts.length ? 'Drehwinkel: Punkt wählen oder Grad tippen (gegen Uhrzeigersinn +)' : 'Drehen: Drehpunkt wählen'; }
  click(p) {
    if (this.phase === 0) return;
    if (!this.pts.length) { this.pts.push(p); return this.update(); }
    this.apply(G.ang(this.pts[0], p));
  }
  apply(a) {
    const T = Trot(this.pts[0], a);
    if (this.app.opts.rotCopy) state.doc.ents.push(...this.selected().map((e) => transformEnt(cloneEnt(e), T)));
    else for (const e of this.selected()) transformEnt(e, T);
    this.app.commit(); this.app.setTool('select');
  }
  input(s) {
    if (this.phase && this.pts.length) { const v = parseFloat(s.replace(',', '.')); if (!isNaN(v)) { this.apply(G.rad(v)); return true; } }
    return super.input(s);
  }
  chips() { const c = super.chips(); if (this.phase) c.push({ t: this.app.opts.rotCopy ? '✓ Als Kopie' : 'Als Kopie', f: () => { this.app.opts.rotCopy = !this.app.opts.rotCopy; this.update(); } }); return c; }
  preview(B, sc) { if (this.phase && this.pts.length && this.cur) { B.stroke([this.pts[0], this.cur], false, RUB); this.previewSel(B, sc, Trot(this.pts[0], G.ang(this.pts[0], this.cur))); } }
}

export class MirrorTool extends ModTool {
  msg() { return this.phase === 0 ? this.selMsg() : this.pts.length ? 'Zweiter Punkt der Spiegelachse' : 'Spiegeln: ersten Punkt der Spiegelachse wählen'; }
  click(p) {
    if (this.phase === 0) return;
    if (!this.pts.length) { this.pts.push(p); return this.update(); }
    if (G.dist(p, this.pts[0]) < 1e-9) return;
    const T = Tmirror(this.pts[0], p);
    if (this.app.opts.mirrorKeep) state.doc.ents.push(...this.selected().map((e) => transformEnt(cloneEnt(e), T)));
    else for (const e of this.selected()) transformEnt(e, T);
    this.app.commit(); this.app.setTool('select');
  }
  chips() { const c = super.chips(); if (this.phase) c.push({ t: this.app.opts.mirrorKeep ? '✓ Original behalten' : 'Original behalten', f: () => { this.app.opts.mirrorKeep = !this.app.opts.mirrorKeep; this.update(); } }); return c; }
  preview(B, sc) { if (this.phase && this.pts.length && this.cur && G.dist(this.cur, this.pts[0]) > 1e-9) { B.stroke([this.pts[0], this.cur], false, RUB); this.previewSel(B, sc, Tmirror(this.pts[0], this.cur)); } }
}

// ---------- Versatz ----------
export class OffsetTool extends Tool {
  constructor(app) { super(app); this.ent = null; }
  msg() { return this.ent ? 'Seite wählen, auf die versetzt wird' : `Versatz ${fmtNum(this.app.opts.offset, 2)} mm – Objekt anklicken (Abstand tippen zum Ändern)`; }
  rawClick() { return !this.ent; }
  input(s) { const v = parseFloat(s.replace(',', '.')); if (v > 0) { this.app.opts.offset = v; this.app.syncOpts(); this.update(); return true; } return false; }
  make(e, p) {
    const d = this.app.opts.offset;
    switch (e.type) {
      case 'line': { const s = Math.sign(G.cross(G.sub(e.b, e.a), G.sub(p, e.a))) || 1; const n = G.mul(G.perp(G.norm(G.sub(e.b, e.a))), d * s); return Object.assign(cloneEnt(e), { a: G.add(e.a, n), b: G.add(e.b, n) }); }
      case 'circle': case 'arc': { const r = G.dist(p, e.c) > e.r ? e.r + d : e.r - d; if (r <= 0) return null; return Object.assign(cloneEnt(e), { r }); }
      case 'pline': {
        let s;
        if (e.closed) { const inside = G.pointInPoly(p, e.pts); const ccw = G.polyArea(e.pts) > 0; s = (inside === ccw) ? 1 : -1; }
        else { let best = null; for (const [a, b] of entSegs(e)) { const dd = G.distPointSeg(p, a, b).d; if (!best || dd < best.d) best = { d: dd, a, b }; } s = Math.sign(G.cross(G.sub(best.b, best.a), G.sub(p, best.a))) || 1; }
        return Object.assign(cloneEnt(e), { pts: G.offsetPolyline(e.pts, e.closed, d * s) });
      }
    }
    return null;
  }
  click(p, info) {
    if (!this.ent) {
      const e = this.app.pick(info?.raw || p, (x) => ['line', 'pline', 'circle', 'arc'].includes(x.type));
      if (e) { this.ent = e; this.update(); }
      return;
    }
    const n = this.make(this.ent, p);
    if (n) { state.doc.ents.push(n); this.app.commit(); }
    this.ent = null; this.update();
  }
  esc() { if (this.ent) { this.ent = null; this.update(); } else super.esc(); }
  preview(B, sc) { if (this.ent && this.cur) { const n = this.make(this.ent, this.cur); if (n) emit(n, B, sc); } }
}

// ---------- Stutzen ----------
function cutParams(e, others) {
  const ts = [];
  if (e.type === 'line') {
    for (const o of others) for (const [a, b] of entSegs(o, true)) { const I = G.segSegInt(e.a, e.b, a, b); if (I && I.t > 1e-7 && I.t < 1 - 1e-7) ts.push(I.t); }
  } else {
    for (const o of others) {
      if (o.type === 'circle' || o.type === 'arc') { for (const q of G.circleCircleInt(e.c, e.r, o.c, o.r)) if (o.type === 'circle' || G.angInArc(G.ang(o.c, q), o.a0, o.a1)) ts.push(G.normAng(G.ang(e.c, q))); continue; }
      for (const [a, b] of entSegs(o, true)) for (const q of G.lineCircleInt(a, b, e.c, e.r)) if (q.t >= -1e-9 && q.t <= 1 + 1e-9) ts.push(G.normAng(G.ang(e.c, q)));
    }
  }
  return ts;
}
export class TrimTool extends Tool {
  msg() { return 'Stutzen: Teilstück anklicken, das entfernt werden soll (Linien, Polylinien, Kreise, Bögen)'; }
  rawClick() { return true; }
  click(p, info) {
    const raw = info?.raw || p;
    let e = this.app.pick(raw, (x) => ['line', 'pline', 'circle', 'arc'].includes(x.type));
    if (!e) return;
    if (e.type === 'pline') {
      const idx = state.doc.ents.indexOf(e);
      const lines = entSegs(e).map(([a, b]) => ({ id: nid(), type: 'line', layer: e.layer, color: e.color, lw: e.lw, lt: e.lt, a: G.clone(a), b: G.clone(b) }));
      state.doc.ents.splice(idx, 1, ...lines);
      e = this.app.pick(raw, (x) => x.type === 'line' && lines.includes(x));
      if (!e) return;
    }
    const others = this.app.visibleEnts().filter((o) => o !== e && !['text', 'dim', 'leader'].includes(o.type));
    const ts = cutParams(e, others);
    const idx = state.doc.ents.indexOf(e);
    if (e.type === 'line') {
      const tp = G.footOnLine(raw, e.a, e.b).t;
      let lo = 0, hi = 1; for (const t of ts) { if (t < tp && t > lo) lo = t; if (t > tp && t < hi) hi = t; }
      const pieces = [];
      if (lo > 1e-7) pieces.push(Object.assign(cloneEnt(e), { a: G.clone(e.a), b: G.lerp(e.a, e.b, lo) }));
      if (hi < 1 - 1e-7) pieces.push(Object.assign(cloneEnt(e), { a: G.lerp(e.a, e.b, hi), b: G.clone(e.b) }));
      state.doc.ents.splice(idx, 1, ...pieces);
    } else {
      const ap = G.normAng(G.ang(e.c, raw));
      if (e.type === 'circle') {
        if (ts.length < 2) { this.app.toast('Kreis braucht mindestens zwei Schnittpunkte'); return; }
        const rel = (a) => G.normAng(a - ap);
        const sorted = ts.slice().sort((a, b) => rel(a) - rel(b));
        const next = sorted[0], prev = sorted[sorted.length - 1];
        state.doc.ents.splice(idx, 1, Object.assign(cloneEnt(e), { type: 'arc', a0: next, a1: prev }));
      } else {
        const span = G.normAng(e.a1 - e.a0); const rel = (a) => G.normAng(a - e.a0);
        const tp = rel(ap);
        let lo = 0, hi = span; for (const t of ts.map(rel)) { if (t > 1e-7 && t < span - 1e-7) { if (t < tp && t > lo) lo = t; if (t > tp && t < hi) hi = t; } }
        const pieces = [];
        if (lo > 1e-7) pieces.push(Object.assign(cloneEnt(e), { a0: e.a0, a1: G.normAng(e.a0 + lo) }));
        if (hi < span - 1e-7) pieces.push(Object.assign(cloneEnt(e), { a0: G.normAng(e.a0 + hi), a1: e.a1 }));
        state.doc.ents.splice(idx, 1, ...pieces);
      }
    }
    this.app.sel.clear(); this.app.commit(); this.update();
  }
}

// ---------- Dehnen ----------
export class ExtendTool extends Tool {
  msg() { return 'Dehnen: Linie nahe dem Ende anklicken, das verlängert werden soll'; }
  rawClick() { return true; }
  click(p, info) {
    const raw = info?.raw || p;
    const e = this.app.pick(raw, (x) => x.type === 'line');
    if (!e) return;
    const atB = G.dist(raw, e.b) < G.dist(raw, e.a);
    const s = atB ? e.a : e.b, t = atB ? e.b : e.a;
    let best = Infinity;
    for (const o of this.app.visibleEnts()) {
      if (o === e || ['text', 'dim', 'leader'].includes(o.type)) continue;
      for (const [a, b] of entSegs(o, true)) {
        const I = G.segSegInt(s, t, a, b, true);
        if (I && I.u >= -1e-9 && I.u <= 1 + 1e-9 && I.t > 1 + 1e-7 && I.t < best) best = I.t;
      }
    }
    if (best === Infinity) { this.app.toast('Keine Begrenzung in Verlängerung gefunden'); return; }
    const np = G.lerp(s, t, best);
    if (atB) e.b = np; else e.a = np;
    this.app.commit(); this.update();
  }
}

// ---------- Messen ----------
export class MeasureTool extends Tool {
  msg() {
    if (this.res) return this.res;
    return this.pts.length ? 'Messen: zweiten Punkt wählen' : 'Messen: ersten Punkt wählen';
  }
  click(p) {
    if (this.pts.length !== 1) { this.pts = [p]; this.res = null; return this.update(); }
    const a = this.pts[0];
    this.res = `Abstand ${fmtNum(G.dist(a, p), 2)} mm · Δx ${fmtNum(p.x - a.x, 2)} · Δy ${fmtNum(p.y - a.y, 2)} · Winkel ${fmtNum(G.deg(G.ang(a, p)), 2)}°`;
    this.pts.push(p); this.update();
  }
  preview(B) { if (this.pts.length === 1 && this.cur) B.stroke([this.pts[0], this.cur], false, PREV); if (this.pts.length === 2) B.stroke(this.pts, false, PREV); }
}

// ---------- Blatt platzieren ----------
export class SheetTool extends Tool {
  msg() { return 'Blatt: Mittelpunkt des Blattes auf der Zeichnung wählen'; }
  click(p) { const sh = state.doc.sheet; sh.cx = p.x; sh.cy = p.y; sh.show = true; this.app.commit(); this.app.setTool('select'); this.app.refreshPanels(); }
  preview(B) {
    if (!this.cur) return;
    const sh = Object.assign({}, state.doc.sheet, { cx: this.cur.x, cy: this.cur.y });
    const M = sheetMaps(sh); const F = frameRect(sh);
    const r = (x0, y0, x1, y1) => [M.toModel(x0, y0), M.toModel(x1, y0), M.toModel(x1, y1), M.toModel(x0, y1)];
    B.stroke(r(0, 0, M.W, M.H), true, PREV);
    B.stroke(r(F.x0, F.y0, F.x1, F.y1), true, RUB);
  }
}

// ---------- Elementgruppe platzieren (Aufbauten, Einfügen) ----------
export class PlaceTool extends Tool {
  constructor(app, ents, label) { super(app); this.ents = ents; this.label = label || 'Objekte'; }
  msg() { return `${this.label}: Einfügepunkt wählen (Bezugspunkt = links unten)`; }
  placed(p) { return this.ents.map((e) => transformEnt(JSON.parse(JSON.stringify(e)), Tmove(p.x, p.y))); }
  click(p) {
    const news = this.placed(p).map((e) => Object.assign(e, { id: nid() }));
    state.doc.ents.push(...news);
    this.app.sel.clear(); news.forEach((e) => this.app.sel.add(e.id));
    this.app.commit(); this.app.setTool('select');
  }
  chips() {
    return [
      { t: 'Drehen 90°', f: () => { this.ents.forEach((e) => transformEnt(e, Trot({ x: 0, y: 0 }, Math.PI / 2))); this.update(); } },
      { t: 'Spiegeln', f: () => { this.ents.forEach((e) => transformEnt(e, Tmirror({ x: 0, y: 0 }, { x: 0, y: 1 }))); this.update(); } },
    ];
  }
  preview(B, sc) { if (this.cur) for (const e of this.placed(this.cur)) emit(e, B, sc); }
}

export { hitDist, Tool }; // Tool: Trockenbau-Modul
