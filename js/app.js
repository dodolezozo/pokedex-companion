/* ─────────────────────────────────────────
   Pokédex Companion — app.js  v5
───────────────────────────────────────── */

const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

function SPRITE_URL(id) {
  const game = state.games.find(g => g.id === state.gameId);
  const set  = game?.spriteSet;
  return set ? `${SPRITE_BASE}/versions/${set}/${id}.png` : `${SPRITE_BASE}/${id}.png`;
}

// ── État global ──────────────────────────
const state = {
  lang:           'fr',
  gameId:         null,
  stepIndex:      0,
  activeVersions: new Set(),
  captured:       {},
  gameMenuOpen:   false,
  games:          [],
  meta:           null,
  zones:          {},
  pokedex:        {},
  ui:             {},
  pokemonNames:   {},
  zoneNames:      {},
  itemNames:      {},
  milestoneNames: {},
};

// ── localStorage ─────────────────────────
const LS_KEY_CAPTURED = id => `pkc_captured_${id}`;
const LS_KEY_STEP     = id => `pkc_step_${id}`;
const LS_KEY_LANG     = ()  => `pkc_lang`;

function loadCaptured(gameId) {
  if (!state.captured[gameId]) {
    try {
      const raw = localStorage.getItem(LS_KEY_CAPTURED(gameId));
      state.captured[gameId] = raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { state.captured[gameId] = new Set(); }
  }
  return state.captured[gameId];
}

function saveCaptured(gameId) {
  try { localStorage.setItem(LS_KEY_CAPTURED(gameId), JSON.stringify([...state.captured[gameId]])); } catch {}
}

function loadStep(gameId) {
  try {
    const v = localStorage.getItem(LS_KEY_STEP(gameId));
    return v !== null ? parseInt(v, 10) : 0;
  } catch { return 0; }
}

function saveStep(gameId, stepIndex) {
  try { localStorage.setItem(LS_KEY_STEP(gameId), String(stepIndex)); } catch {}
}

function toggleCaptured(pokemonId) {
  const set = loadCaptured(state.gameId);
  if (set.has(pokemonId)) set.delete(pokemonId);
  else set.add(pokemonId);
  saveCaptured(state.gameId);

  const card = document.querySelector(`.poke-card[data-id="${pokemonId}"]`);
  if (card) {
    const isCaptured = set.has(pokemonId);
    card.classList.toggle('captured', isCaptured);
    const box = card.querySelector('.capture-box');
    if (box) box.textContent = isCaptured ? '✓' : '';
  }
  updateCapturedStat();
}

function updateCapturedStat() {
  const captured = loadCaptured(state.gameId);
  const allCards = document.querySelectorAll('.poke-card:not(.locked):not(.version-hidden)');
  const total = allCards.length;
  const count = [...allCards].filter(c => captured.has(Number(c.dataset.id))).length;
  document.getElementById('stat-captured').textContent = count;
  if (total > 0 && count === total) launchConfetti();
}

function launchConfetti() {
  const colors = ['#1D9E75','#EF9F27','#378ADD','#D4537E','#7F77DD','#E24B4A'];
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;overflow:hidden;';
  document.body.appendChild(container);
  for (let i = 0; i < 120; i++) {
    const piece = document.createElement('div');
    const color = colors[Math.floor(Math.random() * colors.length)];
    const size = 6 + Math.random() * 8;
    const isRect = Math.random() > 0.5;
    piece.style.cssText = `position:absolute;top:-20px;left:${Math.random()*100}%;width:${isRect?size:size*.6}px;height:${isRect?size*.4:size}px;background:${color};border-radius:${isRect?'2px':'50%'};animation:confetti-fall ${2.5+Math.random()*1.5}s ${Math.random()*.8}s ease-in forwards;transform:rotate(${Math.random()*360}deg);`;
    container.appendChild(piece);
  }
  setTimeout(() => container.remove(), 5000);
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

async function loadGames()   { state.games   = await fetchJSON('data/games.json'); }
async function loadPokedex() { state.pokedex = await fetchJSON('data/pokemon.json'); }

async function loadGame(gameId) {
  const [meta, zones] = await Promise.all([
    fetchJSON(`data/${gameId}/meta.json`),
    fetchJSON(`data/zones/${gameId}.json`),
  ]);
  state.meta      = meta;
  state.zones     = zones;
  state.stepIndex = Math.min(loadStep(gameId), (meta.milestones?.length ?? 1) - 1);
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
function pokeName(id)       { return state.pokemonNames[String(id)]?.[state.lang] ?? state.pokemonNames[String(id)]?.en ?? `#${id}`; }
function zoneName(key)      { return state.zoneNames[key]?.[state.lang]           ?? state.zoneNames[key]?.en           ?? key; }
function itemName(key)      { return state.itemNames[key]?.[state.lang]            ?? state.itemNames[key]?.en            ?? key; }
function milestoneName(id)  { return state.milestoneNames[state.gameId]?.[id]?.[state.lang] ?? state.milestoneNames[state.gameId]?.[id]?.en ?? id; }
function gameName(game)     { return game.names?.[state.lang] ?? game.names?.en ?? game.id; }
function versionName(vId)   { const v = state.meta?.versions?.[vId]; return v?.[state.lang] ?? v?.en ?? vId; }

// ── Filtre cross-gen ─────────────────────
function pokemonGen(id) {
  if (id <= 151) return 1; if (id <= 251) return 2; if (id <= 386) return 3;
  if (id <= 493) return 4; if (id <= 649) return 5; if (id <= 721) return 6;
  if (id <= 809) return 7; if (id <= 905) return 8; return 9;
}
function gameMaxGen() {
  return { rgb_jp:1, rby:1, gsc:2, rse:3, frlg:3, dp:4, hgss:4, bw:5, bw2:5,
           xy:6, oras:6, sm:7, usum:7, lgpe:7, swsh:8, bdsp:4, sv:9 }[state.gameId] ?? 9;
}

// ── Logique état courant ─────────────────
function getCurrentState() {
  const unlockedZones   = new Set();
  const unlockedItems   = new Set();
  const unlockedMethods = new Set(['wild']);

  for (let i = 0; i <= state.stepIndex; i++) {
    const m = state.meta.milestones[i];
    m.unlocksZones.forEach(z  => unlockedZones.add(z));
    m.unlocksItems.forEach(it => unlockedItems.add(it));
    if (m.id === 'hm-surf' || m.unlocksMethod === 'surfing') unlockedMethods.add('surfing');
    if (['hm-fish','old-rod','good-rod','super-rod'].includes(m.id) || m.unlocksMethod === 'fishing') unlockedMethods.add('fishing');
    if (m.unlocksMethod) unlockedMethods.add(m.unlocksMethod);
  }
  return { unlockedZones, unlockedItems, unlockedMethods };
}

function getZonePokemon(unlockedZones, unlockedMethods) {
  const found = new Map();
  for (const zone of unlockedZones) {
    const zoneData = state.zones[zone];
    if (!zoneData) continue;
    if (Array.isArray(zoneData)) {
      zoneData.forEach(id => { if (!found.has(id)) found.set(id, 'wild'); });
    } else {
      for (const [method, ids] of Object.entries(zoneData)) {
        if (!unlockedMethods.has(method)) continue;
        ids.forEach(id => { if (!found.has(id)) found.set(id, method); });
      }
    }
  }
  return found;
}

function getGiftPokemon() {
  const order = state.meta.milestones.map(m => m.id);
  const gifts = new Set();
  for (const gift of (state.meta.gifts ?? [])) {
    const idx = order.indexOf(gift.milestone);
    if (idx !== -1 && idx <= state.stepIndex) gifts.add(gift.id);
  }
  return gifts;
}

function getExclusiveVersion(id) {
  for (const [version, ids] of Object.entries(state.meta?.exclusives ?? {})) {
    if (ids.includes(id)) return version;
  }
  return null;
}
function isVersionFiltered(id) {
  const v = getExclusiveVersion(id);
  return v ? !state.activeVersions.has(v) : false;
}

function getSpawnZones(id, unlockedZones, unlockedMethods) {
  const zones = [];
  for (const zone of unlockedZones) {
    const zoneData = state.zones[zone];
    if (!zoneData) continue;
    if (Array.isArray(zoneData)) {
      if (zoneData.includes(id)) zones.push({ zone, method: 'wild' });
    } else {
      for (const [method, ids] of Object.entries(zoneData)) {
        if (unlockedMethods.has(method) && ids.includes(id)) zones.push({ zone, method });
      }
    }
  }
  return zones;
}

// Retourne toutes les branches d'évolution depuis un Pokémon
function getEvolutions(id) {
  const data = state.pokedex[String(id)];
  if (!data?.evolvesInto && data?.evolvesInto !== 0) return [];
  const into = Array.isArray(data.evolvesInto) ? data.evolvesInto : [data.evolvesInto];
  // Pour les branches multiples, chaque branche peut avoir sa propre condition d'évolution
  // Chercher dans le pokedex les Pokémon qui ont evolvesFrom = id
  if (into.length > 1 || Array.isArray(data.evolvesInto)) {
    return into.map(nextId => {
      const nextData = state.pokedex[String(nextId)];
      return { nextId, evolution: nextData?.evolution ?? data.evolution ?? null };
    });
  }
  return into.map(nextId => ({ nextId, evolution: data.evolution ?? null }));
}

function categorizePokemon() {
  const { unlockedZones, unlockedItems, unlockedMethods } = getCurrentState();
  const zonePokemon = getZonePokemon(unlockedZones, unlockedMethods);
  const giftIds     = getGiftPokemon();
  const starterIds  = new Set(state.meta.starters ?? []);
  const maxGen      = gameMaxGen();
  const result      = { available: [], locked: [] };
  const seen        = new Set();

  function addPokemon(id, source, evolutionFrom, evolution) {
    if (pokemonGen(id) > maxGen) return;
    if (seen.has(id)) return;
    seen.add(id);

    const spawnZones = ['wild','surfing','fishing'].includes(source)
      ? getSpawnZones(id, unlockedZones, unlockedMethods) : [];

    result.available.push({ id, source, evolutionFrom: evolutionFrom ?? null,
      evolution: evolution ?? null, exclusiveVersion: getExclusiveVersion(id), spawnZones });

    // Explorer toutes les branches d'évolution
    for (const { nextId, evolution: evo } of getEvolutions(id)) {
      if (seen.has(nextId) || pokemonGen(nextId) > maxGen) continue;

      const itemLocked = (evo?.type === 'stone' && !unlockedItems.has(evo.item))
                      || (evo?.type === 'trade' && evo.item && !unlockedItems.has(evo.item));

      if (itemLocked) {
        seen.add(nextId);
        result.locked.push({ id: nextId, source: 'evolution', evolutionFrom: id,
          lockReason: { type: evo.type, item: evo.item }, exclusiveVersion: getExclusiveVersion(nextId) });
      } else {
        addPokemon(nextId, 'evolution', id, evo);
      }
    }
  }

  for (const id of starterIds)             addPokemon(id, 'starter');
  for (const id of giftIds)               addPokemon(id, 'gift');
  for (const [id, source] of zonePokemon) addPokemon(id, source);

  result.available.sort((a, b) => a.id - b.id);
  result.locked.sort((a, b) => a.id - b.id);
  return result;
}

// ── Rendu cartes ─────────────────────────
function getTagInfo(entry) {
  const { source, evolution, lockReason } = entry;
  if (lockReason) {
    if (lockReason.type === 'stone') return { label: t('tagLabels.stone'), cls: 'tag-stone' };
    if (lockReason.type === 'trade') return { label: t('tagLabels.trade'), cls: 'tag-trade' };
    return { label: t('tagLabels.locked'), cls: 'tag-special' };
  }
  if (source === 'starter')  return { label: t('tagLabels.starter'),  cls: 'tag-starter'   };
  if (source === 'gift')     return { label: t('tagLabels.gift'),      cls: 'tag-gift'      };
  if (source === 'wild')     return { label: t('tagLabels.wild'),      cls: 'tag-wild'      };
  if (source === 'surfing')  return { label: t('tagLabels.surfing'),   cls: 'tag-surfing'   };
  if (source === 'fishing')  return { label: t('tagLabels.fishing'),   cls: 'tag-fishing'   };
  if (source === 'npc-trade')return { label: t('tagLabels.npcTrade'), cls: 'tag-npc-trade' };
  if (source === 'buy')      return { label: t('tagLabels.buy'),       cls: 'tag-buy'       };
  if (source === 'fossil')   return { label: t('tagLabels.fossil'),    cls: 'tag-fossil'    };
  if (source === 'evolution' && evolution) {
    switch (evolution.type) {
      case 'level':   return { label: `${t('levelLabel')} ${evolution.level}`, cls: 'tag-evolution' };
      case 'stone':   return { label: itemName(evolution.item), cls: 'tag-stone' };
      case 'trade':   return evolution.item
        ? { label: `${t('tagLabels.trade')} + ${itemName(evolution.item)}`, cls: 'tag-trade' }
        : { label: t('tagLabels.trade'), cls: 'tag-trade' };
      case 'happiness':
      case 'happiness-day':
      case 'happiness-night': return { label: t('tagLabels.happiness'), cls: 'tag-happiness' };
      case 'sun': case 'moon': return { label: t('tagLabels.time'), cls: 'tag-special' };
      default: return { label: t('tagLabels.evolution'), cls: 'tag-evolution' };
    }
  }
  return { label: '?', cls: 'tag-special' };
}

function getSubline(entry) {
  const { source, evolutionFrom, lockReason } = entry;
  if (lockReason?.type === 'stone') return `🔒 ${itemName(lockReason.item)}`;
  if (lockReason?.type === 'trade') return lockReason.item
    ? `🔒 ${t('tagLabels.trade')} + ${itemName(lockReason.item)}`
    : `🔒 ${t('lockLabel.trade')}`;
  if (source === 'evolution' && evolutionFrom) return `${t('evolvesFrom')} ${pokeName(evolutionFrom)}`;
  return '';
}

function makeCard(entry, isLocked) {
  const { id, exclusiveVersion, spawnZones } = entry;
  const { label, cls } = getTagInfo(entry);
  const subline  = getSubline(entry);
  const name     = pokeName(id);
  const captured = loadCaptured(state.gameId).has(id);
  const filtered = isVersionFiltered(id);

  const exclusiveBadge = exclusiveVersion
    ? `<span class="poke-tag tag-exclusive">${versionName(exclusiveVersion)}</span>` : '';

  const checkbox = !isLocked
    ? `<label class="capture-label" onclick="event.stopPropagation()">
        <input type="checkbox" class="capture-cb" ${captured ? 'checked' : ''}
          onchange="toggleCaptured(${id})" />
        <span class="capture-box">${captured ? '✓' : ''}</span>
       </label>` : '';

  let tooltip = '';
  if (spawnZones?.length > 0) {
    const icons = { wild:'🌿', surfing:'🌊', fishing:'🎣' };
    const items = spawnZones.map(({ zone, method }) =>
      `<span class="tooltip-zone">${icons[method]??''} ${zoneName(zone)}</span>`).join('');
    tooltip = `<div class="spawn-tooltip"><div class="tooltip-title">${t('tooltipTitle')}</div>${items}</div>`;
  }

  const classes = ['poke-card', isLocked?'locked':'', captured?'captured':'',
    filtered?'version-hidden':'', spawnZones?.length>0?'has-tooltip':''].filter(Boolean).join(' ');

  return `<div class="${classes}" data-id="${id}">
    ${checkbox}${tooltip}
    <span class="poke-num">#${String(id).padStart(3,'0')}</span>
    <img src="${SPRITE_URL(id)}" alt="${name}" loading="lazy" width="64" height="64"
      onerror="this.src='${SPRITE_BASE}/${id}.png'" />
    <span class="poke-name">${name}</span>
    <span class="poke-tag ${cls}">${label}</span>
    ${exclusiveBadge}
    ${subline ? `<span class="poke-location">${subline}</span>` : ''}
  </div>`;
}

// ── Rendu UI ─────────────────────────────
function renderHeader() {
  document.title = t('title');
  document.getElementById('site-title').textContent = t('title');
  document.getElementById('placeholder-text').textContent = t('noGame');
  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) resetBtn.title = t('resetTitle');
  document.getElementById('lang-switcher').innerHTML =
    ['fr','en','ja'].map(l =>
      `<button class="lang-btn ${l === state.lang ? 'active' : ''}"
        onclick="switchLang('${l}')">${l.toUpperCase()}</button>`
    ).join('');
}

function renderGameSelector() {
  const currentGame = state.games.find(g => g.id === state.gameId);
  const btnLabel = currentGame ? `${currentGame.icon} ${gameName(currentGame)}` : `🎮 ${t('selectGame')}`;

  document.getElementById('game-selector').innerHTML = `
    <div class="game-dropdown">
      <button class="game-main-btn ${state.gameId ? 'active' : ''}"
        style="${currentGame ? `border-color:${currentGame.color};color:${currentGame.color}` : ''}"
        onclick="toggleGameMenu()">
        ${btnLabel} <span class="dropdown-arrow">${state.gameMenuOpen ? '▲' : '▼'}</span>
      </button>
      ${state.gameMenuOpen ? `<div class="game-menu">
        ${state.games.map(g => `
          <button class="game-menu-item ${g.id === state.gameId ? 'selected' : ''}" onclick="selectGame('${g.id}')">
            ${g.icon} ${gameName(g)}
          </button>`).join('')}
      </div>` : ''}
    </div>`;
}

function toggleGameMenu() {
  state.gameMenuOpen = !state.gameMenuOpen;
  renderGameSelector();
}

function renderVersionFilter() {
  const versions = state.meta?.versions ?? {};
  const keys = Object.keys(versions);
  const el = document.getElementById('version-filter');
  if (keys.length === 0) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.innerHTML = `<span class="version-filter-label">${t('versionFilter')}</span>` +
    keys.map(vId => `<button class="version-btn ${state.activeVersions.has(vId) ? 'active' : ''}"
      onclick="toggleVersion('${vId}')">${versionName(vId)}</button>`).join('');
}

function toggleVersion(vId) {
  if (state.activeVersions.has(vId)) {
    if (state.activeVersions.size === 1) return;
    state.activeVersions.delete(vId);
  } else { state.activeVersions.add(vId); }
  renderVersionFilter();
  renderGrids();
}

function renderProgress() {
  if (!state.meta) return;
  document.getElementById('progress-track').innerHTML =
    state.meta.milestones.map((m, i) => {
      const isPast = i < state.stepIndex, isActive = i === state.stepIndex;
      const connector = i > 0 ? `<div class="connector ${i <= state.stepIndex ? 'done' : ''}"></div>` : '';
      return `${connector}
        <div class="milestone" onclick="setStep(${i})" title="${milestoneName(m.id)}">
          <div class="m-dot ${isPast ? 'past' : isActive ? 'active' : ''}">${isPast ? '✓' : m.icon}</div>
          <div class="m-label ${isActive ? 'active' : ''}">${milestoneName(m.id).replace(' — ','<br>')}</div>
        </div>`;
    }).join('');
}

function renderGrids() {
  if (!state.meta) return;
  const { available, locked } = categorizePokemon();
  const captured = loadCaptured(state.gameId);
  const visibleAvailable = available.filter(e => !isVersionFiltered(e.id));
  const capturedCount    = visibleAvailable.filter(e => captured.has(e.id)).length;

  document.getElementById('stat-available').textContent  = visibleAvailable.length;
  document.getElementById('stat-locked').textContent     = locked.filter(e => !isVersionFiltered(e.id)).length;
  document.getElementById('stat-captured').textContent   = capturedCount;
  document.getElementById('label-available').textContent = t('statAvailable');
  document.getElementById('label-locked').textContent    = t('statLocked');
  document.getElementById('label-captured').textContent  = t('statCaptured');

  document.getElementById('sec-available').textContent = `${visibleAvailable.length} ${t('available')}`;
  document.getElementById('grid-available').innerHTML  = available.map(e => makeCard(e, false)).join('');

  const visibleLocked = locked.filter(e => !isVersionFiltered(e.id));
  document.getElementById('divider').style.display  = visibleLocked.length > 0 ? '' : 'none';
  document.getElementById('sec-locked').textContent = visibleLocked.length > 0 ? `${visibleLocked.length} ${t('locked')}` : '';
  document.getElementById('grid-locked').innerHTML  = locked.map(e => makeCard(e, true)).join('');
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
  try { localStorage.setItem(LS_KEY_LANG(), lang); } catch {}
  await loadI18n();
  renderAll();
}

async function selectGame(id) {
  state.gameId       = id;
  state.gameMenuOpen = false;
  document.getElementById('placeholder').style.display  = 'none';
  document.getElementById('main-content').style.display = '';
  await loadGame(id);
  renderAll();
}

function setStep(i) {
  state.stepIndex = i;
  saveStep(state.gameId, i);
  renderProgress();
  renderGrids();
}

// ── Init ─────────────────────────────────
async function init() {
  try {
    const saved = localStorage.getItem(LS_KEY_LANG());
    if (saved && ['fr','en','ja'].includes(saved)) state.lang = saved;
  } catch {}

  await Promise.all([loadI18n(), loadGames(), loadPokedex()]);
  renderAll();

  document.addEventListener('click', e => {
    if (state.gameMenuOpen && !e.target.closest('.game-dropdown')) {
      state.gameMenuOpen = false;
      renderGameSelector();
    }
  });
}

init();
