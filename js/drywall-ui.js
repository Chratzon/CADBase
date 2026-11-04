// ============================================================
// TROCKENBAU-MODUL (Test) – Bedienung: Werkzeug, Eigenschaften, Massen-Dialog
// ============================================================
import * as G from './geom.js';
import { state, fmtNum } from './model.js';
import { emit } from './render.js';
import { Tool, PlaceTool } from './tools.js';
import { download } from './export.js';
import * as DW from './drywall.js';

let C = null; // Kontext aus main.js
export function initDrywall(ctx) { C = ctx; }

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const walls = () => state.doc.ents.filter((e) => e.type === 'wall');
const num = (v) => String(v).replace('.', ',');

// System-Auswahl gruppiert nach Kategorie
function sysOptions(cur, withVaries) {
  const cats = {};
  for (const [k, s] of Object.entries(DW.SYSTEMS)) (cats[s.cat] = cats[s.cat] || []).push([k, s]);
  return (withVaries ? '<option value="">– verschieden –</option>' : '') + Object.entries(cats).map(([c, list]) => `<optgroup label="${esc(c)}">${list.map(([k, s]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</optgroup>`).join('');
}

export function newWall(a, b, o) {
  const n = walls().length + 1;
  const w = { type: 'wall', a: G.clone(a), b: G.clone(b), endA: true, endB: true, label: true, name: 'Wand ' + n };
  DW.applySystem(w, o.sys);
  // aktuelle Werte aus der Leiste übernehmen
  for (const k of ['prof', 'achs', 'board', 't', 'h', 'ins', 'just', 'gap']) if (o[k] !== undefined) w[k] = o[k];
  const S = DW.SYSTEMS[o.sys];
  if (o.layers) { if (S.sides === 2) { w.nA = +o.layers; w.nB = +o.layers; } else { w.nA = 0; w.nB = +o.layers; } }
  return w;
}

// ---------- Werkzeug: Wände im Zug mit Eckverbindung ----------
export class WallTool extends Tool {
  constructor(app) { super(app); this.chain = []; }
  msg() {
    const o = this.app.opts.wall;
    if (this.pts.length) return `Nächster Wandpunkt – Länge tippen möglich · Ecken werden verschnitten · auf Startpunkt = schließen · Enter = fertig`;
    return `Wand ${o.sys} (${DW.profLabel(o.sys, o.prof)}, h = ${fmtNum(+o.h, 0)} mm): Startpunkt wählen – Bezug ${o.just === 'M' ? 'Wandachse' : o.just === 'A' ? 'Seite A (Rückseite/Grundwand)' : 'Seite B'}`;
  }
  click(p) {
    if (this.pts.length) {
      if (G.dist(this.base, p) < 50) return;
      const first = this.chain[0];
      const closing = first && this.chain.length >= 2 && G.dist(p, first.a) < this.app.tol();
      const end = closing ? G.clone(first.a) : G.clone(p);
      const w = this.app.addEnts([Object.assign(newWall(this.base, end, this.app.opts.wall), { layer: this.app.layerFor('L0') })])[0];
      const prev = this.chain[this.chain.length - 1];
      if (prev) { prev.jB = { id: w.id, role: 'through' }; w.jA = { id: prev.id, role: 'butt' }; }
      this.chain.push(w);
      if (closing) { w.jB = { id: first.id, role: 'through' }; first.jA = { id: w.id, role: 'butt' }; this.app.commit(); return this.finish(); }
      this.app.commit();
    }
    this.pts.push(p); this.update();
  }
  finish() { this.pts = []; this.chain = []; this.update(); }
  preview(B, sc) {
    if (!this.base || !this.cur || G.dist(this.base, this.cur) < 1) return;
    emit(Object.assign(newWall(this.base, this.cur, this.app.opts.wall), { id: '_tmp', layer: state.doc.cur }), B, sc);
  }
  chips() {
    const c = [];
    if (this.chain.length >= 2) c.push({ t: 'Schließen', f: () => this.click(G.clone(this.chain[0].a)) });
    if (this.pts.length) c.push({ t: 'Fertig', f: () => this.finish(), main: true });
    return c;
  }
  enter() { if (this.pts.length) this.finish(); else super.enter(); }
  esc() { if (this.pts.length) this.finish(); else super.esc(); }
}

// verbundene Nachbarwand beim Ziehen eines Eckpunkts mitführen
export function moveJoint(e, end, q) {
  const j = end === 'a' ? e.jA : e.jB; if (!j) return;
  const o = walls().find((x) => x.id === j.id); if (!o) return;
  if (o.jA?.id === e.id) o.a = G.clone(q); else if (o.jB?.id === e.id) o.b = G.clone(q);
}

