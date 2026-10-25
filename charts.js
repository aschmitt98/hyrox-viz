/* Graphiques SVG. Marques fines, grille en hairline, couleurs portées par des classes CSS
 * (jamais en ligne : la CSP interdit les styles inline), infobulle + focus clavier sur chaque
 * marque, et un tableau équivalent sous chaque graphique. */
import {
  h, s, fr, parseDay, addDays, mondayOf, todayIso, dayLabel, rangeLabel, paceLabel,
  JOURS_COURTS, MOIS, bindTip, tipRow, tableView, legendItem,
} from './lib.js';
import { CFG, KCAL, STATUTS, statutOf, classeJour, kcalStats } from './data.js';

const SVG_ARIA = (t) => `${t} Les données sont dans le tableau sous le graphique.`;

/* Quadrillage commun : lignes horizontales tous les `step`, étiquettes à gauche. */
function grid(svg, m, W, y, top, step, fmt) {
  for (let v = 0; v <= top + 1e-9; v += step) {
    svg.append(s('line', { class: v === 0 ? 'base' : 'grid', x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }),
      s('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, fmt(v)));
  }
}
/* Barre dont seule l'extrémité est arrondie (4 px), ancrée sur la ligne de base. */
const barPath = (x, yt, w, yb) => {
  const r = Math.min(4, w / 2, yb - yt);
  return `M${x},${yb} V${yt + r} Q${x},${yt} ${x + r},${yt} H${x + w - r} Q${x + w},${yt} ${x + w},${yt + r} V${yb} Z`;
};

/* ---------- volume de course par semaine ---------- */
export function volumeChart(d, curNum) {
  const weeks = d.weeks;
  const W = 960, H = 290, m = { t: 22, r: 12, b: 30, l: 38 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const top = Math.ceil(Math.max(5, ...weeks.map((w) => Math.max(w.cible || 0, w.doc || 0))) / 5) * 5;
  const y = (v) => m.t + ih - (v / top) * ih;
  const band = iw / weeks.length, bw = Math.min(24, band * 0.62);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': SVG_ARIA('Volume de course hebdomadaire documenté face à la cible du plan, en kilomètres.') });
  grid(svg, m, W, y, top, 5, String);
  svg.append(s('text', { x: m.l - 8, y: m.t - 9, 'text-anchor': 'end' }, 'km'));

  const documented = weeks.filter((w) => w.doc != null);
  const best = documented.reduce((a, w) => (!a || w.doc > a.doc ? w : a), null);
  const last = documented[documented.length - 1];
  const labelled = new Set([best, last].filter(Boolean));

  weeks.forEach((w, i) => {
    const cx = m.l + band * i + band / 2, x = cx - bw / 2;
    const g = s('g', { class: 'col', tabindex: '0', role: 'img',
      'aria-label': `${w.sem} : ${w.doc != null ? fr(w.doc) + ' km documentés' : 'pas de distance documentée'}, cible ${fr(w.cible)} km` });
    g.append(s('rect', { class: 'hit', x: m.l + band * i, y: m.t, width: band, height: ih }));
    if (w.doc != null) {
      g.append(s('path', { class: `bar${w.partiel ? ' partial' : ''}`, d: barPath(x, y(w.doc), bw, y(0)) }));
      if (labelled.has(w)) g.append(s('text', { class: 'val', x: cx, y: y(w.doc) - 6, 'text-anchor': 'middle' }, fr(w.doc)));
    }
    if (w.cible != null) g.append(s('line', { class: 'tick', x1: cx - bw / 2 - 4, x2: cx + bw / 2 + 4, y1: y(w.cible), y2: y(w.cible) }));
    svg.append(g, s('text', { class: w.num === curNum ? 'cur' : '', x: cx, y: H - 10, 'text-anchor': 'middle' }, w.sem));
    bindTip(g, () => {
      const nodes = [
        h('div', { class: 't' }, `${w.sem} · ${w.debut ? rangeLabel(w.debut, w.fin) : ''}${w.phase ? ' · ' + w.phase : ''}`),
        h('div', { class: 'v' }, w.doc != null ? `${fr(w.doc)} km documentés${w.partiel ? ' (partiel)' : ''}` : 'Pas de distance documentée'),
        tipRow('line plan', `Cible du plan : ${w.cible != null ? fr(w.cible) + ' km' : '—'}`),
      ];
      if (w.partiel) nodes.push(h('div', { class: 't' }, 'Des séances de course n’ont pas de distance exploitable : le réel est supérieur.'));
      return nodes;
    });
  });
  const legend = h('div', { class: 'legend' },
    legendItem('s1', 'Documenté'), legendItem('s1soft', 'Documenté, partiel (réel supérieur)'), legendItem('line plan', 'Cible du plan'));
  const table = tableView(['Semaine', 'Dates', 'Cible (km)', 'Documenté (km)', 'Complétude'],
    weeks.map((w) => [w.sem, w.debut ? rangeLabel(w.debut, w.fin) : '—', fr(w.cible), fr(w.doc),
      w.doc == null ? 'non documenté' : w.partiel ? 'partiel' : 'complet']), [2, 3]);
  return [legend, h('div', { class: 'chart' }, svg), table];
}

/* ---------- efficience aérobie ---------- */
const dayDiff = (a, b) => Math.round((parseDay(a) - parseDay(b)) / 86400000);

export function efChart(points) {
  if (!points.length) return [h('p', { class: 'note' }, 'Aucun point exploitable pour l’instant.')];
  const W = 960, H = 290, m = { t: 22, r: 16, b: 30, l: 48 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const t0 = addDays(points[0].date, -5);
  const t1 = [addDays(points[points.length - 1].date, 5), todayIso()].sort().pop();
  const span = dayDiff(t1, t0);
  const x = (d) => m.l + (dayDiff(d, t0) / span) * iw;
  const efs = points.map((p) => p.ef);
  const lo = Math.floor(Math.min(...efs) * 50) / 50, hi = Math.ceil(Math.max(...efs) * 50) / 50;
  const y = (v) => m.t + ih - ((v - lo) / (hi - lo)) * ih;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': SVG_ARIA('Efficience aérobie des sorties en zone 2 au fil du temps.') });
  for (let v = lo; v <= hi + 1e-9; v += 0.02) {
    svg.append(s('line', { class: 'grid', x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }),
      s('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, v.toFixed(2).replace('.', ',')));
  }
  svg.append(s('line', { class: 'base', x1: m.l, x2: W - m.r, y1: m.t + ih, y2: m.t + ih }));
  // repères de mois (le 1er de chaque mois compris dans la plage)
  let cy = parseDay(t0).getFullYear(), cm = parseDay(t0).getMonth();
  const fin = parseDay(t1);
  while (new Date(cy, cm, 1) <= fin) {
    const fi = `${cy}-${String(cm + 1).padStart(2, '0')}-01`;
    if (fi >= t0 && fi <= t1) svg.append(s('text', { x: x(fi), y: H - 10, 'text-anchor': 'middle' }, MOIS[cm]));
    cm += 1;
    if (cm > 11) { cm = 0; cy += 1; }
  }
  svg.append(s('text', { x: m.l - 8, y: m.t - 9, 'text-anchor': 'end' }, 'EF'));
  svg.append(s('polyline', { class: 'ef-line', points: points.map((p) => `${x(p.date)},${y(p.ef)}`).join(' ') }));

  const best = points.reduce((a, p) => (p.ef > a.ef ? p : a), points[0]);
  const last = points[points.length - 1];
  points.forEach((p) => {
    const g = s('g', { class: 'pt', tabindex: '0', role: 'img',
      'aria-label': `${dayLabel(p.date)} : efficience ${p.ef.toFixed(3).replace('.', ',')}, ${paceLabel(p.pace)}, FC moyenne ${p.fc}` });
    g.append(s('circle', { class: 'hit', cx: x(p.date), cy: y(p.ef), r: 14 }),
      s('circle', { class: 'dot', cx: x(p.date), cy: y(p.ef), r: 5 }));
    if (p === best || p === last) {
      g.append(s('text', { class: 'val', x: x(p.date), y: y(p.ef) - 12, 'text-anchor': 'middle' }, p.ef.toFixed(3).replace('.', ',')));
    }
    svg.append(g);
    bindTip(g, () => [
      h('div', { class: 't' }, `${dayLabel(p.date)} · ${p.sem}`),
      h('div', { class: 'v' }, `EF ${p.ef.toFixed(3).replace('.', ',')}`),
      h('div', {}, `${paceLabel(p.pace)} · FC moy ${p.fc}`),
      h('div', { class: 't' }, p.type),
    ]);
  });
  const legend = h('div', { class: 'legend' }, legendItem('s1', 'Une sortie Z2 (EF = vitesse en m/min ÷ FC moyenne)'));
  const table = tableView(['Date', 'Semaine', 'Séance', 'Allure', 'FC moy', 'EF'],
    points.map((p) => [dayLabel(p.date), p.sem, p.type, paceLabel(p.pace), String(p.fc), p.ef.toFixed(3).replace('.', ',')]), [4, 5]);
  return [legend, h('div', { class: 'chart' }, svg), table];
}

/* ---------- calories ---------- */
const kcalLegend = (nut, withMeans) => h('div', { class: 'legend' },
  ...['dans', 'sous', 'haut'].map((k) => legendItem(`k-${k}`, `${KCAL[k].glyph} ${KCAL[k].label}${k === 'dans' ? ` (±${CFG.tolerance} kcal)` : ''}`)),
  legendItem('k-incomplet', `${KCAL.incomplet.glyph} ${KCAL.incomplet.label} (sans dîner), exclue des moyennes`),
  withMeans ? legendItem('line mean', 'Moyenne (cible stricte)') : null,
  nut.cible ? legendItem('k-band', `Cible ${nut.cible.lo}–${nut.cible.hi} kcal`) : null);

function kcalFrame(W, H, m, nut, maxV) {
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const top = Math.max(500, Math.ceil(maxV / 500) * 500);
  const y = (v) => m.t + ih - (v / top) * ih;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
  if (nut.cible) {
    svg.append(s('rect', { class: 'band', x: m.l, y: y(nut.cible.hi), width: iw, height: y(nut.cible.lo) - y(nut.cible.hi) }));
  }
  grid(svg, m, W, y, top, 500, (v) => fr(v, 0));
  svg.append(s('text', { x: m.l - 8, y: m.t - 9, 'text-anchor': 'end' }, 'kcal'));
  if (nut.cible) {
    svg.append(s('text', { class: 'band-l', x: W - m.r + 6, y: y(nut.cible.hi) + 4 }, `${nut.cible.hi}`),
      s('text', { class: 'band-l', x: W - m.r + 6, y: y(nut.cible.lo) + 4 }, `${nut.cible.lo}`));
  }
  return { svg, iw, ih, y, top };
}

/* Un graphique par jour : barres colorées selon la cible, moyenne de chaque semaine en dessous. */
export function kcalChart(dates, nut, opts = {}) {
  const W = opts.W || 960, H = 300, m = { t: 22, r: 52, b: 58, l: 46 };
  const cible = nut.cible;
  const maxV = Math.max(cible ? cible.hi + CFG.tolerance : 0, ...dates.map((d) => (nut.days[d] ? nut.days[d].kcal : 0)));
  const { svg, iw, ih, y } = kcalFrame(W, H, m, nut, maxV);
  svg.setAttribute('aria-label', SVG_ARIA('Calories mangées par jour, comparées à la cible.'));
  const band = iw / dates.length, bw = Math.min(24, band * 0.62);
  const today = todayIso();

  dates.forEach((d, i) => {
    const day = nut.days[d];
    const cx = m.l + band * i + band / 2, x = cx - bw / 2;
    const cls = day ? classeJour(day, cible) : null;
    const wd = (parseDay(d).getDay() + 6) % 7;
    const g = s('g', { class: 'col', tabindex: '0', role: 'img',
      'aria-label': `${dayLabel(d)} : ${day ? fr(day.kcal, 0) + ' kcal, ' + KCAL[cls].label : 'pas de journal'}` });
    g.append(s('rect', { class: 'hit', x: m.l + band * i, y: m.t, width: band, height: ih }));
    if (day && cls === 'incomplet') {
      g.append(s('rect', { class: 'kbar incomplet', x, y: y(day.kcal), width: bw, height: y(0) - y(day.kcal), rx: 3 }));
    } else if (day) {
      g.append(s('path', { class: `kbar ${cls}`, d: barPath(x, y(day.kcal), bw, y(0)) }));
    }
    if (opts.values && day) g.append(s('text', { class: 'val', x: cx, y: y(day.kcal) - 6, 'text-anchor': 'middle' }, fr(day.kcal, 0)));
    svg.append(g, s('text', { class: d === today ? 'cur' : '', x: cx, y: H - m.b + 16, 'text-anchor': 'middle' },
      opts.jours ? `${JOURS_COURTS[wd]} ${parseDay(d).getDate()}` : String(parseDay(d).getDate())));
    bindTip(g, () => {
      if (!day) return [h('div', { class: 't' }, dayLabel(d)), h('div', {}, 'Pas de journal alimentaire ce jour-là.')];
      const nodes = [
        h('div', { class: 't' }, dayLabel(d)),
        h('div', { class: 'v' }, `${fr(day.kcal, 0)} kcal · ${fr(day.prot, 0)} g de protéines`),
        tipRow(`k-${cls}`, `${KCAL[cls].glyph} ${KCAL[cls].label}`),
      ];
      if (cls === 'incomplet') nodes.push(h('div', { class: 't' }, 'Aucun dîner saisi : exclue des moyennes.'));
      if (day.sport) nodes.push(h('div', { class: 't' }, `Sport : ${day.sport}`));
      return nodes;
    });
  });

  // Moyennes : une par semaine (lundi → dimanche) présente dans la plage.
  const groups = [];
  dates.forEach((d, i) => {
    const mon = mondayOf(d);
    const last = groups[groups.length - 1];
    if (last && last.mon === mon) { last.i1 = i; last.dates.push(d); } else groups.push({ mon, i0: i, i1: i, dates: [d] });
  });
  const means = [];
  for (const g of groups) {
    const st = kcalStats(g.dates, nut);
    if (st.mean == null) continue;
    const xa = m.l + band * g.i0 + 2, xb = m.l + band * (g.i1 + 1) - 2;
    svg.append(s('line', { class: 'mean', x1: xa, x2: xb, y1: y(st.mean), y2: y(st.mean) }));
    const wide = (xb - xa) > 90;
    const glyph = st.classe && KCAL[st.classe] ? KCAL[st.classe].glyph : '';
    svg.append(s('text', { class: 'val', x: (xa + xb) / 2, y: H - 12, 'text-anchor': 'middle' },
      `${wide ? 'moy ' : ''}${glyph} ${fr(st.mean, 0)}`.trim()));
    means.push({ g, st });
  }
  const table = tableView(['Date', 'kcal', 'Protéines (g)', 'Statut', 'Sport'],
    dates.filter((d) => nut.days[d]).map((d) => {
      const day = nut.days[d], cls = classeJour(day, cible);
      return [dayLabel(d), fr(day.kcal, 0), fr(day.prot, 0), KCAL[cls].label, day.sport || ''];
    }), [1, 2]);
  const meansTable = means.length ? tableView(['Semaine du', 'Jours comptés', 'Moyenne (kcal/j)', 'Statut'],
    means.map(({ g, st }) => [dayLabel(g.mon), `${st.n}${st.incomplets ? ` (+${st.incomplets} incomplet${st.incomplets > 1 ? 's' : ''})` : ''}`,
      fr(st.mean, 0), st.classe ? KCAL[st.classe].label : '—']), [1, 2], 'Voir les moyennes') : null;
  return [kcalLegend(nut, true), h('div', { class: 'chart' }, svg), meansTable, table];
}

/* Moyenne par semaine sur toute la saison : une barre par semaine, cible stricte. */
export function kcalWeeksChart(items, nut) {
  const W = 960, H = 270, m = { t: 22, r: 52, b: 34, l: 46 };
  const cible = nut.cible;
  const { svg, iw, ih, y } = kcalFrame(W, H, m, nut, Math.max(cible ? cible.hi : 0, ...items.map((it) => it.mean)));
  svg.setAttribute('aria-label', SVG_ARIA('Moyenne de calories par jour, semaine par semaine.'));
  const band = iw / items.length, bw = Math.min(40, band * 0.62);
  items.forEach((it, i) => {
    const cx = m.l + band * i + band / 2, x = cx - bw / 2;
    const g = s('g', { class: 'col', tabindex: '0', role: 'img',
      'aria-label': `${it.label} : moyenne ${fr(it.mean, 0)} kcal par jour, ${KCAL[it.classe].label}` });
    g.append(s('rect', { class: 'hit', x: m.l + band * i, y: m.t, width: band, height: ih }),
      s('path', { class: `kbar ${it.classe}`, d: barPath(x, y(it.mean), bw, y(0)) }),
      s('text', { class: 'val', x: cx, y: y(it.mean) - 6, 'text-anchor': 'middle' }, fr(it.mean, 0)));
    svg.append(g, s('text', { x: cx, y: H - 10, 'text-anchor': 'middle' }, it.label));
    bindTip(g, () => [
      h('div', { class: 't' }, `${it.label} · semaine du ${dayLabel(it.monday)}`),
      h('div', { class: 'v' }, `${fr(it.mean, 0)} kcal/jour en moyenne`),
      tipRow(`k-${it.classe}`, `${KCAL[it.classe].glyph} ${KCAL[it.classe].label}`),
      h('div', { class: 't' }, `${it.n} jour${it.n > 1 ? 's' : ''} comptés${it.incomplets ? `, ${it.incomplets} incomplet${it.incomplets > 1 ? 's' : ''} exclu${it.incomplets > 1 ? 's' : ''}` : ''}`),
    ]);
  });
  const table = tableView(['Semaine', 'Du', 'Jours comptés', 'Moyenne (kcal/j)', 'Statut'],
    items.map((it) => [it.label, dayLabel(it.monday), String(it.n), fr(it.mean, 0), KCAL[it.classe].label]), [2, 3]);
  return [kcalLegend(nut, false), h('div', { class: 'chart' }, svg), table];
}

/* ---------- séances par semaine ---------- */
export function adherence(d, curNum) {
  const rows = d.weeks.map((w) => {
    const n = w.seances.filter((x) => x.statut !== 'deplacee').length;
    const faites = w.seances.filter((x) => x.statut === 'fait').length;
    const strip = h('div', { class: 'adh-strip' }, w.seances.map((x) => {
      const st = statutOf(x.statut);
      const seg = h('div', { class: `seg ${st.cls}`, tabindex: '0',
        'aria-label': `${w.sem}, ${x.date ? dayLabel(x.date) : ''} : ${x.type}, ${st.label}` }, st.glyph);
      bindTip(seg, () => [
        h('div', { class: 't' }, `${w.sem} · ${x.date ? dayLabel(x.date) : ''}`),
        h('div', { class: 'v' }, x.type),
        tipRow(st.cls, `${st.glyph} ${st.label}`),
      ]);
      return seg;
    }));
    return h('div', { class: `adh-row${w.num === curNum ? ' cur' : ''}` },
      h('span', { class: 'adh-l' }, w.sem), strip, h('span', { class: 'adh-n' }, `${faites}/${n}`));
  });
  const legend = h('div', { class: 'legend' }, ...['fait', 'partiel', 'skipped', 'deplacee', 'prevu'].map((k) =>
    legendItem(STATUTS[k].cls, `${STATUTS[k].glyph} ${STATUTS[k].label}`)));
  const count = (w, k) => w.seances.filter((x) => x.statut === k).length;
  const table = tableView(['Semaine', 'Fait', 'Partiel', 'Sautée', 'Déplacée', 'À venir'],
    d.weeks.map((w) => [w.sem, ...['fait', 'partiel', 'skipped', 'deplacee', 'prevu'].map((k) => String(count(w, k)))]), [1, 2, 3, 4, 5]);
  return [legend, h('div', { class: 'adh' }, rows), table];
}
