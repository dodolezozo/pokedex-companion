/* ─────────────────────────────────────────
   Pokémon Guide — app.js  v3
   Logique : zones → Pokémon + inférence évolutions
───────────────────────────────────────── */

const SPRITE_URL = id =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;

// ── État global ──────────────────────────
const state = {
  lang: 'fr',
  gameId: null,
  stepIndex: 0,
  // données jeu
  games: [],
  meta: null,       // milestones + starters + gifts
  zones: {},        // zoneId → [pokemonId, ...]
  // données globales
  pokedex: {},      // id → { evolvesFrom, evolvesInto, evolution }
  // i18n
  ui: {},
  pokemonNames: {},
  zoneNames: {},
  itemNames: {},
  milestoneNames: {},
};

// ── Chargement JSON ──────────────────────
async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Cannot load ${path}`);
  return res.json();
}

async function loadI18n() {
  const [ui, pokemonNames, zoneNames, itemNames, milestoneNames] = await Promise.all([
    fetchJSON(`i18n/${state.lang}.json`),
    fetchJSON('data/i18n/pokemon-names.json'),
    fetchJSON('data/i18n/zones.json'),
    fetchJSON('data/i18n/items.json'),
    fetchJSON('data/i18n/milestones.json'),
  ]);
  state.ui             = ui.ui;
  state.pokemonNames   = pokemonNames;
  state.zoneNames      = zoneNames;
  state.itemNames      = itemNames;
  state.milestoneNames = milestoneNames;
}

async function loadGames() {
  state.games = await fetchJSON('data/games.json');
}

async function loadPokedex() {
  state.pokedex = await fetchJSON('data/pokemon.json');
}

async function loadGame(gameId) {
  const [meta, zones] = await Promise.all([
    fetchJSON(`data/${gameId}/meta.json`),
    fetchJSON(`data/zones/${gameId}.json`),
  ]);
  state.meta      = meta;
  state.zones     = zones;
  state.stepIndex = 0;
}

// ── Helpers traduction ───────────────────
function t(key) {
  const keys = key.split('.');
  let val = state.ui;
  for (const k of keys) val = val?.[k];
  return val ?? key;
}

function pokeName(id) {
  return state.pokemonNames[String(id)]?.[state.lang]
      ?? state.pokemonNames[String(id)]?.en
      ?? `#${id}`;
}

function zoneName(key) {
  return state.zoneNames[key]?.[state.lang]
      ?? state.zoneNames[key]?.en
      ?? key;
}

function itemName(key) {
  return state.itemNames[key]?.[state.lang]
      ?? state.itemNames[key]?.en
      ?? key;
}

function milestoneName(id) {
  return state.milestoneNames[state.gameId]?.[id]?.[state.lang]
      ?? state.milestoneNames[state.gameId]?.[id]?.en
      ?? id;
}

function gameName(game) {
  return game.names?.[state.lang] ?? game.names?.en ?? game.id;
}

// ── Logique principale ───────────────────

// Retourne l'état courant : zones débloquées, items disponibles
function getCurrentState() {
  const milestones = state.meta.milestones;
  const unlockedZones = new Set();
  const unlockedItems = new Set();

  for (let i = 0; i <= state.stepIndex; i++) {
    const m = milestones[i];
    m.unlocksZones.forEach(z => unlockedZones.add(z));
    m.unlocksItems.forEach(it => unlockedItems.add(it));
  }

  return { unlockedZones, unlockedItems };
}

// Retourne l'ensemble des Pokémon directement trouvables dans les zones débloquées
function getWildPokemon(unlockedZones) {
  const found = new Set();
  for (const zone of unlockedZones) {
    const ids = state.zones[zone] ?? [];
    ids.forEach(id => found.add(id));
  }
  return found;
}

// Retourne les gifts disponibles à ce stade
function getGiftPokemon() {
  const milestones = state.meta.milestones;
  const currentMilestoneId = milestones[state.stepIndex].id;
  const milestoneOrder = milestones.map(m => m.id);
  const currentIdx = milestoneOrder.indexOf(currentMilestoneId);

  const gifts = new Set();
  for (const gift of (state.meta.gifts ?? [])) {
    const giftIdx = milestoneOrder.indexOf(gift.milestone);
    if (giftIdx !== -1 && giftIdx <= currentIdx) {
      gifts.add(gift.id);
    }
  }
  return gifts;
}

