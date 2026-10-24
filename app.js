'use strict';
/* Prépa Hyrox — page de visualisation.
 *
 * Aucune donnée dans ce repo : la page lit les fichiers YAML du repo privé via l'API GitHub,
 * avec un token fine-grained (Contents : lecture seule) saisi par l'utilisatrice. Les données
 * restent en mémoire ; seul le token peut être mémorisé (case à cocher).
 */
(function () {
  const CFG = {
    owner: 'aschmitt98',
    repo: 'hyrox-coach',
    branch: 'main',
    raceDate: '2026-12-13',
    tokenKey: 'hyrox_viz_token',
  };

  const STATUTS = {
    fait:     { label: 'Fait',     glyph: '✓', cls: 'fait' },
    partiel:  { label: 'Partiel',  glyph: '½', cls: 'partiel' },
    skipped:  { label: 'Sautée',   glyph: '✕', cls: 'skipped' },
    deplacee: { label: 'Déplacée', glyph: '↔', cls: 'deplacee' },
    prevu:    { label: 'À venir',  glyph: '·', cls: 'prevu' },
  };
  const AUTRE = { label: 'Autre', glyph: '?', cls: 'autre' };
  const statutOf = (k) => STATUTS[k] || AUTRE;

  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

  const state = { data: null, warnings: [] };

  /* ---------- DOM ---------- */
  const SVGNS = 'http://www.w3.org/2000/svg';
  function fill(el, attrs, kids) {
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid);                       // un texte devient un nœud texte : jamais d'innerHTML
    }
    return el;
  }
  const h = (tag, attrs, ...kids) => fill(document.createElement(tag), attrs, kids);
  const s = (tag, attrs, ...kids) => fill(document.createElementNS(SVGNS, tag), attrs, kids);
  const $ = (id) => document.getElementById(id);

  /* ---------- formats ---------- */
  const fr = (n, d = 1) => (n == null ? '—' : n.toLocaleString('fr-FR', { maximumFractionDigits: d }));
  const iso = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? '' : String(v).trim());
  const parseDay = (i) => { const [y, m, d] = i.split('-').map(Number); return new Date(y, m - 1, d); };
  const dayLabel = (i) => { const d = parseDay(i); return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`; };
  const fullDate = (i) => { const d = parseDay(i); return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`; };
  function rangeLabel(a, b) {
    const da = parseDay(a), db = parseDay(b);
    return da.getMonth() === db.getMonth()
      ? `${da.getDate()} – ${db.getDate()} ${MOIS[db.getMonth()]}`
      : `${da.getDate()} ${MOIS[da.getMonth()]} – ${db.getDate()} ${MOIS[db.getMonth()]}`;
  }
  const todayIso = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
  const daysTo = (i) => Math.round((parseDay(i) - parseDay(todayIso())) / 86400000);

  /* ---------- extraction (port de scripts/build.py du repo de données) ---------- */
  function nombre(v) {
    if (v == null) return null;
    const m = String(v).match(/(\d+(?:[.,]\d+)?)/);
    return m ? parseFloat(m[1].replace(',', '.')) : null;
  }
  // « 4,63 km (~9:42/km) » → 4.63 ; « tapis @ 6.5 km/h » → null (une vitesse n'est pas une distance).
  function distanceKm(detail) {
    if (!detail) return null;
    const t = String(detail);
    let m = t.match(/(\d+[.,]\d+)\s*km(?!\s*\/\s*h)\b/);
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
  function estCourse(type) {
    const t = String(type || '').replace(/\([^)]*\)/g, '');
    return /Z2|VMA|Tempo|Run|Long|Footing|course|Hyrox|SIM|VAMEVAL/i.test(t);
  }
  function secondes(txt) {
    const p = (String(txt).match(/\d+/g) || []).map(Number);
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : 0;
  }
  function hms(sec) {
    const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = Math.round(sec % 60);
    const p2 = (n) => String(n).padStart(2, '0');
    return hh ? `${hh}h${p2(mm)}:${p2(ss)}` : `${mm}:${p2(ss)}`;
  }

  function parseWeek(w) {
    const num = parseInt(String(w.semaine).slice(1), 10);
    const seances = (w.seances || []).map((x) => {
      const r = x.realise || {};
      return {
        date: iso(x.date), jour: x.jour, type: x.type || '—', plan: x.plan || {},
        statut: r.statut || 'prevu', source: r.statut_source, detail: r.detail,
        ressenti: r.rpe_fc_sensations, debrief: r.debrief,
      };
    });
    let doc = 0, manquantes = 0;
    for (const x of seances) {
      if ((x.statut === 'fait' || x.statut === 'partiel') && estCourse(x.type)) {
        const km = distanceKm(x.detail);
        if (km) doc += km; else manquantes++;
      }
    }
    const dates = seances.map((x) => x.date).filter(Boolean).sort();
    return {
      sem: String(w.semaine), num, bloc: w.bloc, phase: w.phase, objectif: w.objectif,
      cible: nombre(w.volume_run_cible_km), avertissement: w.volume_run_cible_statut,
      cibleChrono: w.cible_chrono && w.cible_chrono.valeur,
      seances, debut: dates[0], fin: dates[dates.length - 1],
      doc: doc ? Math.round(doc * 10) / 10 : null, partiel: manquantes > 0,
    };
  }

  function currentWeek(d) {
    const t = todayIso();
    const inRange = d.weeks.find((w) => w.debut && w.debut <= t && t <= w.fin);
    if (inRange) return inRange;
    const started = d.weeks.filter((w) => w.seances.some((x) => x.statut !== 'prevu'));
    return started[started.length - 1] || d.weeks[0];
  }

  /* ---------- accès GitHub ---------- */
  class ApiError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }
  async function ghGet(path, token, dir) {
    // `t` contourne le cache navigateur (GitHub répond max-age=60) ; un seul en-tête non standard
    // (Authorization) pour que la requête préliminaire CORS reste celle que l'API accepte partout.
    const url = `https://api.github.com/repos/${CFG.owner}/${CFG.repo}/contents/${path}?ref=${encodeURIComponent(CFG.branch)}&t=${Date.now()}`;
    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: dir ? 'application/vnd.github+json' : 'application/vnd.github.raw+json',
      },
    });
    if (!r.ok) throw new ApiError(r.status, `${r.status} sur ${path}`);
    return dir ? r.json() : r.text();
  }

  async function loadAll(token) {
    const warnings = [];
    const listing = await ghGet('plan/semaines', token, true);
    const names = listing.filter((f) => f.type === 'file' && /^W\d+\.yaml$/.test(f.name)).map((f) => f.name);
    if (!names.length) throw new ApiError(404, 'Aucun fichier W<n>.yaml trouvé dans plan/semaines');
    const [weekTexts, coursesText, profilsText] = await Promise.all([
      Promise.all(names.map((n) => ghGet(`plan/semaines/${n}`, token))),
      ghGet('historique/courses.yaml', token),
      ghGet('coach/profils.yaml', token).catch(() => null),
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
      courses: (courses.courses || []).map((c) => ({ ...c, date: iso(c.date), total: secondes(c.chrono_officiel) })),
      leviers: courses.leviers_restants || [],
    };
  }

  /* ---------- token ---------- */
  const store = {
    get() { try { return sessionStorage.getItem(CFG.tokenKey) || localStorage.getItem(CFG.tokenKey); } catch (e) { return null; } },
    set(tok, persist) {
      try {
        sessionStorage.setItem(CFG.tokenKey, tok);
        if (persist) localStorage.setItem(CFG.tokenKey, tok); else localStorage.removeItem(CFG.tokenKey);
      } catch (e) { /* stockage indisponible : la session courante suffit */ }
    },
    clear() { try { sessionStorage.removeItem(CFG.tokenKey); localStorage.removeItem(CFG.tokenKey); } catch (e) { /* rien */ } },
  };

  /* ---------- infobulle (une seule, partagée) ---------- */
  const tipEl = h('div', { class: 'tip', role: 'tooltip', hidden: true });
  document.body.append(tipEl);
  function showTip(nodes, x, y) {
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
  const hideTip = () => { tipEl.hidden = true; };
  function bindTip(el, nodesFn) {
    el.addEventListener('pointermove', (e) => showTip(nodesFn(), e.clientX, e.clientY));
    el.addEventListener('pointerleave', hideTip);
    el.addEventListener('focus', () => { const r = el.getBoundingClientRect(); showTip(nodesFn(), r.left + r.width / 2, r.top); });
    el.addEventListener('blur', hideTip);
  }
  const tipRow = (cls, text) => h('div', { class: 'r' }, h('span', { class: `key ${cls}` }), text);

  /* ---------- composants ---------- */
  function card(title, sub, ...content) {
    return h('section', { class: 'card' }, h('h2', {}, title), sub && h('p', { class: 'sub' }, sub), ...content);
  }
  function tableView(head, rows, numCols, label) {
    const isNum = (i) => (numCols || []).includes(i);
    return h('details', { class: 'table-view' },
      h('summary', {}, label || 'Voir les données'),
      h('div', { class: 'tbl-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, head.map((t, i) => h('th', { class: isNum(i) ? 'num' : '' }, t)))),
        h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c, i) => h('td', { class: isNum(i) ? 'num' : '' }, c))))))));
  }
  const tile = (label, value, sub) => h('div', { class: 'tile' },
    h('div', { class: 'l' }, label), h('div', { class: 'v' }, value), sub && h('div', { class: 's' }, sub));
  const legendItem = (cls, text) => h('span', {}, h('span', { class: `key ${cls}` }), text);

  /* ---------- vue Saison ---------- */
  function volumeChart(d, curNum) {
    const weeks = d.weeks;
    const W = 960, H = 290, m = { t: 22, r: 12, b: 30, l: 38 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const maxV = Math.max(5, ...weeks.map((w) => Math.max(w.cible || 0, w.doc || 0)));
    const top = Math.ceil(maxV / 5) * 5;
    const y = (v) => m.t + ih - (v / top) * ih;
    const band = iw / weeks.length;
    const bw = Math.min(24, band * 0.62);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img',
      'aria-label': 'Volume de course hebdomadaire documenté face à la cible du plan, en kilomètres. Les données sont dans le tableau sous le graphique.' });

    for (let v = 0; v <= top; v += 5) {
      svg.append(s('line', { class: v === 0 ? 'base' : 'grid', x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }),
        s('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, String(v)));
    }
    svg.append(s('text', { x: m.l - 8, y: m.t - 9, 'text-anchor': 'end' }, 'km'));

    const documented = weeks.filter((w) => w.doc != null);
    const best = documented.reduce((a, w) => (!a || w.doc > a.doc ? w : a), null);
    const last = documented[documented.length - 1];
    const labelled = new Set([best, last].filter(Boolean));

    weeks.forEach((w, i) => {
      const cx = m.l + band * i + band / 2;
      const x = cx - bw / 2;
      const g = s('g', { class: 'col', tabindex: '0', role: 'img',
        'aria-label': `${w.sem} : ${w.doc != null ? fr(w.doc) + ' km documentés' : 'pas de distance documentée'}, cible ${fr(w.cible)} km` });
      g.append(s('rect', { class: 'hit', x: m.l + band * i, y: m.t, width: band, height: ih }));
      if (w.doc != null) {
        const yt = y(w.doc), yb = y(0), r = Math.min(4, bw / 2, yb - yt);
        g.append(s('path', { class: `bar${w.partiel ? ' partial' : ''}`,
          d: `M${x},${yb} V${yt + r} Q${x},${yt} ${x + r},${yt} H${x + bw - r} Q${x + bw},${yt} ${x + bw},${yt + r} V${yb} Z` }));
        if (labelled.has(w)) g.append(s('text', { class: 'val', x: cx, y: yt - 6, 'text-anchor': 'middle' }, fr(w.doc)));
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

  function adherence(d, curNum) {
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

  function viewSaison(app) {
    const d = state.data;
    const cur = currentWeek(d);
    const j = daysTo(CFG.raceDate);
    const courseOk = d.courses.filter((c) => /Men Open/i.test(String(c.format)) && c.total);
    const best = courseOk.reduce((a, c) => (!a || c.total < a.total ? c : a), null);
    const faites = cur.seances.filter((x) => x.statut === 'fait').length;
    const prevues = cur.seances.filter((x) => x.statut !== 'deplacee').length;
    fill(app, {}, [
      state.warnings.length ? h('div', { class: 'warn' }, state.warnings.join(' · ')) : null,
      h('section', { class: 'hero' },
        h('div', { class: 'hero-fig' }, j >= 0 ? `J-${j}` : `J+${-j}`),
        h('div', { class: 'hero-sub' }, `avant Hyrox Paris — dimanche ${fullDate(CFG.raceDate)} · Mixed Doubles`)),
      h('div', { class: 'tiles' },
        tile('Cible chrono', d.cibleChrono || '—', best ? `départ ${best.chrono_officiel}` : null),
        best ? tile('Meilleur chrono (Men Open)', best.chrono_officiel, `${best.nom}, ${fullDate(best.date)}`) : null,
        d.vma && d.vma.actuelle != null ? tile('VMA', `${fr(d.vma.actuelle)} km/h`, d.vma.cible != null ? `cible ${fr(d.vma.cible)} km/h` : null) : null,
        tile(`Semaine ${cur.sem}`, `${faites} / ${prevues}`, 'séances faites')),
      card('Volume de course par semaine', 'Kilomètres courus, tels qu’ils sont documentés dans le réalisé, face à la cible du plan.', ...volumeChart(d, cur.num)),
      card('Séances par semaine', 'Une case par séance. Les séances déplacées dans la semaine ne comptent pas dans le total.', ...adherence(d, cur.num))]);
  }

  /* ---------- vue Semaine ---------- */
  function viewSemaine(app, wanted) {
    const d = state.data;
    const w = d.weeks.find((x) => x.sem === wanted) || currentWeek(d);
    const select = h('select', { 'aria-label': 'Semaine', onchange: (e) => { location.hash = `#/semaine/${e.target.value}`; } },
      d.weeks.map((x) => h('option', { value: x.sem, selected: x.sem === w.sem }, `${x.sem} · ${x.debut ? rangeLabel(x.debut, x.fin) : ''}`)));
    const meta = (l, v) => v ? h('div', {}, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v)) : null;
    const lines = (p) => [['Échauffement', p.echauffement], ['Corps', p.corps], ['Retour au calme', p.retour_calme],
      ['Intensité', p.intensite], ['Notes du coach', p.notes_coach]].filter(([, t]) => t && String(t).trim() !== '—');
    const block = (title, open, kids) => kids.length ? h('details', { open }, h('summary', {}, title), ...kids) : null;
    const para = (t) => h('div', { class: 'txt' }, String(t));
    const labelled = ([l, t]) => h('div', { class: 'txt' }, h('strong', {}, `${l} — `), String(t));

    app.append(
      h('div', { class: 'weekbar' }, h('h2', {}, 'Semaine'), select),
      h('section', { class: 'card' },
        h('h2', {}, `${w.sem} · ${w.debut ? rangeLabel(w.debut, w.fin) : ''}`),
        w.objectif && h('p', { class: 'sub' }, w.objectif),
        h('div', { class: 'wkmeta' },
          meta('Bloc', [w.bloc, w.phase].filter(Boolean).join(' · ')),
          meta('Cible de course', w.cible != null ? `${fr(w.cible)} km` : null),
          meta('Documenté', w.doc != null ? `${fr(w.doc)} km${w.partiel ? ' (partiel)' : ''}` : 'non documenté'),
          meta('Cible chrono', w.cibleChrono)),
        w.avertissement && h('details', { class: 'table-view' }, h('summary', {}, 'Note sur la cible de volume'), h('div', { class: 'txt note' }, String(w.avertissement)))),
      h('div', { class: 'sessions' }, w.seances.map((x) => {
        const st = statutOf(x.statut);
        const p = x.plan;
        const resume = [p.duree, p.lieu, p.rpe_cible].filter((v) => v && String(v).trim() !== '—').join(' · ');
        const realise = [x.detail && para(x.detail), x.ressenti && h('div', { class: 'txt' }, h('strong', {}, 'Ressenti — '), String(x.ressenti))].filter(Boolean);
        return h('article', { class: 'sess' },
          h('div', { class: 'sess-h' },
            h('span', { class: 'sess-d' }, x.date ? dayLabel(x.date) : (x.jour || '')),
            h('span', { class: 'sess-t' }, x.type),
            h('span', { class: `chip ${st.cls}` }, `${st.glyph} ${st.label}`)),
          resume && h('div', { class: 'plan' }, `Plan : ${resume}`),
          block('Plan détaillé', x.statut === 'prevu', lines(p).map(labelled)),
          block('Réalisé', x.statut !== 'prevu', realise),
          block('Débrief', false, x.debrief ? [para(x.debrief)] : []));
      })));
  }

  /* ---------- vue Courses ---------- */
  function viewCourses(app) {
    const d = state.data;
    const legend = h('div', { class: 'legend' }, legendItem('s1', 'Run'), legendItem('s2', 'Workouts (stations)'), legendItem('s3', 'Roxzone'));
    const cards = d.courses.map((c) => {
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
      const stations = c.stations && Object.keys(c.stations).length ? tableView(['Station', 'Temps'], Object.entries(c.stations).map(([k, v]) => [k.replace(/_/g, ' '), String(v)]), [1], 'Temps par station') : null;
      const runs = Array.isArray(c.runs) && c.runs.length ? h('p', { class: 'note' }, `Runs : ${c.runs.join(' · ')}`) : null;
      return h('section', { class: 'card race' },
        h('div', { class: 'race-h' }, h('h3', {}, c.nom), h('span', { class: 'note' }, `${fullDate(c.date)} · ${c.format || ''}`)),
        h('div', { class: 'race-chrono' }, String(c.chrono_officiel)),
        stack,
        h('div', { class: 'note' }, parts.map((p) => `${p[1]} ${hms(p[2])}`).join(' · ')),
        ...notes.map((n) => h('p', { class: 'note' }, n)), runs, stations,
        c.lecture && h('details', { class: 'table-view' }, h('summary', {}, 'Lecture du coach'), h('div', { class: 'txt note' }, String(c.lecture).trim())));
    });
    app.append(h('h2', {}, 'Courses'), legend, ...cards,
      card('Leviers restants', 'Là où se trouvent les secondes, par priorité.',
        tableView(['#', 'Levier', 'État', 'Impact estimé'], d.leviers.map((l) => [String(l.priorite), l.levier, l.etat, l.impact_estime || '']), [0])));
    // Le tableau des leviers est le contenu principal : on le déplie.
    const det = app.querySelector('.card:last-child details.table-view');
    if (det) det.open = true;
    // Une étiquette ne s'affiche que si elle tient dans son segment ; la valeur reste dans la ligne de texte.
    requestAnimationFrame(() => app.querySelectorAll('.stack > div').forEach((seg) => {
      if (seg.scrollWidth > seg.clientWidth) seg.textContent = '';
    }));
  }

  /* ---------- écrans d'état ---------- */
  function setChrome(loggedIn) {
    $('refresh').hidden = !loggedIn;
    $('logout').hidden = !loggedIn;
    $('nav').hidden = !loggedIn;
  }
  function renderLogin(message) {
    state.data = null;
    setChrome(false);
    const input = h('input', { type: 'password', name: 'token', autocomplete: 'off', spellcheck: 'false', placeholder: 'github_pat_…', 'aria-label': 'Token GitHub', required: true });
    const keep = h('input', { type: 'checkbox' });
    const err = h('p', { class: 'err', hidden: !message }, message || '');
    const form = h('form', { onsubmit: async (e) => {
      e.preventDefault();
      const tok = input.value.trim();
      if (!/^github_pat_[A-Za-z0-9_]+$/.test(tok)) {
        err.hidden = false;
        err.textContent = /^gh[pousr]_/.test(tok)
          ? 'Token classique refusé : il donne accès à tous tes repos. Crée un token fine-grained (il commence par github_pat_).'
          : 'Ce n’est pas un token fine-grained : il doit commencer par github_pat_.';
        return;
      }
      store.set(tok, keep.checked);
      input.value = '';
      await load(tok);
    } },
      input, h('label', { class: 'chk' }, keep, 'Mémoriser sur cet ordinateur'), h('button', { type: 'submit', class: 'primary' }, 'Se connecter'));
    $('app').replaceChildren(h('section', { class: 'card login' },
      h('h1', {}, 'Connexion'), err,
      h('p', {}, `Cette page lit tes données dans le repo privé ${CFG.owner}/${CFG.repo}. Elle n’en contient aucune : il lui faut un token en lecture seule.`),
      h('ol', {},
        h('li', {}, 'GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.'),
        h('li', {}, `Repository access : Only select repositories → ${CFG.repo}.`),
        h('li', {}, 'Permissions → Repository permissions → Contents : Read-only.'),
        h('li', {}, 'Expiration : 90 jours. Copie le token (github_pat_…) et colle-le ci-dessous.')),
      form,
      h('p', { class: 'note' }, 'Le token n’est envoyé qu’à api.github.com. Les données restent en mémoire et disparaissent à la fermeture de l’onglet.')));
    input.focus();
  }
  function renderMessage(text, withRetry) {
    $('app').replaceChildren(h('section', { class: 'card' }, h('p', {}, text),
      withRetry && h('div', { class: 'weekbar' },
        h('button', { type: 'button', class: 'primary', onclick: () => load(store.get()) }, 'Réessayer'),
        h('button', { type: 'button', class: 'ghost', onclick: logout }, 'Changer de token'))));
  }

  function explain(e) {
    if (e instanceof ApiError) {
      if (e.status === 403) return 'Accès refusé (permissions du token, ou limite de requêtes GitHub atteinte).';
      if (e.status === 404) return `Introuvable (${e.message}). Le token n’a probablement pas accès à ${CFG.owner}/${CFG.repo}, ou lui manque la permission Contents : Read-only.`;
      return `Erreur GitHub : ${e.message}`;
    }
    return 'Impossible de joindre api.github.com (réseau, ou requête bloquée par le navigateur).';
  }
  async function load(token) {
    setChrome(true);
    renderMessage('Chargement des semaines…', false);
    try {
      const data = await loadAll(token);
      state.data = data;
      state.warnings = data.warnings;
      render();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { store.clear(); renderLogin('Token refusé ou expiré. Génère-en un nouveau.'); return; }
      renderMessage(explain(e), true);
    }
  }
  function logout() { store.clear(); renderLogin(); }

  /* ---------- routage ---------- */
  function render() {
    if (!state.data) return;
    hideTip();
    const [route, arg] = (location.hash.replace(/^#\/?/, '') || 'saison').split('/');
    const views = { saison: viewSaison, semaine: viewSemaine, courses: viewCourses };
    const name = views[route] ? route : 'saison';
    document.querySelectorAll('#nav a').forEach((a) => {
      if (a.dataset.route === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const app = $('app');
    app.replaceChildren();
    views[name](app, arg);
  }

  window.addEventListener('hashchange', render);
  $('refresh').addEventListener('click', () => load(store.get()));
  $('logout').addEventListener('click', logout);
  const token = store.get();
  if (token) load(token); else renderLogin();
})();
