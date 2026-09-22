// Shifumi entre amis — sans compte.
// Modes « même téléphone » et « ordinateur » : tout se passe dans le navigateur.
// Mode en ligne : la partie est enregistrée sur le serveur (api/game.js), chacun joue quand il veut.

const MOVES = {
  rock: { emoji: '✊', beats: 'scissors', label: 'Pierre' },
  paper: { emoji: '✋', beats: 'rock', label: 'Feuille' },
  scissors: { emoji: '✌️', beats: 'paper', label: 'Ciseaux' },
};
const WINS_NEEDED = 2; // match en 2 manches gagnantes
const POLL_MS = 3000;

const $ = (id) => document.getElementById(id);

const state = {
  mode: null,        // 'online' | 'local' | 'cpu'
  names: ['Toi', 'Adversaire'],
  scores: [0, 0],
  round: 0,
  matchRound: 1,     // numéro de manche dans le match en cours
  matchOver: false,
  myMove: null,
  oppMove: null,
  localTurn: 0,      // mode local : 0 = joueur 1, 1 = joueur 2
  localMoves: [null, null],
};

const online = {
  id: null,
  token: null,
  view: null,        // état de la partie renvoyé par le serveur
  seen: 0,           // dernière manche dont on a déjà montré le résultat
  shown: null,       // manche actuellement affichée dans l'écran de résultat
  timer: null,
  renderKey: '',
};

// ---------- Utilitaires ----------

function show(screen) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  $('screen-' + screen).classList.remove('hidden');
}

function myName() {
  return $('name').value.trim() || 'Joueur';
}

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
}

function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignoré */ }
}

function saveName() {
  store('shifumi-name', $('name').value.trim());
}

function winner(a, b) {
  if (a === b) return 0;
  return MOVES[a].beats === b ? 1 : 2;
}

function setStatus(text) {
  $('status').textContent = text;
}

function setChoicesEnabled(enabled) {
  document.querySelectorAll('#choices button').forEach((b) => {
    b.disabled = !enabled;
    b.classList.remove('selected');
  });
}

function updateScoreboard() {
  $('p1-name').textContent = state.names[0];
  $('p2-name').textContent = state.names[1];
  $('p1-score').textContent = state.scores[0];
  $('p2-score').textContent = state.scores[1];
}

function gameUrl(id) {
  return `${location.origin}${location.pathname}?partie=${id}`;
}

// Affiche le résultat d'une manche. w : 0 = égalité, 1 = joueur de gauche, 2 = joueur de droite.
function showReveal(leftMove, rightMove, w, matchWinner) {
  $('choices').classList.add('hidden');
  $('btn-handover').classList.add('hidden');
  $('hand-1').textContent = MOVES[leftMove].emoji;
  $('hand-2').textContent = MOVES[rightMove].emoji;
  // Force l'animation à rejouer
  ['hand-1', 'hand-2'].forEach((id) => { const el = $(id); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; });

  const result = $('result');
  result.className = 'result';
  const sameScreen = state.mode === 'local';
  if (matchWinner) {
    result.textContent = sameScreen || matchWinner === 1
      ? `🏆 ${sameScreen ? state.names[matchWinner - 1] + ' remporte' : 'Tu remportes'} le match !`
      : `${state.names[1]} remporte le match…`;
    if (!sameScreen) result.classList.add(matchWinner === 1 ? 'win' : 'lose');
  } else if (w === 0) {
    result.textContent = 'Égalité !';
  } else if (sameScreen) {
    result.textContent = `${state.names[w - 1]} gagne la manche !`;
  } else if (w === 1) {
    result.textContent = 'Gagné ! 🎉';
    result.classList.add('win');
  } else {
    result.textContent = 'Perdu…';
    result.classList.add('lose');
  }
  $('btn-next').textContent = matchWinner ? '🔁 Revanche' : 'Manche suivante';
  setStatus(`${MOVES[leftMove].label} contre ${MOVES[rightMove].label}`);
  $('reveal').classList.remove('hidden');
}

// ---------- Modes « même téléphone » et « ordinateur » ----------