// Remonte la chaîne d'évolution jusqu'à la base
function getEvolutionChainBase(id) {
  let current = id;
  const visited = new Set();
  while (true) {
    if (visited.has(current)) break;
    visited.add(current);
    const data = state.pokedex[String(current)];
    if (!data?.evolvesFrom) break;
    current = data.evolvesFrom;
  }
  return current;
}

// Descend toute la chaîne depuis un ID
function getEvolutionChainDown(id) {
  const chain = [];
  let current = id;
  const visited = new Set();
  while (current && !visited.has(current)) {
    visited.add(current);
    chain.push(current);
    const data = state.pokedex[String(current)];
    current = data?.evolvesInto ?? null;
  }
  return chain;
}

// Vérifie si une évolution est bloquée par un item non disponible
function isEvolutionItemLocked(id, unlockedItems) {
  const data = state.pokedex[String(id)];
  if (!data?.evolution) return false;
  const evo = data.evolution;
  if (evo.type === 'stone' && !unlockedItems.has(evo.item)) return true;
  if (evo.type === 'metal-coat' && !unlockedItems.has('metal-coat')) return true;
  return false;
}

// Catégoriser tous les Pokémon à afficher
function categorizePokemon() {
  const { unlockedZones, unlockedItems } = getCurrentState();
  const wildIds   = getWildPokemon(unlockedZones);
  const giftIds   = getGiftPokemon();
  const starterIds = new Set(state.meta.starters ?? []);

  // Ensemble de toutes les "bases accessibles" (sauvages + starters + gifts)
  const accessible = new Set([...wildIds, ...giftIds, ...starterIds]);

  const result = {
    available: [],  // { id, source, evolutionLocked: false }
    locked: [],     // { id, source, lockReason }
  };

  const seen = new Set();

  function addPokemon(id, source) {
    if (seen.has(id)) return;
    seen.add(id);

    const data = state.pokedex[String(id)] ?? {};

    // Pokémon lui-même : disponible
    result.available.push({ id, source });

    // Dérouler la chaîne d'évolutions suivantes
    let current = id;
    while (true) {
      const d = state.pokedex[String(current)];
      if (!d?.evolvesInto) break;
      const nextId = d.evolvesInto;
      if (seen.has(nextId)) break;
      seen.add(nextId);

      const evo = d.evolution;
      const itemLocked = evo?.type === 'stone' && !unlockedItems.has(evo.item);

      if (itemLocked) {
        result.locked.push({
          id: nextId,
          source: 'evolution',
          evolutionFrom: current,
          lockReason: { type: 'stone', item: evo.item },
        });
        break; // Si bloqué ici, on ne continue pas la chaîne
      } else {
        result.available.push({ id: nextId, source: 'evolution', evolutionFrom: current, evolution: evo });
      }
      current = nextId;
    }
  }

  // Starters
  for (const id of starterIds) addPokemon(id, 'starter');

  // Gifts
  for (const id of giftIds) addPokemon(id, 'gift');

  // Sauvages
  for (const id of wildIds) addPokemon(id, 'wild');

  return result;
}

// ── Rendu des cartes ─────────────────────
function getTagInfo(entry) {
  const { source, evolution, lockReason } = entry;

  if (lockReason) {
    if (lockReason.type === 'stone') return { label: t('tagLabels.stone'), cls: 'tag-stone' };
    if (lockReason.type === 'trade') return { label: t('tagLabels.trade'), cls: 'tag-trade' };
    return { label: t('tagLabels.locked'), cls: 'tag-special' };
  }

  if (source === 'starter') return { label: t('tagLabels.starter'), cls: 'tag-starter' };
  if (source === 'gift')    return { label: t('tagLabels.gift'),    cls: 'tag-gift' };
  if (source === 'wild')    return { label: t('tagLabels.wild'),    cls: 'tag-wild' };

  if (source === 'evolution' && evolution) {
    switch (evolution.type) {
      case 'level':      return { label: `${t('levelLabel')} ${evolution.level}`, cls: 'tag-evolution' };
      case 'stone':      return { label: t('tagLabels.stone'),      cls: 'tag-stone' };
      case 'trade':      return { label: t('tagLabels.trade'),      cls: 'tag-trade' };
      case 'happiness':
      case 'happiness-day':
      case 'happiness-night':
                         return { label: t('tagLabels.happiness'),  cls: 'tag-happiness' };
      case 'sun':
      case 'moon':       return { label: t('tagLabels.time'),       cls: 'tag-special' };
      default:           return { label: t('tagLabels.evolution'),  cls: 'tag-evolution' };
    }
  }

  return { label: '?', cls: 'tag-special' };
}

