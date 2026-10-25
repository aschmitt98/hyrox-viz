/* Données : lecture des deux repos privés via l'API GitHub, extraction, agrégats.
 * L'extraction de la course et de l'efficience reprend les règles de scripts/build.py
 * (repo hyrox-coach) : si elles y changent, il faut les changer ici. */
import { iso, todayIso, mondayOf, addDays } from './lib.js';

export const CFG = {
  coach: { owner: 'aschmitt98', repo: 'hyrox-coach', branch: 'main' },
  nutrition: { owner: 'aschmitt98', repo: 'nutrition', branch: 'main' },
  raceDate: '2026-12-13',
  tokenKey: 'hyrox_viz_token',
  // Marge autour de la cible pour colorer un JOUR : un journal estimé n'est pas précis à 100 kcal près.
  // Les moyennes (semaine, mois) se comparent à la cible stricte.
  tolerance: 100,
};

export const STATUTS = {
  fait:     { label: 'Fait',     glyph: '✓', cls: 'fait' },
  partiel:  { label: 'Partiel',  glyph: '½', cls: 'partiel' },
  skipped:  { label: 'Sautée',   glyph: '✕', cls: 'skipped' },
  deplacee: { label: 'Déplacée', glyph: '↔', cls: 'deplacee' },
  prevu:    { label: 'À venir',  glyph: '·', cls: 'prevu' },
};
export const statutOf = (k) => STATUTS[k] || { label: 'Autre', glyph: '?', cls: 'autre' };

export const KCAL = {
  dans:      { label: 'Dans la cible',          glyph: '✓' },
  sous:      { label: 'Sous la cible',          glyph: '▼' },
  haut:      { label: 'Au-dessus de la cible',  glyph: '▲' },
  incomplet: { label: 'Journée incomplète',     glyph: '…' },
  neutre:    { label: 'Cible inconnue',         glyph: '' },
};

/* ---------- extraction (port de scripts/build.py) ---------- */
export function nombre(v) {
  if (v == null) return null;
  const m = String(v).match(/(\d+(?:[.,]\d+)?)/);
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}
// « 4,63 km (~9:42/km) » → 4.63 ; « tapis @ 6.5 km/h » → null (une vitesse n'est pas une distance).
export function distanceKm(detail) {
  if (!detail) return null;
  const t = String(detail);
  const m = t.match(/(\d+[.,]\d+)\s*km(?!\s*\/\s*h)\b/);
  if (m) return parseFloat(m[1].replace(',', '.'));
  const duree = t.match(/(\d+)(?::(\d\d))?\s*min/) || t.match(/\b(\d+):(\d\d)\b/);
  const allure = t.match(/(\d+):(\d\d)\s*\/\s*km/);
  if (duree && allure) {
    const mins = parseInt(duree[1], 10) + (duree[2] ? parseInt(duree[2], 10) / 60 : 0);
    const pace = parseInt(allure[1], 10) + parseInt(allure[2], 10) / 60;
    return Math.round((mins / pace) * 100) / 100;
  }
  return null;
}
// Les parenthèses sont du commentaire : « Force LÉGÈRE (au lieu de TEST VMA) » n'est pas de la course.
export function estCourse(type) {
  const t = String(type || '').replace(/\([^)]*\)/g, '');
  return /Z2|VMA|Tempo|Run|Long|Footing|course|Hyrox|SIM|VAMEVAL/i.test(t);
}
// Efficience = vitesse (m/min) / FC moyenne. Sur une séance mixte (Z2 + lignes droites, VMA…),
// seul un « Bloc Z2 : allure, FC moy » isolé est exploitable : sinon on ne renvoie rien.
const MIXTE = /lignes droites|strides|fractionn|VMA|VAMEVAL|tempo/i;
export function efSeance(blob, type) {
  let t = String(blob || '');
  if (MIXTE.test(String(type || ''))) {
    const bloc = t.match(/[Bb]loc Z2\s*:([^\n]{0,90})/);
    if (!bloc) return null;
    t = bloc[1];
  }
  const a = t.match(/(\d+):(\d\d)\s*\/\s*km/);
  const f = t.match(/(?:FC\s*)?moy(?:enne)?\.?\s*:?\s*(\d{2,3})/i);
  if (!(a && f)) return null;
  const pace = parseInt(a[1], 10) + parseInt(a[2], 10) / 60;
  const fc = parseInt(f[1], 10);
  if (!(fc > 100 && fc < 210 && pace > 3 && pace < 15)) return null;
  return { ef: Math.round(((1000 / pace) / fc) * 1000) / 1000, fc, pace };
}

