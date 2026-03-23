"""
generate_pokemon.py
-------------------
Génère data/pokemon.json depuis PokéAPI.

Usage:
    pip install requests
    python generate_pokemon.py

Format de sortie:
    {
      "25":  {},                                          ← pas d'évolution
      "26":  { "evolvesFrom": 25, "evolution": { "type": "stone", "item": "thunder-stone" } },
      "133": {},
      "134": { "evolvesFrom": 133, "evolution": { "type": "stone", "item": "water-stone" } },
      ...
    }
"""

import requests, json, time, sys
from pathlib import Path

API = "https://pokeapi.co/api/v2"
MAX_ID = 1025  # Gen 1-7, changer à 905 pour gen 8 ou 1025 pour gen 9

# ── Helpers ───────────────────────────────────────────────

def get(url, retries=3):
    for i in range(retries):
        try:
            r = requests.get(url, timeout=10)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            if i == retries - 1:
                raise
            time.sleep(1)

def item_name(item_url):
    """Retourne le slug de l'item (ex: 'thunder-stone')."""
    return item_url.rstrip('/').split('/')[-1]

def parse_condition(detail):
    """
    Convertit un evolution-detail de PokéAPI en notre format { type, ... }.
    Retourne None si la condition n'est pas reconnue (forme alternative, etc.)
    """
    trigger = detail.get('trigger', {}).get('name', '')

    if trigger == 'level-up':
        min_level      = detail.get('min_level')
        min_happiness  = detail.get('min_happiness')
        time_of_day    = detail.get('time_of_day', '')
        known_move     = detail.get('known_move')
        held_item      = detail.get('held_item')
        min_beauty     = detail.get('min_beauty')
        min_affection  = detail.get('min_affection')
        needs_overworld_rain = detail.get('needs_overworld_rain')
        location       = detail.get('location')

        if min_happiness:
            if time_of_day == 'day':
                return {'type': 'happiness-day'}
            elif time_of_day == 'night':
                return {'type': 'happiness-night'}
            else:
                return {'type': 'happiness'}
        if min_beauty:
            return {'type': 'beauty', 'value': min_beauty}
        if min_affection:
            return {'type': 'affection', 'value': min_affection}
        if held_item:
            return {'type': 'level-held', 'item': held_item.get('name') or item_name(held_item['url']), 'time': time_of_day or None}
        if known_move:
            return {'type': 'move', 'move': known_move['name']}
        if needs_overworld_rain:
            return {'type': 'rain'}
        if location:
            return {'type': 'location', 'location': location['name']}
        if time_of_day == 'day':
            return {'type': 'level-day', 'level': min_level}
        if time_of_day == 'night':
            return {'type': 'level-night', 'level': min_level}
        if min_level:
            return {'type': 'level', 'level': min_level}
        # Level-up sans condition particulière (Levelup vide = rare, ex: Nincada)
        return {'type': 'level', 'level': None}

    elif trigger == 'use-item':
        item = detail.get('item')
        if item:
            return {'type': 'stone', 'item': item.get('name') or item_name(item['url'])}

    elif trigger == 'trade':
        held = detail.get('held_item')
        if held:
            return {'type': 'trade', 'item': held.get('name') or item_name(held['url'])}
        return {'type': 'trade'}

    elif trigger == 'shed':
        return {'type': 'shed'}  # Ninjask/Munja

    elif trigger == 'spin':
        return {'type': 'spin'}

    elif trigger == 'tower-of-darkness':
        return {'type': 'tower-of-darkness'}

    elif trigger == 'tower-of-waters':
        return {'type': 'tower-of-waters'}

    elif trigger == 'three-critical-hits':
        return {'type': 'three-critical-hits'}

    elif trigger == 'take-damage':
        return {'type': 'take-damage'}

    elif trigger == 'agile-style-move':
        return {'type': 'agile-style'}

    elif trigger == 'strong-style-move':
        return {'type': 'strong-style'}

    elif trigger == 'recoil-damage':
        return {'type': 'recoil-damage'}

    # Trigger inconnu
    return {'type': trigger}


