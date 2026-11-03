// Geometrie-Grundfunktionen (Modellkoordinaten in mm, y nach oben)
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a, s) => ({ x: a.x * s, y: a.y * s });
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const cross = (a, b) => a.x * b.y - a.y * b.x;
export const len = (a) => Math.hypot(a.x, a.y);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a) => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; };
export const perp = (a) => ({ x: -a.y, y: a.x });
export const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const mid = (a, b) => lerp(a, b, 0.5);
export const ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
export const polar = (c, r, a) => ({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
export const TAU = Math.PI * 2;
export const deg = (r) => r * 180 / Math.PI;
export const rad = (d) => d * Math.PI / 180;
export const clone = (p) => ({ x: p.x, y: p.y });

export function rot(p, c, a) {
  const s = Math.sin(a), co = Math.cos(a);
  const dx = p.x - c.x, dy = p.y - c.y;
  return { x: c.x + dx * co - dy * s, y: c.y + dx * s + dy * co };
}

export function mirrorPt(p, a, b) {
  const d = norm(sub(b, a));
  const v = sub(p, a);
  const t = dot(v, d);
  const f = add(a, mul(d, t));
  return { x: 2 * f.x - p.x, y: 2 * f.y - p.y };
}

export function normAng(a) { a %= TAU; return a < 0 ? a + TAU : a; }
// liegt Winkel a im Bogen von a0 ccw nach a1?
export function angInArc(a, a0, a1) {
  a = normAng(a - a0); const span = normAng(a1 - a0) || TAU;
  return a <= span + 1e-9;
}

export function segSegInt(a, b, c, d, infinite = false) {
  const r = sub(b, a), s = sub(d, c);
  const den = cross(r, s);
  if (Math.abs(den) < 1e-12) return null;
  const ca = sub(c, a);
  const t = cross(ca, s) / den, u = cross(ca, r) / den;
  if (!infinite && (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9)) return null;
  return { x: a.x + r.x * t, y: a.y + r.y * t, t, u };
}

// Schnitt Gerade(a,b) mit Kreis; t-Parameter auf a->b
export function lineCircleInt(a, b, c, r) {
  const d = sub(b, a), f = sub(a, c);
  const A = dot(d, d), B = 2 * dot(f, d), C = dot(f, f) - r * r;
  let disc = B * B - 4 * A * C;
  if (disc < 0 || A < 1e-12) return [];
  disc = Math.sqrt(disc);
  const out = [];
  for (const t of [(-B - disc) / (2 * A), (-B + disc) / (2 * A)]) out.push({ x: a.x + d.x * t, y: a.y + d.y * t, t });
  return out;
}

export function circleCircleInt(c1, r1, c2, r2) {
  const d = dist(c1, c2);
  if (d < 1e-9 || d > r1 + r2 || d < Math.abs(r1 - r2)) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const p = lerp(c1, c2, a / d);
  const ux = (c2.x - c1.x) / d, uy = (c2.y - c1.y) / d;
  return [{ x: p.x - uy * h, y: p.y + ux * h }, { x: p.x + uy * h, y: p.y - ux * h }];
}

export function distPointSeg(p, a, b) {
  const ab = sub(b, a); const l2 = dot(ab, ab);
  let t = l2 ? dot(sub(p, a), ab) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const q = add(a, mul(ab, t));
  return { d: dist(p, q), t, q };
}

export function footOnLine(p, a, b) {
  const ab = sub(b, a); const l2 = dot(ab, ab) || 1;
  const t = dot(sub(p, a), ab) / l2;
  return { q: add(a, mul(ab, t)), t };
}

export function pointInPoly(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export function pointInRings(p, rings) {
  let c = 0; for (const r of rings) if (pointInPoly(p, r)) c++;
  return c % 2 === 1;
}

export function polyArea(pts) {
  let s = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += (pts[j].x * pts[i].y - pts[i].x * pts[j].y);
  return s / 2;
}

export function circle3(p1, p2, p3) {
  const ax = p1.x, ay = p1.y, bx = p2.x, by = p2.y, cx = p3.x, cy = p3.y;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-9) return null;
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  const c = { x: ux, y: uy };
  return { c, r: dist(c, p1) };
}

export function arcPts(c, r, a0, a1, segs) {
  const span = normAng(a1 - a0) || TAU;
  const n = segs || Math.max(8, Math.ceil(span / TAU * 72));
  const out = [];
  for (let i = 0; i <= n; i++) out.push(polar(c, r, a0 + span * i / n));
  return out;
}

export function bboxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; }
  return { x0, y0, x1, y1 };
}
export function bboxUnion(a, b) {
  if (!a) return b; if (!b) return a;
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}
export function bboxHit(b, p, tol) { return p.x >= b.x0 - tol && p.x <= b.x1 + tol && p.y >= b.y0 - tol && p.y <= b.y1 + tol; }
export function bboxInside(b, r) { return b.x0 >= r.x0 && b.x1 <= r.x1 && b.y0 >= r.y0 && b.y1 <= r.y1; }
export function bboxOverlap(a, b) { return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0; }

// Segment schneidet Rechteck?
export function segHitsRect(a, b, r) {
  const inR = (p) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
  if (inR(a) || inR(b)) return true;
  const c = [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }];
  for (let i = 0; i < 4; i++) if (segSegInt(a, b, c[i], c[(i + 1) % 4])) return true;
  return false;
}

