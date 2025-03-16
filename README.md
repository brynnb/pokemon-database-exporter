# Pokémon Database Exporter

This project exports data from the Pokémon Red/Blue game files into a SQLite database for easier analysis and use in other applications.

## Known Issues (To-Do List)

There is a lot of data still not in tables: NPC speech, text on signs, custom NPC behavior, wild pokemon data, collision info for tiles. Additionally some data is imperfect, and specifically the `warps` table, which is close to a good spot, but not entirely. 

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

## How Warps Work

Warps connect different maps in the game, allowing the player to move between locations. Each warp is defined with specific coordinates and a destination.

### Warp Definition Format

Warps are defined in map object files (e.g., `data/maps/objects/OaksLab.asm`) using the following format:

```
def_warp_events
    warp_event  x, y, DESTINATION_MAP, warp_id
```

Where:

- `x, y`: Coordinates of the warp tile on the current map
- `DESTINATION_MAP`: Constant for the destination map
- `warp_id`: 1-based index of the corresponding warp in the destination map

### How Warp Connections Work

The warp system uses 1-based indexing to connect warps between maps. When a player steps on a warp tile, the game:

1. Identifies which warp was triggered on the current map
2. Looks up the destination map and warp index
3. Finds the corresponding warp in the destination map
4. Places the player at those coordinates

### The LAST_MAP Special Value

Many warps in the game use a special value called `LAST_MAP` instead of a specific map constant. When the game encounters `LAST_MAP`, it uses the player's previous map as the destination. The game engine maintains a record of which map the player was in before entering the current map.

This approach simplifies the implementation of buildings and areas that should always return the player to wherever they entered from. Instead of hardcoding specific map connections, the game can dynamically determine the correct return location.

### Database Implementation Considerations

When creating a database representation of the game's maps and warps, the `LAST_MAP` value presents a challenge since it's a runtime value rather than a static connection. There are several approaches to handle this:

1. **Explicit Connections**: Replace `LAST_MAP` with explicit connections between each pair of connected maps. This requires identifying all possible entry points to a map and creating direct connections.

2. **Previous Map Tracking**: Implement a system that tracks the player's previous map, similar to how the game engine works. This maintains the dynamic nature of `LAST_MAP`.

3. **Bidirectional References**: Store warps in a table with bidirectional references, where each warp knows both its source and destination. When a warp uses `LAST_MAP`, the database can resolve this at query time.

### Example: Oak's Lab and Pallet Town

In `data/maps/objects/OaksLab.asm`, we have:

```
def_warp_events
    warp_event  4, 11, LAST_MAP, 3
    warp_event  5, 11, LAST_MAP, 3
```

This defines two warp tiles at coordinates (4,11) and (5,11) that both lead to warp #3 of the previous map (Pallet Town).

In `data/maps/objects/PalletTown.asm`, we have:

```
def_warp_events
    warp_event  5,  5, REDS_HOUSE_1F, 1
    warp_event 13,  5, BLUES_HOUSE, 1
    warp_event 12, 11, OAKS_LAB, 2
```

The third warp (index 3) is at coordinates (12,11) and leads to warp #2 in Oak's Lab.

So when a player steps on either tile (4,11) or (5,11) in Oak's Lab, they are transported to coordinates (12,11) in Pallet Town, which is the door to Oak's Lab. Conversely, when a player steps on tile (12,11) in Pallet Town, they are transported to the second warp in Oak's Lab.