function startGame(mode, names) {
  stopOnline();
  state.mode = mode;
  state.names = names;
  state.scores = [0, 0];
  state.round = 0;
  state.matchRound = 1;
  state.matchOver = false;
  $('share').classList.add('hidden');
  $('matches-info').textContent = '';
  updateScoreboard();
  show('game');
  startRound();
}

function startRound() {
  state.myMove = null;
  state.oppMove = null;
  state.localTurn = 0;
  state.localMoves = [null, null];
  $('reveal').classList.add('hidden');
  $('btn-handover').classList.add('hidden');
  $('choices').classList.remove('hidden');
  setChoicesEnabled(true);

  $('match-info').textContent = `Manche ${state.matchRound} — premier à ${WINS_NEEDED} manches gagnantes`;
  if (state.mode === 'local') {
    setStatus(`${state.names[0]}, choisis (${state.names[1]} ne regarde pas !)`);
  } else {
    setStatus('Choisis ton coup');
  }
}

function onPick(move) {
  if (state.mode === 'online') return onlinePlay(move);
  if (state.mode === 'local') return onLocalPick(move);
  if (state.myMove) return;

  state.myMove = move;
  setChoicesEnabled(false);
  document.querySelector(`#choices button[data-move="${move}"]`).classList.add('selected');
  const keys = Object.keys(MOVES);
  state.oppMove = keys[Math.floor(Math.random() * keys.length)];
  setTimeout(resolveRound, 400);
}

function onLocalPick(move) {
  state.localMoves[state.localTurn] = move;
  if (state.localTurn === 0) {
    state.localTurn = 1;
    $('choices').classList.add('hidden');
    $('btn-handover').classList.remove('hidden');
    setStatus(`Passe le téléphone à ${state.names[1]}`);
  } else {
    state.myMove = state.localMoves[0];
    state.oppMove = state.localMoves[1];
    resolveRound();
  }
}

function resolveRound() {
  const w = winner(state.myMove, state.oppMove);
  if (w) state.scores[w - 1]++;
  updateScoreboard();
  state.matchOver = w !== 0 && state.scores[w - 1] >= WINS_NEEDED;
  showReveal(state.myMove, state.oppMove, w, state.matchOver ? w : 0);
}

function nextRound() {
  if (state.mode === 'online') return onlineNext();
  state.round++;
  if (state.matchOver) {
    state.scores = [0, 0];
    state.matchRound = 1;
    state.matchOver = false;
    updateScoreboard();
  } else {
    state.matchRound++;
  }
  startRound();
}

// ---------- Mode en ligne (partie enregistrée sur le serveur) ----------