// Versatz einer Polylinie (d>0 = links in Laufrichtung)
export function offsetPolyline(pts, closed, d) {
  const n = pts.length;
  if (n < 2) return pts.slice();
  const segs = [];
  const m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const nn = mul(perp(norm(sub(b, a))), d);
    segs.push([add(a, nn), add(b, nn)]);
  }
  const out = [];
  if (!closed) out.push(segs[0][0]);
  for (let i = closed ? 0 : 1; i < segs.length + (closed ? 0 : 0); i++) {
    const prev = segs[(i - 1 + segs.length) % segs.length], cur = segs[i];
    const I = segSegInt(prev[0], prev[1], cur[0], cur[1], true);
    out.push(I ? { x: I.x, y: I.y } : cur[0]);
  }
  if (!closed) out.push(segs[segs.length - 1][1]);
  return out;
}

// Segment auf Ringe (gerade/ungerade) zuschneiden
export function clipSegToRings(a, b, rings) {
  const ts = [0, 1];
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const I = segSegInt(a, b, r[j], r[i]);
      if (I) ts.push(I.t);
    }
  }
  ts.sort((x, y) => x - y);
  const out = [];
  for (let i = 0; i < ts.length - 1; i++) {
    const t0 = ts[i], t1 = ts[i + 1];
    if (t1 - t0 < 1e-9) continue;
    const m = lerp(a, b, (t0 + t1) / 2);
    if (pointInRings(m, rings)) out.push([lerp(a, b, t0), lerp(a, b, t1)]);
  }
  // benachbarte zusammenfassen
  const merged = [];
  for (const s of out) {
    const last = merged[merged.length - 1];
    if (last && dist(last[1], s[0]) < 1e-9) last[1] = s[1]; else merged.push(s);
  }
  return merged;
}

// Fläche um Punkt p aus Segmenten finden (für Schraffur per Klick)
export function findFace(segs, p) {
  const n = segs.length;
  if (n > 4000) return null;
  const cuts = segs.map(() => [0, 1]);
  const bbs = segs.map(([a, b]) => ({ x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) }));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (!bboxOverlap(bbs[i], bbs[j])) continue;
    const I = segSegInt(segs[i][0], segs[i][1], segs[j][0], segs[j][1]);
    if (I) { cuts[i].push(I.t); cuts[j].push(I.u); }
  }
  const key = (q) => Math.round(q.x * 1000) + ',' + Math.round(q.y * 1000);
  const nodes = new Map();
  const node = (q) => { const k = key(q); let nd = nodes.get(k); if (!nd) { nd = { k, p: { x: q.x, y: q.y }, adj: new Set() }; nodes.set(k, nd); } return nd; };
  for (let i = 0; i < n; i++) {
    const ts = [...new Set(cuts[i].map((t) => Math.min(1, Math.max(0, t))))].sort((a, b) => a - b);
    for (let k = 0; k < ts.length - 1; k++) {
      const n0 = node(lerp(segs[i][0], segs[i][1], ts[k])), n1 = node(lerp(segs[i][0], segs[i][1], ts[k + 1]));
      if (n0 !== n1) { n0.adj.add(n1.k); n1.adj.add(n0.k); }
    }
  }
  // lose Enden entfernen
  let changed = true;
  while (changed) {
    changed = false;
    for (const nd of nodes.values()) {
      if (nd.adj.size <= 1) {
        for (const k of nd.adj) nodes.get(k)?.adj.delete(nd.k);
        nodes.delete(nd.k); changed = true;
      }
    }
  }
  if (!nodes.size) return null;
  // Komponenten
  const comp = new Map(); let cid = 0;
  for (const nd of nodes.values()) {
    if (comp.has(nd.k)) continue;
    const st = [nd.k]; comp.set(nd.k, cid);
    while (st.length) { const k = st.pop(); for (const a of nodes.get(k).adj) if (!comp.has(a)) { comp.set(a, cid); st.push(a); } }
    cid++;
  }
  // sortierte Nachbarn
  const sorted = new Map();
  for (const nd of nodes.values()) {
    const arr = [...nd.adj].map((k) => ({ k, a: Math.atan2(nodes.get(k).p.y - nd.p.y, nodes.get(k).p.x - nd.p.x) }));
    arr.sort((x, y) => x.a - y.a);
    sorted.set(nd.k, arr);
  }
  const visited = new Set();
  const faces = [];
  for (const nd of nodes.values()) {
    for (const nb of sorted.get(nd.k)) {
      const ek = nd.k + '>' + nb.k;
      if (visited.has(ek)) continue;
      const ring = []; let u = nd.k, v = nb.k; let guard = 0;
      while (!visited.has(u + '>' + v) && guard++ < 100000) {
        visited.add(u + '>' + v);
        ring.push(nodes.get(u).p);
        const arr = sorted.get(v);
        const back = Math.atan2(nodes.get(u).p.y - nodes.get(v).p.y, nodes.get(u).p.x - nodes.get(v).p.x);
        // nächste Kante im Uhrzeigersinn ab Rückrichtung
        let best = null;
        for (let i = arr.length - 1; i >= 0; i--) if (arr[i].a < back - 1e-12) { best = arr[i]; break; }
        if (!best) best = arr[arr.length - 1];
        u = v; v = best.k;
      }
      faces.push({ ring, area: polyArea(ring), comp: comp.get(nd.k) });
    }
  }
  let best = null;
  for (const f of faces) {
    if (f.area <= 1e-9) continue;
    if (!pointInPoly(p, f.ring)) continue;
    if (!best || f.area < best.area) best = f;
  }
  if (!best) return null;
  // Inseln als Löcher
  const holes = [];
  for (const f of faces) {
    if (f.comp === best.comp || f.area >= 0) continue;
    if (Math.abs(f.area) >= best.area) continue;
    if (pointInPoly(f.ring[0], best.ring) && !pointInPoly(p, f.ring)) holes.push(f.ring.slice().reverse());
  }
  return { pts: best.ring, holes };
}

// einfacher Zufall mit Seed (für Muster)
export function hash2(i, j, s = 0) {
  let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
