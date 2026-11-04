// Blatt, Rahmen, Schriftfeld, Druck und SVG-Erzeugung
import { FORMATS, state, layerById } from './model.js';
import { SvgB, emit } from './render.js';

export function paperSize(sh) { const [a, b] = FORMATS[sh.fmt] || FORMATS.A3; return sh.orient === 'quer' ? [b, a] : [a, b]; }
export function sheetMaps(sh) {
  const [W, H] = paperSize(sh);
  return {
    W, H,
    toModel: (px, py) => ({ x: sh.cx + (px - W / 2) * sh.sc, y: sh.cy - (py - H / 2) * sh.sc }),
    toPaper: (p) => ({ x: (p.x - sh.cx) / sh.sc + W / 2, y: H / 2 - (p.y - sh.cy) / sh.sc }),
  };
}
export function frameRect(sh) { const [W, H] = paperSize(sh); return { x0: 20, y0: 5, x1: W - 5, y1: H - 5 }; }

const TBW = 180, TBH = 32;

// Faltlinien nach DIN 824 Form A (mit 20 mm Heftrand) auf A4 210 x 297
// v: x-Positionen ab linkem Rand, h: y-Positionen ab unterem Rand, corner: Eckumschlag oben links
export function foldLines(W, H) {
  const v = [], h = [];
  if (W * H <= 297 * 210 + 1) return { v, h, corner: null }; // A4 wird nicht gefaltet
  if (W > 210 + 1) {
    const c = W - 190;
    if (W <= 430) { v.push((c + 20) / 2, c); }
    else {
      let last = 210; v.push(last);
      while (c - last > 380) { last += 190; v.push(last); }
      if (c - last <= 200) v.push(last + (W - last) / 2);
      else { v.push((last + c) / 2); v.push(c); }
    }
  }
  for (let y = 297; y < H - 1; y += 297) h.push(y);
  const corner = (h.length && W >= 590) ? { x: 105, y: H - 297 } : null;
  return { v, h, corner };
}

// Rahmen + Schriftfeld in Modellkoordinaten zeichnen
export function emitSheet(B, sh) {
  const M = sheetMaps(sh); const m = (x, y) => M.toModel(x, y);
  const sc = sh.sc;
  const F = frameRect(sh);
  const black = '#000000';
  const thick = { color: black, lw: 0.5, dash: [] }, thin = { color: black, lw: 0.25, dash: [] };
  const rect = (x0, y0, x1, y1) => [m(x0, y0), m(x1, y0), m(x1, y1), m(x0, y1)];
  B.stroke(rect(F.x0, F.y0, F.x1, F.y1), true, thick);
  // Faltmarke / Lochrand-Markierung links mittig
  B.stroke([m(5, M.H / 2), m(12, M.H / 2)], false, thin);
  if (sh.fold !== false) {
    const F2 = foldLines(M.W, M.H); const L = 8, fm = { color: black, lw: 0.35, dash: [] };
    for (const x of F2.v) { B.stroke([m(x, 0), m(x, L)], false, fm); B.stroke([m(x, M.H), m(x, M.H - L)], false, fm); }
    for (const yb of F2.h) { const y = M.H - yb; B.stroke([m(0, y), m(L, y)], false, fm); B.stroke([m(M.W, y), m(M.W - L, y)], false, fm); }
    if (F2.corner) { const c = F2.corner; B.stroke([m(c.x, 0), m(c.x - 3, 6)], false, fm); B.stroke([m(0, c.y), m(6, c.y - 3)], false, fm); }
  }
  const x1 = F.x1, y1 = F.y1, x0 = x1 - TBW, y0 = y1 - TBH;
  B.fill([rect(x0, y0, x1, y1)], '#ffffff');
  B.stroke(rect(x0, y0, x1, y1), true, thick);
  const xl = x0 + 60;
  B.stroke([m(xl, y0), m(xl, y1)], false, thin);
  B.stroke([m(xl, y0 + 9), m(x1, y0 + 9)], false, thin);
  B.stroke([m(xl, y0 + 20), m(x1, y0 + 20)], false, thin);
  const cw = (x1 - xl) / 6;
  for (let i = 1; i < 6; i++) B.stroke([m(xl + cw * i, y0 + 20), m(xl + cw * i, y1)], false, thin);
  const tb = sh.tb || {};
  const T = (x, y, s, h, bold) => B.text(m(x, y), s, h * sc, 0, 'l', 'b', black, bold);
  const lab = (x, y, s) => B.text(m(x, y), s, 1.5 * sc, 0, 'l', 'b', '#444444');
  lab(x0 + 2, y0 + 3.5, 'Verfasser / Firma');
  String(tb.firma || '').split('\n').slice(0, 4).forEach((l, i) => T(x0 + 2, y0 + 9 + i * 4.6, l, i === 0 ? 3 : 2.3, i === 0));
  lab(xl + 2, y0 + 3.5, 'Projekt');
  T(xl + 2, y0 + 7.8, tb.projekt || '', 3);
  lab(xl + 2, y0 + 12.5, 'Planinhalt');
  T(xl + 2, y0 + 18, tb.titel || '', 4, true);
  const cells = [['Maßstab', '1:' + sh.sc], ['Format', sh.fmt], ['Datum', tb.datum || ''], ['Gezeichnet', tb.gez || ''], ['Plan-Nr.', tb.plannr || ''], ['Index', tb.index || '']];
  cells.forEach(([l, v], i) => { lab(xl + cw * i + 1.5, y0 + 23.5, l); T(xl + cw * i + 1.5, y0 + 29.5, v, v.length > 9 ? 2.2 : 3); });
  lab(x0 + 2, y1 - 1.8, 'erstellt mit CADBase');
}

