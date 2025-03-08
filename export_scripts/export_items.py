#!/usr/bin/env python3
import os
import re
import sqlite3
from pathlib import Path

# Constants
POKEMON_DATA_DIR = Path("pokemon-game-data/data/items")
CONSTANTS_DIR = Path("pokemon-game-data/constants")


def create_database():
    """Create SQLite database and tables"""
    conn = sqlite3.connect("pokemon.db")
    cursor = conn.cursor()

    # Drop existing items table if it exists
    cursor.execute("DROP TABLE IF EXISTS items")

    # Create items table
    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        short_name TEXT NOT NULL,
        price INTEGER,
        is_usable INTEGER NOT NULL DEFAULT 0,
        uses_party_menu INTEGER NOT NULL DEFAULT 0,
        vending_price INTEGER,
        move_id INTEGER,
        is_guard_drink INTEGER NOT NULL DEFAULT 0,
        is_key_item INTEGER NOT NULL DEFAULT 0
    )
    """
    )

    conn.commit()
    return conn, cursor


def parse_item_constants():
    """Parse item constants to get item IDs and short names"""
    item_constants_path = CONSTANTS_DIR / "item_constants.asm"

    with open(item_constants_path, "r") as f:
        content = f.read()

    # Extract item constants
    item_constants = {}
    pattern = r"const\s+(\w+)\s*;\s*\$([0-9A-F]+)"
    matches = re.finditer(pattern, content)

    for match in matches:
        short_name = match.group(1)
        item_id = int(match.group(2), 16)
        item_constants[short_name] = item_id

    return item_constants


def parse_item_names():
    """Parse item names from names.asm"""
    names_path = POKEMON_DATA_DIR / "names.asm"

    with open(names_path, "r") as f:
        content = f.read()

    # Extract item names
    item_names = []

    # Find the position of the first assert_list_length NUM_ITEMS
    assert_pos = content.find("assert_list_length NUM_ITEMS")
    if assert_pos != -1:
        # Only parse content up to the assert statement
        content_to_parse = content[:assert_pos]
    else:
        content_to_parse = content

    pattern = r'li\s+"([^"]+)"'
    matches = re.finditer(pattern, content_to_parse)

    for match in matches:
        item_name = match.group(1)
        item_names.append(item_name)

    return item_names


def parse_item_prices():
    """Parse item prices from prices.asm"""
    prices_path = POKEMON_DATA_DIR / "prices.asm"

    with open(prices_path, "r") as f:
        content = f.read()

    # Extract item prices
    item_prices = []
    pattern = r"bcd3\s+(\d+)"
    matches = re.finditer(pattern, content)

    for match in matches:
        price = int(match.group(1))
        item_prices.append(price)

    return item_prices


def parse_key_items():
    """Parse key items from key_items.asm"""
    key_items_path = POKEMON_DATA_DIR / "key_items.asm"

    with open(key_items_path, "r") as f:
        content = f.read()

    # Extract key items
    key_items = []
    pattern = r"dbit\s+(TRUE|FALSE)\s*;\s*(\w+)"
    matches = re.finditer(pattern, content)

    for match in matches:
        is_key = match.group(1) == "TRUE"
        item_name = match.group(2)
        key_items.append((item_name, is_key))

    return key_items


def parse_party_menu_items():
    """Parse items that use party menu from use_party.asm"""
    party_menu_path = POKEMON_DATA_DIR / "use_party.asm"

    with open(party_menu_path, "r") as f:
        content = f.read()

    # Extract party menu items
    party_menu_items = []
    pattern = r"db\s+(\w+)"
    matches = re.finditer(pattern, content)

    for match in matches:
        item_name = match.group(1)
        if item_name != "-1":  # Skip the end marker
            party_menu_items.append(item_name)

    return party_menu_items


def parse_overworld_items():
    """Parse items usable in overworld from use_overworld.asm"""
    overworld_path = POKEMON_DATA_DIR / "use_overworld.asm"

    with open(overworld_path, "r") as f:
        content = f.read()

    # Extract overworld items
    overworld_items = []
    pattern = r"db\s+(\w+)"
    matches = re.finditer(pattern, content)

    for match in matches:
        item_name = match.group(1)
        if item_name != "-1":  # Skip the end marker
            overworld_items.append(item_name)

    return overworld_items


def parse_guard_drink_items():
    """Parse guard drink items from guard_drink_items.asm"""
    guard_drink_path = POKEMON_DATA_DIR / "guard_drink_items.asm"

    with open(guard_drink_path, "r") as f:
        content = f.read()

    # Extract guard drink items
    guard_drink_items = []
    pattern = r"db\s+(\w+)"
    matches = re.finditer(pattern, content)

    for match in matches:
        item_name = match.group(1)
        if item_name != "0":  # Skip the end marker
            guard_drink_items.append(item_name)

    return guard_drink_items


def parse_vending_prices():
    """Parse vending prices from vending_prices.asm"""
    vending_path = POKEMON_DATA_DIR / "vending_prices.asm"

    with open(vending_path, "r") as f:
        content = f.read()

    # Extract vending prices
    vending_prices = {}
    pattern = r"vend_item\s+(\w+),\s+(\d+)"
    matches = re.finditer(pattern, content)

    for match in matches:
        item_name = match.group(1)
        price = int(match.group(2))
        vending_prices[item_name] = price

    return vending_prices


def parse_tm_hm_moves():
    """Parse TM/HM move IDs"""
    # This is a simplified approach - in a real implementation, you'd need to parse
    # the actual move IDs from the constants and data files
    tm_hm_moves = {}

    # TMs start at item ID 0xC9 (201)
    for i in range(50):
        tm_hm_moves[201 + i] = i + 1  # Placeholder move IDs

    # HMs start at item ID 0xC4 (196)
    for i in range(5):
        tm_hm_moves[196 + i] = 51 + i  # Placeholder move IDs

    return tm_hm_moves


def is_item_usable(item_name, overworld_items, party_menu_items):
    """Determine if an item is usable based on overworld and party menu lists"""
    return item_name in overworld_items or item_name in party_menu_items


def main():
    # Create database
    conn, cursor = create_database()

    # Parse data
    item_constants = parse_item_constants()
    item_names = parse_item_names()
    item_prices = parse_item_prices()
    key_items_data = parse_key_items()
    party_menu_items = parse_party_menu_items()
    overworld_items = parse_overworld_items()
    guard_drink_items = parse_guard_drink_items()
    vending_prices = parse_vending_prices()
    tm_hm_moves = parse_tm_hm_moves()

    # Create reverse mapping for item constants
    item_id_to_name = {v: k for k, v in item_constants.items()}

    # Create mapping for key items
    key_item_map = {}
    for item_name, is_key in key_items_data:
        key_item_map[item_name] = is_key

    # Insert items into database
    for i, name in enumerate(item_names):
        item_id = i + 1  # Item IDs start at 1
        short_name = item_id_to_name.get(item_id, f"UNKNOWN_{item_id}")
        price = item_prices[i]

        # Convert 0 price to NULL
        price_value = None if price == 0 else price

        # Check if item is usable
        is_usable = is_item_usable(short_name, overworld_items, party_menu_items)

        # Check if item uses party menu
        uses_party_menu = short_name in party_menu_items

        # Check if item is a guard drink
        is_guard_drink = short_name in guard_drink_items

        # Check if item is a key item
        is_key_item = key_item_map.get(short_name, False)

        # Get vending price if available
        vending_price = vending_prices.get(short_name)

        # Get move ID if it's a TM/HM
        move_id = tm_hm_moves.get(item_id)

        # Insert into database
        cursor.execute(
            """
        INSERT INTO items (
            id, name, short_name, price, is_usable, uses_party_menu, 
            vending_price, move_id, is_guard_drink, is_key_item
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                item_id,
                name,
                short_name,
                price_value,
                1 if is_usable else 0,
                1 if uses_party_menu else 0,
                vending_price,
                move_id,
                1 if is_guard_drink else 0,
                1 if is_key_item else 0,
            ),
        )

    # Commit changes and close connection
    conn.commit()
    conn.close()

    print(f"Successfully exported {len(item_names)} items to pokemon.db")


if __name__ == "__main__":
    main()