async function api(params) {
  const res = params.action === 'get'
    ? await fetch(`api/game?id=${encodeURIComponent(params.id)}&token=${encodeURIComponent(params.token || '')}`)
    : await fetch('api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) });
  let data = {};
  try { data = await res.json(); } catch (e) { /* réponse vide */ }
  if (!res.ok) {
    const err = new Error(data.error || 'Connexion impossible, réessaie.');
    err.status = res.status;
    throw err;
  }
  return data;
}

function savedGames() {
  return load('shifumi-games', []);
}

function rememberGame(id, token, opp) {
  const games = savedGames().filter((g) => g.id !== id);
  const previous = savedGames().find((g) => g.id === id);
  games.unshift({ id, token, opp: opp || (previous && previous.opp) || null, at: Date.now() });
  store('shifumi-games', games.slice(0, 10));
}

function forgetGame(id) {
  store('shifumi-games', savedGames().filter((g) => g.id !== id));
}

function showError(message) {
  stopOnline();
  $('wait-text').textContent = message;
  show('wait');
}

async function createOnlineGame() {
  saveName();
  $('wait-text').textContent = 'Création de la partie…';
  show('wait');
  try {
    const data = await api({ action: 'create', name: myName() });
    rememberGame(data.id, data.token);
    enterOnline(data.id, data.token, data.state);
  } catch (err) {
    showError(err.message);
  }
}

async function joinOnlineGame(id) {
  saveName();
  $('wait-text').textContent = 'Connexion à la partie…';
  show('wait');
  try {
    const data = await api({ action: 'join', id, name: myName() });
    rememberGame(id, data.token, data.state.names[0]);
    enterOnline(id, data.token, data.state);
  } catch (err) {
    showError(err.message);
  }
}

function enterOnline(id, token, view) {
  stopOnline();
  state.mode = 'online';
  online.id = id;
  online.token = token;
  online.view = null;
  online.shown = null;
  online.renderKey = '';
  online.seen = load(`shifumi-seen-${id}`, 0);
  history.replaceState(null, '', `?partie=${id}`);
  $('share-link').value = gameUrl(id);
  $('btn-copy').textContent = '📋 Copier / partager le lien';
  show('game');
  if (view) renderOnline(view);
  else { $('wait-text').textContent = 'Chargement de la partie…'; show('wait'); }
  poll();
}

async function poll() {
  clearTimeout(online.timer);
  if (state.mode !== 'online') return;
  if (!document.hidden) {
    try {
      const data = await api({ action: 'get', id: online.id, token: online.token });
      if (state.mode !== 'online') return;
      if (data.state.me === null) {
        forgetGame(online.id);
        return showError("Cette partie n'est plus associée à ce téléphone.");
      }
      show('game');
      renderOnline(data.state);
    } catch (err) {
      if (err.status === 404) { forgetGame(online.id); return showError(err.message); }
      setStatus('Connexion perdue, nouvelle tentative…');
    }
  }
  online.timer = setTimeout(poll, POLL_MS);
}

function stopOnline() {
  clearTimeout(online.timer);
  online.timer = null;
  if (state.mode === 'online') state.mode = null;
}

function renderOnline(view) {
  online.view = view;
  const me = view.me;
  const opp = 1 - me;
  const oppName = view.names[opp];

  // Rien n'a changé depuis le dernier affichage : on ne touche à rien (évite de rejouer les animations).
  const key = JSON.stringify([view, online.seen]);
  if (key === online.renderKey) return;
  online.renderKey = key;
  if (oppName) rememberGame(online.id, online.token, oppName);

  state.names = [view.names[me] || 'Toi', oppName || 'En attente…'];
  $('share').classList.toggle('hidden', Boolean(oppName));
  const total = view.matches[0] + view.matches[1];
  $('matches-info').textContent = total
    ? `Matchs gagnés : ${state.names[0]} ${view.matches[me]} – ${view.matches[opp]} ${state.names[1]}`
    : '';

  // Résultat pas encore vu (ex. : l'ami a joué pendant qu'on était parti), ou fin de match.
  const unseen = view.history.find((h) => h.round > online.seen);
  const last = view.history[view.history.length - 1];
  const reveal = unseen || (view.matchOver ? last : null);
  if (reveal) {
    online.shown = reveal;
    state.scores = [reveal.wins[me], reveal.wins[opp]];
    updateScoreboard();
    $('match-info').textContent = `Match n°${reveal.matchNo} — manche ${reveal.matchRound}`;
    const w = reveal.winner < 0 ? 0 : reveal.winner === me ? 1 : 2;
    const mw = reveal.matchWinner < 0 ? 0 : reveal.matchWinner === me ? 1 : 2;
    showReveal(reveal.moves[me], reveal.moves[opp], w, mw);
    return;
  }

  online.shown = null;
  state.scores = [view.wins[me], view.wins[opp]];
  updateScoreboard();
  $('reveal').classList.add('hidden');
  $('choices').classList.remove('hidden');
  $('match-info').textContent = `Match n°${view.matchNo} — manche ${view.matchRound} (premier à ${view.winsNeeded} manches gagnantes)`;

  setChoicesEnabled(!view.myMove);
  if (view.myMove) {
    document.querySelector(`#choices button[data-move="${view.myMove}"]`).classList.add('selected');
    setStatus(oppName
      ? `Tu as joué ${MOVES[view.myMove].emoji} — en attente de ${oppName}…`
      : `Tu as joué ${MOVES[view.myMove].emoji} — en attente que ton ami rejoigne…`);
  } else if (view.played[opp]) {
    setStatus(`${oppName} a déjà joué, à toi !`);
  } else {
    setStatus('Choisis ton coup');
  }
}

async function onlinePlay(move) {
  const view = online.view;
  if (!view || view.myMove || online.shown) return;
  setChoicesEnabled(false);
  document.querySelector(`#choices button[data-move="${move}"]`).classList.add('selected');
  setStatus('Envoi…');
  try {
    const data = await api({ action: 'play', id: online.id, token: online.token, move });
    online.renderKey = '';
    renderOnline(data.state);
  } catch (err) {
    setStatus(err.message);
    setChoicesEnabled(true);
  }
}

async function onlineNext() {
  const shown = online.shown;
  if (!shown) return;
  online.seen = Math.max(online.seen, shown.round);
  store(`shifumi-seen-${online.id}`, online.seen);
  const view = online.view;
  const isLast = shown.round === view.history[view.history.length - 1].round;
  if (shown.matchWinner >= 0 && isLast && view.matchOver) {
    $('btn-next').disabled = true;
    try {
      const data = await api({ action: 'rematch', id: online.id, token: online.token });
      online.renderKey = '';
      renderOnline(data.state);
    } catch (err) {
      setStatus(err.message);
    }
    $('btn-next').disabled = false;
    return;
  }
  online.renderKey = '';
  renderOnline(view);
}

async function shareLink() {
  const url = $('share-link').value;
  if (navigator.share) {
    try { await navigator.share({ title: 'Shifumi', text: 'Viens jouer au shifumi avec moi !', url }); return; } catch (e) { /* annulé */ }
  }
  try {
    await navigator.clipboard.writeText(url);
    $('btn-copy').textContent = '✅ Lien copié !';
  } catch (e) {
    $('share-link').select();
  }
}

// ---------- Accueil ----------

function renderMyGames() {
  const games = savedGames();
  const list = $('my-games-list');
  list.innerHTML = '';
  games.forEach((g) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.textContent = g.opp ? `▶️ Reprendre contre ${g.opp}` : `▶️ Reprendre la partie ${g.id}`;
    btn.onclick = () => enterOnline(g.id, g.token);
    li.appendChild(btn);
    list.appendChild(li);
  });
  $('my-games').classList.toggle('hidden', games.length === 0);
}

