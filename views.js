/* Vues : Saison, Mois, Semaine, Courses. Chaque vue reçoit le conteneur et les données déjà chargées. */
import {
  h, fill, fr, parseDay, addDays, mondayOf, todayIso, daysTo, dayLabel, fullDate, rangeLabel, monthLabel,
  range7, shiftMonth, monthDates, secondes, hms, paceLabel, JOURS_COURTS, bindTip, tipRow, card, tableView, tile, legendItem, navLink, notice,
} from './lib.js';
import {
  CFG, KCAL, statutOf, currentWeek, trainingStats, efPoints, kcalStats, classeJour, monthsSpan, seanceMetrics,
} from './data.js';
import {
  volumeChart, efChart, kcalChart, kcalWeeksChart, adherence, chargesSection, monthlyKmChart, chargeLabel,
} from './charts.js';

const ef3 = (v) => (v == null ? '—' : v.toFixed(3).replace('.', ','));
const shortType = (t) => String(t).replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
const pad2 = (n) => String(n).padStart(2, '0');

/* ---------- blocs communs ---------- */
function nutritionNotices(data) {
  const nut = data.nutrition;
  if (!nut.ok) return notice(`Journal alimentaire indisponible : ${nut.reason}.`);
  if (nut.derniere && daysTo(nut.derniere) < -2) {
    return notice(`Le journal alimentaire s’arrête au ${fullDate(nut.derniere)} : les jours suivants n’ont pas encore été rapatriés dans le repo nutrition.`);
  }
  return null;
}

function kcalTile(label, st, nut) {
  if (!nut.ok) return null;
  if (st.mean == null) return tile(label, '—', 'aucune journée complète');
  const k = KCAL[st.classe];
  return tile(label, `${k.glyph} ${fr(st.mean, 0)} kcal/j`,
    `${st.n} jour${st.n > 1 ? 's' : ''} compté${st.n > 1 ? 's' : ''}${nut.cible ? ` · cible ${nut.cible.lo}–${nut.cible.hi}` : ''}`,
    `k-${st.classe}`);
}

function dayTipNodes(date, day, cls) {
  const nodes = [
    h('div', { class: 't' }, dayLabel(date)),
    h('div', { class: 'v' }, `${fr(day.kcal, 0)} kcal · ${fr(day.prot, 0)} g de protéines`),
    tipRow(`k-${cls}`, `${KCAL[cls].glyph} ${KCAL[cls].label}`),
  ];
  if (cls === 'incomplet') nodes.push(h('div', { class: 't' }, 'Aucun dîner saisi : exclue des moyennes.'));
  if (day.sport) nodes.push(h('div', { class: 't' }, `Sport : ${day.sport}`));
  return nodes;
}

/* Une case de calendrier : séances du jour (statut + type) et calories (pastille colorée). */
function calCell(data, date, inMonth) {
  const nut = data.nutrition;
  const info = data.index[date];
  const el = h('div', { class: `cal-cell${inMonth ? '' : ' out'}${date === todayIso() ? ' today' : ''}` },
    h('div', { class: 'cal-d' }, String(parseDay(date).getDate())));
  for (const x of info ? info.seances : []) {
    const st = statutOf(x.statut);
    const chip = h('div', { class: `cal-s ${st.cls}`, tabindex: '0', 'aria-label': `${dayLabel(date)} : ${x.type}, ${st.label}` },
      h('span', { class: 'g' }, st.glyph), h('span', { class: 't' }, shortType(x.type)));
    bindTip(chip, () => [
      h('div', { class: 't' }, `${x.sem} · ${dayLabel(date)}`),
      h('div', { class: 'v' }, x.type),
      tipRow(st.cls, `${st.glyph} ${st.label}`),
      x.km ? h('div', {}, `${fr(x.km)} km`) : null,
      x.ef ? h('div', {}, `EF ${ef3(x.ef.ef)}`) : null,
    ].filter(Boolean));
    el.append(chip);
  }
  const day = nut.ok ? nut.days[date] : null;
  if (day) {
    const cls = classeJour(day, nut.cible);
    const pill = h('div', { class: `cal-k k-${cls}`, tabindex: '0',
      'aria-label': `${dayLabel(date)} : ${fr(day.kcal, 0)} kcal, ${KCAL[cls].label}` }, `${KCAL[cls].glyph} ${fr(day.kcal, 0)}`);
    bindTip(pill, () => dayTipNodes(date, day, cls));
    el.append(pill);
  }
  return el;
}

