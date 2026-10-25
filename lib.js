/* Outils communs : construction du DOM, dates, formats, infobulle, petits composants.
 * Aucune donnée n'est jamais passée par innerHTML : un texte devient un nœud texte. */

const SVGNS = 'http://www.w3.org/2000/svg';

export function fill(el, attrs, kids) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid);
  }
  return el;
}
export const h = (tag, attrs, ...kids) => fill(document.createElement(tag), attrs, kids);
export const s = (tag, attrs, ...kids) => fill(document.createElementNS(SVGNS, tag), attrs, kids);
export const $ = (id) => document.getElementById(id);

/* ---------- dates & formats ---------- */
export const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const MOIS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
export const JOURS_COURTS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];

export const fr = (n, d = 1) => (n == null ? '—' : n.toLocaleString('fr-FR', { maximumFractionDigits: d }));
export const iso = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? '' : String(v).trim());
const pad2 = (n) => String(n).padStart(2, '0');
export const toIso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const parseDay = (i) => { const [y, m, d] = i.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (i, n) => { const d = parseDay(i); d.setDate(d.getDate() + n); return toIso(d); };
export const mondayOf = (i) => addDays(i, -((parseDay(i).getDay() + 6) % 7));
export const todayIso = () => toIso(new Date());
export const daysTo = (i) => Math.round((parseDay(i) - parseDay(todayIso())) / 86400000);
export const dayLabel = (i) => { const d = parseDay(i); return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`; };
export const fullDate = (i) => { const d = parseDay(i); return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`; };
export function rangeLabel(a, b) {
  const da = parseDay(a), db = parseDay(b);
  return da.getMonth() === db.getMonth()
    ? `${da.getDate()} – ${db.getDate()} ${MOIS[db.getMonth()]}`
    : `${da.getDate()} ${MOIS[da.getMonth()]} – ${db.getDate()} ${MOIS[db.getMonth()]}`;
}
export const monthLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return `${MOIS_LONG[m - 1]} ${y}`; };
export const shiftMonth = (ym, k) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + k, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
};
export const monthDates = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => `${ym}-${pad2(i + 1)}`);
};
export const range7 = (monday) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));
export const secondes = (txt) => {
  const p = (String(txt).match(/\d+/g) || []).map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : 0;
};
export function hms(sec) {
  const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = Math.round(sec % 60);
  return hh ? `${hh}h${pad2(mm)}:${pad2(ss)}` : `${mm}:${pad2(ss)}`;
}
export const paceLabel = (minPerKm) => { const t = Math.round(minPerKm * 60); return `${Math.floor(t / 60)}:${pad2(t % 60)}/km`; };

/* ---------- infobulle (une seule, partagée) ---------- */
const tipEl = h('div', { class: 'tip', role: 'tooltip', hidden: true });
document.body.append(tipEl);
export function showTip(nodes, x, y) {
  tipEl.replaceChildren(...nodes);
  tipEl.hidden = false;
  const w = tipEl.offsetWidth, hh = tipEl.offsetHeight;
  let left = x + 14, top = y - hh - 10;
  if (left + w > window.innerWidth - 8) left = x - w - 14;
  if (left < 8) left = 8;
  if (top < 8) top = y + 18;
  tipEl.style.left = `${left}px`;
  tipEl.style.top = `${top}px`;
}
export const hideTip = () => { tipEl.hidden = true; };
export function bindTip(el, nodesFn) {
  el.addEventListener('pointermove', (e) => showTip(nodesFn(), e.clientX, e.clientY));
  el.addEventListener('pointerleave', hideTip);
  el.addEventListener('focus', () => { const r = el.getBoundingClientRect(); showTip(nodesFn(), r.left + r.width / 2, r.top); });
  el.addEventListener('blur', hideTip);
}
export const tipRow = (cls, text) => h('div', { class: 'r' }, h('span', { class: `key ${cls}` }), text);

/* ---------- composants ---------- */
export const card = (title, sub, ...content) =>
  h('section', { class: 'card' }, h('h2', {}, title), sub && h('p', { class: 'sub' }, sub), ...content);

export function tableView(head, rows, numCols, label) {
  const isNum = (i) => (numCols || []).includes(i);
  return h('details', { class: 'table-view' },
    h('summary', {}, label || 'Voir les données'),
    h('div', { class: 'tbl-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, head.map((t, i) => h('th', { class: isNum(i) ? 'num' : '' }, t)))),
      h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c, i) => h('td', { class: isNum(i) ? 'num' : '' }, c))))))));
}
export const tile = (label, value, sub, cls) => h('div', { class: `tile${cls ? ' ' + cls : ''}` },
  h('div', { class: 'l' }, label), h('div', { class: 'v' }, value), sub && h('div', { class: 's' }, sub));
export const legendItem = (cls, text) => h('span', {}, h('span', { class: `key ${cls}` }), text);
export const navLink = (href, text, disabled) => disabled
  ? h('span', { class: 'btn off', 'aria-disabled': 'true' }, text)
  : h('a', { class: 'btn', href }, text);
export const notice = (text) => h('div', { class: 'warn' }, text);

/* ---------- vue des graphiques de calories (choix mémorisé, par commodité) ---------- */
const VUES = ['statut', 'macros', 'repas'];
const KEY_VUE = 'hyrox_viz_vue_kcal';
export const ui = { kcal: 'macros' };
try { const v = localStorage.getItem(KEY_VUE); if (VUES.includes(v)) ui.kcal = v; } catch (e) { /* stockage indisponible */ }
let rerender = () => {};
export const setRerender = (f) => { rerender = f; };
export function setKcalView(v) {
  if (!VUES.includes(v)) return;
  ui.kcal = v;
  try { localStorage.setItem(KEY_VUE, v); } catch (e) { /* rien */ }
  rerender();
}
