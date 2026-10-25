# Prépa Hyrox — page de visualisation

Page statique (GitHub Pages) qui affiche la prépa Hyrox. **Ce repo ne contient aucune donnée** : la page lit les repos privés `aschmitt98/hyrox-coach` et `aschmitt98/nutrition` via l'API GitHub, avec un token fine-grained en lecture seule que tu colles au premier lancement.

Adresse : https://aschmitt98.github.io/hyrox-viz/

## Les vues

| Vue | Contenu |
|---|---|
| **Saison** | Compte à rebours, volume de course par semaine (documenté vs cible), calories par semaine, séances par semaine |
| **Mois** | Calendrier (séances + calories du jour, bilan de chaque semaine), km, séances faites, efficience et calories moyennes du mois, calories jour par jour |
| **Semaine** | Bilan de la semaine, jour par jour, calories avec moyenne, puis chaque séance en puces : statut, allure / FC / EF, RPE, barre plan contre réel, charges levées, alerte du débrief. Le texte (plan, réalisé, débrief) est replié sous « Détails » |
| **Analyse** | Charges par exercice (un petit graphique par exercice), efficience aérobie, km par mois |
| **Courses** | Chronos, répartition run / stations / Roxzone, leviers |

## Créer le token

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
2. Repository access : **Only select repositories** → `hyrox-coach` **et** `nutrition`.
3. Permissions → Repository permissions → **Contents : Read-only**.
4. Expiration : 90 jours.

La page refuse tout token qui ne commence pas par `github_pat_` : un token classique (`ghp_…`) donnerait accès à tous tes repos. Si `nutrition` n'est pas dans le token, la page fonctionne quand même, sans les calories (un bandeau l'explique).

## Ce qui est lu

- `hyrox-coach` : `plan/semaines/W*.yaml`, `historique/courses.yaml`, `historique/charges_par_exercice.yaml` (facultatif : sans lui, l'onglet Analyse l'explique), `coach/profils.yaml` (VMA uniquement).
- `nutrition` : `data/journal/AAAA-MM.json` (le journal alimentaire) et `profil.md` (la cible de calories, section « Cibles quotidiennes »).

Rien n'est écrit.

## Règles d'affichage des calories

Ces choix sont à connaître pour lire les couleurs ; ils se changent dans `data.js` (`CFG.tolerance`, `classeJour`).

- **Jour** : vert si le total est dans la cible **± 100 kcal**, jaune en dessous, orange au-dessus. La marge existe parce qu'un journal estimé n'est pas précis à 100 kcal près.
- **Journée incomplète** (aucun dîner saisi) : case vide, jamais colorée, **exclue des moyennes**. Sinon une saisie inachevée se lit comme une journée où tu as peu mangé.
- **Moyennes** (semaine, mois) : comparées à la cible **stricte**, sur les jours complets seulement. Le nombre de jours comptés est affiché.
- **Cible** : lue dans `profil.md`, donc la cible *actuelle*, appliquée à tout l'historique. Si tu changes de mode (déficit, charge avant course), les jours passés seront recolorés. Prévoir un historique des cibles avant la semaine de course.
- Le journal n'est à jour que jusqu'au dernier rapatriement dans le repo `nutrition` : la page signale quand il s'arrête.
- **Sélecteur Cible / Macros / Repas** (choix mémorisé dans le navigateur, par défaut Macros) :
  - *Cible* : la barre entière est colorée selon le statut.
  - *Macros* : barre empilée protéines / glucides / lipides, en kcal (4 kcal/g pour les protéines et glucides, 9 kcal/g pour les lipides). Les calories saisies **sans macros** (plat du commerce, boisson, alcool, ligne « à la main » sans détail) forment un segment gris « Non détaillé » : elles ne sont jamais réparties au hasard entre les macros.
  - *Repas* : barre empilée petit-déjeuner / déjeuner / dîner / en-cas.
  - Dans les deux vues empilées, le statut vert / jaune / orange passe dans une pastille au-dessus de la barre (✓ ▼ ▲).
  - Les segments somment toujours au total de la journée ; les tableaux « Voir les données » donnent les valeurs exactes.
- **Séance de chaque jour** : sous chaque barre, le type de séance en un mot (Force, Hyrox, Z2, VMA, Tempo, Kiné, Repos, Congé), barré si la séance a été sautée. L'intitulé complet est dans l'infobulle. Les parenthèses et les conditions (« … si feu vert kiné ») sont ignorées pour classer une séance.
- **Masquer les calories** : le bouton en haut de la page retire toutes les calories de toutes les vues (graphiques, pastilles du calendrier, tuiles, bandeaux). Le choix est mémorisé dans le navigateur.

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

`index.html` · `style.css` · `app.js` (connexion, chargement, routage) · `data.js` (lecture GitHub, extraction, agrégats) · `charts.js` (graphiques SVG) · `views.js` (les cinq vues) · `lib.js` (DOM, dates, infobulle, choix de vue) · `vendor/` (js-yaml).

## Limites connues

- Les données ne sont fraîches que jusqu'au dernier commit des repos : les saisies faites dans les applications ne sont visibles qu'une fois reportées dans les repos.
- Le volume « documenté » et l'efficience sont extraits du texte des `realise:` avec les mêmes règles que `scripts/build.py` de `hyrox-coach` (`distanceKm`, `estCourse`, `efSeance` dans `data.js`). Si ces règles changent là-bas, il faut les changer ici.
- L'efficience repose sur peu de points (sorties Z2 avec allure et FC moyenne lisibles) : elle sert à voir une tendance, pas à juger une séance.
- Les charges viennent de `historique/charges_par_exercice.yaml` : chaque entrée cite mot pour mot le passage du réalisé d'où elle vient (`scripts/verifier_charges.py` dans `hyrox-coach` le vérifie). Un point creux est un « comme prévu » déclaré, pas une mesure. Les exercices à une seule charge n'ont pas de graphique, seulement une ligne dans un tableau.
- Une séance de course sans allure ni FC lisibles n'affiche pas de puce de rythme : rien n'est déduit.
