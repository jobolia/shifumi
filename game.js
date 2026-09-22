// Shifumi entre amis — pas de serveur, pas de compte.
// Le mode en ligne utilise PeerJS (WebRTC) : les deux navigateurs se parlent directement.

const MOVES = {
  rock: { emoji: '✊', beats: 'scissors', label: 'Pierre' },
  paper: { emoji: '✋', beats: 'rock', label: 'Feuille' },
  scissors: { emoji: '✌️', beats: 'paper', label: 'Ciseaux' },
};
const PEER_PREFIX = 'shifumi-amis-';

const $ = (id) => document.getElementById(id);

const state = {
  mode: null,        // 'online' | 'local' | 'cpu'
  names: ['Toi', 'Adversaire'],
  scores: [0, 0],
  round: 0,
  myMove: null,
  oppMoves: {},      // coups adverses reçus, indexés par numéro de manche
  localTurn: 0,      // mode local : 0 = joueur 1, 1 = joueur 2
  localMoves: [null, null],
  peer: null,
  conn: null,
};

// ---------- Utilitaires ----------

function show(screen) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  $('screen-' + screen).classList.remove('hidden');
}

function myName() {
  return $('name').value.trim() || 'Joueur';
}

function saveName() {
  try { localStorage.setItem('shifumi-name', $('name').value.trim()); } catch (e) { /* ignoré */ }
}

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
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
    if (enabled) b.classList.remove('selected');
  });
}

function updateScoreboard() {
  $('p1-name').textContent = state.names[0];
  $('p2-name').textContent = state.names[1];
  $('p1-score').textContent = state.scores[0];
  $('p2-score').textContent = state.scores[1];
}

// ---------- Déroulement d'une manche ----------

function startGame(mode, names) {
  state.mode = mode;
  state.names = names;
  state.scores = [0, 0];
  state.round = 0;
  state.oppMoves = {};
  updateScoreboard();
  show('game');
  startRound();
}

function startRound() {
  state.myMove = null;
  state.localTurn = 0;
  state.localMoves = [null, null];
  $('reveal').classList.add('hidden');
  $('btn-handover').classList.add('hidden');
  $('choices').classList.remove('hidden');
  setChoicesEnabled(true);

  if (state.mode === 'local') {
    setStatus(`${state.names[0]}, choisis (${state.names[1]} ne regarde pas !)`);
  } else {
    setStatus('Choisis ton coup');
    // L'adversaire a peut-être déjà joué cette manche
    if (state.mode === 'online' && state.oppMoves[state.round]) {
      setStatus(`Choisis ton coup — ${state.names[1]} a déjà joué`);
    }
  }
}

function onPick(move) {
  if (state.mode === 'local') return onLocalPick(move);
  if (state.myMove) return;

  state.myMove = move;
  setChoicesEnabled(false);
  document.querySelector(`#choices button[data-move="${move}"]`).classList.add('selected');

  if (state.mode === 'cpu') {
    const keys = Object.keys(MOVES);
    state.oppMoves[state.round] = keys[Math.floor(Math.random() * keys.length)];
    setTimeout(tryReveal, 400);
  } else {
    send({ t: 'pick', move, round: state.round });
    setStatus(`En attente de ${state.names[1]}…`);
    tryReveal();
  }
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
    state.oppMoves[state.round] = state.localMoves[1];
    tryReveal();
  }
}

function tryReveal() {
  const opp = state.oppMoves[state.round];
  if (!state.myMove || !opp) return;

  const w = winner(state.myMove, opp);
  if (w) state.scores[w - 1]++;
  updateScoreboard();

  $('choices').classList.add('hidden');
  $('hand-1').textContent = MOVES[state.myMove].emoji;
  $('hand-2').textContent = MOVES[opp].emoji;
  // Force l'animation à rejouer
  ['hand-1', 'hand-2'].forEach((id) => { const el = $(id); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; });

  const result = $('result');
  result.className = 'result';
  if (w === 0) {
    result.textContent = 'Égalité !';
  } else if (state.mode === 'local') {
    result.textContent = `${state.names[w - 1]} gagne la manche !`;
  } else if (w === 1) {
    result.textContent = 'Gagné ! 🎉';
    result.classList.add('win');
  } else {
    result.textContent = 'Perdu…';
    result.classList.add('lose');
  }
  setStatus(`${MOVES[state.myMove].label} contre ${MOVES[opp].label}`);
  $('reveal').classList.remove('hidden');
}