function weekSummary(data, monday) {
  const dates = range7(monday);
  const ts = trainingStats(data, dates);
  const wk = data.weekByMonday[monday];
  const ks = data.nutrition.ok ? kcalStats(dates, data.nutrition) : null;
  const el = h('div', { class: 'cal-sum' }, h('div', { class: 'cal-sum-h' }, wk ? wk.sem : '—'));
  if (ts.n) el.append(h('div', {}, `${fr(ts.km)} km${ts.partiel ? '*' : ''}`), h('div', { class: 'note' }, `${ts.faites}/${ts.prevues} séances`));
  if (ks && ks.mean != null) el.append(h('div', { class: `cal-k k-${ks.classe}` }, `${KCAL[ks.classe].glyph} ${fr(ks.mean, 0)}`));
  return el;
}

function efChartCard(data) {
  const pts = efPoints(data);
  return card('Efficience aérobie',
    `Vitesse (m/min) ÷ FC moyenne, sorties Z2 uniquement : plus c’est haut, plus tu vas vite à fréquence cardiaque égale. ${pts.length} sorties exploitables : la chaleur, le parcours et la fatigue font bouger l’EF autant que la forme, donc lis la tendance, pas un point.`,
    ...efChart(pts));
}

/* ---------- Saison ---------- */
export function viewSaison(app, data, warnings) {
  const cur = currentWeek(data);
  const j = daysTo(CFG.raceDate);
  const nut = data.nutrition;
  const courseOk = data.courses.filter((c) => /Men Open/i.test(String(c.format)) && secondes(c.chrono_officiel));
  const best = courseOk.reduce((a, c) => (!a || secondes(c.chrono_officiel) < secondes(a.chrono_officiel) ? c : a), null);
  const ts = trainingStats(data, range7(mondayOf(cur.debut)));

  const items = [];
  if (nut.ok) {
    const mondays = [...new Set(Object.keys(nut.days).map(mondayOf))].sort();
    for (const mon of mondays) {
      const st = kcalStats(range7(mon), nut);
      if (st.mean == null) continue;
      const wk = data.weekByMonday[mon];
      items.push({ label: wk ? wk.sem : `${parseDay(mon).getDate()}/${pad2(parseDay(mon).getMonth() + 1)}`,
        monday: mon, mean: st.mean, n: st.n, incomplets: st.incomplets, classe: st.classe });
    }
  }

  fill(app, {}, [
    warnings.length ? notice(warnings.join(' · ')) : null,
    nutritionNotices(data),
    h('section', { class: 'hero' },
      h('div', { class: 'hero-fig' }, j >= 0 ? `J-${j}` : `J+${-j}`),
      h('div', { class: 'hero-sub' }, `avant Hyrox Paris — dimanche ${fullDate(CFG.raceDate)} · Mixed Doubles`)),
    h('div', { class: 'tiles' },
      tile('Cible chrono', data.cibleChrono || '—', best ? `départ ${best.chrono_officiel}` : null),
      best ? tile('Meilleur chrono (Men Open)', best.chrono_officiel, `${best.nom}, ${fullDate(best.date)}`) : null,
      data.vma && data.vma.actuelle != null ? tile('VMA', `${fr(data.vma.actuelle)} km/h`, data.vma.cible != null ? `cible ${fr(data.vma.cible)} km/h` : null) : null,
      tile(`Semaine ${cur.sem}`, `${ts.faites} / ${ts.prevues}`, 'séances faites')),
    card('Volume de course par semaine', 'Kilomètres courus, tels qu’ils sont documentés dans le réalisé, face à la cible du plan.', ...volumeChart(data, cur.num)),
    nut.ok
      ? card('Calories par semaine', `Moyenne par jour, semaine par semaine${nut.cible ? ` — cible ${nut.cible.lo}–${nut.cible.hi} kcal${nut.cible.mode ? ` (mode « ${nut.cible.mode} »)` : ''}` : ''}. Les jours sans dîner saisi sont exclus.`,
        ...(items.length ? kcalWeeksChart(items, nut) : [h('p', { class: 'note' }, 'Aucune semaine avec une journée complète.')]))
      : null,
    card('Séances par semaine', 'Une case par séance. Les séances déplacées dans la semaine ne comptent pas dans le total.', ...adherence(data, cur.num)),
  ]);
}

