/* ─────────────────────────────────────────
   Pokémon Guide — app.js
   Lecture JSON + i18n (fr / en / ja)
───────────────────────────────────────── */

const SPRITE_URL = id =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;

// ── État global ──────────────────────────
const state = {
  lang: 'fr',
  gameId: null,
  stepIndex: 0,
  i18n: {},
  games: [],
  meta: null,
  pokemon: [],
};

// ── Chargement JSON ──────────────────────
async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Impossible de charger ${path}`);
  return res.json();
}

async function loadI18n(lang) {
  state.i18n = await fetchJSON(`i18n/${lang}.json`);
}

async function loadGames() {
  state.games = await fetchJSON('data/games.json');
}

async function loadGame(gameId) {
  const [meta, pokemon] = await Promise.all([
    fetchJSON(`data/${gameId}/meta.json`),
    fetchJSON(`data/${gameId}/pokemon.json`),
  ]);
  state.meta = meta;
  state.pokemon = pokemon;
  state.stepIndex = 0;
}

// ── Raccourci traduction ─────────────────
function t(key) {
  const keys = key.split('.');
  let val = state.i18n;
  for (const k of keys) val = val?.[k];
  return val ?? key;
}

function tName(obj) {
  return obj?.names?.[state.lang] ?? obj?.names?.fr ?? '???';
}

// ── Rendu ────────────────────────────────
function renderHeader() {
  document.title = t('ui.title');
  document.getElementById('site-title').textContent = t('ui.title');

  // Boutons langue
  const container = document.getElementById('lang-switcher');
  container.innerHTML = ['fr', 'en', 'ja'].map(l =>
    `<button class="lang-btn ${l === state.lang ? 'active' : ''}"
      onclick="switchLang('${l}')">${l.toUpperCase()}</button>`
  ).join('');
}

function renderGameSelector() {
  const el = document.getElementById('game-selector');
  el.innerHTML = state.games.map(g =>
    `<button class="game-btn ${g.id === state.gameId ? 'active' : ''}"
      style="${g.id === state.gameId ? `background:${g.color};border-color:${g.color}` : ''}"
      onclick="selectGame('${g.id}')">
      ${g.icon} ${tName(g)}
    </button>`
  ).join('');
}

function renderProgress() {
  if (!state.meta) return;
  const milestones = state.meta.milestones;
  const track = document.getElementById('progress-track');

  track.innerHTML = milestones.map((m, i) => {
    const isPast   = i < state.stepIndex;
    const isActive = i === state.stepIndex;
    const connector = i > 0
      ? `<div class="connector ${i <= state.stepIndex ? 'done' : ''}"></div>`
      : '';
    return `${connector}
      <div class="milestone" onclick="setStep(${i})" title="${tName(m)}">
        <div class="m-dot ${isPast ? 'past' : isActive ? 'active' : ''}">
          ${isPast ? '✓' : m.icon}
        </div>
        <div class="m-label ${isActive ? 'active' : ''}">
          ${tName(m).replace(' — ', '<br>')}
        </div>
      </div>`;
  }).join('');
}

function getObtainLabel(p) {
  const type = p.obtain?.type;
  const ui   = t('ui.tagLabels');
  switch (type) {
    case 'starter':   return { label: ui.starter,   cls: 'tag-starter'   };
    case 'wild':      return { label: ui.wild,       cls: 'tag-wild'      };
    case 'evolution': {
      const lvl = p.obtain.level;
      return { label: lvl ? `${t('ui.levelLabel')} ${lvl}` : ui.evolution, cls: 'tag-evolution' };
    }
    case 'stone':     return { label: ui.stone,      cls: 'tag-stone'     };
    case 'trade':     return { label: ui.trade,      cls: 'tag-trade'     };
    case 'gift':      return { label: ui.gift,       cls: 'tag-gift'      };
    case 'special':   return { label: ui.special,    cls: 'tag-special'   };
    default:          return { label: type ?? '?',   cls: 'tag-special'   };
  }
}

function getLocationText(p) {
  const type = p.obtain?.type;
  if (type === 'starter') return t('ui.tagLabels.starter');
  if (type === 'evolution') {
    const from = state.pokemon.find(pk => pk.id === p.obtain.from);
    return from ? `${t('ui.evolvesFrom')} ${tName(from)}` : '';
  }
  if (type === 'trade')   return t('ui.lockLabel.trade');
  if (type === 'stone')   return tName(p.lock) ?? t('ui.tagLabels.stone');
  if (p.obtain?.locations?.length) {
    const rarity = p.obtain.locations[0].rarity;
    const zone   = p.obtain.locations[0].zone;
    const rarityLabel = t(`ui.rarityLabels.${rarity}`) ?? rarity;
    return `${zone} · ${rarityLabel}`;
  }
  if (p.notes?.[state.lang]) return p.notes[state.lang];
  return '';
}

function getLockText(p) {
  if (!p.lock) return null;
  const type = p.lock.type;
  if (type === 'stone') return `🔒 ${tName(p.lock)}`;
  if (type === 'trade') return `🔒 ${t('ui.lockLabel.trade')}`;
  return `🔒 ${tName(p.lock)}`;
}

function makeCard(p, isLocked) {
  const { label, cls } = getObtainLabel(p);
  const location = getLocationText(p);
  const lockText = getLockText(p);

  return `<div class="poke-card ${isLocked ? 'locked' : ''}">
    <span class="poke-num">#${String(p.id).padStart(3, '0')}</span>
    <img src="${SPRITE_URL(p.id)}" alt="${tName(p)}" loading="lazy" width="72" height="72" />
    <span class="poke-name">${tName(p)}</span>
    <span class="poke-tag ${cls}">${label}</span>
    ${location ? `<span class="poke-location">${location}</span>` : ''}
    ${isLocked && lockText ? `<span class="lock-reason">${lockText}</span>` : ''}
  </div>`;
}

function renderGrids() {
  if (!state.meta || !state.pokemon.length) return;

  const currentId = state.meta.milestones[state.stepIndex].id;
  const milestoneIds = state.meta.milestones.map(m => m.id);
  const currentIndex = milestoneIds.indexOf(currentId);

  // Pokémon dont le jalon de départ est <= étape actuelle
  const reachable = state.pokemon.filter(p => {
    const pIdx = milestoneIds.indexOf(p.availableFrom);
    return pIdx <= currentIndex;
  });

  const available = reachable.filter(p => {
    if (!p.lock) return true;
    const lockIdx = milestoneIds.indexOf(p.lock.availableFrom);
    return lockIdx <= currentIndex;
  });

  const locked = reachable.filter(p => {
    if (!p.lock) return false;
    const lockIdx = milestoneIds.indexOf(p.lock.availableFrom);
    return lockIdx > currentIndex;
  });

  // Stats
  document.getElementById('stat-available').textContent = available.length;
  document.getElementById('stat-locked').textContent    = locked.length;
  document.getElementById('stat-total').textContent     = state.pokemon.length;
  document.getElementById('label-available').textContent = t('ui.statAvailable');
  document.getElementById('label-locked').textContent    = t('ui.statLocked');
  document.getElementById('label-total').textContent     = t('ui.statTotal');

  // Grilles
  document.getElementById('sec-available').textContent =
    `${available.length} ${t('ui.available')}`;
  document.getElementById('grid-available').innerHTML =
    available.map(p => makeCard(p, false)).join('');

  const hasLocked = locked.length > 0;
  document.getElementById('divider').style.display = hasLocked ? '' : 'none';
  document.getElementById('sec-locked').textContent =
    hasLocked ? `${locked.length} ${t('ui.locked')}` : '';
  document.getElementById('grid-locked').innerHTML =
    hasLocked ? locked.map(p => makeCard(p, true)).join('') : '';
}

function renderAll() {
  renderHeader();
  renderGameSelector();
  renderProgress();
  renderGrids();
}

// ── Actions utilisateur ──────────────────
async function switchLang(lang) {
  state.lang = lang;
  await loadI18n(lang);
  renderAll();
}

async function selectGame(id) {
  state.gameId = id;
  document.getElementById('placeholder').style.display = 'none';
  document.getElementById('main-content').style.display = '';
  await loadGame(id);
  renderAll();
}

function setStep(i) {
  state.stepIndex = i;
  renderProgress();
  renderGrids();
}

// ── Init ─────────────────────────────────
async function init() {
  await Promise.all([loadI18n('fr'), loadGames()]);
  renderHeader();
  renderGameSelector();
}

init();
