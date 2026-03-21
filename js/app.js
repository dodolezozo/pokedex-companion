/* ─────────────────────────────────────────
   Pokémon Guide — app.js  v4
   + exclusivités version
   + checkbox "capturé" avec localStorage
   + bouton reset
───────────────────────────────────────── */

const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

function SPRITE_URL(id) {
  const game = state.games.find(g => g.id === state.gameId);
  const set  = game?.spriteSet;
  const versioned = set
    ? `${SPRITE_BASE}/versions/${set}/${id}.png`
    : `${SPRITE_BASE}/${id}.png`;
  // Fallback : si le sprite versionné n'existe pas (404), on tombe sur le sprite par défaut
  return versioned;
}

// ── État global ──────────────────────────
const state = {
  lang: 'fr',
  gameId: null,
  stepIndex: 0,
  activeVersions: new Set(),   // versions cochées dans le filtre
  captured: {},                // { [gameId]: Set<pokemonId> }
  // données jeu
  games: [],
  meta: null,
  zones: {},
  // données globales
  pokedex: {},
  // i18n
  ui: {},
  pokemonNames: {},
  zoneNames: {},
  itemNames: {},
  milestoneNames: {},
};

// ── localStorage ─────────────────────────
const LS_KEY = gameId => `pkguide_captured_${gameId}`;

function loadCaptured(gameId) {
  if (!state.captured[gameId]) {
    try {
      const raw = localStorage.getItem(LS_KEY(gameId));
      state.captured[gameId] = raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      state.captured[gameId] = new Set();
    }
  }
  return state.captured[gameId];
}

function saveCaptured(gameId) {
  try {
    localStorage.setItem(
      LS_KEY(gameId),
      JSON.stringify([...state.captured[gameId]])
    );
  } catch { /* quota dépassé ou navigation privée */ }
}

function toggleCaptured(pokemonId) {
  const set = loadCaptured(state.gameId);
  if (set.has(pokemonId)) set.delete(pokemonId);
  else set.add(pokemonId);
  saveCaptured(state.gameId);
  // Mise à jour visuelle sans re-render complet
  const card = document.querySelector(`.poke-card[data-id="${pokemonId}"]`);
  if (card) {
    const isCaptured = set.has(pokemonId);
    card.classList.toggle('captured', isCaptured);
    const cb = card.querySelector('.capture-cb');
    if (cb) cb.checked = isCaptured;
  }
}

function resetCaptured() {
  state.captured[state.gameId] = new Set();
  saveCaptured(state.gameId);
  renderGrids();
}

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

async function loadGames()   { state.games  = await fetchJSON('data/games.json'); }
async function loadPokedex() { state.pokedex = await fetchJSON('data/pokemon.json'); }

async function loadGame(gameId) {
  const [meta, zones] = await Promise.all([
    fetchJSON(`data/${gameId}/meta.json`),
    fetchJSON(`data/zones/${gameId}.json`),
  ]);
  state.meta      = meta;
  state.zones     = zones;
  state.stepIndex = 0;

  // Init filtre versions : toutes actives par défaut
  state.activeVersions = new Set(Object.keys(meta.versions ?? {}));
  loadCaptured(gameId);
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
      ?? state.pokemonNames[String(id)]?.en ?? `#${id}`;
}
function itemName(key) {
  return state.itemNames[key]?.[state.lang]
      ?? state.itemNames[key]?.en ?? key;
}
function milestoneName(id) {
  return state.milestoneNames[state.gameId]?.[id]?.[state.lang]
      ?? state.milestoneNames[state.gameId]?.[id]?.en ?? id;
}
function gameName(game) {
  return game.names?.[state.lang] ?? game.names?.en ?? game.id;
}
function versionName(versionId) {
  const v = state.meta?.versions?.[versionId];
  return v?.[state.lang] ?? v?.en ?? versionId;
}

// ── Logique principale ───────────────────
function getCurrentState() {
  const unlockedZones = new Set();
  const unlockedItems = new Set();
  for (let i = 0; i <= state.stepIndex; i++) {
    const m = state.meta.milestones[i];
    m.unlocksZones.forEach(z => unlockedZones.add(z));
    m.unlocksItems.forEach(it => unlockedItems.add(it));
  }
  return { unlockedZones, unlockedItems };
}

function getWildPokemon(unlockedZones) {
  const found = new Set();
  for (const zone of unlockedZones) {
    (state.zones[zone] ?? []).forEach(id => found.add(id));
  }
  return found;
}

function getGiftPokemon() {
  const milestoneOrder = state.meta.milestones.map(m => m.id);
  const gifts = new Set();
  for (const gift of (state.meta.gifts ?? [])) {
    const giftIdx = milestoneOrder.indexOf(gift.milestone);
    if (giftIdx !== -1 && giftIdx <= state.stepIndex) gifts.add(gift.id);
  }
  return gifts;
}