function getSubline(entry) {
  const { source, evolution, evolutionFrom, lockReason } = entry;

  if (lockReason?.type === 'stone') return `🔒 ${itemName(lockReason.item)}`;
  if (lockReason?.type === 'trade') return `🔒 ${t('lockLabel.trade')}`;

  if (source === 'evolution' && evolutionFrom) {
    return `${t('evolvesFrom')} ${pokeName(evolutionFrom)}`;
  }

  return '';
}

function makeCard(entry, isLocked) {
  const { id } = entry;
  const { label, cls } = getTagInfo(entry);
  const subline = getSubline(entry);
  const name = pokeName(id);

  return `<div class="poke-card ${isLocked ? 'locked' : ''}">
    <span class="poke-num">#${String(id).padStart(3, '0')}</span>
    <img src="${SPRITE_URL(id)}" alt="${name}" loading="lazy" width="72" height="72" />
    <span class="poke-name">${name}</span>
    <span class="poke-tag ${cls}">${label}</span>
    ${subline ? `<span class="poke-location">${subline}</span>` : ''}
  </div>`;
}

// ── Rendu UI ─────────────────────────────
function renderHeader() {
  document.title = t('title');
  document.getElementById('site-title').textContent = t('title');
  document.getElementById('lang-switcher').innerHTML =
    ['fr', 'en', 'ja'].map(l =>
      `<button class="lang-btn ${l === state.lang ? 'active' : ''}"
        onclick="switchLang('${l}')">${l.toUpperCase()}</button>`
    ).join('');
}

function renderGameSelector() {
  document.getElementById('game-selector').innerHTML =
    state.games.map(g =>
      `<button class="game-btn ${g.id === state.gameId ? 'active' : ''}"
        style="${g.id === state.gameId ? `background:${g.color};border-color:${g.color}` : ''}"
        onclick="selectGame('${g.id}')">
        ${g.icon} ${gameName(g)}
      </button>`
    ).join('');
}

function renderProgress() {
  if (!state.meta) return;
  document.getElementById('progress-track').innerHTML =
    state.meta.milestones.map((m, i) => {
      const isPast   = i < state.stepIndex;
      const isActive = i === state.stepIndex;
      const label    = milestoneName(m.id).replace(' — ', '<br>');
      const connector = i > 0
        ? `<div class="connector ${i <= state.stepIndex ? 'done' : ''}"></div>`
        : '';
      return `${connector}
        <div class="milestone" onclick="setStep(${i})" title="${milestoneName(m.id)}">
          <div class="m-dot ${isPast ? 'past' : isActive ? 'active' : ''}">
            ${isPast ? '✓' : m.icon}
          </div>
          <div class="m-label ${isActive ? 'active' : ''}">${label}</div>
        </div>`;
    }).join('');
}

function renderGrids() {
  if (!state.meta) return;

  const { available, locked } = categorizePokemon();

  document.getElementById('stat-available').textContent  = available.length;
  document.getElementById('stat-locked').textContent     = locked.length;
  document.getElementById('stat-total').textContent      = available.length + locked.length;
  document.getElementById('label-available').textContent = t('statAvailable');
  document.getElementById('label-locked').textContent    = t('statLocked');
  document.getElementById('label-total').textContent     = t('statTotal');

  document.getElementById('sec-available').textContent =
    `${available.length} ${t('available')}`;
  document.getElementById('grid-available').innerHTML =
    available.map(e => makeCard(e, false)).join('');

  const hasLocked = locked.length > 0;
  document.getElementById('divider').style.display  = hasLocked ? '' : 'none';
  document.getElementById('sec-locked').textContent =
    hasLocked ? `${locked.length} ${t('locked')}` : '';
  document.getElementById('grid-locked').innerHTML  =
    hasLocked ? locked.map(e => makeCard(e, true)).join('') : '';
}

function renderAll() {
  renderHeader();
  renderGameSelector();
  renderProgress();
  renderGrids();
}

// ── Actions ──────────────────────────────
async function switchLang(lang) {
  state.lang = lang;
  const ui = await fetchJSON(`i18n/${lang}.json`);
  state.ui = ui.ui;
  renderAll();
}

async function selectGame(id) {
  state.gameId = id;
  document.getElementById('placeholder').style.display  = 'none';
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
  await Promise.all([loadI18n(), loadGames(), loadPokedex()]);
  renderAll();
}

init();
