/* Graphiques SVG. Marques fines, grille en hairline, couleurs portées par des classes CSS
 * (jamais en ligne : la CSP interdit les styles inline), infobulle + focus clavier sur chaque
 * marque, et un tableau équivalent sous chaque graphique. */
import {
  h, s, fr, parseDay, addDays, mondayOf, todayIso, dayLabel, rangeLabel, paceLabel, monthLabel, shiftMonth, monthDates,
  JOURS_COURTS, MOIS, bindTip, tipRow, tableView, legendItem, range7, ui, setKcalView,
} from './lib.js';
import {
  CFG, KCAL, STATUTS, statutOf, classeJour, kcalStats, trainingStats, monthsSpan, chargesParExercice,
  VUES_KCAL, segmentsKcal, segmentsMoyens, grammes, typeCourt, categoriesSeance,
} from './data.js';

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
const STATUT_VUES = ['dans', 'sous', 'haut', 'incomplet'];

/* Sélecteur : la même journée vue par rapport à la cible, par macro, ou par repas. */
function kcalControl() {
  return h('div', { class: 'seg-ctl', role: 'group', 'aria-label': 'Répartition des calories' },
    h('span', { class: 'note' }, 'Afficher :'),
    ...Object.entries(VUES_KCAL).map(([k, v]) => h('button', {
      type: 'button', class: ui.kcal === k ? 'on' : '', 'aria-pressed': String(ui.kcal === k), onclick: () => setKcalView(k),
    }, v.label)));
}

function kcalLegend(nut, vue, withMeans, avecSeances) {
  const court = { dans: `dans la cible (±${CFG.tolerance})`, sous: 'sous la cible', haut: 'au-dessus', incomplet: 'incomplète (sans dîner), hors moyennes' };
  const statuts = STATUT_VUES.map((k) => legendItem(`k-${k}`, `${KCAL[k].glyph} ${court[k]}`));
  const segs = vue === 'statut' ? [] : VUES_KCAL[vue].segs.map((sg) => legendItem(`seg-${sg.cls}`, sg.label));
  return h('div', { class: 'legend small' }, ...segs, ...(vue === 'statut' ? statuts : [h('span', { class: 'sep' }, '|'), ...statuts]),
    withMeans ? legendItem('line mean', 'moyenne (cible stricte)') : null,
    nut.cible ? legendItem('k-band', `cible ${nut.cible.lo}–${nut.cible.hi}`) : null,
    avecSeances ? h('span', { class: 'note' }, 'Sous chaque jour : la séance (barrée = sautée)') : null);
}

function kcalFrame(W, H, m, nut, maxV) {
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const top = Math.max(500, Math.ceil(maxV / 500) * 500);
  const y = (v) => m.t + ih - (v / top) * ih;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
  if (nut.cible) {
    svg.append(s('rect', { class: 'band', x: m.l, y: y(nut.cible.hi), width: iw, height: y(nut.cible.lo) - y(nut.cible.hi) }));
  }
  grid(svg, m, W, y, top, 500, (v) => fr(v, 0));
  svg.append(s('text', { x: m.l - 8, y: m.t - 9 - (m.cap || 0), 'text-anchor': 'end' }, 'kcal'));
  if (nut.cible) {
    svg.append(s('text', { class: 'band-l', x: W - m.r + 6, y: y(nut.cible.hi) + 4 }, `${nut.cible.hi}`),
      s('text', { class: 'band-l', x: W - m.r + 6, y: y(nut.cible.lo) + 4 }, `${nut.cible.lo}`));
  }
  return { svg, iw, ih, y, top };
}