export function buildSVG(opts = {}) {
  const d = state.doc, sh = d.sheet;
  const M = sheetMaps(sh); const F = frameRect(sh);
  const B = new SvgB(M.toPaper, sh.sc, { mono: opts.mono, imgData: opts.imgData });
  for (const pass of [0, 1]) for (const e of d.ents) { if ((e.type === 'image') !== (pass === 0)) continue; const L = layerById(e.layer); if (!L.vis || L.print === false) continue; emit(e, B, sh.sc); }
  const B2 = new SvgB(M.toPaper, sh.sc, { mono: opts.mono });
  emitSheet(B2, sh);
  const W = M.H !== undefined ? M.W : 0, H = M.H;
  let ow = W, oh = H, note = '';
  if (opts.fit && opts.fit !== sh.fmt) {
    const [a, b] = FORMATS[opts.fit]; [ow, oh] = sh.orient === 'quer' ? [b, a] : [a, b];
    note = `<text x="${F.x0}" y="${H - 1.5}" font-family="Arial" font-size="2.4" fill="#000">Ausdruck auf ${opts.fit} verkleinert – nicht maßstäblich (Original ${sh.fmt}, 1:${sh.sc})</text>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" style="fill:none;stroke:none" width="${ow}mm" height="${oh}mm" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">` +
    `<rect width="${W}" height="${H}" fill="#fff"/>` +
    `<defs><clipPath id="cbclip"><rect x="${F.x0}" y="${F.y0}" width="${F.x1 - F.x0}" height="${F.y1 - F.y0}"/></clipPath></defs>` +
    `<g clip-path="url(#cbclip)">${B.out.join('')}</g>${B2.out.join('')}${note}</svg>`;
  return { svg, W: ow, H: oh };
}

export function printSheet(opts = {}) {
  const { svg, W, H } = buildSVG(opts);
  let area = document.getElementById('printArea');
  if (!area) { area = document.createElement('div'); area.id = 'printArea'; document.body.appendChild(area); }
  area.innerHTML = svg;
  let ps = document.getElementById('pageStyle');
  if (!ps) { ps = document.createElement('style'); ps.id = 'pageStyle'; document.head.appendChild(ps); }
  ps.textContent = `@page { size: ${W}mm ${H}mm; margin: 0; } #printArea svg { width: ${W}mm; height: ${H}mm; }`;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); area.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { try { window.print(); } catch (err) { done(); } }, 60);
}
