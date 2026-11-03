// Schraffurmuster (Abstände in Papier-mm, werden mit Maßstab multipliziert)
import { rot, bboxOf, clipSegToRings, pointInRings, hash2, rad, TAU } from './geom.js';

export const PATTERNS = {
  mauerwerk:    { label: 'Mauerwerk (45°)', mat: '#c9785b' },
  stahlbeton:   { label: 'Stahlbeton', mat: '#9aa0a6' },
  beton:        { label: 'Beton unbewehrt', mat: '#b4b8bc' },
  kreuz:        { label: 'Kreuzschraffur', mat: '#a0a0a0' },
  daemmung:     { label: 'Dämmung weich', mat: '#f2d24b', fit: true },
  daemmung_hart:{ label: 'Dämmung hart', mat: '#cfe3a8', fit: true },
  holz_quer:    { label: 'Holz (Querschnitt)', mat: '#d9a866', fit: true },
  holz_laengs:  { label: 'Holz (längs)', mat: '#e0b77a' },
  holzwerkstoff:{ label: 'Holzwerkstoff / OSB', mat: '#d8b580' },
  gips:         { label: 'Gipsplatte', mat: '#f3f1ec', fill: '#f4f4f2' },
  estrich:      { label: 'Estrich / Mörtel', mat: '#c8c3b8' },
  putz:         { label: 'Putz', mat: '#e6e1d6' },
  erdreich:     { label: 'Erdreich', mat: '#8c6d4f' },
  kies:         { label: 'Kies / Schotter', mat: '#b8b1a4' },
  stahl:        { label: 'Stahl (voll)', mat: '#5d6670', fill: '#222222', solid: true },
  folie:        { label: 'Folie / Abdichtung', mat: '#333333', fill: '#555555', solid: true },
  fuellung:     { label: 'Füllung (Farbe)', mat: '#cccccc', solid: true },
  keine:        { label: 'Nur Umriss', mat: '#dddddd' },
};

// Linienschar in lokalem Rahmen: horizontale Linien mit Abstand sp
function family(bb, sp, offset = 0) {
  const segs = [];
  const k0 = Math.floor((bb.y0 - offset) / sp) - 1, k1 = Math.ceil((bb.y1 - offset) / sp) + 1;
  if (k1 - k0 > 3000) return segs;
  for (let k = k0; k <= k1; k++) {
    const y = k * sp + offset;
    segs.push([{ x: bb.x0 - sp, y }, { x: bb.x1 + sp, y }]);
  }
  return segs;
}

export function autoAngle(pts) {
  const b = bboxOf(pts);
  return (b.x1 - b.x0) >= (b.y1 - b.y0) ? 0 : 90;
}

const cache = new WeakMap();

// liefert {fill, segs:[[p,q]], dots:[p], dotR, rings}
export function genHatch(e, sc) {
  const key = JSON.stringify([e.pts, e.holes, e.pattern, e.scale, e.angle, sc, e.color]);
  const c = cache.get(e);
  if (c && c.key === key) return c.res;
  const res = build(e, sc);
  cache.set(e, { key, res });
  return res;
}

