# Pokémon Database Exporter

This project exports data from the Pokémon Red/Blue game files into a SQLite database for easier analysis and use in other applications.

## Features

- Exports data from the original game files
- Creates a SQLite database with structured tables

## Installation

1. Clone this repository:

   ```bash
   git clone git@github.com:brynnb/pokemon-database-exporter.git
   cd pokemon-database-exporter
   ```

2. Install dependencies:
   ```bash
   npm install
   ```
   This will automatically clone the required Pokémon game data repository.

## Usage

### Using Node.js

Run the full export process:

```bash
npm run export
```

Export only item data:

```bash
npm run export:items
```

### Using Python directly

Export item data:

```bash
python3 export_items.py
```

Export move data:

```bash
python3 export_moves.py
```

### Pokémon Name Utilities

```python
from utils.pokemon_utils import normalize_pokemon_name, SPECIAL_NAME_MAPPINGS

# Convert special Pokémon names to their constant representation
normalized = normalize_pokemon_name("NidoranM")  # Returns "NIDORAN_M"
normalized = normalize_pokemon_name("Farfetch'd")  # Returns "FARFETCHD"
```

The `SPECIAL_NAME_MAPPINGS` dictionary contains mappings for Pokémon with special characters in their names.
