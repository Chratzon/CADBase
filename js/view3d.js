// Einfache 3D-Ansicht: Flächen (Schraffuren / geschlossene Polylinien) werden extrudiert
import { state, layerById, entSegs, nid } from './model.js';
import { PATTERNS } from './hatch.js';
import * as G from './geom.js';
import { wallParts3D } from './drywall.js'; // Trockenbau

function hex2rgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function rgb2hex(r, g, b) { return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
function lighten(h, f) { const [r, g, b] = hex2rgb(h); return rgb2hex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f); }

export class View3D {
  constructor(canvas, onChange) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.onChange = onChange || (() => {});
    this.setView('iso');
    this.zoom = 1; this.pan = { x: 0, y: 0 };
    this.prisms = []; this.lines = [];
    this.ptrs = new Map();
    this.bind();
  }
  setView(v) {
    const V = { iso: [-45, 35.26], vorne: [0, 0], oben: [0, 90], seite: [-90, 0], iso2: [-135, 30] }[v] || [-45, 35];
    this.yaw = G.rad(V[0]); this.pitch = G.rad(V[1]);
  }
  build() {
    const d = state.doc; const def = +d.settings.ext3d || 300;
    this.prisms = []; this.lines = [];
    let bb = null;
    const list = [];
    for (const e of d.ents) { // Trockenbau: Wände in Platten/Dämmung zerlegen, Höhe = Wandhöhe
      if (e.type !== 'wall') { list.push(e); continue; }
      if (!layerById(e.layer).vis || e.no3d) continue;
      for (const s of wallParts3D(e)) list.push(s);
    }
    for (const e of list) {
      const L = layerById(e.layer); if (!L.vis) continue;
      if (['dim', 'text', 'leader'].includes(e.type)) continue;
      // eingefügte Isometrien und ausgeblendete Objekte nicht erneut in 3D zeigen
      if (e.no3d || e.iso || L.name === '3D-Ansicht') continue;
      const z0 = +e.z0 || 0;
      let rings = null, color = null, h = 0;
      if (e.type === 'hatch') {
        rings = [e.pts, ...(e.holes || [])];
        color = e.pattern === 'fuellung' ? (e.fillColor || '#cccccc') : (PATTERNS[e.pattern] || PATTERNS.keine).mat;
        h = e.ext === undefined || e.ext === null || e.ext === '' ? def : +e.ext;
      } else if ((e.type === 'pline' && e.closed) || e.type === 'circle') {
        rings = [e.type === 'circle' ? G.arcPts(e.c, e.r, 0, G.TAU, 48).slice(0, -1) : e.pts];
        color = lighten(L.color === '#000000' ? '#8a9099' : L.color, 0.35);
        h = +e.ext || 0;
      }
      if (rings && h > 0) {
        const rs = rings.map((r, i) => { const a = G.polyArea(r); const ccw = a > 0; return (i === 0) === ccw ? r : r.slice().reverse(); });
        this.prisms.push({ rings: rs, z0, z1: z0 + h, color });
        for (const r of rs) bb = G.bboxUnion(bb, G.bboxOf(r));
        this.zmax = Math.max(this.zmax || 0, z0 + h);
      } else {
        for (const [a, b] of entSegs(e, true)) { this.lines.push([{ x: a.x, y: a.y, z: z0 }, { x: b.x, y: b.y, z: z0 }]); bb = G.bboxUnion(bb, G.bboxOf([a, b])); }
      }
    }
    bb = bb || { x0: -500, y0: -500, x1: 500, y1: 500 };
    let zmax = 0; for (const p of this.prisms) zmax = Math.max(zmax, p.z1);
    this.center = { x: (bb.x0 + bb.x1) / 2, y: (bb.y0 + bb.y1) / 2, z: zmax / 2 };
    this.size = Math.max(1, Math.hypot(bb.x1 - bb.x0, bb.y1 - bb.y0, zmax));
  }
  // Welt -> Ansicht {x, y (oben), d (Tiefe)}
  P(p) {
    const c = this.center; const x = p.x - c.x, y = p.y - c.y, z = p.z - c.z;
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const x1 = x * cy - y * sy, y1 = x * sy + y * cy;
    return { x: x1, y: z * cp + y1 * sp, d: y1 * cp - z * sp };
  }
  viewDir() { const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch); return { x: Math.sin(this.yaw) * cp, y: Math.cos(this.yaw) * cp, z: -sp }; }
  // sichtbare Flächen, sortiert von hinten nach vorne
  faces() {
    const vd = this.viewDir(); const Ld = { x: 0.35, y: -0.55, z: 0.76 };
    const out = [];
    const add = (rings3, n, color) => {
      const dp = n.x * vd.x + n.y * vd.y + n.z * vd.z;
      if (dp > -1e-6) return;
      const pr = rings3.map((r) => r.map((q) => this.P(q)));
      let dsum = 0, cnt = 0; for (const q of pr[0]) { dsum += q.d; cnt++; }
      const I = 0.55 + 0.45 * Math.max(0, n.x * Ld.x + n.y * Ld.y + n.z * Ld.z);
      const [r, g, b] = hex2rgb(color);
      out.push({ pr, d: dsum / cnt, col: rgb2hex(r * I, g * I, b * I) });
    };
    for (const P of this.prisms) {
      add(P.rings.map((r) => r.map((q) => ({ x: q.x, y: q.y, z: P.z1 }))), { x: 0, y: 0, z: 1 }, P.color);
      add(P.rings.map((r) => r.map((q) => ({ x: q.x, y: q.y, z: P.z0 }))), { x: 0, y: 0, z: -1 }, P.color);
      for (const r of P.rings) for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length];
        const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy); if (l < 1e-9) continue;
        add([[{ x: a.x, y: a.y, z: P.z0 }, { x: b.x, y: b.y, z: P.z0 }, { x: b.x, y: b.y, z: P.z1 }, { x: a.x, y: a.y, z: P.z1 }]], { x: dy / l, y: -dx / l, z: 0 }, P.color);
      }
    }
    out.sort((a, b) => b.d - a.d);
    return out;
  }
  resize() {
    const r = this.cv.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
    this.cv.width = Math.max(1, r.width * dpr); this.cv.height = Math.max(1, r.height * dpr);
    this.w = r.width; this.h = r.height; this.dpr = dpr;
  }
  render() {
    if (!this.w) this.resize();
    const c = this.ctx; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = '#eef0f2'; c.fillRect(0, 0, this.w, this.h);
    const s = Math.min(this.w, this.h) / this.size * 0.8 * this.zoom;
    const S = (q) => ({ x: this.w / 2 + q.x * s + this.pan.x, y: this.h / 2 - q.y * s + this.pan.y });
    c.lineJoin = 'round';
    c.strokeStyle = '#5b6470'; c.lineWidth = 1;
    c.beginPath();
    for (const [a, b] of this.lines) { const p = S(this.P(a)), q = S(this.P(b)); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); }
    c.stroke();
    for (const f of this.faces()) {
      c.beginPath();
      for (const r of f.pr) { r.forEach((q, i) => { const p = S(q); i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); }); c.closePath(); }
      c.fillStyle = f.col; c.fill('evenodd');
      c.strokeStyle = 'rgba(20,24,30,0.75)'; c.lineWidth = 0.8; c.stroke();
    }
    if (!this.prisms.length) {
      c.fillStyle = '#5b6470'; c.font = '14px system-ui, sans-serif'; c.textAlign = 'center';
      c.fillText('Keine Körper: Schraffuren werden automatisch extrudiert,', this.w / 2, 30);
      c.fillText('geschlossene Polylinien/Kreise über „3D-Höhe" in den Eigenschaften.', this.w / 2, 50);
    }
  }
  // Aktuelle Ansicht als Vektor-Isometrie in die Zeichnung übernehmen
  toEntities(origin, layerId) {
    const ents = [];
    const T = (q) => ({ x: origin.x + q.x, y: origin.y + q.y });
    for (const [a, b] of this.lines) ents.push({ id: nid(), type: 'line', layer: layerId, a: T(this.P(a)), b: T(this.P(b)), iso: true });
    for (const f of this.faces()) {
      const rings = f.pr.map((r) => r.map(T));
      ents.push({ id: nid(), type: 'hatch', layer: layerId, pts: rings[0], holes: rings.slice(1), pattern: 'fuellung', fillColor: f.col, outline: true, olw: 0.25, ext: 0, iso: true });
    }
    return ents;
  }
  bind() {
    const cv = this.cv;
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button, sh: e.shiftKey }); });
    cv.addEventListener('pointermove', (e) => {
      const p = this.ptrs.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (this.ptrs.size === 2) {
        const [a, b] = [...this.ptrs.values()];
        const d0 = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX; p.y = e.clientY;
        const d1 = Math.hypot(a.x - b.x, a.y - b.y);
        if (d0 > 0) this.zoom *= d1 / d0;
        this.pan.x += dx / 2; this.pan.y += dy / 2;
      } else if (p.b === 2 || p.b === 1 || p.sh) { this.pan.x += dx; this.pan.y += dy; p.x = e.clientX; p.y = e.clientY; }
      else {
        this.yaw -= dx * 0.008; this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch + dy * 0.008));
        p.x = e.clientX; p.y = e.clientY;
      }
      this.render();
    });
    const up = (e) => this.ptrs.delete(e.pointerId);
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom *= Math.exp(-e.deltaY * 0.0015); this.render(); }, { passive: false });
  }
}
