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
const sel = (name, opts, cur, attr = 'data-o') => `<select ${attr}="${name}">${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
const walls = () => state.doc.ents.filter((e) => e.type === 'wall');

export function newWall(a, b, o) {
  const n = walls().length + 1;
  const L = DW.SYSTEMS[o.sys]?.layers || 2;
  return { type: 'wall', a: G.clone(a), b: G.clone(b), sys: o.sys, prof: +o.prof, achs: +o.achs, board: o.board, t: +o.t, nA: L, nB: L, ins: +o.ins, h: +o.h, just: o.just, endA: true, endB: true, label: true, name: 'Wand ' + n };
}

export class WallTool extends Tool {
  msg() { const o = this.app.opts.wall; return this.pts.length ? 'Wand: Endpunkt wählen – Länge tippen möglich · Enter = fertig' : `Wand ${o.sys}, CW ${o.prof}, h = ${fmtNum(+o.h, 0)} mm: Startpunkt der Wand wählen (Bezug: ${o.just === 'M' ? 'Wandachse' : 'Seite ' + o.just})`; }
  click(p) {
    if (this.pts.length && G.dist(this.base, p) > 50) {
      this.app.addEnts([Object.assign(newWall(this.base, p, this.app.opts.wall), { layer: this.app.layerFor('L0') })]);
      this.app.commit();
    }
    this.pts.push(p); this.update();
  }
  preview(B, sc) { if (this.base && this.cur && G.dist(this.base, this.cur) > 1) emit(Object.assign(newWall(this.base, this.cur, this.app.opts.wall), { id: '_tmp', layer: state.doc.cur }), B, sc); }
  chips() { return this.pts.length ? [{ t: 'Fertig', f: () => { this.pts = []; this.update(); }, main: true }] : []; }
  enter() { if (this.pts.length) { this.pts = []; this.update(); } else super.enter(); }
  esc() { if (this.pts.length) { this.pts = []; this.update(); } else super.esc(); }
}

export function optbarHtml(o) {
  return `<label class="ob">System ${sel('w.sys', Object.keys(DW.SYSTEMS).map((k) => [k, k]), o.sys)}</label>
    <label class="ob">CW ${sel('w.prof', DW.PROFILES.map((p) => [p, p]), o.prof)}</label>
    <label class="ob">Achsabst. ${sel('w.achs', [[625, '625'], [417, '417'], [312.5, '312,5']], o.achs)}</label>
    <label class="ob">Platte ${sel('w.board', Object.keys(DW.BOARDS).map((k) => [k, k]), o.board)}</label>
    <label class="ob">d ${sel('w.t', [[12.5, '12,5'], [15, '15'], [18, '18'], [20, '20'], [25, '25']], o.t)}</label>
    <label class="ob">Höhe mm <input data-o="w.h" value="${o.h}" size="5" inputmode="decimal"></label>
    <label class="ob">Dämmung ${sel('w.ins', [[0, 'ohne'], [40, '40'], [60, '60'], [80, '80'], [100, '100']], o.ins)}</label>
    <label class="ob">Bezug ${sel('w.just', [['M', 'Achse'], ['A', 'Seite A'], ['B', 'Seite B']], o.just)}</label>`;
}
export function optbarChange(o, kk, v) { o[kk] = ['prof', 'achs', 't', 'h', 'ins'].includes(kk) ? (parseFloat(String(v).replace(',', '.')) || o[kk]) : v; }

export function propsHtml(ents, common, row) {
  const e0 = ents[0]; const one = ents.length === 1;
  const sv = (k, opts, num) => `<select data-k="${k}" ${num ? 'data-num="1"' : ''}>${common(k) === undefined ? '<option value="">– verschieden –</option>' : ''}${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(common(k)) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  let h = `<div class="psec">Trockenbauwand (Test)</div>`;
  if (one) h += row('Bezeichnung', `<input data-k="name" value="${esc(e0.name)}">`);
  h += row('System', sv('sys', Object.entries(DW.SYSTEMS).map(([k, s]) => [k, s.label])));
  h += row('CW-Profil', sv('prof', DW.PROFILES.map((p) => [p, 'CW ' + p]), true));
  h += row('Achsabstand', sv('achs', [[625, '625 mm'], [417, '417 mm'], [312.5, '312,5 mm']], true));
  h += row('Platte', sv('board', Object.entries(DW.BOARDS)));
  h += row('Plattendicke', sv('t', [[12.5, '12,5 mm'], [15, '15 mm'], [18, '18 mm'], [20, '20 mm'], [25, '25 mm']], true));
  h += row('Lagen Seite A', sv('nA', [[0, '0'], [1, '1'], [2, '2'], [3, '3']], true));
  h += row('Lagen Seite B', sv('nB', [[0, '0'], [1, '1'], [2, '2'], [3, '3']], true));
  h += row('Dämmung', sv('ins', [[0, 'ohne'], [40, '40 mm'], [60, '60 mm'], [80, '80 mm'], [100, '100 mm']], true));
  h += row('Wandhöhe (mm)', `<input data-k="h" data-num="1" value="${common('h') ?? ''}" inputmode="decimal">`);
  h += row('Bezugslinie', sv('just', [['M', 'Wandachse'], ['A', 'Außenkante Seite A'], ['B', 'Außenkante Seite B']]));
  h += row('Anschluss Anfang', `<input type="checkbox" data-k="endA" ${common('endA') !== false ? 'checked' : ''}>`);
  h += row('Anschluss Ende', `<input type="checkbox" data-k="endB" ${common('endB') !== false ? 'checked' : ''}>`);
  h += row('Seiten tauschen', `<input type="checkbox" data-k="flip" ${common('flip') ? 'checked' : ''}>`);
  h += row('Beschriftung', `<input type="checkbox" data-k="label" ${common('label') !== false ? 'checked' : ''}>`);
  if (one) {
    const q = DW.wallTakeoff(e0);
    h += `<div class="pinfo">Länge ${fmtNum(q.len, 0)} mm · Höhe ${fmtNum(q.h, 0)} mm · Fläche ${fmtNum(q.area, 2)} m² · Wanddicke ${fmtNum(q.d, 1)} mm</div>`;
    if (q.warn.length) h += `<div class="pinfo warn">⚠ ${q.warn.map(esc).join('<br>⚠ ')}</div>`;
    h += `<div class="pbtns"><button data-act="dwElevA">Ansicht Seite A</button><button data-act="dwElevB">Ansicht Seite B</button></div>`;
  }
  h += `<div class="pbtns"><button data-act="dwMass" class="primary">Massenermittlung</button></div>`;
  return h;
}
// Änderungen mit Folgen (System -> Lagen)
export function propChanged(e, k, v) {
  if (k === 'sys') { const L = DW.SYSTEMS[v]?.layers || 2; e.nA = L; e.nB = L; }
  if (k === 'prof' && +e.ins > +v) e.ins = DW.MIN_INS[v];
}