/* ---------- Mois ---------- */
export function viewMois(app, data, arg) {
  const span = monthsSpan(data);
  let ym = /^\d{4}-\d{2}$/.test(arg || '') ? arg : todayIso().slice(0, 7);
  if (ym < span.first) ym = span.first;
  if (ym > span.last) ym = span.last;
  const nut = data.nutrition;
  const mDates = monthDates(ym);
  const start = mondayOf(mDates[0]);
  const end = addDays(mondayOf(mDates[mDates.length - 1]), 6);

  const ts = trainingStats(data, mDates);
  const ks = nut.ok ? kcalStats(mDates, nut) : null;

  const cal = h('div', { class: 'cal' },
    ...[...JOURS_COURTS, 'semaine'].map((d) => h('div', { class: 'cal-h' }, d)));
  for (let mon = start; mon <= end; mon = addDays(mon, 7)) {
    range7(mon).forEach((d) => cal.append(calCell(data, d, d.startsWith(ym))));
    cal.append(weekSummary(data, mon));
  }

  fill(app, {}, [
    h('div', { class: 'weekbar' },
      navLink(`#/mois/${shiftMonth(ym, -1)}`, '← Mois précédent', ym <= span.first),
      h('h2', { class: 'cap' }, monthLabel(ym)),
      navLink(`#/mois/${shiftMonth(ym, 1)}`, 'Mois suivant →', ym >= span.last)),
    nutritionNotices(data),
    h('div', { class: 'tiles' },
      tile('Km courus', `${fr(ts.km)} km`, ts.partiel ? 'partiel : des distances manquent dans le réalisé' : 'documentés dans le réalisé'),
      tile('Séances faites', `${ts.faites} / ${ts.prevues}`, 'les séances déplacées ne comptent pas'),
      tile('Efficience moyenne', ef3(ts.efMean), ts.efN ? `${ts.efN} sortie${ts.efN > 1 ? 's' : ''} Z2` : 'aucune sortie Z2 exploitable'),
      ks ? kcalTile('Calories moyennes', ks, nut) : null),
    card('Calendrier', 'Séances (statut + type) et calories du jour. Dernière colonne : bilan de la semaine (* = distances incomplètes).', cal),
    nut.ok ? card('Calories par jour', null, ...kcalChart(mDates, nut)) : null,
  ]);
}

/* ---------- Semaine ---------- */
const chip = (cls, ...kids) => h('span', { class: `m ${cls || ''}`.trim() }, ...kids);

/* Plan et réel côte à côte : l'écart au plan est l'information la plus utile. */
function kmBars(x, mt) {
  const real = x.km, plan = mt.planKm;
  if (!real && !plan) return null;
  const max = Math.max(real || 0, plan || 0);
  const row = (label, cls, v, extra) => {
    const b = h('div', { class: `kb ${cls}` });
    b.style.width = `${(v / max) * 100}%`;
    return h('div', { class: 'kmrow' }, h('span', { class: 'kl' }, label), h('div', { class: 'kt' }, b),
      h('span', { class: 'kv' }, `${fr(v, 2)} km`, extra));
  };
  const delta = real && plan ? Math.round((real / plan - 1) * 100) : null;
  return h('div', { class: 'kmbars' },
    plan ? row('plan', 'plan', plan) : null,
    real ? row('réel', 'real', real, delta != null ? h('span', { class: 'delta' }, ` ${delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : ''}${delta} %`) : null) : null);
}