// ---------- Optionsleiste ----------
const selO = (name, opts, cur) => `<select data-o="${name}">${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
export function optbarHtml(o) {
  const S = DW.SYSTEMS[o.sys] || DW.SYSTEMS.W112;
  const B = DW.BOARDS[o.board] || DW.BOARDS.GKB;
  const profs = DW.profilesFor(o.sys);
  return `<label class="ob">System <select data-o="w.sys">${sysOptions(o.sys)}</select></label>
    ${profs.length > 1 ? `<label class="ob">Profil ${selO('w.prof', profs.map((p) => [p, DW.profLabel(o.sys, p)]), o.prof)}</label>` : ''}
    ${S.stud !== 'NONE' ? `<label class="ob">${S.stud === 'RIEGEL' ? 'Riegelabst.' : 'Achsabst.'} ${selO('w.achs', [[1000, '1000'], [625, '625'], [417, '417'], [312.5, '312,5']].filter(([v]) => S.stud === 'RIEGEL' ? v <= 625 : (v < 1000 || S.cat.startsWith('Schacht'))), o.achs)}</label>` : ''}
    <label class="ob">Platte ${selO('w.board', Object.entries(DW.BOARDS).map(([k, b]) => [k, k]), o.board)}</label>
    <label class="ob">d ${selO('w.t', B.t.map((t) => [t, num(t)]), o.t)}</label>
    <label class="ob">Lagen ${selO('w.layers', [1, 2, 3].map((n) => [n, S.sides === 2 ? n + ' je Seite' : String(n)]), o.layers || S.layers)}</label>
    <label class="ob">Höhe <input data-o="w.h" value="${o.h}" size="5" inputmode="decimal"></label>
    ${S.stud !== 'NONE' ? `<label class="ob">Dämmung ${selO('w.ins', [[0, 'ohne'], [20, '20'], [30, '30'], [40, '40'], [60, '60'], [80, '80'], [100, '100']], o.ins)}</label>` : ''}
    ${S.gapLabel ? `<label class="ob">${S.gapLabel.split(' ')[0]} <input data-o="w.gap" value="${num(o.gap)}" size="4" inputmode="decimal"></label>` : ''}
    <label class="ob">Bezug ${selO('w.just', [['M', 'Achse'], ['A', 'Seite A'], ['B', 'Seite B']], o.just)}</label>`;
}
export function optbarChange(o, kk, v) {
  if (kk === 'sys') { const S = DW.SYSTEMS[v]; Object.assign(o, S.def, { sys: v, layers: S.layers }); return 'rerender'; }
  o[kk] = ['prof', 'achs', 't', 'h', 'ins', 'gap', 'layers'].includes(kk) ? (parseFloat(String(v).replace(',', '.')) || (kk === 'ins' || kk === 'gap' ? 0 : o[kk])) : v;
  if (kk === 'board') { const B = DW.BOARDS[v]; if (!B.t.includes(+o.t)) o.t = B.t[0]; return 'rerender'; }
}

// ---------- Eigenschaften ----------
export function propsHtml(ents, common, row) {
  const e0 = ents[0]; const one = ents.length === 1;
  const sys = common('sys'); const S = DW.SYSTEMS[sys];
  const sv = (k, opts, isNum) => `<select data-k="${k}" ${isNum ? 'data-num="1"' : ''}>${common(k) === undefined ? '<option value="">– verschieden –</option>' : ''}${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(common(k)) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  let h = `<div class="psec">Trockenbauwand (Test)</div>`;
  if (one) h += row('Bezeichnung', `<input data-k="name" value="${esc(e0.name)}">`);
  h += row('System', `<select data-k="sys">${sysOptions(sys, sys === undefined)}</select>`);
  if (S) {
    const profs = DW.profilesFor(sys);
    if (profs.length > 1) h += row('Profil', sv('prof', profs.map((p) => [p, DW.profLabel(sys, p)]), true));
    if (S.stud !== 'NONE') h += row(S.stud === 'RIEGEL' ? 'Riegelabstand' : 'Achsabstand', sv('achs', [[1000, '1000 mm'], [625, '625 mm'], [417, '417 mm'], [312.5, '312,5 mm']], true));
    h += row('Platte', sv('board', Object.entries(DW.BOARDS).map(([k, b]) => [k, b.label])));
    const B = DW.BOARDS[common('board')] || DW.BOARDS.GKB;
    h += row('Plattendicke', sv('t', B.t.map((t) => [t, num(t) + ' mm']), true));
    if (S.sides === 2) h += row('Lagen Seite A', sv('nA', [[0, '0'], [1, '1'], [2, '2'], [3, '3']], true));
    h += row(S.sides === 2 ? 'Lagen Seite B' : 'Lagen (Raumseite)', sv('nB', [[1, '1'], [2, '2'], [3, '3']], true));
    if (S.stud !== 'NONE') h += row('Dämmung', sv('ins', [[0, 'ohne'], [20, '20 mm'], [30, '30 mm'], [40, '40 mm'], [60, '60 mm'], [80, '80 mm'], [100, '100 mm']], true));
    if (S.gapLabel) h += row(S.gapLabel + ' (mm)', `<input data-k="gap" data-num="1" value="${common('gap') ?? ''}" inputmode="decimal">`);
  }
  h += row('Wandhöhe (mm)', `<input data-k="h" data-num="1" value="${common('h') ?? ''}" inputmode="decimal">`);
  h += row('Bezugslinie', sv('just', [['M', 'Wandachse'], ['A', 'Außenkante Seite A'], ['B', 'Außenkante Seite B']]));
  h += row('Anschluss Anfang', `<input type="checkbox" data-k="endA" ${common('endA') !== false ? 'checked' : ''}>`);
  h += row('Anschluss Ende', `<input type="checkbox" data-k="endB" ${common('endB') !== false ? 'checked' : ''}>`);
  h += row('Seiten tauschen', `<input type="checkbox" data-k="flip" ${common('flip') ? 'checked' : ''}>`);
  h += row('Beschriftung', `<input type="checkbox" data-k="label" ${common('label') !== false ? 'checked' : ''}>`);
  if (one) {
    const q = DW.wallTakeoff(e0);
    const j = [e0.jA ? 'Anfang' : '', e0.jB ? 'Ende' : ''].filter(Boolean).join(' + ');
    h += `<div class="pinfo">Länge ${fmtNum(q.len, 0)} mm · Höhe ${fmtNum(q.h, 0)} mm · Fläche ${fmtNum(q.area, 2)} m² · Dicke ${fmtNum(q.d, 1)} mm${j ? `<br>Eckverbindung: ${j}` : ''}</div>`;
    if (q.warn.length) h += `<div class="pinfo warn">⚠ ${q.warn.map(esc).join('<br>⚠ ')}</div>`;
    const sides = S && S.sides === 2 ? ['A', 'B'] : ['B'];
    h += `<div class="pbtns">${sides.map((s) => `<button data-act="dwElev${s}">Ansicht Seite ${s}</button>`).join('')}${e0.jA || e0.jB ? '<button data-act="dwUnjoin">Ecke lösen</button>' : ''}</div>`;
  }
  h += `<div class="pbtns"><button data-act="dwMass" class="primary">Massenermittlung</button></div>`;
  return h;
}
export function propChanged(e, k, v) {
  if (k === 'sys' && DW.SYSTEMS[v]) { const keep = { h: e.h, just: e.just }; DW.applySystem(e, v); Object.assign(e, keep); return true; }
  if (k === 'board') { const B = DW.BOARDS[v]; if (B && !B.t.includes(+e.t)) e.t = B.t[0]; }
  return false;
}
export function propAction(act, ents) {
  if (act === 'dwElevA' || act === 'dwElevB') {
    const w = ents.find((e) => e.type === 'wall'); if (!w) return;
    const side = act.slice(-1);
    C.setTool(new PlaceTool(C.app, DW.elevationEnts(w, side, C.app.layerFor), `Ansicht ${w.name} Seite ${side}`));
    C.toast('Wandansicht hängt am Cursor – Einfügepunkt wählen');
  }
  if (act === 'dwUnjoin') {
    for (const w of ents.filter((e) => e.type === 'wall')) {
      for (const k of ['jA', 'jB']) if (w[k]) { const o = walls().find((x) => x.id === w[k].id); if (o) { if (o.jA?.id === w.id) delete o.jA; if (o.jB?.id === w.id) delete o.jB; } delete w[k]; }
    }
    C.app.commit();
  }
  if (act === 'dwMass') massDialog(ents.filter((e) => e.type === 'wall'));
}

