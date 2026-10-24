# Prépa Hyrox — page de visualisation

Page statique (GitHub Pages) qui affiche la prépa Hyrox : volume de course par semaine, séances faites, détail d'une semaine, chronos de course.

**Ce repo ne contient aucune donnée.** La page lit les fichiers YAML du repo privé `aschmitt98/hyrox-coach` via l'API GitHub, avec un token fine-grained en lecture seule que tu colles au premier lancement.

Adresse : https://aschmitt98.github.io/hyrox-viz/

## Créer le token

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
2. Repository access : **Only select repositories** → `hyrox-coach` (un seul repo).
3. Permissions → Repository permissions → **Contents : Read-only**.
4. Expiration : 90 jours.

La page refuse tout token qui ne commence pas par `github_pat_` : un token classique (`ghp_…`) donnerait accès à tous tes repos.

## Ce qui est lu

`plan/semaines/W*.yaml`, `historique/courses.yaml`, `coach/profils.yaml` (VMA uniquement). Rien n'est écrit. La page ne lit pas `ETAT.md`.

## Sécurité

- Le token n'est envoyé qu'à `api.github.com` (politique CSP dans `index.html`).
- Aucun script tiers : js-yaml est embarqué dans `vendor/` (version 4.1.0, licence MIT).
- Les données restent en mémoire. Seul le token peut être gardé : en `sessionStorage` par défaut, en `localStorage` si la case « Mémoriser » est cochée. « Se déconnecter » efface les deux.
- Quiconque obtient le token lit tes données de santé tant qu'il n'est pas révoqué : révoque-le dans Settings → Developer settings s'il fuit, et ne le colle sur aucune autre page.
- Cette page est publique (le code, pas les données). Ne jamais y committer de données du repo privé.

## Tester en local

```bash
python3 -m http.server 8765
# puis http://localhost:8765/
```

## Limites connues

- Les données ne sont fraîches que jusqu'au dernier commit de `hyrox-coach` : les saisies faites dans l'application ne sont visibles qu'une fois reportées dans le repo.
- Le volume « documenté » est extrait du texte des `realise:` avec les mêmes règles que `scripts/build.py` (`distanceKm`, `estCourse`). Si ces règles changent là-bas, il faut les changer ici.
