#!/usr/bin/env python3
import os
import re
import sqlite3
from pathlib import Path

# Constants
POKEMON_DATA_DIR = Path("pokemon-game-data/data/maps/objects")
CONSTANTS_DIR = Path("pokemon-game-data/constants")
MAP_HEADERS_DIR = Path("pokemon-game-data/data/maps/headers")

# Object types
OBJECT_TYPE_BG = "sign"
OBJECT_TYPE_OBJECT = "npc"
OBJECT_TYPE_ITEM = "item"


def create_database():
    """Create SQLite database and objects table"""
    conn = sqlite3.connect("pokemon.db")
    cursor = conn.cursor()

    # Drop existing objects table if it exists
    cursor.execute("DROP TABLE IF EXISTS objects")

    # Create objects table
    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS objects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        zone_id INTEGER NOT NULL,
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
        FOREIGN KEY (zone_id) REFERENCES zones (id),
        FOREIGN KEY (item_id) REFERENCES items (id)
    )
    """
    )

    conn.commit()
    return conn, cursor


def get_all_zones(cursor):
    """Get all zones from the database"""
    cursor.execute("SELECT id, name FROM zones")
    return {name: id for id, name in cursor.fetchall()}


def create_map_to_zone_mapping(cursor):
    """Create a mapping between map object file names and zone names"""
    # Get all zones from the database
    zones = get_all_zones(cursor)

    # Create a mapping dictionary
    map_to_zone = {}

    # Direct mappings for cities, towns, and routes
    for zone_name, zone_id in zones.items():
        # For cities, towns, and routes, the map file name is likely the same as the zone name
        map_to_zone[zone_name] = zone_id

    # Add special mappings for buildings and areas that might have different naming conventions
    # This is a simplified approach - in a real implementation, you'd need to analyze all map names
    # and create a more comprehensive mapping

    # Example mappings for buildings in cities
    for zone_name in zones:
        if (
            "City" in zone_name
            or "Town" in zone_name
            or "Island" in zone_name
            or "Plateau" in zone_name
        ):
            base_name = (
                zone_name.replace("City", "")
                .replace("Town", "")
                .replace("Island", "")
                .replace("Plateau", "")
            )

            # Map buildings to their respective cities/towns
            map_to_zone[f"{base_name}Mart"] = zones[zone_name]
            map_to_zone[f"{base_name}Pokecenter"] = zones[zone_name]
            map_to_zone[f"{base_name}Gym"] = zones[zone_name]

    # Add specific mappings for special areas
    # Create a default zone for maps that don't have a direct mapping
    default_zone_id = zones.get(
        "PalletTown", 1
    )  # Use PalletTown as default or fallback to ID 1

    # Create a new zone entry for each unique map file that doesn't have a direct mapping
    map_files = list(POKEMON_DATA_DIR.glob("*.asm"))
    for file_path in map_files:
        map_name = parse_map_name_from_file(file_path)
        if map_name not in map_to_zone:
            # Check if this map is a building or area within a known zone
            assigned = False
            for zone_name, zone_id in zones.items():
                # Try to match the map name with a zone name
                if zone_name in map_name:
                    map_to_zone[map_name] = zone_id
                    assigned = True
                    break

            # If no match found, create a new entry in the zones table
            if not assigned:
                cursor.execute(
                    "INSERT INTO zones (name, is_overworld) VALUES (?, 0)", (map_name,)
                )
                new_zone_id = cursor.lastrowid
                map_to_zone[map_name] = new_zone_id

    return map_to_zone


def get_zone_id_for_map(map_name, map_to_zone):
    """Get zone ID for a map using the mapping"""
    return map_to_zone.get(map_name)


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


def process_map_file(file_path, cursor, map_to_zone):
    """Process a single map object file and extract all objects"""
    map_name = parse_map_name_from_file(file_path)

    # Get zone ID for this map
    zone_id = get_zone_id_for_map(map_name, map_to_zone)
    if not zone_id:
        print(f"Warning: Could not find zone ID for map {map_name}")
        return []

    with open(file_path, "r") as f:
        content = f.read()

    # Parse different types of objects
    signs = parse_bg_events(content, map_name)
    objects = parse_object_events(content, map_name, cursor)

    # Combine all objects and add zone_id
    all_objects = signs + objects
    for obj in all_objects:
        obj["zone_id"] = zone_id

    return all_objects


def main():
    # Create database
    conn, cursor = create_database()

    # Create map to zone mapping
    map_to_zone = create_map_to_zone_mapping(cursor)

    # Get all map object files
    map_files = list(POKEMON_DATA_DIR.glob("*.asm"))

    # Process each map file
    all_objects = []
    for file_path in map_files:
        objects = process_map_file(file_path, cursor, map_to_zone)
        all_objects.extend(objects)

    # Insert objects into database
    for obj in all_objects:
        cursor.execute(
            """
        INSERT INTO objects (
            name, zone_id, object_type, x, y, local_x, local_y,
            spriteset_id, sprite_name, text, action_type, action_direction, item_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                obj.get("name"),
                obj.get("zone_id"),
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

    # Commit changes and close connection
    conn.commit()
    conn.close()

    print(f"Successfully exported {len(all_objects)} objects to pokemon.db")
    print(
        "Note: Run update_object_coordinates.py to update global coordinates (x, y) based on local coordinates (local_x, local_y)"
    )


if __name__ == "__main__":
    main()
