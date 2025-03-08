# Pokémon Database Exporter

This project exports data from the Pokémon Red/Blue game files into a SQLite database for easier analysis and use in other applications.


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

# Pokémon Map Exporter

This tool exports map data from the Pokémon Red/Blue codebase to a SQLite database and provides functionality to render maps as images.

## Overview

The Pokémon Red/Blue games store map data in a complex, layered format:

1. **Maps** (.blk files) - Each byte represents a block index
2. **Blocksets** (.bst files) - Each block is 16 bytes representing a 4x4 grid of tile indices
3. **Tilesets** (.png/.2bpp files) - Each tile is 8x8 pixels with 2 bits per pixel

This tool extracts all this data and stores it in a structured SQLite database, making it easier to work with and visualize.

## Requirements

- Python 3.6+
- PIL (Pillow) for image processing
- RGBDS tools (specifically `rgbgfx`) for generating 2bpp files from PNG files

## Installation

1. Clone this repository
2. Install the required Python packages:
   ```
   pip install pillow
   ```
3. Install RGBDS tools:
   - macOS: `brew install rgbds`
   - Linux: Follow instructions at https://rgbds.gbdev.io/install/
   - Windows: Download from https://github.com/gbdev/rgbds/releases


## How It Works

The tool follows the process described in MAPLOGIC.md:

1. Load map constants (dimensions) from constants/map_constants.asm
2. Load tileset constants from constants/tileset_constants.asm
3. Extract map headers from data/maps/headers/\*.asm to determine which tileset each map uses
4. Extract map data from maps/\*.blk
5. Extract tileset data from gfx/tilesets/_.png and gfx/blocksets/_.bst
6. Generate 2bpp files from PNG files if they don't exist
7. Parse blockset files to extract block data
8. Parse 2bpp files to extract tile data
9. Store all data in a SQLite database