/* Une séance en un coup d'œil : statut, chiffres, charges levées. Le texte (plan, réalisé, débrief) est replié. */
function sessionCard(x, data) {
  const st = statutOf(x.statut);
  const mt = seanceMetrics(x);
  const nom = (k) => (data.charges.exercices[k] ? data.charges.exercices[k].nom : k);
  const charges = data.charges.ok ? data.charges.entries.filter((e) => e.date === x.date) : [];
  const chips = [];
  if (mt.planDuree) chips.push(chip('ghost', `plan ${mt.planDuree}`));
  if (x.ef) chips.push(chip('', `${paceLabel(x.ef.pace)} · FC ${x.ef.fc} · EF ${ef3(x.ef.ef)}`));
  else if (mt.fc) chips.push(chip('', `FC moy ${mt.fc}`));
  if (mt.rpe) chips.push(chip('', `RPE ${mt.rpe}${mt.rpePlan ? ` · cible ${mt.rpePlan}` : ''}`));
  const lines = [['Échauffement', x.plan.echauffement], ['Corps', x.plan.corps], ['Retour au calme', x.plan.retour_calme],
    ['Intensité', x.plan.intensite], ['Notes du coach', x.plan.notes_coach]].filter(([, v]) => v && String(v).trim() !== '—');
  const sec = (title, kids) => (kids.length ? h('div', { class: 'sec' }, h('h4', {}, title), ...kids) : null);
  const para = (v) => h('div', { class: 'txt' }, String(v));
  const body = [
    sec('Plan', lines.map(([l, v]) => h('div', { class: 'txt' }, h('strong', {}, `${l} — `), String(v)))),
    sec('Réalisé', [x.detail && para(x.detail), x.ressenti && h('div', { class: 'txt' }, h('strong', {}, 'Ressenti — '), String(x.ressenti))].filter(Boolean)),
    sec('Débrief', x.debrief ? [para(x.debrief)] : []),
  ].filter(Boolean);
  return h('article', { class: `sess s-${st.cls}` },
    h('div', { class: 'sess-h' },
      h('span', { class: 'sess-d' }, x.date ? dayLabel(x.date) : (x.jour || '')),
      h('span', { class: 'sess-t' }, x.type),
      h('span', { class: `chip ${st.cls}` }, `${st.glyph} ${st.label}`)),
    chips.length ? h('div', { class: 'metrics' }, ...chips) : null,
    kmBars(x, mt),
    charges.length ? h('div', { class: 'metrics' }, ...charges.map((e) =>
      chip(e.statut === 'mesure' ? 'c-mes' : 'c-cp', h('strong', {}, nom(e.exercice)), ` ${chargeLabel(e)}`))) : null,
    mt.alerte ? h('div', { class: 'alerte' }, mt.alerte) : null,
    body.length ? h('details', { class: 'more' }, h('summary', {}, 'Détails'), ...body) : null);
}

export function viewSemaine(app, data, wanted) {
  const w = data.weeks.find((x) => x.sem === wanted) || currentWeek(data);
  const i = data.weeks.indexOf(w);
  const prev = data.weeks[i - 1], next = data.weeks[i + 1];
  const nut = data.nutrition;
  const dates = range7(mondayOf(w.debut));
  const ts = trainingStats(data, dates);
  const ks = nut.ok ? kcalStats(dates, nut) : null;
  const select = h('select', { 'aria-label': 'Semaine', onchange: (e) => { location.hash = `#/semaine/${e.target.value}`; } },
    data.weeks.map((x) => h('option', { value: x.sem, selected: x.sem === w.sem }, `${x.sem} · ${x.debut ? rangeLabel(x.debut, x.fin) : ''}`)));

  const strip = h('div', { class: 'cal week' }, ...JOURS_COURTS.map((d) => h('div', { class: 'cal-h' }, d)));
  dates.forEach((d) => strip.append(calCell(data, d, true)));
  const contexte = w.objectif || w.avertissement;

  fill(app, {}, [
    h('div', { class: 'weekbar' },
      navLink(prev ? `#/semaine/${prev.sem}` : '#', `← ${prev ? prev.sem : ''}`, !prev),
      select,
      navLink(next ? `#/semaine/${next.sem}` : '#', `${next ? next.sem : ''} →`, !next)),
    nutritionNotices(data),
    h('div', { class: 'tiles' },
      tile('Km courus', `${fr(ts.km)} km`, `${w.cible != null ? `cible du plan ${fr(w.cible)} km` : 'sans cible'}${ts.partiel ? ' · partiel' : ''}`),
      tile('Séances faites', `${ts.faites} / ${ts.prevues}`, 'les déplacées ne comptent pas'),
      tile('Efficience moyenne', ef3(ts.efMean), ts.efN ? `${ts.efN} sortie${ts.efN > 1 ? 's' : ''} Z2` : 'aucune sortie Z2'),
      ks ? kcalTile('Calories moyennes', ks, nut) : null),
    h('section', { class: 'card wkhead' },
      h('div', { class: 'wk-t' },
        h('h2', {}, `${w.sem} · ${rangeLabel(dates[0], dates[6])}`),
        w.bloc || w.phase ? h('span', { class: 'tag' }, [w.bloc, w.phase].filter(Boolean).join(' · ')) : null),
      strip,
      contexte ? h('details', { class: 'more' }, h('summary', {}, 'Objectif et note de volume'),
        w.objectif ? h('div', { class: 'txt' }, String(w.objectif)) : null,
        w.avertissement ? h('div', { class: 'txt note' }, String(w.avertissement)) : null) : null),
    nut.ok ? card('Calories par jour', null, ...kcalChart(dates, nut, { W: 760, values: true, jours: true })) : null,
    h('div', { class: 'sessions' }, w.seances.map((x) => sessionCard(x, data))),
  ]);
}