/* Empile les segments (macros ou repas) ; seul le dernier est arrondi, un trait de la couleur du fond les sépare. */
function stackBar(g, x, bw, y, segs, order) {
  let acc = 0;
  const parts = [];
  for (const sg of order) {
    const v = segs[sg.key] || 0;
    if (v > 0 && y(acc) - y(acc + v) >= 1) parts.push({ sg, lo: acc, hi: acc + v });
    acc += v;
  }
  parts.forEach((pt, i) => {
    const yb = y(pt.lo), yt = y(pt.hi);
    g.append(i === parts.length - 1
      ? s('path', { class: `stk ${pt.sg.cls}`, d: barPath(x, yt, bw, yb) })
      : s('rect', { class: `stk ${pt.sg.cls}`, x, y: yt, width: bw, height: yb - yt }));
  });
}
/* Pastille de statut au-dessus de la barre : le vert / jaune / orange survit à l'empilement. */
function capMark(g, cx, yTop, cls) {
  if (cls === 'neutre') return;
  g.append(s('rect', { class: `cap ${cls}`, x: cx - 9, y: yTop - 21, width: 18, height: 16, rx: 4 }),
    s('text', { class: `capg ${cls}`, x: cx, y: yTop - 9, 'text-anchor': 'middle' }, KCAL[cls].glyph));
}
const pct = (v, tot) => (tot ? Math.round((v / tot) * 100) : 0);
function repartitionTip(day, vue) {
  const segs = segmentsKcal(day, vue);
  const g = grammes(day);
  const rows = VUES_KCAL[vue].segs.filter((sg) => (segs[sg.key] || 0) >= 1).map((sg) =>
    tipRow(`seg-${sg.cls}`, `${sg.label} : ${fr(segs[sg.key], 0)} kcal${vue === 'macros' && g[sg.key] != null ? ` · ${fr(g[sg.key], 0)} g` : ''} (${pct(segs[sg.key], day.kcal)} %)`));
  if (vue === 'macros' && pct(segs.autres, day.kcal) >= 15) {
    rows.push(h('div', { class: 't' }, 'Calories saisies sans macros (plat du commerce, boisson…) : la répartition de cette journée est incomplète.'));
  }
  return rows;
}