export function parseWeek(w) {
  const num = parseInt(String(w.semaine).slice(1), 10);
  const seances = (w.seances || []).map((x) => {
    const r = x.realise || {};
    const statut = r.statut || 'prevu';
    const blob = [r.statut_source, r.detail, r.rpe_fc_sensations, r.debrief].map((v) => (v ? String(v) : '')).join(' ');
    const course = (statut === 'fait' || statut === 'partiel') && estCourse(x.type);
    const ef = efSeance(blob, x.type);
    return {
      date: iso(x.date), jour: x.jour, type: x.type || '—', plan: x.plan || {}, statut,
      source: r.statut_source, detail: r.detail, ressenti: r.rpe_fc_sensations, debrief: r.debrief,
      course, km: course ? distanceKm(r.detail) : null,
      ef: ef && /Z2|Footing/i.test(String(x.type || '')) ? ef : null,
    };
  });
  let doc = 0, manquantes = 0;
  for (const x of seances) if (x.course) { if (x.km) doc += x.km; else manquantes++; }
  const dates = seances.map((x) => x.date).filter(Boolean).sort();
  return {
    sem: String(w.semaine), num, bloc: w.bloc, phase: w.phase, objectif: w.objectif,
    cible: nombre(w.volume_run_cible_km), avertissement: w.volume_run_cible_statut,
    cibleChrono: w.cible_chrono && w.cible_chrono.valeur,
    seances, debut: dates[0], fin: dates[dates.length - 1],
    doc: doc ? Math.round(doc * 10) / 10 : null, partiel: manquantes > 0,
  };
}