export function propAction(act, ents) {
  if (act === 'dwElevA' || act === 'dwElevB') {
    const w = ents.find((e) => e.type === 'wall'); if (!w) return;
    const side = act === 'dwElevA' ? 'A' : 'B';
    C.setTool(new PlaceTool(C.app, DW.elevationEnts(w, side, C.app.layerFor), `Ansicht ${w.name} Seite ${side}`));
    C.toast('Wandansicht hängt am Cursor – Einfügepunkt wählen');
  }
  if (act === 'dwMass') massDialog(ents.filter((e) => e.type === 'wall'));
}

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
      ${res.per.map(({ w, q }) => `<tr><td>${esc(w.name)}</td><td>${w.sys} · CW${w.prof} · ${w.nA}+${w.nB}× ${w.board}</td><td class="r">${fmtNum(q.len / 1000, 2)} m</td><td class="r">${fmtNum(q.h / 1000, 2)} m</td><td class="r">${fmtNum(q.area, 2)}</td></tr>`).join('')}
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
      <label>Spachtel kg je m Fuge<input id="dwKg" value="${String(P.kgJoint).replace('.', ',')}" inputmode="decimal"></label>
    </div>
    <label class="chk"><input type="checkbox" id="dwStrip" ${P.strip ? 'checked' : ''}> Fugendeckstreifen / Glasfaserbewehrung ansetzen</label>
    <label class="chk"><input type="checkbox" id="dwTf" ${P.tfBoden ? 'checked' : ''}> Trenn-Fix auch am Bodenanschluss</label>
    <div id="dwOut"></div>
    <p class="hint">Rechenwerte nach Knauf Detailblatt W11 (Schraubabstände je Lage, Ständer je Achsabstand + Endständer, Platten 1250 mm breit mit versetzten Stößen). Ohne Öffnungen, Türen und Eckausbildungen. Spachtel ist ein Schätzwert. Vor Bestellung prüfen.</p>`;
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
      '', ['Wand', 'System', 'Länge m', 'Höhe m', 'Fläche m²'].join(';'), ...res.per.map(({ w, q }) => [`"${w.name}"`, `${w.sys} CW${w.prof} ${w.nA}+${w.nB}x ${w.board} ${w.t}`, n(fmtNum(q.len / 1000, 3)), n(fmtNum(q.h / 1000, 3)), n(fmtNum(q.area, 3))].join(';'))];
    download((state.doc.name || 'Massen').replace(/[^\wäöüÄÖÜß\- ]+/g, '') + '_Massen.csv', '﻿' + lines.join('\r\n'), 'text/csv');
  }
  if (r.v === 'tab') { C.setTool(new PlaceTool(C.app, DW.tableEnts(res, C.app.layerFor), 'Massentabelle')); C.toast('Tabelle hängt am Cursor – Einfügepunkt wählen'); }
}