function nextRound() {
  delete state.oppMoves[state.round];
  state.round++;
  startRound();
}

// ---------- Mode en ligne (PeerJS) ----------

function send(msg) {
  if (state.conn && state.conn.open) state.conn.send(msg);
}

function setupConnection(conn) {
  state.conn = conn;
  conn.on('open', () => send({ t: 'hello', name: myName() }));
  conn.on('data', (msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'hello') {
      const opp = String(msg.name || 'Ami').slice(0, 16);
      startGame('online', [myName(), opp]);
    } else if (msg.t === 'pick' && MOVES[msg.move] && Number.isInteger(msg.round)) {
      state.oppMoves[msg.round] = msg.move;
      if (msg.round === state.round) {
        if (state.myMove) tryReveal();
        else setStatus(`Choisis ton coup — ${state.names[1]} a déjà joué`);
      }
    }
  });
  conn.on('close', () => {
    if (state.mode === 'online') {
      alert(`${state.names[1]} a quitté la partie.`);
      quit();
    }
  });
}

function peerAvailable() {
  if (typeof Peer !== 'undefined') return true;
  $('share').classList.add('hidden');
  $('wait-text').textContent = 'Impossible de charger le mode en ligne. Vérifie ta connexion internet.';
  return false;
}

function hostGame() {
  saveName();
  show('wait');
  if (!peerAvailable()) return;
  $('wait-text').textContent = 'Création de la partie…';
  $('share').classList.add('hidden');

  const code = randomCode();
  const peer = new Peer(PEER_PREFIX + code);
  state.peer = peer;

  peer.on('open', () => {
    const url = `${location.origin}${location.pathname}?partie=${code}`;
    $('share-link').value = url;
    $('room-code').textContent = code;
    $('share').classList.remove('hidden');
    $('wait-text').textContent = 'En attente de ton ami…';
  });
  peer.on('connection', (conn) => {
    if (state.conn) { conn.close(); return; } // une seule personne à la fois
    setupConnection(conn);
  });
  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') { peer.destroy(); hostGame(); return; }
    $('wait-text').textContent = 'Erreur de connexion : ' + err.type;
  });
}

function joinGame(code) {
  show('wait');
  $('share').classList.add('hidden');
  $('wait-text').textContent = `Connexion à la partie ${code}…`;
  if (!peerAvailable()) return;

  const peer = new Peer();
  state.peer = peer;
  peer.on('open', () => setupConnection(peer.connect(PEER_PREFIX + code, { reliable: true })));
  peer.on('error', (err) => {
    $('wait-text').textContent = err.type === 'peer-unavailable'
      ? 'Partie introuvable. Le lien a peut-être expiré : demande-en un nouveau.'
      : 'Erreur de connexion : ' + err.type;
  });
}

async function shareLink() {
  const url = $('share-link').value;
  if (navigator.share) {
    try { await navigator.share({ title: 'Shifumi', text: 'Viens jouer au shifumi !', url }); return; } catch (e) { /* annulé */ }
  }
  try {
    await navigator.clipboard.writeText(url);
    $('btn-copy').textContent = '✅ Lien copié !';
  } catch (e) {
    $('share-link').select();
  }
}

function quit() {
  const peer = state.peer;
  state.mode = null;
  state.conn = null;
  state.peer = null;
  if (peer) peer.destroy();
  history.replaceState(null, '', location.pathname);
  $('btn-copy').textContent = '📋 Copier / partager le lien';
  $('btn-online').textContent = '🌐 Créer une partie en ligne';
  $('btn-online').onclick = hostGame;
  show('home');
}

// ---------- Initialisation ----------

try { $('name').value = localStorage.getItem('shifumi-name') || ''; } catch (e) { /* ignoré */ }

$('btn-online').onclick = hostGame;
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
document.querySelectorAll('.btn-quit').forEach((b) => { b.onclick = quit; });

const joinCode = new URLSearchParams(location.search).get('partie');
if (joinCode) {
  // L'invité choisit son pseudo avant de rejoindre
  $('btn-online').textContent = `🎮 Rejoindre la partie ${joinCode.toUpperCase()}`;
  $('btn-online').onclick = () => { saveName(); joinGame(joinCode.toUpperCase()); };
  $('name').focus();
}