// Retourne la version exclusive d'un pokémon (ou null)
function getExclusiveVersion(id) {
  const exclusives = state.meta?.exclusives ?? {};
  for (const [version, ids] of Object.entries(exclusives)) {
    if (ids.includes(id)) return version;
  }
  return null;
}

// Est-ce que ce pokémon est filtré par la version active ?
function isVersionFiltered(id) {
  const version = getExclusiveVersion(id);
  if (!version) return false; // pas exclusif = toujours visible
  return !state.activeVersions.has(version);
}

// Retourne les zones débloquées où spawn ce pokémon
function getSpawnZones(id, unlockedZones) {
  const zones = [];
  for (const zone of unlockedZones) {
    if ((state.zones[zone] ?? []).includes(id)) zones.push(zone);
  }
  return zones;
}

function categorizePokemon() {
  const { unlockedZones, unlockedItems } = getCurrentState();
  const wildIds    = getWildPokemon(unlockedZones);
  const giftIds    = getGiftPokemon();
  const starterIds = new Set(state.meta.starters ?? []);

  const result = { available: [], locked: [] };
  const seen   = new Set();

  function addPokemon(id, source) {
    if (seen.has(id)) return;
    seen.add(id);

    const spawnZones = ['wild', 'surfing', 'fishing'].includes(source) ? getSpawnZones(id, unlockedZones) : [];
    result.available.push({ id, source, exclusiveVersion: getExclusiveVersion(id), spawnZones });

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
          id: nextId, source: 'evolution', evolutionFrom: current,
          lockReason: { type: 'stone', item: evo.item },
          exclusiveVersion: getExclusiveVersion(nextId),
        });
        break;
      } else {
        result.available.push({
          id: nextId, source: 'evolution', evolutionFrom: current,
          evolution: evo, exclusiveVersion: getExclusiveVersion(nextId),
        });
      }
      current = nextId;
    }
  }

  for (const id of starterIds) addPokemon(id, 'starter');
  for (const id of giftIds)    addPokemon(id, 'gift');
  for (const id of wildIds)    addPokemon(id, 'wild');

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
  if (source === 'starter') return { label: t('tagLabels.starter'),   cls: 'tag-starter' };
  if (source === 'gift')    return { label: t('tagLabels.gift'),       cls: 'tag-gift' };
  if (source === 'wild')    return { label: t('tagLabels.wild'),       cls: 'tag-wild' };
  if (source === 'evolution' && evolution) {
    switch (evolution.type) {
      case 'level':          return { label: `${t('levelLabel')} ${evolution.level}`, cls: 'tag-evolution' };
      case 'stone':          return { label: t('tagLabels.stone'),     cls: 'tag-stone' };
      case 'trade':          return { label: t('tagLabels.trade'),     cls: 'tag-trade' };
      case 'happiness':
      case 'happiness-day':
      case 'happiness-night':return { label: t('tagLabels.happiness'), cls: 'tag-happiness' };
      case 'sun': case 'moon':return { label: t('tagLabels.time'),    cls: 'tag-special' };
      default:               return { label: t('tagLabels.evolution'), cls: 'tag-evolution' };
    }
  }
  if (source === 'npc-trade') return { label: t('tagLabels.npcTrade'), cls: 'tag-npc-trade' };
  if (source === 'buy')       return { label: t('tagLabels.buy'),      cls: 'tag-buy'      };
  if (source === 'surfing')   return { label: t('tagLabels.surfing'),  cls: 'tag-surfing'  };
  if (source === 'fishing')   return { label: t('tagLabels.fishing'),  cls: 'tag-fishing'  };
  if (source === 'fossil')    return { label: t('tagLabels.fossil'),   cls: 'tag-fossil'   };
  return { label: '?', cls: 'tag-special' };
}

function getSubline(entry) {
  const { source, evolution, evolutionFrom, lockReason } = entry;
  if (lockReason?.type === 'stone') return `🔒 ${itemName(lockReason.item)}`;
  if (lockReason?.type === 'trade') return `🔒 ${t('lockLabel.trade')}`;
  if (source === 'evolution' && evolutionFrom)
    return `${t('evolvesFrom')} ${pokeName(evolutionFrom)}`;
  return '';
}