function build(e, sc) {
  const rings = [e.pts, ...(e.holes || [])];
  const P = PATTERNS[e.pattern] || PATTERNS.keine;
  const s = (e.scale || 1) * sc; // Modell-mm pro Papier-mm
  const out = { fill: P.fill || null, segs: [], dots: [], dotR: 0.18, rings };
  if (e.pattern === 'fuellung') out.fill = e.fillColor || '#d0d0d0';
  if (P.solid || e.pattern === 'keine') return out;

  let angDeg = (e.angle === null || e.angle === undefined || e.angle === 'auto') ? (P.fit ? autoAngle(e.pts) : 0) : +e.angle;
  const extra = { mauerwerk: 45, stahlbeton: 45, kreuz: 45, erdreich: 45 }[e.pattern] || 0;
  const A = rad(angDeg + extra);
  const O = { x: 0, y: 0 };
  const local = e.pts.map((p) => rot(p, O, -A));
  const bb = bboxOf(local);
  let L = [];          // lokale Segmente
  let D = [];          // lokale Punkte
  const H = bb.y1 - bb.y0, W = bb.x1 - bb.x0;

  switch (e.pattern) {
    case 'mauerwerk': L = family(bb, 3 * s); break;
    case 'stahlbeton': L = family(bb, 3 * s).concat(family(bb, 3 * s, 0.7 * s)); break;
    case 'kreuz': {
      L = family(bb, 3 * s);
      const A2 = rad(angDeg + 135);
      const loc2 = e.pts.map((p) => rot(p, O, -A2));
      const fam2 = family(bboxOf(loc2), 3 * s).map(([a, b]) => [rot(a, O, A2 - A), rot(b, O, A2 - A)]);
      L = L.concat(fam2);
      break;
    }
    case 'beton': {
      const cs = 3.2 * s;
      const i0 = Math.floor(bb.x0 / cs) - 1, i1 = Math.ceil(bb.x1 / cs) + 1, j0 = Math.floor(bb.y0 / cs) - 1, j1 = Math.ceil(bb.y1 / cs) + 1;
      if ((i1 - i0) * (j1 - j0) > 40000) break;
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const r1 = hash2(i, j, 1), r2 = hash2(i, j, 2), r3 = hash2(i, j, 3);
        D.push({ x: (i + r1) * cs, y: (j + r2) * cs });
        D.push({ x: (i + hash2(i, j, 7)) * cs, y: (j + hash2(i, j, 8)) * cs });
        if (r3 < 0.45) {
          const c = { x: (i + hash2(i, j, 4)) * cs, y: (j + hash2(i, j, 5)) * cs };
          const rr = 0.7 * s, a0 = hash2(i, j, 6) * TAU;
          const t = [0, 1, 2].map((k) => ({ x: c.x + rr * Math.cos(a0 + k * TAU / 3), y: c.y + rr * Math.sin(a0 + k * TAU / 3) }));
          L.push([t[0], t[1]], [t[1], t[2]], [t[2], t[0]]);
        }
      }
      break;
    }
    case 'daemmung': {
      // Schlaufenlinie über die volle Schichtdicke
      const amp = H / 2 * 0.96, yc = (bb.y0 + bb.y1) / 2;
      const per = Math.max(H * 0.75, 0.5 * s);
      const a = per / TAU, k = a * 1.9;
      const tStart = (bb.x0 - per) / a, tEnd = (bb.x1 + per) / a;
      const steps = Math.min(20000, Math.ceil((tEnd - tStart) / (TAU / 28)));
      let prev = null;
      for (let i = 0; i <= steps; i++) {
        const t = tStart + (tEnd - tStart) * i / steps;
        const p = { x: a * t - k * Math.sin(t), y: yc + amp * Math.cos(t) };
        if (prev) L.push([prev, p]);
        prev = p;
      }
      break;
    }
    case 'daemmung_hart': {
      const step = Math.max(H, 0.5 * s);
      for (let x = bb.x0 - step; x <= bb.x1 + step; x += step) {
        L.push([{ x, y: bb.y0 }, { x: x + step, y: bb.y1 }]);
        L.push([{ x, y: bb.y1 }, { x: x + step, y: bb.y0 }]);
      }
      break;
    }
    case 'holz_quer': {
      L.push([{ x: bb.x0, y: bb.y0 }, { x: bb.x1, y: bb.y1 }], [{ x: bb.x0, y: bb.y1 }, { x: bb.x1, y: bb.y0 }]);
      break;
    }
    case 'holz_laengs': {
      const sp = 2.6 * s;
      const j0 = Math.floor(bb.y0 / sp) - 1, j1 = Math.ceil(bb.y1 / sp) + 1;
      if (j1 - j0 > 2000) break;
      for (let j = j0; j <= j1; j++) {
        const ph = hash2(j, 3, 9) * TAU, am = (0.25 + hash2(j, 4, 9) * 0.35) * s, wl = (18 + hash2(j, 5, 9) * 14) * s;
        let prev = null;
        const n = Math.min(2000, Math.ceil((W + 2 * sp) / (wl / 16)));
        for (let i = 0; i <= n; i++) {
          const x = bb.x0 - sp + (W + 2 * sp) * i / n;
          const p = { x, y: j * sp + am * Math.sin(x / wl * TAU + ph) };
          if (prev) L.push([prev, p]);
          prev = p;
        }
      }
      break;
    }
    case 'holzwerkstoff': {
      const cs = 2.2 * s;
      const i0 = Math.floor(bb.x0 / cs) - 1, i1 = Math.ceil(bb.x1 / cs) + 1, j0 = Math.floor(bb.y0 / cs) - 1, j1 = Math.ceil(bb.y1 / cs) + 1;
      if ((i1 - i0) * (j1 - j0) > 40000) break;
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const c = { x: (i + hash2(i, j, 1)) * cs, y: (j + hash2(i, j, 2)) * cs };
        const a = (hash2(i, j, 3) - 0.5) * 0.9, l = (0.6 + hash2(i, j, 4) * 0.8) * s;
        L.push([{ x: c.x - l * Math.cos(a), y: c.y - l * Math.sin(a) }, { x: c.x + l * Math.cos(a), y: c.y + l * Math.sin(a) }]);
      }
      break;
    }
    case 'gips': case 'estrich': case 'putz': {
      const cs = (e.pattern === 'gips' ? 1.4 : e.pattern === 'putz' ? 1.1 : 1.8) * s;
      const i0 = Math.floor(bb.x0 / cs) - 1, i1 = Math.ceil(bb.x1 / cs) + 1, j0 = Math.floor(bb.y0 / cs) - 1, j1 = Math.ceil(bb.y1 / cs) + 1;
      if ((i1 - i0) * (j1 - j0) > 60000) break;
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        if (e.pattern === 'gips') D.push({ x: (i + (j % 2 ? 0.5 : 0)) * cs, y: j * cs });
        else D.push({ x: (i + hash2(i, j, 1)) * cs, y: (j + hash2(i, j, 2)) * cs });
      }
      out.dotR = e.pattern === 'estrich' ? 0.2 : 0.14;
      break;
    }
    case 'erdreich': {
      const cs = 4 * s, g = 0.7 * s, l = 2.2 * s;
      const i0 = Math.floor(bb.x0 / cs) - 1, i1 = Math.ceil(bb.x1 / cs) + 1, j0 = Math.floor(bb.y0 / cs) - 1, j1 = Math.ceil(bb.y1 / cs) + 1;
      if ((i1 - i0) * (j1 - j0) > 30000) break;
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const ox = i * cs + (j % 2 ? cs / 2 : 0), oy = j * cs;
        for (let k = 0; k < 3; k++) L.push([{ x: ox, y: oy + k * g }, { x: ox + l, y: oy + k * g }]);
      }
      break;
    }
    case 'kies': {
      const cs = 3 * s;
      const i0 = Math.floor(bb.x0 / cs) - 1, i1 = Math.ceil(bb.x1 / cs) + 1, j0 = Math.floor(bb.y0 / cs) - 1, j1 = Math.ceil(bb.y1 / cs) + 1;
      if ((i1 - i0) * (j1 - j0) > 20000) break;
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const c = { x: (i + 0.2 + hash2(i, j, 1) * 0.6) * cs, y: (j + 0.2 + hash2(i, j, 2) * 0.6) * cs };
        const rx = (0.5 + hash2(i, j, 3) * 0.6) * s, ry = rx * (0.6 + hash2(i, j, 4) * 0.4), a0 = hash2(i, j, 5) * 3;
        let prev = null;
        for (let k = 0; k <= 8; k++) {
          const t = k / 8 * TAU;
          const px = rx * Math.cos(t), py = ry * Math.sin(t);
          const p = { x: c.x + px * Math.cos(a0) - py * Math.sin(a0), y: c.y + px * Math.sin(a0) + py * Math.cos(a0) };
          if (prev) L.push([prev, p]);
          prev = p;
        }
      }
      break;
    }
  }
  for (const [a, b] of L) {
    const pa = rot(a, O, A), pb = rot(b, O, A);
    for (const sg of clipSegToRings(pa, pb, rings)) out.segs.push(sg);
  }
  for (const d of D) { const p = rot(d, O, A); if (pointInRings(p, rings)) out.dots.push(p); }
  return out;
}
