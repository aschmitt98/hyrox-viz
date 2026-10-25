# Prépa Hyrox — page de visualisation

Page statique (GitHub Pages) qui affiche la prépa Hyrox. **Ce repo ne contient aucune donnée** : la page lit les repos privés `aschmitt98/hyrox-coach` et `aschmitt98/nutrition` via l'API GitHub, avec un token fine-grained en lecture seule que tu colles au premier lancement.

Adresse : https://aschmitt98.github.io/hyrox-viz/

## Les vues

| Vue | Contenu |
|---|---|
| **Saison** | Compte à rebours, volume de course par semaine (documenté vs cible), efficience aérobie, calories par semaine, séances par semaine |
| **Mois** | Calendrier (séances + calories du jour, bilan de chaque semaine), km, séances faites, efficience et calories moyennes du mois, calories jour par jour |
| **Semaine** | Bilan de la semaine, jour par jour, calories avec moyenne, puis le détail de chaque séance (plan, réalisé, débrief) |
| **Courses** | Chronos, répartition run / stations / Roxzone, leviers |

## Créer le token

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
2. Repository access : **Only select repositories** → `hyrox-coach` **et** `nutrition`.
3. Permissions → Repository permissions → **Contents : Read-only**.
4. Expiration : 90 jours.

La page refuse tout token qui ne commence pas par `github_pat_` : un token classique (`ghp_…`) donnerait accès à tous tes repos. Si `nutrition` n'est pas dans le token, la page fonctionne quand même, sans les calories (un bandeau l'explique).

## Ce qui est lu

- `hyrox-coach` : `plan/semaines/W*.yaml`, `historique/courses.yaml`, `coach/profils.yaml` (VMA uniquement).
- `nutrition` : `data/journal/AAAA-MM.json` (le journal alimentaire) et `profil.md` (la cible de calories, section « Cibles quotidiennes »).

Rien n'est écrit.

## Règles d'affichage des calories

Ces choix sont à connaître pour lire les couleurs ; ils se changent dans `data.js` (`CFG.tolerance`, `classeJour`).

- **Jour** : vert si le total est dans la cible **± 100 kcal**, jaune en dessous, orange au-dessus. La marge existe parce qu'un journal estimé n'est pas précis à 100 kcal près.
- **Journée incomplète** (aucun dîner saisi) : case vide, jamais colorée, **exclue des moyennes**. Sinon une saisie inachevée se lit comme une journée où tu as peu mangé.
- **Moyennes** (semaine, mois) : comparées à la cible **stricte**, sur les jours complets seulement. Le nombre de jours comptés est affiché.
- **Cible** : lue dans `profil.md`, donc la cible *actuelle*, appliquée à tout l'historique. Si tu changes de mode (déficit, charge avant course), les jours passés seront recolorés. Prévoir un historique des cibles avant la semaine de course.
- Le journal n'est à jour que jusqu'au dernier rapatriement dans le repo `nutrition` : la page signale quand il s'arrête.

## Sécurité

- Le token n'est envoyé qu'à `api.github.com` (politique CSP dans `index.html`).
- Aucun script tiers : js-yaml est embarqué dans `vendor/` (version 4.1.0, licence MIT).
- Les données restent en mémoire. Seul le token peut être gardé : en `sessionStorage` par défaut, en `localStorage` si la case « Mémoriser » est cochée. « Se déconnecter » efface les deux.
- Quiconque obtient le token lit tes données de santé et d'alimentation tant qu'il n'est pas révoqué : révoque-le dans Settings → Developer settings s'il fuit, et ne le colle sur aucune autre page.
- Cette page est publique (le code, pas les données). Ne jamais y committer de données des repos privés.

## Tester en local

```bash
python3 -m http.server 8765
# puis http://localhost:8765/
```

## Organisation du code

`index.html` · `style.css` · `app.js` (connexion, chargement, routage) · `data.js` (lecture GitHub, extraction, agrégats) · `charts.js` (graphiques SVG) · `views.js` (les quatre vues) · `lib.js` (DOM, dates, infobulle) · `vendor/` (js-yaml).

## Limites connues

- Les données ne sont fraîches que jusqu'au dernier commit des repos : les saisies faites dans les applications ne sont visibles qu'une fois reportées dans les repos.
- Le volume « documenté » et l'efficience sont extraits du texte des `realise:` avec les mêmes règles que `scripts/build.py` de `hyrox-coach` (`distanceKm`, `estCourse`, `efSeance` dans `data.js`). Si ces règles changent là-bas, il faut les changer ici.
- L'efficience repose sur peu de points (sorties Z2 avec allure et FC moyenne lisibles) : elle sert à voir une tendance, pas à juger une séance.
- Les charges par exercice ne sont pas affichées : elles n'existent aujourd'hui que comme texte libre dans les réalisés.
