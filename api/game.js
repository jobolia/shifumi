// API d'une partie de shifumi en ligne, enregistrée dans Redis (base créée depuis l'onglet Storage de Vercel).
//
// Une partie = un hash Redis `shifumi:<ID>` dont chaque champ n'est écrit qu'une fois (HSETNX),
// ce qui évite tout conflit quand les deux joueurs jouent en même temps :
//   token:0 / token:1   jeton secret de chaque joueur (gardé dans son navigateur)
//   name:0 / name:1     pseudos
//   m:<manche>:<joueur> coup joué (rock | paper | scissors)
//   rematch:<n>         demande de revanche qui ouvre le match n
// L'état de la partie (scores, historique…) est recalculé à chaque lecture par `fold`.

export const MOVES = ['rock', 'paper', 'scissors'];
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
export const WINS_NEEDED = 2;
const TTL_SECONDS = 60 * 60 * 24 * 30; // une partie est gardée 30 jours après la dernière action
const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// ---------- Stockage ----------

// Deux façons de joindre Redis, selon la base reliée au projet :
//   REDIS_URL                          connexion Redis classique (redis://…)
//   KV_REST_API_URL / KV_REST_API_TOKEN API HTTP d'Upstash
const REDIS_URL = process.env.REDIS_URL;
const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(...command) {
  const res = await fetch(REST_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}` },
    body: JSON.stringify(command),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `Redis HTTP ${res.status}`);
  return data.result;
}

// Stockage en mémoire, seulement pour tester en local sans Redis.
const memory = new Map();
const memoryStore = {
  async getAll(key) { return { ...(memory.get(key) || {}) }; },
  async setOnce(key, field, value) {
    const h = memory.get(key) || {};
    if (field in h) return false;
    h[field] = value;
    memory.set(key, h);
    return true;
  },
};

const redisStore = {
  async getAll(key) {
    const flat = (await redis('HGETALL', key)) || [];
    const h = {};
    for (let i = 0; i < flat.length; i += 2) h[flat[i]] = flat[i + 1];
    return h;
  },
  async setOnce(key, field, value) {
    const ok = (await redis('HSETNX', key, field, value)) === 1;
    if (ok) await redis('EXPIRE', key, TTL_SECONDS);
    return ok;
  },
};

// La connexion est gardée entre deux appels tant que la fonction reste « chaude ».
let clientPromise = null;
function redisClient() {
  if (!clientPromise) {
    clientPromise = import('redis').then(async ({ createClient }) => {
      const client = createClient({ url: REDIS_URL });
      client.on('error', (err) => console.error('Redis', err));
      await client.connect();
      return client;
    }).catch((err) => { clientPromise = null; throw err; });
  }
  return clientPromise;
}

const tcpStore = {
  async getAll(key) {
    return { ...(await (await redisClient()).hGetAll(key)) };
  },
  async setOnce(key, field, value) {
    const client = await redisClient();
    const res = await client.hSetNX(key, field, value);
    const ok = res === true || res === 1;
    if (ok) await client.expire(key, TTL_SECONDS);
    return ok;
  },
};

function getStore() {
  if (REDIS_URL) return tcpStore;
  if (REST_URL && REST_TOKEN) return redisStore;
  if (!process.env.VERCEL) return memoryStore;
  return null;
}

// ---------- Règles ----------

function roundWinner(a, b) {
  if (a === b) return -1;
  return BEATS[a] === b ? 0 : 1;
}

// Rejoue toute la partie à partir des champs enregistrés.
export function fold(h) {
  const state = {
    names: [h['name:0'] || null, h['name:1'] || null],
    wins: [0, 0],
    matches: [0, 0],
    matchNo: 1,
    matchRound: 1,
    round: 1,
    matchOver: false,
    history: [],
  };
  for (let r = 1; ; r++) {
    state.round = r;
    if (state.matchOver) {
      if (!h[`rematch:${state.matchNo + 1}`]) break;
      state.matchNo++;
      state.matchRound = 1;
      state.wins = [0, 0];
      state.matchOver = false;
    }
    const a = h[`m:${r}:0`];
    const b = h[`m:${r}:1`];
    if (!a || !b) break;
    const w = roundWinner(a, b);
    if (w >= 0) state.wins[w]++;
    const matchWinner = w >= 0 && state.wins[w] >= WINS_NEEDED ? w : -1;
    if (matchWinner >= 0) {
      state.matches[matchWinner]++;
      state.matchOver = true;
    }
    state.history.push({ round: r, matchNo: state.matchNo, matchRound: state.matchRound, moves: [a, b], winner: w, wins: [...state.wins], matchWinner });
    state.matchRound++;
  }
  return state;
}

// Ce qu'un joueur a le droit de voir : jamais le coup adverse de la manche en cours.
function view(h, me) {
  const s = fold(h);
  const out = {
    names: s.names,
    wins: s.wins,
    matches: s.matches,
    matchNo: s.matchNo,
    matchRound: s.matchRound,
    round: s.round,
    matchOver: s.matchOver,
    history: s.history,
    winsNeeded: WINS_NEEDED,
    me,
    played: [Boolean(h[`m:${s.round}:0`]), Boolean(h[`m:${s.round}:1`])],
    myMove: null,
  };
  if (s.matchOver) out.played = [false, false];
  if (me === 0 || me === 1) out.myMove = s.matchOver ? null : h[`m:${s.round}:${me}`] || null;
  return out;
}

// ---------- Handler HTTP ----------

function randomString(len, chars) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function cleanName(name) {
  return String(name || '').trim().slice(0, 16) || 'Joueur';
}

function whoAmI(h, token) {
  if (token && h['token:0'] === token) return 0;
  if (token && h['token:1'] === token) return 1;
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const store = getStore();
  if (!store) {
    return res.status(503).json({ error: "Le stockage des parties n'est pas encore configuré (base Redis manquante)." });
  }

  try {
    const input = req.method === 'GET' ? req.query : (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {});
    const action = req.method === 'GET' ? 'get' : input.action;
    const id = String(input.id || '').toUpperCase();
    const token = String(input.token || '');

    if (action === 'create') {
      for (let i = 0; i < 5; i++) {
        const newId = randomString(6, ID_CHARS);
        const newToken = randomString(24, ID_CHARS);
        const key = `shifumi:${newId}`;
        if (await store.setOnce(key, 'token:0', newToken)) {
          await store.setOnce(key, 'name:0', cleanName(input.name));
          return res.status(200).json({ id: newId, token: newToken, state: view(await store.getAll(key), 0) });
        }
      }
      return res.status(500).json({ error: 'Impossible de créer la partie, réessaie.' });
    }

    if (!/^[A-Z0-9]{6}$/.test(id)) return res.status(400).json({ error: 'Code de partie invalide.' });
    const key = `shifumi:${id}`;
    let h = await store.getAll(key);
    if (!h['token:0']) return res.status(404).json({ error: "Cette partie n'existe pas ou a expiré." });
    let me = whoAmI(h, token);

    if (action === 'get') {
      return res.status(200).json({ state: view(h, me) });
    }

    if (action === 'join') {
      if (me !== null) return res.status(200).json({ token, state: view(h, me) });
      const newToken = randomString(24, ID_CHARS);
      if (!(await store.setOnce(key, 'token:1', newToken))) {
        return res.status(409).json({ error: 'Cette partie est déjà complète.' });
      }
      await store.setOnce(key, 'name:1', cleanName(input.name));
      return res.status(200).json({ token: newToken, state: view(await store.getAll(key), 1) });
    }

    if (me === null) return res.status(403).json({ error: "Tu ne fais pas partie de cette partie." });

    if (action === 'play') {
      if (!MOVES.includes(input.move)) return res.status(400).json({ error: 'Coup invalide.' });
      const s = fold(h);
      if (s.matchOver) return res.status(409).json({ error: 'Le match est terminé.', state: view(h, me) });
      await store.setOnce(key, `m:${s.round}:${me}`, input.move); // ignoré si déjà joué
      h = await store.getAll(key);
      return res.status(200).json({ state: view(h, me) });
    }

    if (action === 'rematch') {
      const s = fold(h);
      if (s.matchOver) await store.setOnce(key, `rematch:${s.matchNo + 1}`, String(me));
      h = await store.getAll(key);
      return res.status(200).json({ state: view(h, me) });
    }

    return res.status(400).json({ error: 'Action inconnue.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erreur du serveur, réessaie dans un instant.' });
  }
}