// ---------- Massenermittlung ----------
export async function massDialog(selWalls) {
  const all = walls();
  if (!all.length) return C.toast('Noch keine Trockenbauwand gezeichnet (Werkzeug „Wand", Taste W)');
  let list = selWalls && selWalls.length ? selWalls : all;
  const P = Object.assign({ zuschlag: 5, strip: true, tfBoden: true, kgJoint: 0.25, kgArea: 0.15 }, C.getPref('dw.params', {}));
  const render = (body) => {
    const res = DW.takeoffAll(list, P);
    const warns = res.per.flatMap(({ w, q }) => q.warn.map((x) => `${w.name}: ${x}`));
    body.querySelector('#dwOut').innerHTML = `
      <table class="mtab"><thead><tr><th>Wand</th><th>System</th><th class="r">Länge</th><th class="r">Höhe</th><th class="r">m²</th></tr></thead><tbody>
      ${res.per.map(({ w, q }) => `<tr><td>${esc(w.name)}</td><td>${w.sys} · ${DW.profLabel(w.sys, w.prof)} · ${DW.SYSTEMS[w.sys]?.sides === 2 ? w.nA + '+' + w.nB : w.nB}× ${w.board} ${num(w.t)}</td><td class="r">${fmtNum(q.len / 1000, 2)} m</td><td class="r">${fmtNum(q.h / 1000, 2)} m</td><td class="r">${fmtNum(q.area, 2)}</td></tr>`).join('')}
      <tr class="sum"><td colspan="4">Summe Wandfläche</td><td class="r">${fmtNum(res.area, 2)}</td></tr></tbody></table>
      ${warns.length ? `<div class="pinfo warn">⚠ ${warns.map(esc).join('<br>⚠ ')}</div>` : ''}
      <table class="mtab"><thead><tr><th>Pos.</th><th>Material</th><th class="r">Menge</th><th>Einh.</th><th>Hinweis</th></tr></thead><tbody>
      ${res.rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.label)}</td><td class="r"><b>${DW.fmtQty(r)}</b></td><td>${r.unit}</td><td class="hint">${esc(r.note || '')}</td></tr>`).join('')}
      </tbody></table>`;
    return res;
  };
  let res = null;
  const html = `
    <div class="row3">
      <label>Umfang<select id="dwScope"><option value="all">Alle Wände (${all.length})</option>${selWalls && selWalls.length && selWalls.length < all.length ? `<option value="sel" selected>Auswahl (${selWalls.length})</option>` : ''}</select></label>
      <label>Zuschlag Verbrauchsmaterial %<input id="dwZ" value="${P.zuschlag}" inputmode="decimal"></label>
      <label>Spachtel kg je m Fuge<input id="dwKg" value="${num(P.kgJoint)}" inputmode="decimal"></label>
    </div>
    <label class="chk"><input type="checkbox" id="dwStrip" ${P.strip ? 'checked' : ''}> Fugendeckstreifen / Glasfaserbewehrung ansetzen</label>
    <label class="chk"><input type="checkbox" id="dwTf" ${P.tfBoden ? 'checked' : ''}> Trenn-Fix auch am Bodenanschluss</label>
    <div id="dwOut"></div>
    <p class="hint">Rechenwerte nach Knauf-Detailblättern W11/W61/W62: Ständer je Achsabstand + Endständer bzw. Riegel, Platten nach Format mit versetzten Stößen, Schrauben je Lage nach Schraubabstand, Randbefestigung je System, verschnittene Ecken mit Eckschutz. Ohne Öffnungen und T-Anschlüsse. Spachtel ist ein Schätzwert. Vor Bestellung prüfen.</p>`;
  const r = await C.dialog('Massenermittlung Trockenbau (Test)', html, [{ t: 'Schließen' }, { t: 'CSV / Excel', v: 'csv' }, { t: 'Als Tabelle in Zeichnung', v: 'tab', primary: true }], (body) => {
    const upd = () => {
      P.zuschlag = parseFloat(body.querySelector('#dwZ').value.replace(',', '.')) || 0;
      P.kgJoint = parseFloat(body.querySelector('#dwKg').value.replace(',', '.')) || 0.25;
      P.strip = body.querySelector('#dwStrip').checked; P.tfBoden = body.querySelector('#dwTf').checked;
      list = body.querySelector('#dwScope').value === 'sel' ? selWalls : all;
      C.setPref('dw.params', P);
      res = render(body);
    };
    body.addEventListener('change', upd); body.addEventListener('input', (e) => { if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') upd(); });
    upd();
  });
  if (!r || !res) return;
  if (r.v === 'csv') {
    const n = (x) => String(x).replace('.', ',');
    const lines = [['Pos.', 'Material', 'Menge', 'Einheit', 'Hinweis'].join(';'), ...res.rows.map((x, i) => [i + 1, `"${x.label}"`, n(DW.fmtQty(x)), x.unit, `"${x.note || ''}"`].join(';')),
      '', ['Wand', 'System', 'Länge m', 'Höhe m', 'Fläche m²'].join(';'), ...res.per.map(({ w, q }) => [`"${w.name}"`, `${w.sys} ${DW.profLabel(w.sys, w.prof)} ${w.board} ${w.t}`, n(fmtNum(q.len / 1000, 3)), n(fmtNum(q.h / 1000, 3)), n(fmtNum(q.area, 3))].join(';'))];
    download((state.doc.name || 'Massen').replace(/[^\wäöüÄÖÜß\- ]+/g, '') + '_Massen.csv', '﻿' + lines.join('\r\n'), 'text/csv');
  }
  if (r.v === 'tab') { C.setTool(new PlaceTool(C.app, DW.tableEnts(res, C.app.layerFor), 'Massentabelle')); C.toast('Tabelle hängt am Cursor – Einfügepunkt wählen'); }
}
