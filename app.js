/* Prépa Hyrox — point d'entrée : connexion par token, chargement, routage.
 *
 * Aucune donnée dans ce repo : la page lit les repos privés `hyrox-coach` et `nutrition` via l'API
 * GitHub, avec un token fine-grained (Contents : lecture seule) saisi par l'utilisatrice. Les données
 * restent en mémoire ; seul le token peut être mémorisé (case à cocher). */
import { h, $, hideTip, setRerender } from './lib.js';
import { CFG, ApiError, loadAll, buildIndex } from './data.js';
import { viewSaison, viewMois, viewSemaine, viewAnalyse, viewCourses } from './views.js';

const state = { data: null };

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
    h('p', {}, `Cette page lit tes données dans les repos privés ${CFG.coach.owner}/${CFG.coach.repo} et ${CFG.nutrition.owner}/${CFG.nutrition.repo}. Elle n’en contient aucune : il lui faut un token en lecture seule.`),
    h('ol', {},
      h('li', {}, 'GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.'),
      h('li', {}, `Repository access : Only select repositories → ${CFG.coach.repo} et ${CFG.nutrition.repo}.`),
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
    if (e.status === 404) return `Introuvable (${e.message}). Le token n’a probablement pas accès à ${CFG.coach.owner}/${CFG.coach.repo}, ou lui manque la permission Contents : Read-only.`;
    return `Erreur GitHub : ${e.message}`;
  }
  return `Impossible de charger les données (${e && e.message ? e.message : 'erreur inconnue'}). Réseau, requête bloquée par le navigateur, ou fichier illisible.`;
}

async function load(token) {
  setChrome(true);
  renderMessage('Chargement des données…', false);
  try {
    state.data = buildIndex(await loadAll(token));
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
  const views = {
    saison: (app) => viewSaison(app, state.data, state.data.warnings),
    mois: (app) => viewMois(app, state.data, arg),
    semaine: (app) => viewSemaine(app, state.data, arg),
    analyse: (app) => viewAnalyse(app, state.data),
    courses: (app) => viewCourses(app, state.data),
  };
  const name = views[route] ? route : 'saison';
  document.querySelectorAll('#nav a').forEach((a) => {
    if (a.dataset.route === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const app = $('app');
  app.replaceChildren();
  views[name](app);
}

setRerender(render);
window.addEventListener('hashchange', render);
$('refresh').addEventListener('click', () => load(store.get()));
$('logout').addEventListener('click', logout);
const token = store.get();
if (token) load(token); else renderLogin();
