# ✊ ✋ ✌️ Shifumi entre amis

Un petit jeu de pierre-feuille-ciseaux à jouer entre amis, **sans compte, sans inscription, sans serveur à gérer**.

## Modes de jeu

- 🌐 **En ligne** : crée une partie, envoie le lien à un ami. La partie est **enregistrée** :
  chacun joue sa manche quand il veut, peut fermer la page et revenir plus tard (les parties
  en cours apparaissent sur l'accueil).
- 📱 **À deux sur le même téléphone** : chacun choisit à son tour, sans regarder.
- 🤖 **Contre l'ordinateur**.

Chaque match se joue en **2 manches gagnantes** : le premier à 2 victoires gagne, puis on peut lancer une revanche.

## Comment ça marche

- Le site (`index.html`, `style.css`, `game.js`) est statique.
- `api/game.js` est une fonction Vercel qui enregistre les parties dans une base **Redis (Upstash)**,
  gardées 30 jours après la dernière action.
- Pas de compte : chaque joueur reçoit un jeton secret gardé dans son navigateur. Le coup de
  l'adversaire n'est jamais envoyé avant que les deux aient joué.

## Mettre le jeu en ligne (Vercel)

1. Sur [vercel.com/new](https://vercel.com/new), importer le dépôt `jobolia/shifumi`
   (*Framework Preset* : **Other**, aucune commande de build).
2. Dans le projet Vercel : **Storage → Create Database → Redis** (offre gratuite),
   puis **Connect** au projet `shifumi`. Cela ajoute la variable `REDIS_URL`
   (les variables `KV_REST_API_URL` / `KV_REST_API_TOKEN` d'Upstash marchent aussi).
3. **Deployments → ⋯ → Redeploy** pour que le jeu utilise la base.
4. Ensuite, chaque push sur `main` redéploie automatiquement le jeu.

## Jouer en local

Les modes « même téléphone » et « ordinateur » marchent en ouvrant simplement `index.html`.
Pour le mode en ligne, lancer `vercel dev` (sans base Redis configurée, les parties sont gardées en
mémoire, ce qui suffit pour tester).

## Fichiers

| Fichier       | Rôle                                           |
|---------------|------------------------------------------------|
| `index.html`  | Les écrans du jeu                              |
| `style.css`   | Le style (mode clair et sombre)                |
| `game.js`     | Les règles et les trois modes de jeu           |
| `api/game.js` | Le serveur des parties en ligne (Vercel)       |
