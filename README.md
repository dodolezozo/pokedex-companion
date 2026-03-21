# Pokémon Guide Progression

Un guide interactif qui affiche les Pokémon disponibles selon ta progression dans le jeu.

**[Voir le site →](https://ton-pseudo.github.io/pokemon-guide)**

## Fonctionnalités

- Slider de progression par arène / événement majeur
- Affichage des Pokémon disponibles à chaque étape
- Grisage des Pokémon nécessitant une condition non remplie (pierre, échange...)
- Sprites officiels via PokéAPI
- Support multilingue : Français · English · 日本語
- Jeux supportés : Rouge Feu/Vert Feuille · Rubis/Saphir/Émeraude · Diamant/Perle/Platine

## Structure

```
pokemon-guide/
├── index.html
├── css/style.css
├── js/app.js
├── i18n/           ← Traductions (fr/en/ja)
└── data/
    ├── games.json  ← Liste des jeux
    ├── frlg/       ← Rouge Feu / Vert Feuille
    │   ├── meta.json     (milestones + zones)
    │   └── pokemon.json  (pokémon + conditions)
    ├── rse/        ← Rubis / Saphir / Émeraude
    └── dp/         ← Diamant / Perle / Platine
```

## Ajouter un Pokémon

Dans `data/{jeu}/pokemon.json`, ajoute une entrée :

```json
{
  "id": 25,
  "names": { "fr": "Pikachu", "en": "Pikachu", "ja": "ピカチュウ" },
  "availableFrom": "gym1",
  "obtain": {
    "type": "wild",
    "locations": [{ "zone": "viridian-forest", "rarity": "uncommon" }]
  },
  "lock": null,
  "notes": null
}
```

### Types d'obtention (`type`)

| Type | Description |
|------|-------------|
| `starter` | Pokémon de départ |
| `wild` | Attrapable dans la nature |
| `evolution` | Par niveau (`level`) ou condition (`condition`) |
| `stone` | Pierre évolutive |
| `trade` | Échange |
| `gift` | Cadeau PNJ |
| `special` | Condition particulière |

### Verrou (`lock`)

Si un Pokémon est disponible à l'étape `gym1` mais nécessite une pierre disponible seulement à `gym4` :

```json
"lock": {
  "type": "stone",
  "item": "moon-stone",
  "names": { "fr": "Pierre Lune", "en": "Moon Stone", "ja": "つきのいし" },
  "availableFrom": "gym4"
}
```

## Hébergement GitHub Pages

1. Push le dossier sur un repo GitHub public
2. Settings → Pages → Source: `main` / `/ (root)`
3. Le site est disponible à `https://ton-pseudo.github.io/pokemon-guide`

## Licence

[CC BY-NC 4.0](LICENSE) — Usage non-commercial uniquement.
