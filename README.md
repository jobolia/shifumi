# ✊ ✋ ✌️ Shifumi entre amis

Un petit jeu de pierre-feuille-ciseaux à jouer entre amis, **sans compte, sans inscription, sans serveur à gérer**.

## Modes de jeu

- 🌐 **En ligne** : crée une partie, envoie le lien à un ami, jouez chacun sur votre téléphone.
- 📱 **À deux sur le même téléphone** : chacun choisit à son tour, sans regarder.
- 🤖 **Contre l'ordinateur**.

## Comment ça marche

C'est un site statique (HTML, CSS, JavaScript, rien à compiler). Le mode en ligne utilise
[PeerJS](https://peerjs.com/) (WebRTC) : les deux navigateurs communiquent directement, le serveur
public de PeerJS sert juste à les mettre en relation. Aucune donnée n'est stockée, à part ton pseudo
dans ton navigateur.

## Mettre le jeu en ligne (GitHub Pages)

1. Dans le dépôt : **Settings → Pages**.
2. *Source* : **Deploy from a branch**, branche `main`, dossier `/ (root)`.
3. Après une minute, le jeu est disponible sur `https://jobolia.github.io/shifumi/`.

## Jouer en local

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Fichiers

| Fichier      | Rôle                                    |
|--------------|-----------------------------------------|
| `index.html` | Les écrans du jeu                       |
| `style.css`  | Le style (mode clair et sombre)         |
| `game.js`    | Les règles, les modes de jeu, le réseau |
