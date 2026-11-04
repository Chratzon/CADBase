// ============================================================
// UNTERLAGEN – PDF-Pläne und Bilder als maßstäbliche Zeichengrundlage
// (Aufmaß: Wände usw. auf dem eingelesenen Plan nachzeichnen)
// ============================================================
import * as G from './geom.js';
import { state, nid, fmtNum } from './model.js';
import { Tool, PlaceTool } from './tools.js';

// ---------- Bildspeicher (IndexedDB, bleibt nur in diesem Browser) ----------
const DBN = 'cadbase-img', ST = 'img';
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    try { const r = indexedDB.open(DBN, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }
    catch (err) { rej(err); }
  });
  return dbp;
}
export async function putImg(id, blob) { const d = await db(); return new Promise((res, rej) => { const tx = d.transaction(ST, 'readwrite'); tx.objectStore(ST).put(blob, id); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
export async function getImg(id) { const d = await db(); return new Promise((res, rej) => { const rq = d.transaction(ST).objectStore(ST).get(id); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => rej(rq.error); }); }

const cache = new Map();
let onLoaded = () => {};
export function setOnLoaded(f) { onLoaded = f; }
async function decode(blob) {
  if (window.createImageBitmap) { try { return await createImageBitmap(blob); } catch {} }
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(blob); });
}
export function imageFor(id) {
  let c = cache.get(id);
  if (!c) {
    c = { state: 'loading' }; cache.set(id, c);
    getImg(id).then(async (blob) => {
      if (!blob) { c.state = 'missing'; onLoaded(); return; }
      c.blob = blob; c.img = await decode(blob); c.state = 'ok'; onLoaded();
    }).catch(() => { c.state = 'missing'; onLoaded(); });
  }
  return c;
}
const blobToDataURL = (blob) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
export async function dataURLFor(id) { const c = cache.get(id); const blob = c?.blob || await getImg(id); return blob ? blobToDataURL(blob) : null; }
// für Druck/SVG: Bilddaten aller sichtbaren Unterlagen
export async function imageDataMap(ents) {
  const map = {};
  for (const e of ents) if (e.type === 'image' && !map[e.img]) { const u = await dataURLFor(e.img); if (u) map[e.img] = u; }
  return map;
}
// JSON-Export: Bilder einbetten / beim Laden wiederherstellen
export async function embedImages(doc) { const m = await imageDataMap(doc.ents); return Object.keys(m).length ? Object.assign({}, doc, { _images: m }) : doc; }
export async function restoreImages(doc) {
  if (!doc._images) return doc;
  for (const [id, url] of Object.entries(doc._images)) { const blob = await (await fetch(url)).blob(); await putImg(id, blob); cache.delete(id); }
  delete doc._images; return doc;
}

// ---------- Geometrie ----------
export function imgCorners(e) {
  const a = G.rad(e.rot || 0), c = Math.cos(a), s = Math.sin(a);
  return [[0, 0], [e.w, 0], [e.w, e.h], [0, e.h]].map(([x, y]) => ({ x: e.p.x + x * c - y * s, y: e.p.y + x * s + y * c }));
}

// ---------- PDF ----------
let lib = null;
const base = new URL('./vendor/pdfjs/', import.meta.url).href;
async function pdfjs() {
  if (!lib) { lib = await import('./vendor/pdfjs/pdf.min.mjs'); lib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs'; }
  return lib;
}
export async function openPdf(buf) {
  const L = await pdfjs();
  return L.getDocument({ data: buf, standardFontDataUrl: base + 'standard_fonts/', wasmUrl: base + 'wasm/', iccUrl: base + 'iccs/', isEvalSupported: false, enableXfa: false }).promise;
}
async function renderToCanvas(page, scale) {
  const vp = page.getViewport({ scale });
  const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.floor(vp.width)); cv.height = Math.max(1, Math.floor(vp.height));
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  await page.render({ canvas: cv, canvasContext: ctx, viewport: vp }).promise;
  return cv;
}
export async function pageInfo(pdf, no) { const page = await pdf.getPage(no); const vp = page.getViewport({ scale: 1 }); return { page, wMM: vp.width * 25.4 / 72, hMM: vp.height * 25.4 / 72, wPt: vp.width, hPt: vp.height }; }
export async function pageThumb(pdf, no, maxW = 520) { const { page, wPt } = await pageInfo(pdf, no); const cv = await renderToCanvas(page, maxW / wPt); return cv.toDataURL('image/jpeg', 0.8); }
export async function renderPage(pdf, no, maxPx) {
  const { page, wPt, hPt, wMM, hMM } = await pageInfo(pdf, no);
  const scale = Math.min(Math.sqrt(maxPx / (wPt * hPt)), 400 / 72);
  const cv = await renderToCanvas(page, scale);
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  return { blob, pxW: cv.width, pxH: cv.height, wMM, hMM, dpi: Math.round(scale * 72) };
}

// ---------- Bedienung ----------
let C = null; // Kontext aus main.js
export function initUnderlay(ctx) { C = ctx; setOnLoaded(() => C.app.render()); }

export function ensureLayer() {
  let L = state.doc.layers.find((l) => l.name === 'Unterlage');
  if (!L) { L = { id: 'Lu' + Date.now().toString(36), name: 'Unterlage', color: '#7a7a7a', lw: 0.13, lt: 'solid', vis: true, lock: false, print: true }; state.doc.layers.unshift(L); }
  return L.id;
}

const SCALES = [1, 5, 10, 20, 25, 50, 75, 100, 200, 250, 500, 1000];
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function importFile(file) {
  if (!file) return;
  const isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
  const prefs = C.getPref('ul.params', { sc: 100, q: 12 });
  try {
    if (isPdf) {
      C.toast('PDF wird gelesen …');
      const pdf = await openPdf(await file.arrayBuffer());
      const n = pdf.numPages;
      let curPage = 1;
      const info1 = await pageInfo(pdf, 1);
      const html = `
        <div class="ulprev"><img id="ulThumb" alt="Vorschau"><div id="ulInfo" class="hint"></div></div>
        <div class="row3">
          <label>Seite<select id="ulPage">${Array.from({ length: n }, (_, i) => `<option value="${i + 1}">${i + 1} von ${n}</option>`).join('')}</select></label>
          <label>Planmaßstab 1:<input id="ulSc" name="ulSc" list="ulScales" value="${prefs.sc}" inputmode="decimal"><datalist id="ulScales">${SCALES.map((s) => `<option value="${s}">`).join('')}</datalist></label>
          <label>Qualität<select id="ulQ" name="ulQ"><option value="6" ${prefs.q === 6 ? 'selected' : ''}>Handy (6 MP)</option><option value="12" ${prefs.q === 12 ? 'selected' : ''}>Standard (12 MP)</option><option value="24" ${prefs.q === 24 ? 'selected' : ''}>Hoch (24 MP, PC)</option></select></label>
        </div>
        <p class="hint">Der Maßstab steht meist im Plankopf. Falls unsicher: trotzdem einfügen und danach mit „Plan kalibrieren" an einem bekannten Maß exakt einstellen.</p>`;
      const r = await C.dialog(`PDF-Plan einlesen – ${esc(file.name)}`, html, [{ t: 'Abbrechen' }, { t: 'Einlesen', v: 1, primary: true }], (body) => {
        const show = async () => {
          const no = +body.querySelector('#ulPage').value; curPage = no;
          const inf = no === 1 ? info1 : await pageInfo(pdf, no);
          body.querySelector('#ulInfo').textContent = `Blatt ${fmtNum(inf.wMM, 0)} × ${fmtNum(inf.hMM, 0)} mm`;
          body.querySelector('#ulThumb').src = await pageThumb(pdf, no);
        };
        body.querySelector('#ulPage').addEventListener('change', show); show();
      });
      if (!r) return;
      const sc = parseFloat(String(r.data.ulSc ?? prefs.sc).replace(',', '.')) || 100;
      const q = +(r.data.ulQ ?? 12) || 12;
      C.setPref('ul.params', { sc, q });
      C.toast('Plan wird aufbereitet …');
      const res = await renderPage(pdf, curPage, q * 1e6);
      const id = 'img' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await putImg(id, res.blob);
      place({ id: nid(), type: 'image', img: id, p: { x: 0, y: 0 }, w: res.wMM * sc, h: res.hMM * sc, rot: 0, op: 0.6, name: `${file.name} S. ${curPage}`, pxW: res.pxW, pxH: res.pxH, paperW: res.wMM, planSc: sc });
      C.toast(`Plan eingelesen (${res.dpi} dpi) – Einfügepunkt wählen (unten links)`);
    } else {
      const blob = file.slice ? file : new Blob([file]);
      const bm = await decode(blob);
      const html = `<label class="full">Breite des Bildes in der Natur (m)<input id="ulW" name="ulW" value="10" inputmode="decimal"></label><p class="hint">Grober Wert genügt – danach mit „Plan kalibrieren" exakt einstellen.</p>`;
      const r = await C.dialog(`Bild einlesen – ${esc(file.name)}`, html, [{ t: 'Abbrechen' }, { t: 'Einlesen', v: 1, primary: true }]);
      if (!r) return;
      const wm = parseFloat(String(r.data.ulW || 10).replace(',', '.')) || 10;
      const id = 'img' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await putImg(id, blob);
      const w = wm * 1000, h = w * bm.height / bm.width;
      place({ id: nid(), type: 'image', img: id, p: { x: 0, y: 0 }, w, h, rot: 0, op: 0.6, name: file.name, pxW: bm.width, pxH: bm.height });
      C.toast('Bild eingelesen – Einfügepunkt wählen (unten links)');
    }
  } catch (err) {
    console.error(err);
    C.toast('Datei konnte nicht gelesen werden: ' + (err?.message || err));
  }
}
function place(ent) {
  ent.layer = ensureLayer();
  C.setTool(new PlaceTool(C.app, [ent], 'Plan'));
  C.refreshPanels();
}

// ---------- Kalibrieren ----------
export class CalibTool extends Tool {
  constructor(app) {
    super(app);
    const imgs = state.doc.ents.filter((e) => e.type === 'image');
    const sel = imgs.filter((e) => app.sel.has(e.id));
    this.img = sel[0] || (imgs.length === 1 ? imgs[0] : null);
  }
  msg() {
    if (!this.img) return 'Plan kalibrieren: zuerst den Plan anklicken';
    return ['Plan kalibrieren: Anfang eines bekannten Maßes antippen (z. B. Bemaßung oder Achse im Plan)', 'Ende des bekannten Maßes antippen'][this.pts.length] || '';
  }
  rawClick() { return true; }
  async click(p) {
    if (!this.img) {
      const hit = this.app.pick(p, (e) => e.type === 'image') || state.doc.ents.find((e) => e.type === 'image' && G.pointInPoly(p, imgCorners(e)));
      if (hit) { this.img = hit; this.update(); } else C.toast('Kein Plan an dieser Stelle');
      return;
    }
    this.pts.push(p); this.update();
    if (this.pts.length < 2) return;
    const [a, b] = this.pts; this.pts = [];
    const meas = G.dist(a, b);
    if (meas < 1e-6) return this.update();
    const ang = G.deg(G.ang(a, b)); const snap = Math.round(ang / 90) * 90;
    const r = await C.dialog('Plan kalibrieren', `
      <p>Gemessen im Plan: <b>${fmtNum(meas, 1)} mm</b> (Winkel ${fmtNum(((ang % 360) + 360) % 360, 1)}°)</p>
      <label class="full">Tatsächliches Maß in mm<input id="clReal" name="clReal" value="${Math.round(meas)}" inputmode="decimal"></label>
      <label class="chk"><input type="checkbox" id="clAlign" name="clAlign" ${Math.abs(ang - snap) > 0.05 && Math.abs(ang - snap) < 15 ? 'checked' : ''}> Strecke exakt ${snap % 180 === 0 ? 'waagerecht' : 'senkrecht'} ausrichten (Plan um ${fmtNum(snap - ang, 2)}° drehen)</label>`,
    [{ t: 'Abbrechen' }, { t: 'Übernehmen', v: 1, primary: true }]);
    if (!r) return this.update();
    const real = parseFloat(String(r.data.clReal ?? '').replace(',', '.'));
    const align = !!r.data.clAlign;
    const e = state.doc.ents.find((x) => x.id === this.img.id) || this.img;
    if (real > 0) {
      const f = real / meas;
      e.p = G.add(a, G.mul(G.sub(e.p, a), f)); e.w *= f; e.h *= f;
      if (e.paperW) e.planSc = e.w / e.paperW;
    }
    if (align && Math.abs(snap - ang) > 1e-6) { const d = G.rad(snap - ang); e.p = G.rot(e.p, a, d); e.rot = ((e.rot || 0) + G.deg(d)) % 360; }
    this.app.commit();
    C.toast(`Plan kalibriert${e.planSc ? ` – entspricht ca. 1:${fmtNum(e.planSc, 1)}` : ''}. Maße jetzt im Plan nachmessbar.`);
    this.app.setTool('select');
  }
  preview(B) { if (this.pts.length === 1 && this.cur) B.stroke([this.pts[0], this.cur], false, { color: '#e8590c', lw: 0.35, dash: [] }); }
}

// ---------- Eigenschaften ----------
export function propsHtml(ents, common, row) {
  const e0 = ents[0]; const one = ents.length === 1;
  let h = `<div class="psec">Unterlage</div>`;
  if (one) h += `<div class="pinfo">${esc(e0.name || 'Plan')}<br>${fmtNum(e0.w / 1000, 2)} × ${fmtNum(e0.h / 1000, 2)} m in der Natur${e0.planSc ? ` · ca. 1:${fmtNum(e0.planSc, 1)}` : ''}${e0.pxW ? ` · ${e0.pxW} × ${e0.pxH} px` : ''}</div>`;
  const op = common('op') ?? 0.6;
  h += row('Deckkraft', `<select data-k="op" data-num="1">${[0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1].map((v) => `<option value="${v}" ${Math.abs(v - op) < 0.01 ? 'selected' : ''}>${Math.round(v * 100)} %</option>`).join('')}</select>`);
  h += row('Drehung °', `<input data-k="rot" data-num="1" value="${String(Math.round((common('rot') || 0) * 100) / 100).replace('.', ',')}" inputmode="decimal">`);
  h += `<div class="pbtns"><button data-act="ulCalib" class="primary">Plan kalibrieren</button><button data-act="ulLock">Unterlage sperren</button></div>`;
  h += `<p class="hint">Gesperrt lässt sich auf dem Plan zeichnen, ohne ihn versehentlich zu verschieben. Entsperren über den Reiter Layer.</p>`;
  return h;
}
export function propAction(act) {
  if (act === 'ulCalib') C.setTool('calib');
  if (act === 'ulLock') { const L = state.doc.layers.find((l) => l.name === 'Unterlage'); if (L) { L.lock = true; C.app.sel.clear(); C.app.commit(); C.refreshPanels(); C.toast('Unterlage gesperrt'); } }
}
