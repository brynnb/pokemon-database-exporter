#!/usr/bin/env python3
import os
import re
import sqlite3
from pathlib import Path

# Constants
POKEMON_DATA_DIR = Path("pokemon-game-data/data/maps/objects")
CONSTANTS_DIR = Path("pokemon-game-data/constants")
MAP_HEADERS_DIR = Path("pokemon-game-data/data/maps/headers")
ROOT_DIR = "pokemon-game-data"

# Object types
OBJECT_TYPE_BG = "sign"
OBJECT_TYPE_OBJECT = "npc"
OBJECT_TYPE_ITEM = "item"


def create_database(cursor):
    """Create SQLite database and objects table"""
    # Drop existing objects table if it exists
    cursor.execute("DROP TABLE IF EXISTS objects")

    # Create objects table
    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS objects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        map_id INTEGER NOT NULL,
        object_type TEXT NOT NULL,
        x INTEGER,
        y INTEGER,
        local_x INTEGER,
        local_y INTEGER,
        spriteset_id INTEGER,
        sprite_name TEXT,
        text TEXT,
        action_type TEXT,
        action_direction TEXT,
        item_id INTEGER,
        FOREIGN KEY (map_id) REFERENCES maps (id),
        FOREIGN KEY (item_id) REFERENCES items (id)
    )
    """
    )


def parse_map_name_from_file(file_path):
    """Extract map name from file path"""
    file_name = os.path.basename(file_path)
    map_name = os.path.splitext(file_name)[0]
    return map_name


def parse_bg_events(content, map_name):
    """Parse background events (signs) from the map object file"""
    signs = []

    # Find the bg events section
    bg_section_match = re.search(
        r"def_bg_events(.*?)(?:def_object_events|\Z)", content, re.DOTALL
    )
    if not bg_section_match:
        return signs

    bg_section = bg_section_match.group(1)

    # Extract individual bg events
    bg_pattern = r"bg_event\s+(\d+),\s+(\d+),\s+(\w+)"
    bg_matches = re.finditer(bg_pattern, bg_section)

    for i, match in enumerate(bg_matches):
        x = int(match.group(1))
        y = int(match.group(2))
        text_id = match.group(3)

        signs.append(
            {
                "name": f"{map_name}_SIGN_{i+1}",
                "object_type": OBJECT_TYPE_BG,
                "x": None,  # Global x will be populated later
                "y": None,  # Global y will be populated later
                "local_x": x,
                "local_y": y,
                "text": text_id,
                "sprite_name": "SPRITE_SIGN",  # Default sprite for signs
            }
        )

    return signs


def get_all_items(cursor):
    """Get all items from the database and create a mapping between item constants and item IDs"""
    cursor.execute("SELECT id, name, short_name FROM items")
    items_by_short_name = {}

    for id, name, short_name in cursor.fetchall():
        if short_name:
            items_by_short_name[short_name] = id

    # Add TM and HM mappings
    cursor.execute(
        "SELECT id, short_name FROM items WHERE short_name LIKE 'TM%' OR short_name LIKE 'HM%'"
    )
    for id, short_name in cursor.fetchall():
        # Extract the move name from TM_MOVE_NAME format
        if "_" in short_name:
            parts = short_name.split("_", 1)
            if len(parts) > 1:
                tm_type, move_name = parts
                # Map both formats: TM_MOVE_NAME and TM_MOVE
                items_by_short_name[short_name] = id

                # Also add the TM/HM prefix without the move name
                # This handles cases where the map file just references "TM_SUBMISSION" etc.
                if tm_type in ("TM", "HM"):
                    items_by_short_name[tm_type + "_" + move_name] = id

    return items_by_short_name


def parse_object_events(content, map_name, cursor):
    """Parse object events (NPCs, items) from the map object file"""
    objects = []

    # Get all items from the database
    items = get_all_items(cursor)

    # Find the object events section
    object_section_match = re.search(
        r"def_object_events(.*?)(?:def_warps_to|\Z)", content, re.DOTALL
    )
    if not object_section_match:
        return objects

    object_section = object_section_match.group(1)

    # Extract individual object events
    object_pattern = r"object_event\s+(\d+),\s+(\d+),\s+(\w+),\s+(\w+),\s+(\w+),\s+(\w+)(?:,\s+(\w+)(?:,\s+(\w+))?)?"
    object_matches = re.finditer(object_pattern, object_section)

    for i, match in enumerate(object_matches):
        x = int(match.group(1))
        y = int(match.group(2))
        sprite = match.group(3)
        action_type = match.group(4)
        action_direction = match.group(5)
        text_id = match.group(6)

        # Check for additional parameters (item or trainer info)
        item_or_trainer = (
            match.group(7) if len(match.groups()) >= 7 and match.group(7) else None
        )
        trainer_level = (
            match.group(8) if len(match.groups()) >= 8 and match.group(8) else None
        )

        # Determine if this is an item or NPC based on sprite and parameters
        object_type = OBJECT_TYPE_OBJECT
        item_id = None

        # If it's a Poké Ball sprite, it's likely an item
        if sprite == "SPRITE_POKE_BALL" and item_or_trainer:
            object_type = OBJECT_TYPE_ITEM
            # Look up the item ID from the items table using the constant name
            item_id = items.get(item_or_trainer)
            # If no match, leave item_id as null
        # Check for other item sprites
        elif (
            "ITEM" in sprite
            or "BALL" in sprite
            or "POTION" in sprite
            or "FOSSIL" in sprite
        ):
            object_type = OBJECT_TYPE_ITEM
            # Try to extract item ID from sprite name if possible
            item_match = re.search(r"ITEM_(\d+)", sprite)
            if item_match:
                item_id = int(item_match.group(1))

        objects.append(
            {
                "name": f"{map_name}_{'ITEM' if object_type == OBJECT_TYPE_ITEM else 'NPC'}_{i+1}",
                "object_type": object_type,
                "x": None,  # Global x will be populated later
                "y": None,  # Global y will be populated later
                "local_x": x,
                "local_y": y,
                "spriteset_id": None,  # Not implemented yet
                "sprite_name": sprite,
                "text": text_id,
                "action_type": action_type,
                "action_direction": action_direction,
                "item_id": item_id,
            }
        )

    return objects


def create_map_name_to_id_mapping(cursor):
    """Create a mapping between map names and map IDs"""
    # Initialize empty maps dictionary and default_map_id
    maps = {}
    default_map_id = 1  # Default fallback

    try:
        # Try to get all maps with their names
        cursor.execute("SELECT id, name FROM maps")
        maps = {name: id for id, name in cursor.fetchall()}
    except sqlite3.OperationalError:
        # If maps table doesn't exist, create a basic mapping
        print("Warning: 'maps' table not found, creating fallback mapping")
        # Create a simple mapping for common maps
        common_maps = [
            "PALLET_TOWN",
            "VIRIDIAN_CITY",
            "PEWTER_CITY",
            "CERULEAN_CITY",
            "VERMILION_CITY",
            "LAVENDER_TOWN",
            "CELADON_CITY",
            "SAFFRON_CITY",
            "FUCHSIA_CITY",
            "CINNABAR_ISLAND",
            "INDIGO_PLATEAU",
        ]
        # Assign IDs starting from 1
        for i, map_name in enumerate(common_maps, 1):
            maps[map_name] = i

    # Create a mapping from map names to map IDs
    map_to_map = {}

    # Basic map name to ID mapping
    for map_name, map_id in maps.items():
        map_formatted = format_map_name(map_name)
        map_to_map[map_formatted] = map_id

    # Add some special case mappings
    default_map_id = maps.get(
        "PALLET_TOWN", 1
    )  # Default to Pallet Town if we can't find a match

    # Process all map names to create variants for better matching
    for map_name, map_id in maps.items():
        # Convert to CamelCase (e.g., "PALLET_TOWN" -> "PalletTown")
        words = map_name.split("_")
        camel_case = "".join(word.capitalize() for word in words)
        map_to_map[camel_case] = map_id

    # Handle special case for FuchsiaCity vs FuschiaCity typo
    if "FuchsiaCity" in map_to_map:
        new_map_id = map_to_map["FuchsiaCity"]
        map_to_map["FuschiaCity"] = new_map_id

    return map_to_map, default_map_id


def get_map_id_for_map(map_name, map_to_map):
    """Get map ID for a map using the mapping"""
    return map_to_map.get(map_name)


def format_map_name(map_name):
    """Format map name for consistent matching"""
    return map_name.replace("_", " ").title().replace(" ", "")


def parse_objects(content, map_name, map_info):
    """Parse all objects from a map file's content"""
    objects = {"signs": [], "npcs": [], "items": []}

    # Parse background events (signs)
    bg_section_match = re.search(
        r"def_bg_events(.*?)(?:def_object_events|\Z)", content, re.DOTALL
    )
    if bg_section_match:
        bg_section = bg_section_match.group(1)
        bg_pattern = r"bg_event\s+(\d+),\s+(\d+),\s+(\w+)"
        for i, match in enumerate(re.finditer(bg_pattern, bg_section)):
            x = int(match.group(1))
            y = int(match.group(2))
            text_id = match.group(3)
            objects["signs"].append(
                {
                    "name": f"{map_name}_SIGN_{i+1}",
                    "object_type": OBJECT_TYPE_BG,
                    "x": None,
                    "y": None,
                    "local_x": x,
                    "local_y": y,
                    "text": text_id,
                    "sprite_name": "SPRITE_SIGN",
                }
            )

    # Parse object events (NPCs and items)
    object_section_match = re.search(
        r"def_object_events(.*?)(?:def_warps_to|\Z)", content, re.DOTALL
    )
    if object_section_match:
        object_section = object_section_match.group(1)
        object_pattern = r"object_event\s+(\d+),\s+(\d+),\s+(\w+),\s+(\w+),\s+(\w+),\s+(\w+)(?:,\s+(\w+)(?:,\s+(\w+))?)?"

        for i, match in enumerate(re.finditer(object_pattern, object_section)):
            x = int(match.group(1))
            y = int(match.group(2))
            sprite = match.group(3)
            action_type = match.group(4)
            action_direction = match.group(5)
            text_id = match.group(6)
            item_or_trainer = (
                match.group(7) if len(match.groups()) >= 7 and match.group(7) else None
            )

            # Determine if this is an item or NPC
            object_type = OBJECT_TYPE_OBJECT
            item_id = None
            item_list = map_info.get("items", {})

            if sprite == "SPRITE_POKE_BALL" and item_or_trainer:
                object_type = OBJECT_TYPE_ITEM
                item_id = item_list.get(item_or_trainer)
            elif (
                "ITEM" in sprite
                or "BALL" in sprite
                or "POTION" in sprite
                or "FOSSIL" in sprite
            ):
                object_type = OBJECT_TYPE_ITEM

            if object_type == OBJECT_TYPE_ITEM:
                objects["items"].append(
                    {
                        "name": f"{map_name}_ITEM_{i+1}",
                        "object_type": object_type,
                        "x": None,
                        "y": None,
                        "local_x": x,
                        "local_y": y,
                        "spriteset_id": None,
                        "sprite_name": sprite,
                        "text": text_id,
                        "action_type": action_type,
                        "action_direction": action_direction,
                        "item_id": item_id,
                    }
                )
            else:
                objects["npcs"].append(
                    {
                        "name": f"{map_name}_NPC_{i+1}",
                        "object_type": object_type,
                        "x": None,
                        "y": None,
                        "local_x": x,
                        "local_y": y,
                        "spriteset_id": None,
                        "sprite_name": sprite,
                        "text": text_id,
                        "action_type": action_type,
                        "action_direction": action_direction,
                        "item_id": None,
                    }
                )

    return objects