/* ---------- Analyse ---------- */
export function viewAnalyse(app, data) {
  const ch = data.charges;
  fill(app, {}, [
    h('h2', {}, 'Analyse'),
    ch.ok && ch.entries.length
      ? card('Charges par exercice',
        `${ch.entries.length} charges relevées dans les réalisés, chacune citée mot pour mot dans historique/charges_par_exercice.yaml. Chaque petit graphique a sa propre échelle : compare les trajectoires, pas les kilos d’un exercice à l’autre.`,
        ...chargesSection(data))
      : card('Charges par exercice', null,
        notice('Le fichier historique/charges_par_exercice.yaml est introuvable sur la branche main de hyrox-coach. S’il vient d’être ajouté sur une autre branche, il apparaîtra après sa fusion dans main.')),
    efChartCard(data),
    card('Km par mois', 'Kilomètres de course documentés dans le réalisé, mois par mois.', ...monthlyKmChart(data)),
  ]);
}

/* ---------- Courses ---------- */
export function viewCourses(app, data) {
  const legend = h('div', { class: 'legend' }, legendItem('s1', 'Run'), legendItem('s2', 'Workouts (stations)'), legendItem('s3', 'Roxzone'));
  const cards = data.courses.map((c) => {
    const sp = c.splits || {};
    const parts = [['s1', 'Run', secondes(sp.run_total)], ['s2', 'Workouts', secondes(sp.workouts)], ['s3', 'Roxzone', secondes(sp.roxzone)]];
    const sum = parts.reduce((a, p) => a + p[2], 0);
    const stack = h('div', { class: 'stack', role: 'img', 'aria-label': parts.map((p) => `${p[1]} ${hms(p[2])}`).join(', ') },
      sum ? parts.map((p) => {
        const seg = h('div', { class: p[0], title: `${p[1]} ${hms(p[2])}` }, hms(p[2]));
        seg.style.width = `${(p[2] / sum) * 100}%`;
        return seg;
      }) : null);
    const notes = [c.ecart_vs_precedent && `Écart : ${c.ecart_vs_precedent}`, c.penalites && `Pénalités : ${c.penalites}`, c.reserve && `Réserve : ${c.reserve}`,
      c.chrono_propre_estime && `Chrono propre estimé : ${c.chrono_propre_estime}`, c.fc_moyenne_amarine && `FC moyenne : ${c.fc_moyenne_amarine}`].filter(Boolean);
    const stations = c.stations && Object.keys(c.stations).length
      ? tableView(['Station', 'Temps'], Object.entries(c.stations).map(([k, v]) => [k.replace(/_/g, ' '), String(v)]), [1], 'Temps par station') : null;
    const runs = Array.isArray(c.runs) && c.runs.length ? h('p', { class: 'note' }, `Runs : ${c.runs.join(' · ')}`) : null;
    return h('section', { class: 'card race' },
      h('div', { class: 'race-h' }, h('h3', {}, c.nom), h('span', { class: 'note' }, `${fullDate(c.date)} · ${c.format || ''}`)),
      h('div', { class: 'race-chrono' }, String(c.chrono_officiel)),
      stack,
      h('div', { class: 'note' }, parts.map((p) => `${p[1]} ${hms(p[2])}`).join(' · ')),
      ...notes.map((n) => h('p', { class: 'note' }, n)), runs, stations,
      c.lecture ? h('details', { class: 'table-view' }, h('summary', {}, 'Lecture du coach'), h('div', { class: 'txt note' }, String(c.lecture).trim())) : null);
  });
  const leviers = card('Leviers restants', 'Là où se trouvent les secondes, par priorité.',
    tableView(['#', 'Levier', 'État', 'Impact estimé'], data.leviers.map((l) => [String(l.priorite), l.levier, l.etat, l.impact_estime || '']), [0]));
  fill(app, {}, [h('h2', {}, 'Courses'), legend, ...cards, leviers]);
  const det = leviers.querySelector('details.table-view');
  if (det) det.open = true;
  // Une étiquette ne s'affiche que si elle tient dans son segment ; la valeur reste dans la ligne de texte.
  requestAnimationFrame(() => app.querySelectorAll('.stack > div').forEach((seg) => {
    if (seg.scrollWidth > seg.clientWidth) seg.textContent = '';
  }));
}