/* Un graphique par jour : barres selon la cible, les macros ou les repas ; moyenne de chaque semaine en dessous. */
export function kcalChart(dates, nut, opts = {}) {
  const vue = ui.kcal, stacked = vue !== 'statut';
  const seancesOf = opts.seancesOf || (() => []);
  const compact = dates.length > 10;                 // ~28 px par jour : une catégorie suffit
  const W = opts.W || 960, IH = 104;
  const m = { t: stacked ? 36 : 14, r: 52, b: 84, l: 46, cap: stacked ? 22 : 0 };
  const H = m.t + IH + m.b;
  const cible = nut.cible;
  const maxV = Math.max(cible ? cible.hi + CFG.tolerance : 0, ...dates.map((d) => (nut.days[d] ? nut.days[d].kcal : 0)));
  const { svg, iw, ih, y } = kcalFrame(W, H, m, nut, maxV);
  svg.setAttribute('aria-label', SVG_ARIA('Calories mangées par jour, comparées à la cible.'));
  const band = iw / dates.length, bw = Math.min(24, band * 0.62);
  const today = todayIso();
  const y0 = m.t + ih;

  dates.forEach((d, i) => {
    const day = nut.days[d];
    const ss = seancesOf(d);
    const cx = m.l + band * i + band / 2, x = cx - bw / 2;
    const cls = day ? classeJour(day, cible) : null;
    const wd = (parseDay(d).getDay() + 6) % 7;
    const g = s('g', { class: 'col', tabindex: '0', role: 'img',
      'aria-label': `${dayLabel(d)} : ${day ? fr(day.kcal, 0) + ' kcal, ' + KCAL[cls].label : 'pas de journal'}` });
    g.append(s('rect', { class: 'hit', x: m.l + band * i, y: m.t - m.cap, width: band, height: ih + m.cap + 48 }));
    if (day && cls === 'incomplet') {
      g.append(s('rect', { class: 'kbar incomplet', x, y: y(day.kcal), width: bw, height: y(0) - y(day.kcal), rx: 3 }));
    } else if (day && stacked) {
      stackBar(g, x, bw, y, segmentsKcal(day, vue), VUES_KCAL[vue].segs);
    } else if (day) {
      g.append(s('path', { class: `kbar ${cls}`, d: barPath(x, y(day.kcal), bw, y(0)) }));
    }
    if (day && stacked) capMark(g, cx, y(day.kcal), cls);
    if (opts.values && day) g.append(s('text', { class: 'val', x: cx, y: y(day.kcal) - (stacked ? 28 : 6), 'text-anchor': 'middle' }, fr(day.kcal, 0)));
    ss.slice(0, 2).forEach((x, k) => g.append(s('text', { class: `sl ${x.statut} c-${categoriesSeance(x.type)[0].toLowerCase()}${compact ? ' sm' : ''}`, x: cx, y: y0 + 30 + k * 11, 'text-anchor': 'middle' },
      `${typeCourt(x.type, compact)}${k === 1 && ss.length > 2 ? '+' : ''}`)));
    svg.append(g, s('text', { class: d === today ? 'cur' : '', x: cx, y: H - m.b + 16, 'text-anchor': 'middle' },
      opts.jours ? `${JOURS_COURTS[wd]} ${parseDay(d).getDate()}` : String(parseDay(d).getDate())));
    bindTip(g, () => {
      const seanceNodes = ss.map((x) => h('div', {}, `${statutOf(x.statut).glyph} ${x.type}`));
      if (!seanceNodes.length) seanceNodes.push(h('div', { class: 't' }, 'Aucune séance ce jour-là'));
      if (!day) return [h('div', { class: 't' }, dayLabel(d)), ...seanceNodes, h('div', { class: 't' }, 'Pas de journal alimentaire ce jour-là.')];
      const nodes = [
        h('div', { class: 't' }, dayLabel(d)),
        ...seanceNodes,
        h('div', { class: 'v' }, `${fr(day.kcal, 0)} kcal · ${fr(day.prot, 0)} g de protéines`),
        tipRow(`k-${cls}`, `${KCAL[cls].glyph} ${KCAL[cls].label}`),
      ];
      if (stacked && cls !== 'incomplet') nodes.push(...repartitionTip(day, vue));
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
  const segHead = stacked ? VUES_KCAL[vue].segs.map((sg) => `${sg.label} (kcal)`) : [];
  const table = tableView(['Date', 'kcal', ...segHead, 'Protéines (g)', 'Statut', 'Sport'],
    dates.filter((d) => nut.days[d]).map((d) => {
      const day = nut.days[d], cls = classeJour(day, cible);
      const sg = stacked ? VUES_KCAL[vue].segs.map((x) => fr(segmentsKcal(day, vue)[x.key] || 0, 0)) : [];
      return [dayLabel(d), fr(day.kcal, 0), ...sg, fr(day.prot, 0), KCAL[cls].label, day.sport || ''];
    }), Array.from({ length: 2 + segHead.length }, (_, k) => k + 1));
  const meansTable = means.length ? tableView(['Semaine du', 'Jours comptés', 'Moyenne (kcal/j)', 'Statut'],
    means.map(({ g, st }) => [dayLabel(g.mon), `${st.n}${st.incomplets ? ` (+${st.incomplets} incomplet${st.incomplets > 1 ? 's' : ''})` : ''}`,
      fr(st.mean, 0), st.classe ? KCAL[st.classe].label : '—']), [1, 2], 'Voir les moyennes') : null;
  return [kcalControl(), kcalLegend(nut, vue, true, !!opts.seancesOf), h('div', { class: 'chart' }, svg), meansTable, table];
}

/* Moyenne par semaine sur toute la saison : une barre par semaine, cible stricte. */
export function kcalWeeksChart(items, nut) {
  const vue = ui.kcal, stacked = vue !== 'statut';
  const W = 960, m = { t: stacked ? 36 : 14, r: 52, b: 28, l: 46, cap: stacked ? 22 : 0 };
  const H = m.t + 96 + m.b;
  const cible = nut.cible;
  const { svg, iw, ih, y } = kcalFrame(W, H, m, nut, Math.max(cible ? cible.hi : 0, ...items.map((it) => it.mean)));
  svg.setAttribute('aria-label', SVG_ARIA('Moyenne de calories par jour, semaine par semaine.'));
  const band = iw / items.length, bw = Math.min(40, band * 0.62);
  items.forEach((it, i) => {
    const cx = m.l + band * i + band / 2, x = cx - bw / 2;
    const segs = stacked ? segmentsMoyens(range7(it.monday), nut, vue) : null;
    const g = s('g', { class: 'col', tabindex: '0', role: 'img',
      'aria-label': `${it.label} : moyenne ${fr(it.mean, 0)} kcal par jour, ${KCAL[it.classe].label}` });
    g.append(s('rect', { class: 'hit', x: m.l + band * i, y: m.t - m.cap, width: band, height: ih + m.cap }));
    if (stacked) { stackBar(g, x, bw, y, segs, VUES_KCAL[vue].segs); capMark(g, cx, y(it.mean), it.classe); }
    else g.append(s('path', { class: `kbar ${it.classe}`, d: barPath(x, y(it.mean), bw, y(0)) }));
    g.append(s('text', { class: 'val', x: cx, y: y(it.mean) - (stacked ? 28 : 6), 'text-anchor': 'middle' }, fr(it.mean, 0)));
    svg.append(g, s('text', { x: cx, y: H - 10, 'text-anchor': 'middle' }, it.label));
    bindTip(g, () => {
      const nodes = [
        h('div', { class: 't' }, `${it.label} · semaine du ${dayLabel(it.monday)}`),
        h('div', { class: 'v' }, `${fr(it.mean, 0)} kcal/jour en moyenne`),
        tipRow(`k-${it.classe}`, `${KCAL[it.classe].glyph} ${KCAL[it.classe].label}`),
      ];
      if (stacked) {
        for (const sg of VUES_KCAL[vue].segs.filter((q) => (segs[q.key] || 0) >= 1)) {
          nodes.push(tipRow(`seg-${sg.cls}`, `${sg.label} : ${fr(segs[sg.key], 0)} kcal (${pct(segs[sg.key], it.mean)} %)`));
        }
      }
      nodes.push(h('div', { class: 't' }, `${it.n} jour${it.n > 1 ? 's' : ''} comptés${it.incomplets ? `, ${it.incomplets} incomplet${it.incomplets > 1 ? 's' : ''} exclu${it.incomplets > 1 ? 's' : ''}` : ''}`));
      return nodes;
    });
  });
  const segHead = stacked ? VUES_KCAL[vue].segs.map((sg) => `${sg.label} (kcal/j)`) : [];
  const table = tableView(['Semaine', 'Du', 'Jours comptés', 'Moyenne (kcal/j)', ...segHead, 'Statut'],
    items.map((it) => {
      const segs = stacked ? segmentsMoyens(range7(it.monday), nut, vue) : null;
      return [it.label, dayLabel(it.monday), String(it.n), fr(it.mean, 0),
        ...(stacked ? VUES_KCAL[vue].segs.map((sg) => fr(segs[sg.key] || 0, 0)) : []), KCAL[it.classe].label];
    }), Array.from({ length: 2 + segHead.length }, (_, k) => k + 2));
  return [kcalControl(), kcalLegend(nut, vue, false), h('div', { class: 'chart' }, svg), table];
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

/* ---------- charges par exercice ---------- */
export const chargeLabel = (p) => (p.kgMax != null ? `${fr(p.kg)}–${fr(p.kgMax)} kg` : `${fr(p.kg)} kg`);

/* Un petit graphique par exercice : une charge par séance, échelle propre à l'exercice,
 * échelle de temps commune à tous (on compare les rythmes, pas les kilos). */
function chargeMini(ex, dom) {
  const W = 300, H = 132, m = { t: 14, r: 10, b: 24, l: 36 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const vals = ex.points.flatMap((p) => [p.kg, p.kgMax != null ? p.kgMax : p.kg]);
  const dmin = Math.min(...vals), dmax = Math.max(...vals);
  const pad = dmax === dmin ? Math.max(1, dmax * 0.1) : (dmax - dmin) * 0.18;
  const lo = Math.max(0, dmin - pad), hi = dmax + pad;
  const span = dayDiff(dom.t1, dom.t0);
  const x = (d) => m.l + (dayDiff(d, dom.t0) / span) * iw;
  const y = (v) => m.t + ih - ((v - lo) / (hi - lo)) * ih;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `${ex.nom} : ${ex.points.length} charges relevées, de ${chargeLabel(ex.points[0])} à ${chargeLabel(ex.points[ex.points.length - 1])}.` });
  for (const v of dmax === dmin ? [dmin] : [dmin, dmax]) {
    svg.append(s('line', { class: 'grid', x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }),
      s('text', { x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end' }, fr(v)));
  }
  let cy = parseDay(dom.t0).getFullYear(), cm = parseDay(dom.t0).getMonth();
  while (new Date(cy, cm, 1) <= parseDay(dom.t1)) {
    const fi = `${cy}-${String(cm + 1).padStart(2, '0')}-01`;
    if (fi >= dom.t0 && fi <= dom.t1) svg.append(s('text', { x: x(fi), y: H - 8, 'text-anchor': 'middle' }, MOIS[cm]));
    cm += 1;
    if (cm > 11) { cm = 0; cy += 1; }
  }
  if (ex.points.length > 1) {
    svg.append(s('polyline', { class: 'ef-line', points: ex.points.map((p) => `${x(p.date)},${y(p.kg)}`).join(' ') }));
  }
  ex.points.forEach((p) => {
    const g = s('g', { class: 'pt', tabindex: '0', role: 'img',
      'aria-label': `${ex.nom}, ${dayLabel(p.date)} : ${chargeLabel(p)}${p.serie ? ', ' + p.serie : ''}` });
    if (p.kgMax != null) g.append(s('line', { class: 'range', x1: x(p.date), x2: x(p.date), y1: y(p.kg), y2: y(p.kgMax) }));
    g.append(s('circle', { class: 'hit', cx: x(p.date), cy: y(p.kg), r: 12 }),
      s('circle', { class: `dot ${p.statut === 'mesure' ? 'm' : 'c'}`, cx: x(p.date), cy: y(p.kg), r: 4.5 }));
    svg.append(g);
    bindTip(g, () => [
      h('div', { class: 't' }, `${ex.nom} · ${dayLabel(p.date)}`),
      h('div', { class: 'v' }, chargeLabel(p)),
      p.serie ? h('div', {}, `Série : ${p.serie}`) : null,
      h('div', { class: 't' }, p.statut === 'mesure' ? 'Charge relevée' : '« Comme prévu » déclaré : la charge du plan, pas une mesure'),
      p.note ? h('div', { class: 't' }, p.note) : null,
      h('div', { class: 't' }, `Source : « ${p.extrait} »`),
    ].filter(Boolean));
  });
  return svg;
}

export function chargesSection(data) {
  const exs = chargesParExercice(data);
  const dates = data.charges.entries.map((e) => e.date).sort();
  const dom = { t0: addDays(dates[0], -4), t1: [addDays(dates[dates.length - 1], 4), todayIso()].sort().pop() };
  const lastDate = (ex) => ex.points[ex.points.length - 1].date;
  const multi = exs.filter((e) => e.points.length >= 2)
    .sort((a, b) => b.points.length - a.points.length || (lastDate(a) < lastDate(b) ? 1 : -1));
  const single = exs.filter((e) => e.points.length === 1);

  const cards = multi.map((ex) => {
    const last = ex.points[ex.points.length - 1];
    return h('div', { class: 'cmini' },
      h('div', { class: 'cm-h' }, h('strong', {}, ex.nom), h('span', { class: 'note' }, ex.unite)),
      h('div', { class: 'cm-v' }, h('span', { class: 'big' }, chargeLabel(last)),
        h('span', { class: 'note' }, ` · ${dayLabel(last.date)} · ${ex.points.length} séances`)),
      h('div', { class: 'chart' }, chargeMini(ex, dom)));
  });
  const legend = h('div', { class: 'legend' },
    h('span', {}, h('span', { class: 'key dotm' }), 'Charge relevée'),
    h('span', {}, h('span', { class: 'key dotc' }), '« Comme prévu » déclaré (pas une mesure)'),
    h('span', {}, h('span', { class: 'key rng' }), 'Fourchette ou séries à charges différentes'));
  const rows = (list) => list.map((e) => {
    const meta = data.charges.exercices[e.exercice] || { nom: e.exercice };
    return [dayLabel(e.date), meta.nom, chargeLabel(e), e.serie || '', e.statut === 'mesure' ? 'relevée' : 'comme prévu', e.extrait];
  });
  const head = ['Date', 'Exercice', 'Charge', 'Série', 'Statut', 'Citation du réalisé'];
  const sorted = [...data.charges.entries].sort((a, b) => (a.date < b.date ? 1 : -1));
  return [
    legend,
    h('div', { class: 'cgrid' }, cards),
    single.length ? tableView(['Exercice', 'Date', 'Charge', 'Série'],
      single.map((ex) => [ex.nom, dayLabel(ex.points[0].date), chargeLabel(ex.points[0]), ex.points[0].serie || '']),
      [], `${single.length} exercice${single.length > 1 ? 's' : ''} avec une seule charge relevée`) : null,
    tableView(head, rows(sorted), [], `Toutes les charges (${sorted.length})`),
  ];
}

/* ---------- km par mois ---------- */
export function monthlyKmChart(data) {
  const span = monthsSpan(data);
  const months = [];
  for (let ym = span.first; ym <= span.last; ym = shiftMonth(ym, 1)) months.push(ym);
  const stats = months.map((ym) => ({ ym, ts: trainingStats(data, monthDates(ym)) }));
  const W = 960, H = 260, m = { t: 22, r: 12, b: 30, l: 38 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const top = Math.ceil(Math.max(10, ...stats.map((x) => x.ts.km)) / 10) * 10;
  const y = (v) => m.t + ih - (v / top) * ih;
  const band = iw / months.length, bw = Math.min(48, band * 0.5);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': SVG_ARIA('Kilomètres de course documentés, mois par mois.') });
  grid(svg, m, W, y, top, 10, String);
  svg.append(s('text', { x: m.l - 8, y: m.t - 9, 'text-anchor': 'end' }, 'km'));
  const cur = todayIso().slice(0, 7);
  stats.forEach(({ ym, ts }, i) => {
    const cx = m.l + band * i + band / 2, xx = cx - bw / 2;
    const g = s('g', { class: 'col', tabindex: '0', role: 'img', 'aria-label': `${monthLabel(ym)} : ${fr(ts.km)} km${ts.partiel ? ' (partiel)' : ''}` });
    g.append(s('rect', { class: 'hit', x: m.l + band * i, y: m.t, width: band, height: ih }));
    if (ts.km > 0) {
      g.append(s('path', { class: `bar${ts.partiel ? ' partial' : ''}`, d: barPath(xx, y(ts.km), bw, y(0)) }),
        s('text', { class: 'val', x: cx, y: y(ts.km) - 6, 'text-anchor': 'middle' }, fr(ts.km)));
    }
    svg.append(g, s('text', { class: ym === cur ? 'cur' : '', x: cx, y: H - 10, 'text-anchor': 'middle' }, monthLabel(ym).split(' ')[0]));
    bindTip(g, () => [
      h('div', { class: 't' }, monthLabel(ym) + (ym === cur ? ' (en cours)' : '')),
      h('div', { class: 'v' }, `${fr(ts.km)} km documentés${ts.partiel ? ' (partiel)' : ''}`),
      h('div', {}, `${ts.faites} séance${ts.faites > 1 ? 's' : ''} faite${ts.faites > 1 ? 's' : ''} sur ${ts.prevues}`),
      ts.partiel ? h('div', { class: 't' }, 'Des séances de course n’ont pas de distance exploitable : le réel est supérieur.') : null,
    ].filter(Boolean));
  });
  const legend = h('div', { class: 'legend' }, legendItem('s1', 'Documenté'), legendItem('s1soft', 'Documenté, partiel (réel supérieur)'));
  const table = tableView(['Mois', 'Km documentés', 'Séances faites', 'Complétude'],
    stats.map(({ ym, ts }) => [monthLabel(ym), fr(ts.km), `${ts.faites} / ${ts.prevues}`, ts.km === 0 ? '—' : ts.partiel ? 'partiel' : 'complet']), [1, 2]);
  return [legend, h('div', { class: 'chart' }, svg), table];
}