function goHome() {
  stopOnline();
  state.mode = null;
  history.replaceState(null, '', location.pathname);
  $('btn-online').textContent = '🌐 Créer une partie en ligne';
  $('btn-online').onclick = createOnlineGame;
  renderMyGames();
  show('home');
}

async function openLink(id) {
  const saved = savedGames().find((g) => g.id === id);
  if (saved) return enterOnline(id, saved.token);

  $('wait-text').textContent = 'Chargement de la partie…';
  show('wait');
  try {
    const data = await api({ action: 'get', id });
    const [host, guest] = data.state.names;
    if (guest) return showError('Cette partie est déjà complète. Demande un nouveau lien à ton ami !');
    // L'invité choisit son pseudo avant de rejoindre
    renderMyGames();
    show('home');
    $('btn-online').textContent = `🎮 Rejoindre la partie de ${host}`;
    $('btn-online').onclick = () => joinOnlineGame(id);
    $('name').focus();
  } catch (err) {
    showError(err.message);
  }
}

// ---------- Initialisation ----------

$('name').value = load('shifumi-name', '');

$('btn-online').onclick = createOnlineGame;
$('btn-cpu').onclick = () => { saveName(); startGame('cpu', [myName(), 'Ordi 🤖']); };
$('btn-local').onclick = () => { saveName(); startGame('local', ['Joueur 1', 'Joueur 2']); };
$('btn-copy').onclick = shareLink;
$('btn-next').onclick = nextRound;
$('btn-handover').onclick = () => {
  $('btn-handover').classList.add('hidden');
  $('choices').classList.remove('hidden');
  setStatus(`${state.names[1]}, choisis ton coup`);
};
document.querySelectorAll('#choices button').forEach((b) => { b.onclick = () => onPick(b.dataset.move); });
document.querySelectorAll('.btn-quit').forEach((b) => { b.onclick = goHome; });
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.mode === 'online') poll(); });

const linkId = (new URLSearchParams(location.search).get('partie') || '').toUpperCase();
if (linkId) openLink(linkId);
else goHome();