function makeCard(entry, isLocked) {
  const { id, exclusiveVersion, spawnZones } = entry;
  const { label, cls } = getTagInfo(entry);
  const subline   = getSubline(entry);
  const name      = pokeName(id);
  const captured  = loadCaptured(state.gameId).has(id);
  const filtered  = isVersionFiltered(id);

  // Version exclusive badge
  const exclusiveBadge = exclusiveVersion
    ? `<span class="poke-tag tag-exclusive">${versionName(exclusiveVersion)}</span>`
    : '';

  // Checkbox capture (pas sur les locked)
  const checkbox = !isLocked
    ? `<label class="capture-label" onclick="event.stopPropagation()">
        <input type="checkbox" class="capture-cb" ${captured ? 'checked' : ''}
          onchange="toggleCaptured(${id})" />
        <span class="capture-box">${captured ? '✓' : ''}</span>
       </label>`
    : '';

  // Tooltip zones de spawn
  let tooltip = '';
  if (spawnZones && spawnZones.length > 0) {
    const zoneItems = spawnZones
      .map(z => `<span class="tooltip-zone">${state.zoneNames[z]?.[state.lang] ?? state.zoneNames[z]?.en ?? z}</span>`)
      .join('');
    tooltip = `<div class="spawn-tooltip"><div class="tooltip-title">${t("tooltipTitle")}</div>${zoneItems}</div>`;
  }

  const classes = [
    'poke-card',
    isLocked ? 'locked' : '',
    captured ? 'captured' : '',
    filtered ? 'version-hidden' : '',
    spawnZones && spawnZones.length > 0 ? 'has-tooltip' : '',
  ].filter(Boolean).join(' ');

  return `<div class="${classes}" data-id="${id}">
    ${checkbox}
    ${tooltip}
    <span class="poke-num">#${String(id).padStart(3, '0')}</span>
    <img src="${SPRITE_URL(id)}" alt="${name}" loading="lazy" width="64" height="64" onerror="this.src='${SPRITE_BASE}/${id}.png'" />
    <span class="poke-name">${name}</span>
    <span class="poke-tag ${cls}">${label}</span>
    ${exclusiveBadge}
    ${subline ? `<span class="poke-location">${subline}</span>` : ''}
  </div>`;
}

// ── Rendu filtres version ─────────────────
function renderVersionFilter() {
  const versions = state.meta?.versions ?? {};
  const keys = Object.keys(versions);
  const el = document.getElementById('version-filter');

  if (keys.length === 0) {
    el.style.display = 'none';
    return;
  }
  el.style.display = '';
  el.innerHTML = keys.map(vId => {
    const active = state.activeVersions.has(vId);
    return `<button class="version-btn ${active ? 'active' : ''}"
      onclick="toggleVersion('${vId}')">
      ${versionName(vId)}
    </button>`;
  }).join('');
}

function toggleVersion(versionId) {
  if (state.activeVersions.has(versionId)) {
    // Empêcher de tout décocher
    if (state.activeVersions.size === 1) return;
    state.activeVersions.delete(versionId);
  } else {
    state.activeVersions.add(versionId);
  }
  renderVersionFilter();
  renderGrids();
}

// ── Rendu UI ─────────────────────────────
function renderHeader() {
  document.title = t('title');
  document.getElementById('site-title').textContent      = t('title');
  document.getElementById('placeholder-text').textContent = t('noGame');
  document.getElementById('version-filter-label').textContent = t('versionFilter');
  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) resetBtn.title = t('resetTitle');
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
          <div class="m-dot ${isPast ? 'past' : isActive ? 'active' : ''}">${isPast ? '✓' : m.icon}</div>
          <div class="m-label ${isActive ? 'active' : ''}">${label}</div>
        </div>`;
    }).join('');
}

function renderGrids() {
  if (!state.meta) return;

  const { available, locked } = categorizePokemon();
  const captured = loadCaptured(state.gameId);

  // Stats (compte uniquement les non-filtrés)
  const visibleAvailable = available.filter(e => !isVersionFiltered(e.id));
  const capturedCount    = visibleAvailable.filter(e => captured.has(e.id)).length;

  document.getElementById('stat-available').textContent  = visibleAvailable.length;
  document.getElementById('stat-locked').textContent     = locked.filter(e => !isVersionFiltered(e.id)).length;
  document.getElementById('stat-captured').textContent   = capturedCount;
  document.getElementById('label-available').textContent = t('statAvailable');
  document.getElementById('label-locked').textContent    = t('statLocked');
  document.getElementById('label-captured').textContent  = t('statCaptured');

  document.getElementById('sec-available').textContent =
    `${visibleAvailable.length} ${t('available')}`;
  document.getElementById('grid-available').innerHTML =
    available.map(e => makeCard(e, false)).join('');

  const visibleLocked = locked.filter(e => !isVersionFiltered(e.id));
  const hasLocked = visibleLocked.length > 0;
  document.getElementById('divider').style.display  = hasLocked ? '' : 'none';
  document.getElementById('sec-locked').textContent =
    hasLocked ? `${visibleLocked.length} ${t('locked')}` : '';
  document.getElementById('grid-locked').innerHTML  =
    locked.map(e => makeCard(e, true)).join('');
}

function renderAll() {
  renderHeader();
  renderGameSelector();
  renderVersionFilter();
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
