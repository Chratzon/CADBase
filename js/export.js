// Export: SVG, DXF (R12), JSON
import { state, layerById, LTYPES } from './model.js';
import { emit } from './render.js';
import { buildSVG } from './print.js';
import * as G from './geom.js';

export function download(name, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const safe = (s) => (s || 'zeichnung').replace(/[^\wäöüÄÖÜß\- ]+/g, '').trim().replace(/\s+/g, '_') || 'zeichnung';

export function exportSVG(mono) { download(safe(state.doc.name) + '.svg', buildSVG({ mono }).svg, 'image/svg+xml'); }
export function exportJSON() { download(safe(state.doc.name) + '.cadbase.json', JSON.stringify(state.doc, null, 1), 'application/json'); }

const ACI = [[1, 255, 0, 0], [2, 255, 255, 0], [3, 0, 255, 0], [4, 0, 255, 255], [5, 0, 0, 255], [6, 255, 0, 255], [8, 128, 128, 128], [9, 192, 192, 192], [30, 255, 127, 0], [7, 0, 0, 0]];
function aci(hex) {
  if (!hex || hex[0] !== '#') return 7;
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  let best = 7, bd = Infinity;
  for (const [n, R, Gg, Bb] of ACI) { const d = (r - R) ** 2 + (g - Gg) ** 2 + (b - Bb) ** 2; if (d < bd) { bd = d; best = n; } }
  return best;
}
const dxfStr = (s) => String(s).replace(/[^\x20-\x7e]/g, (c) => '\\U+' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));
const LTN = { solid: 'CONTINUOUS', dashed: 'DASHED', dashdot: 'DASHDOT', dotted: 'DOTTED', long: 'LONGDASH' };
const lname = (L) => String(L.name).replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss').replace(/[^\x20-\x7e]/g, '_').replace(/[<>\/\\":;?*|=,]/g, '_');

class DxfB {
  constructor() { this.o = []; this.layer = '0'; this.lcol = '#000000'; }
  g(...a) { for (let i = 0; i < a.length; i += 2) this.o.push(String(a[i]), typeof a[i + 1] === 'number' ? String(Math.round(a[i + 1] * 10000) / 10000) : String(a[i + 1])); }
  head(type, st) {
    this.g(0, type, 8, this.layer);
    if (st && st.lt && st.dash && st.dash.length) this.g(6, LTN[st.lt] || 'CONTINUOUS');
    if (st && st.color && st.color.toLowerCase() !== this.lcol.toLowerCase()) this.g(62, aci(st.color));
  }
  line(a, b, st) { this.head('LINE', st); this.g(10, a.x, 20, a.y, 30, 0, 11, b.x, 21, b.y, 31, 0); }
  stroke(pts, closed, st) { for (let i = 0; i < pts.length - 1; i++) this.line(pts[i], pts[i + 1], st); if (closed && pts.length > 2) this.line(pts[pts.length - 1], pts[0], st); }
  segs(list, st) { for (const [a, b] of list) this.line(a, b, st); }
  circle(c, r, st) { this.head('CIRCLE', st); this.g(10, c.x, 20, c.y, 30, 0, 40, r); }
  arc(c, r, a0, a1, st) { this.head('ARC', st); this.g(10, c.x, 20, c.y, 30, 0, 40, r, 50, G.deg(a0), 51, G.deg(a1)); }
  fill(rings, color) { /* Flächenfüllungen werden in DXF R12 nicht übertragen */ }
  dots(pts, r, color) { for (const p of pts) { this.head('POINT', { color }); this.g(10, p.x, 20, p.y, 30, 0); } }
  disc(c, r, color) { this.circle(c, r, { color }); }
  tri(pts, color) { this.head('SOLID', { color }); const [a, b, c] = pts; this.g(10, a.x, 20, a.y, 30, 0, 11, b.x, 21, b.y, 31, 0, 12, c.x, 22, c.y, 32, 0, 13, c.x, 23, c.y, 33, 0); }
  text(p, str, h, ang, align, valign, color) {
    this.head('TEXT', { color });
    const hj = align === 'c' ? 1 : align === 'r' ? 2 : 0, vj = valign === 'm' ? 2 : valign === 't' ? 3 : 0;
    this.g(10, p.x, 20, p.y, 30, 0, 40, h, 1, dxfStr(str), 50, ang || 0, 7, 'STANDARD');
    if (hj || vj) this.g(72, hj, 11, p.x, 21, p.y, 31, 0, 73, vj);
  }
}

export function exportDXF() {
  const d = state.doc, sc = d.sheet.sc;
  const B = new DxfB();
  const H = [];
  const g = (...a) => { for (let i = 0; i < a.length; i += 2) H.push(String(a[i]), String(a[i + 1])); };
  g(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$LTSCALE', 40, 1, 0, 'ENDSEC');
  g(0, 'SECTION', 2, 'TABLES');
  const lts = Object.entries(LTYPES);
  g(0, 'TABLE', 2, 'LTYPE', 70, lts.length);
  for (const [k, v] of lts) {
    const dash = v.dash.map((x) => x * sc);
    g(0, 'LTYPE', 2, LTN[k], 70, 0, 3, v.label.replace(/[^\x20-\x7e]/g, ''), 72, 65, 73, dash.length, 40, dash.reduce((a, b) => a + b, 0));
    dash.forEach((x, i) => g(49, i % 2 ? -x : x));
  }
  g(0, 'ENDTAB');
  g(0, 'TABLE', 2, 'LAYER', 70, d.layers.length + 1, 0, 'LAYER', 2, '0', 70, 0, 62, 7, 6, 'CONTINUOUS');
  for (const L of d.layers) g(0, 'LAYER', 2, lname(L), 70, 0, 62, L.vis ? aci(L.color) : -aci(L.color), 6, LTN[L.lt] || 'CONTINUOUS');
  g(0, 'ENDTAB');
  g(0, 'TABLE', 2, 'STYLE', 70, 1, 0, 'STYLE', 2, 'STANDARD', 70, 0, 40, 0, 41, 1, 50, 0, 71, 0, 42, 2.5, 3, 'arial.ttf', 4, '', 0, 'ENDTAB');
  g(0, 'ENDSEC');
  for (const e of d.ents) {
    const L = layerById(e.layer);
    B.layer = lname(L); B.lcol = L.color;
    emit(e, B, sc);
  }
  const out = H.concat(['0', 'SECTION', '2', 'ENTITIES'], B.o, ['0', 'ENDSEC', '0', 'EOF']).join('\r\n');
  download(safe(d.name) + '.dxf', out, 'application/dxf');
}