def get_pokemon_id(species_url):
    return int(species_url.rstrip('/').split('/')[-1])


# ── Collecte des chaînes d'évolution ─────────────────────

def walk_chain(node, result):
    """
    Parcourt récursivement une chaîne d'évolution PokéAPI.
    Remplit result[id] = { evolvesFrom, evolution }
    """
    species_url = node['species']['url']
    current_id  = get_pokemon_id(species_url)

    if current_id not in result:
        result[current_id] = {}

    for evo in node.get('evolves_to', []):
        target_url = evo['species']['url']
        target_id  = get_pokemon_id(target_url)

        details = evo.get('evolution_details', [])
        # Prendre le premier détail non-vide (PokéAPI peut en lister plusieurs)
        condition = None
        for d in details:
            cond = parse_condition(d)
            if cond:
                condition = cond
                break

        result[target_id] = {
            'evolvesFrom': current_id,
            'evolution':   condition,
        }

        walk_chain(evo, result)


# ── Main ──────────────────────────────────────────────────

def main():
    print(f"Fetching toutes les chaînes d'évolution pour {MAX_ID} Pokémon...")

    # 1. Récupérer la liste de toutes les espèces
    print("  → Liste des espèces...")
    species_list = get(f"{API}/pokemon-species?limit={MAX_ID}&offset=0")
    species_urls = [s['url'] for s in species_list['results']]
    print(f"     {len(species_urls)} espèces trouvées")

    # 2. Collecter les IDs de chaînes d'évolution (dédupliqués)
    print("  → Collecte des chaînes d'évolution...")
    chain_urls = set()
    for i, url in enumerate(species_urls):
        species = get(url)
        chain_url = species['evolution_chain']['url']
        chain_urls.add(chain_url)
        if (i + 1) % 50 == 0:
            print(f"     {i+1}/{len(species_urls)} espèces traitées...")
        time.sleep(0.05)  # respecter le rate limit

    print(f"     {len(chain_urls)} chaînes d'évolution uniques")

    # 3. Walker chaque chaîne
    print("  → Parsing des chaînes...")
    evo_data = {}
    for i, chain_url in enumerate(chain_urls):
        chain = get(chain_url)
        walk_chain(chain['chain'], evo_data)
        if (i + 1) % 50 == 0:
            print(f"     {i+1}/{len(chain_urls)} chaînes traitées...")
        time.sleep(0.05)

    # 4. S'assurer que tous les IDs jusqu'à MAX_ID sont présents
    for id in range(1, MAX_ID + 1):
        if id not in evo_data:
            evo_data[id] = {}

    # 5. Nettoyer les entrées vides (evolution: None → retirer la clé)
    for id, entry in evo_data.items():
        if 'evolution' in entry and entry['evolution'] is None:
            del entry['evolution']

    # 6. Trier par ID et convertir les clés en string
    sorted_data = {
        str(k): evo_data[k]
        for k in sorted(evo_data.keys())
        if k <= MAX_ID
    }

    # 7. Écrire le fichier
    out_path = Path('pokemon.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(sorted_data, f, ensure_ascii=False, indent=2)

    print(f"\n✓ {len(sorted_data)} Pokémon écrits dans {out_path}")

    # Quelques vérifications rapides
    print("\nVérifications:")
    checks = {
        '25':  'Pikachu (pas d\'évolution depuis)',
        '26':  'Raichu (évolution de Pikachu, pierre)',
        '133': 'Évoli (base)',
        '134': 'Aquali (pierre eau)',
        '196': 'Mentali (bonheur jour)',
        '197': 'Noctali (bonheur nuit)',
        '129': 'Magicarpe',
        '130': 'Léviator (niveau 20)',
    }
    for id, label in checks.items():
        print(f"  {id} {label}: {sorted_data.get(id, 'MISSING')}")


if __name__ == '__main__':
    main()