def get_all_objects(objects_dict, extra_objects, map_name):
    """Combine all object types into a single list"""
    all_objects = []

    # Add signs
    for sign in objects_dict.get("signs", []):
        all_objects.append(sign)

    # Add NPCs
    for npc in objects_dict.get("npcs", []):
        all_objects.append(npc)

    # Add items
    for item in objects_dict.get("items", []):
        all_objects.append(item)

    # Add any extra objects
    for obj in extra_objects:
        all_objects.append(obj)

    return all_objects


def main():
    """Main function to process and export all objects"""
    # Connect to the database
    conn = sqlite3.connect("../pokemon.db")
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Create the table
    create_database(cursor)

    # Get map to map ID mappings
    map_to_map, default_map_id = create_map_name_to_id_mapping(cursor)

    # Process all objects from object scripts
    all_objects_list = []
    objects_path = os.path.join(ROOT_DIR, "data", "maps", "objects")
    map_info = {}

    for filename in os.listdir(objects_path):
        if not filename.endswith(".asm"):
            continue

        # Extract map name from filename (e.g., ViridianCityObjects.asm -> ViridianCity)
        map_name = filename.replace("Objects.asm", "")

        file_path = os.path.join(objects_path, filename)
        with open(file_path, "r") as f:
            content = f.read()

        # Process objects for this map
        objects = parse_objects(content, map_name, map_info)

        # Get map ID for this map
        map_id = get_map_id_for_map(map_name, map_to_map)
        if not map_id:
            # Try alternate formats
            map_id = get_map_id_for_map(map_name.upper(), map_to_map)

        if not map_id:
            print(f"Warning: Could not find map ID for '{map_name}', using default")
            map_id = default_map_id

        # Combine all objects and add map_id
        all_objects = get_all_objects(objects, [], map_name)
        for obj in all_objects:
            obj["map_id"] = map_id
            all_objects_list.append(obj)

    # Insert all objects
    inserted_count = 0
    for obj in all_objects_list:
        cursor.execute(
            """
        INSERT INTO objects (
            name, map_id, object_type, x, y, local_x, local_y,
            spriteset_id, sprite_name, text, action_type, action_direction, item_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                obj.get("name"),
                obj.get("map_id"),
                obj.get("object_type"),
                obj.get("x"),
                obj.get("y"),
                obj.get("local_x"),
                obj.get("local_y"),
                obj.get("spriteset_id"),
                obj.get("sprite_name"),
                obj.get("text"),
                obj.get("action_type"),
                obj.get("action_direction"),
                obj.get("item_id"),
            ),
        )
        inserted_count += 1

    # Commit changes and close connection
    conn.commit()
    conn.close()

    print(f"Successfully exported {inserted_count} objects to pokemon.db")
    print(
        "Note: Run update_object_coordinates.py to update global coordinates (x, y) based on local coordinates (local_x, local_y)"
    )


if __name__ == "__main__":
    main()