/* ---------- accès GitHub ---------- */
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export async function ghGet(repo, path, token, dir) {
  // `t` contourne le cache navigateur (GitHub répond max-age=60) ; un seul en-tête non standard
  // (Authorization) pour que la requête préliminaire CORS reste celle que l'API accepte partout.
  const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/contents/${path}?ref=${encodeURIComponent(repo.branch)}&t=${Date.now()}`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: dir ? 'application/vnd.github+json' : 'application/vnd.github.raw+json',
    },
  });
  if (!r.ok) throw new ApiError(r.status, `${r.status} sur ${repo.repo}/${path}`);
  return dir ? r.json() : r.text();
}

async function loadCoach(token) {
  const warnings = [];
  const listing = await ghGet(CFG.coach, 'plan/semaines', token, true);
  const names = listing.filter((f) => f.type === 'file' && /^W\d+\.yaml$/.test(f.name)).map((f) => f.name);
  if (!names.length) throw new ApiError(404, 'Aucun fichier W<n>.yaml trouvé dans plan/semaines');
  const [weekTexts, coursesText, profilsText] = await Promise.all([
    Promise.all(names.map((n) => ghGet(CFG.coach, `plan/semaines/${n}`, token))),
    ghGet(CFG.coach, 'historique/courses.yaml', token),
    ghGet(CFG.coach, 'coach/profils.yaml', token).catch(() => null),
  ]);
  const weeks = [];
  weekTexts.forEach((txt, i) => {
    try { weeks.push(parseWeek(jsyaml.load(txt))); }
    catch (e) { warnings.push(`${names[i]} illisible : ${e.message.split('\n')[0]}`); }
  });
  weeks.sort((a, b) => a.num - b.num);
  let courses = { courses: [], leviers_restants: [] };
  try { courses = jsyaml.load(coursesText) || courses; } catch (e) { warnings.push(`courses.yaml illisible : ${e.message.split('\n')[0]}`); }
  let vma = null;
  try {
    const c = profilsText && jsyaml.load(profilsText).amarine.course;
    if (c) vma = { actuelle: c.vma_kmh, cible: c.vma_cible_dec_2026 };
  } catch (e) { /* tuile VMA omise */ }
  const withChrono = weeks.filter((w) => w.cibleChrono);
  return {
    weeks, warnings, vma,
    cibleChrono: withChrono.length ? String(withChrono[withChrono.length - 1].cibleChrono) : null,
    courses: (courses.courses || []).map((c) => ({ ...c, date: iso(c.date) })),
    leviers: courses.leviers_restants || [],
  };
}

/* ---------- nutrition ---------- */
export function summarizeDay(j) {
  const e = Array.isArray(j.entrees) ? j.entrees : [];
  const sum = (k) => Math.round(e.reduce((a, x) => a + (Number(x[k]) || 0), 0));
  const repas = new Set(e.map((x) => x.repas));
  return {
    date: j.date, kcal: sum('kcal'), prot: sum('prot'), fibres: sum('fibres'), n: e.length,
    repas: [...repas], diner: repas.has('diner'), poids: j.poids == null ? null : j.poids, sport: j.sport || null,
  };
}
// Lit la cible actuelle dans profil.md (même règle que scripts/sync_journal.py du repo nutrition).
export function parseCible(md) {
  const i = md.indexOf('## Cibles quotidiennes');
  if (i < 0) return null;
  const rest = md.slice(i + 22);
  const j = rest.search(/\n## /);
  const bloc = j < 0 ? rest : rest.slice(0, j);
  const k = bloc.match(/(\d{3,4})\s*[-–]\s*(\d{3,4})/);
  if (!k) return null;
  const p = bloc.match(/prot[ée]ines?\D{0,12}(\d{2,3})\s*g/i);
  const mode = md.match(/## Mode actuel\s*\n+\s*\*\*([^*]+)\*\*/);
  return { lo: +k[1], hi: +k[2], prot: p ? +p[1] : null, mode: mode ? mode[1].trim() : null };
}
async function loadNutrition(token) {
  try {
    const listing = await ghGet(CFG.nutrition, 'data/journal', token, true);
    const names = listing.filter((f) => f.type === 'file' && /^\d{4}-\d{2}\.json$/.test(f.name)).map((f) => f.name);
    const [texts, profil] = await Promise.all([
      Promise.all(names.map((n) => ghGet(CFG.nutrition, `data/journal/${n}`, token))),
      ghGet(CFG.nutrition, 'profil.md', token),
    ]);
    const days = {};
    texts.forEach((t) => {
      for (const [date, j] of Object.entries(JSON.parse(t))) days[date] = summarizeDay({ ...j, date });
    });
    const cible = parseCible(profil);
    return { ok: true, days, cible, derniere: Object.keys(days).sort().pop() || null };
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) throw e;
    const acces = e instanceof ApiError && (e.status === 404 || e.status === 403);
    return {
      ok: false, days: {}, cible: null,
      reason: acces
        ? `le token n’a pas accès au repo ${CFG.nutrition.repo} (Repository access, avec Contents : Read-only)`
        : `lecture impossible (${e.message})`,
    };
  }
}

export async function loadAll(token) {
  const [coach, nutrition] = await Promise.all([loadCoach(token), loadNutrition(token)]);
  return { ...coach, nutrition, index: null };
}

/* ---------- dérivés ---------- */
export function buildIndex(data) {
  const index = {};
  for (const w of data.weeks) {
    for (const x of w.seances) {
      if (!x.date) continue;
      (index[x.date] = index[x.date] || { date: x.date, seances: [] }).seances.push({ ...x, sem: w.sem });
    }
  }
  data.index = index;
  data.weekByMonday = Object.fromEntries(data.weeks.filter((w) => w.debut).map((w) => [mondayOf(w.debut), w]));
  return data;
}

export function currentWeek(data) {
  const t = todayIso();
  const inRange = data.weeks.find((w) => w.debut && w.debut <= t && t <= w.fin);
  if (inRange) return inRange;
  const started = data.weeks.filter((w) => w.seances.some((x) => x.statut !== 'prevu'));
  return started[started.length - 1] || data.weeks[0];
}

export function trainingStats(data, dates) {
  const set = new Set(dates);
  const ss = data.weeks.flatMap((w) => w.seances).filter((x) => set.has(x.date));
  let km = 0, manque = 0;
  for (const x of ss) if (x.course) { if (x.km) km += x.km; else manque++; }
  const efs = ss.filter((x) => x.ef).map((x) => x.ef.ef);
  return {
    n: ss.length,
    faites: ss.filter((x) => x.statut === 'fait').length,
    prevues: ss.filter((x) => x.statut !== 'deplacee').length,
    km: Math.round(km * 10) / 10, partiel: manque > 0,
    efMean: efs.length ? efs.reduce((a, b) => a + b, 0) / efs.length : null, efN: efs.length,
  };
}

export function efPoints(data) {
  return data.weeks.flatMap((w) => w.seances.filter((x) => x.ef).map((x) => ({
    date: x.date, sem: w.sem, type: x.type, ef: x.ef.ef, fc: x.ef.fc, pace: x.ef.pace,
  }))).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/* Un jour sans dîner saisi est considéré incomplet : exclu des moyennes, jamais compté « sous la cible ». */
export function classeJour(day, cible) {
  if (!day || !day.diner) return 'incomplet';
  if (!cible) return 'neutre';
  if (day.kcal < cible.lo - CFG.tolerance) return 'sous';
  if (day.kcal > cible.hi + CFG.tolerance) return 'haut';
  return 'dans';
}
export function classeMoyenne(m, cible) {
  if (m == null) return null;
  if (!cible) return 'neutre';
  return m < cible.lo ? 'sous' : m > cible.hi ? 'haut' : 'dans';
}
export function kcalStats(dates, nut) {
  const known = dates.map((d) => nut.days[d]).filter(Boolean);
  const full = known.filter((x) => x.diner);
  const mean = full.length ? full.reduce((a, x) => a + x.kcal, 0) / full.length : null;
  return { n: full.length, mean, incomplets: known.length - full.length, classe: classeMoyenne(mean, nut.cible) };
}
export function monthsSpan(data) {
  const all = data.weeks.flatMap((w) => [w.debut, w.fin]).filter(Boolean).sort();
  return { first: all[0].slice(0, 7), last: all[all.length - 1].slice(0, 7) };
}
export { addDays };
