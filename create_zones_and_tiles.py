#!/usr/bin/env python3
"""
Pokemon Map Data Restructuring

This script creates a more structured database schema with zones and tiles tables,
and extracts 16x16 pixel tile images from the existing tilesets.

The script:
1. Creates a "zones" table which groups maps by their tileset type
2. Creates a "tiles" table with x, y coordinates, zone_id, and tile_image_id
3. Extracts 16x16 pixel tile images from the existing tilesets

Usage:
    python create_zones_and_tiles.py
"""

import os
import sqlite3
import binascii
from PIL import Image
from pathlib import Path
import sys
import time
import hashlib
import io
import re

# Constants
TILE_IMAGES_DIR = "tile_images"
BATCH_SIZE = 1000  # Number of tiles to insert in a single batch


def create_new_tables():
    """Create new zones and tiles tables in the database"""
    conn = sqlite3.connect("pokemon.db")
    cursor = conn.cursor()

    # Drop existing tables if they exist
    cursor.execute("DROP TABLE IF EXISTS zones")
    cursor.execute("DROP TABLE IF EXISTS tiles")
    cursor.execute("DROP TABLE IF EXISTS tile_images")

    # Create zones table
    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS zones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        tileset_id INTEGER,
        is_overworld INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (tileset_id) REFERENCES tilesets (id)
    )
    """
    )

    # Create tiles table
    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS tiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        local_x INTEGER NOT NULL,
        local_y INTEGER NOT NULL,
        zone_id INTEGER NOT NULL,
        tile_image_id INTEGER NOT NULL,
        is_overworld INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (zone_id) REFERENCES zones (id),
        FOREIGN KEY (tile_image_id) REFERENCES tile_images (id)
    )
    """
    )

    # Create tile_images table with image_hash for deduplication
    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS tile_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tileset_id INTEGER NOT NULL,
        block_index INTEGER NOT NULL,
        position INTEGER NOT NULL,  -- 0: top-left, 1: top-right, 2: bottom-left, 3: bottom-right
        image_path TEXT NOT NULL,
        image_hash TEXT NOT NULL,
        FOREIGN KEY (tileset_id) REFERENCES tilesets (id)
    )
    """
    )

    # Create indexes for better performance
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tiles_zone_id ON tiles (zone_id)")
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_tiles_tile_image_id ON tiles (tile_image_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_tile_images_tileset_id ON tile_images (tileset_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_tile_images_hash ON tile_images (image_hash)"
    )

    conn.commit()
    return conn


def populate_zones(conn):
    """Populate the zones table based on the maps table"""
    cursor = conn.cursor()

    # Get all maps
    cursor.execute(
        """
    SELECT id, name, tileset_id 
    FROM maps
    ORDER BY id
    """
    )

    maps = cursor.fetchall()

    # Clear existing zones
    cursor.execute("DELETE FROM zones")

    # Process each map and create a zone for it
    for map_id, map_name, tileset_id in maps:
        # Format the name to match the style in map_header_pointers.asm but without the _h suffix
        # Convert from PALLET_TOWN to PalletTown
        formatted_name = "".join(word.capitalize() for word in map_name.split("_"))

        cursor.execute(
            """
        INSERT INTO zones (name, tileset_id, is_overworld)
        VALUES (?, ?, ?)
        """,
            (formatted_name, tileset_id, 1 if tileset_id == 0 else 0),
        )

    conn.commit()

    # Get count of zones
    cursor.execute("SELECT COUNT(*) FROM zones")
    zone_count = cursor.fetchone()[0]

    # Get count of overworld zones
    cursor.execute("SELECT COUNT(*) FROM zones WHERE is_overworld = 1")
    overworld_count = cursor.fetchone()[0]

    print(f"Created {zone_count} zones ({overworld_count} overworld zones)")


def decode_2bpp_tile(tile_data):
    """Decode a 2bpp tile into a 2D array of pixel values (0-3)

    Each tile is 8x8 pixels, with 2 bits per pixel.
    Pixels are spread across neighboring bytes.
    """
    pixels = []

    # Process 16 bytes (8 rows of 2 bytes each)
    for row in range(8):
        row_pixels = []
        # Each row is represented by 2 bytes
        byte1 = tile_data[row * 2]
        byte2 = tile_data[row * 2 + 1]

        # Process each bit in the bytes
        for bit in range(8):
            # Extract the bit from each byte (from MSB to LSB)
            bit_pos = 7 - bit
            bit1 = (byte1 >> bit_pos) & 1
            bit2 = (byte2 >> bit_pos) & 1

            # Combine the bits to get the pixel value (0-3)
            pixel_value = (bit2 << 1) | bit1
            row_pixels.append(pixel_value)

        pixels.append(row_pixels)

    return pixels


def get_image_hash(img):
    """Generate a hash for an image to identify duplicates"""
    img_bytes = io.BytesIO()
    img.save(img_bytes, format="PNG")
    return hashlib.md5(img_bytes.getvalue()).hexdigest()


def extract_tile_images(conn):
    """Extract 16x16 pixel tile images from the blocksets and tilesets"""
    cursor = conn.cursor()

    # Create directory for tile images if it doesn't exist
    os.makedirs(TILE_IMAGES_DIR, exist_ok=True)

    # Clean up old files
    print("Cleaning up old tile images...")
    old_files = list(Path(TILE_IMAGES_DIR).glob("*.png"))
    for old_file in old_files:
        try:
            os.remove(old_file)
        except Exception as e:
            print(f"Error removing {old_file}: {e}")
    print(f"Removed {len(old_files)} old tile images")

    # Define GameBoy color palette (white, light gray, dark gray, black)
    palette = [(255, 255, 255), (192, 192, 192), (96, 96, 96), (0, 0, 0)]

    # Get all tilesets
    cursor.execute("SELECT id, name FROM tilesets")
    tilesets = cursor.fetchall()

    tile_image_count = 0
    unique_image_count = 0
    duplicate_count = 0
    total_tilesets = len(tilesets)

    print(f"Processing {total_tilesets} tilesets...")
    start_time = time.time()

    # Dictionary to track image hashes and their corresponding IDs
    image_hash_to_id = {}

    # Dictionary to map (tileset_id, block_index, position) to tile_image_id
    block_pos_to_image_id = {}

    for i, (tileset_id, tileset_name) in enumerate(tilesets, 1):
        # Update progress
        sys.stdout.write(f"\rProcessing tileset {i}/{total_tilesets}: {tileset_name}")
        sys.stdout.flush()

        # Get blockset data for this tileset
        cursor.execute(
            """
        SELECT block_index, block_data 
        FROM blocksets 
        WHERE tileset_id = ? 
        ORDER BY block_index
        """,
            (tileset_id,),
        )

        blockset_rows = cursor.fetchall()

        if not blockset_rows:
            continue

        # Get tileset tiles
        cursor.execute(
            """
        SELECT tile_index, tile_data 
        FROM tileset_tiles 
        WHERE tileset_id = ? 
        ORDER BY tile_index
        """,
            (tileset_id,),
        )

        tile_rows = cursor.fetchall()

        if not tile_rows:
            continue

        # Create dictionaries for easy lookup
        blocks = {row[0]: row[1] for row in blockset_rows}
        tiles = {row[0]: row[1] for row in tile_rows}

        # Process each block to create 16x16 pixel images (4 per block)
        for block_index, block_data in blocks.items():
            # Define the 4 positions in the block (each position is 2x2 tiles)
            positions = [
                # Top-left: tiles at positions 0,1,4,5
                [(0, 0), (0, 1), (1, 0), (1, 1)],
                # Top-right: tiles at positions 2,3,6,7
                [(0, 2), (0, 3), (1, 2), (1, 3)],
                # Bottom-left: tiles at positions 8,9,12,13
                [(2, 0), (2, 1), (3, 0), (3, 1)],
                # Bottom-right: tiles at positions 10,11,14,15
                [(2, 2), (2, 3), (3, 2), (3, 3)],
            ]

            for pos_index, position in enumerate(positions):
                # Create a new 16x16 image
                img = Image.new("RGB", (16, 16), color=(255, 255, 255))

                # Process each of the 4 tiles in this position
                for i, (y, x) in enumerate(position):
                    # Calculate the position in the block data
                    tile_pos = y * 4 + x

                    # Get the tile index from the block data
                    if tile_pos < len(block_data):
                        tile_index = block_data[tile_pos]
                    else:
                        continue

                    # Get the tile data
                    tile_data = tiles.get(tile_index)
                    if not tile_data:
                        continue

                    # Decode the tile data
                    tile_pixels = decode_2bpp_tile(tile_data)

                    # Calculate where to place this tile in the 16x16 image
                    offset_x = (i % 2) * 8  # 0 for left tiles, 8 for right tiles
                    offset_y = (i // 2) * 8  # 0 for top tiles, 8 for bottom tiles

                    # Draw the tile
                    for py in range(8):
                        for px in range(8):
                            pixel_value = tile_pixels[py][px]
                            pixel_color = palette[pixel_value]
                            img.putpixel((offset_x + px, offset_y + py), pixel_color)

                # Generate hash for the image
                img_hash = get_image_hash(img)

                # Check if we've already seen this image
                if img_hash in image_hash_to_id:
                    # Use the existing image ID
                    existing_image_id = image_hash_to_id[img_hash]
                    block_pos_to_image_id[(tileset_id, block_index, pos_index)] = (
                        existing_image_id
                    )
                    duplicate_count += 1
                else:
                    # Save the image with a sequential number
                    image_path = f"{TILE_IMAGES_DIR}/tile_{unique_image_count}.png"
                    img.save(image_path)

                    # Insert the new image record
                    cursor.execute(
                        """
                    INSERT INTO tile_images (tileset_id, block_index, position, image_path, image_hash)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                        (tileset_id, block_index, pos_index, image_path, img_hash),
                    )

                    # Get the new image ID
                    image_id = cursor.lastrowid
                    image_hash_to_id[img_hash] = image_id
                    block_pos_to_image_id[(tileset_id, block_index, pos_index)] = (
                        image_id
                    )
                    unique_image_count += 1

                tile_image_count += 1

                # Commit periodically
                if unique_image_count % BATCH_SIZE == 0:
                    conn.commit()

    conn.commit()
    elapsed_time = time.time() - start_time
    print(f"\nProcessed {tile_image_count} tile images")
    print(f"- Unique images: {unique_image_count}")
    print(f"- Duplicate images: {duplicate_count}")
    print(f"- Total time: {elapsed_time:.2f} seconds")

    return block_pos_to_image_id


def populate_tiles(conn, block_pos_to_image_id):
    """Populate the tiles table based on the tiles_raw and zones tables"""
    cursor = conn.cursor()

    # Clear the tiles table before repopulating
    print("Clearing existing tiles...")
    cursor.execute("DELETE FROM tiles")
    conn.commit()

    # Get all zones
    cursor.execute("SELECT id, name, is_overworld FROM zones")
    zones = cursor.fetchall()

    # Create a mapping of map name to zone_id and is_overworld flag
    map_name_to_zone_info = {}
    for zone_id, zone_name, is_overworld in zones:
        # Convert zone name back to map format for matching
        # e.g., "PalletTown" -> "PALLET_TOWN"
        map_style_name = re.sub(r"([a-z])([A-Z])", r"\1_\2", zone_name).upper()
        map_name_to_zone_info[map_style_name] = (zone_id, is_overworld)

        # Handle special cases for routes
        if zone_name.startswith("Route"):
            route_num = zone_name[5:]  # Extract route number
            route_map_name = f"ROUTE_{route_num}"
            map_name_to_zone_info[route_map_name] = (zone_id, is_overworld)

    # Check if the tiles_raw table exists
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='tiles_raw'"
    )
    has_tiles_raw = cursor.fetchone() is not None

    if not has_tiles_raw:
        print("Error: tiles_raw table does not exist. Please run export_map.py first.")
        return

    # Get all maps with their zone IDs
    cursor.execute(
        """
    SELECT m.id, m.name, m.width, m.height, m.tileset_id, z.id as zone_id, z.is_overworld
    FROM maps m
    LEFT JOIN zones z ON UPPER(z.name) = UPPER(REPLACE(REPLACE(m.name, '_', ''), ' ', ''))
    """
    )

    maps = cursor.fetchall()
    total_maps = len(maps)

    print(f"Processing {total_maps} maps...")
    tile_count = 0
    processed_maps = 0
    skipped_maps = 0
    skipped_map_names = []
    start_time = time.time()

    # Prepare for batch insert
    tiles_data = []

    # Get the overworld map positions if available
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='overworld_map_positions'"
    )
    has_positions_table = cursor.fetchone() is not None

    map_positions = {}
    if has_positions_table:
        cursor.execute(
            "SELECT map_name, x_offset, y_offset FROM overworld_map_positions"
        )
        for map_name, x_offset, y_offset in cursor.fetchall():
            map_positions[map_name] = (x_offset, y_offset)

    # Process each map
    for i, (
        map_id,
        map_name,
        width,
        height,
        tileset_id,
        db_zone_id,
        db_is_overworld,
    ) in enumerate(maps, 1):
        # Update progress every 5 maps
        if i % 5 == 0 or i == total_maps:
            sys.stdout.write(
                f"\rProcessed {i}/{total_maps} maps, created {tile_count} tiles"
            )
            sys.stdout.flush()

        # Get the zone_id and is_overworld flag for this map
        zone_info = map_name_to_zone_info.get(map_name)

        if zone_info:
            zone_id, is_overworld = zone_info
        else:
            # If not found in our mapping, use the one from the database join if available
            if db_zone_id is not None:
                zone_id = db_zone_id
                is_overworld = db_is_overworld if db_is_overworld is not None else 0
            else:
                # Try a more flexible match
                map_name_simplified = map_name.replace("_", "").lower()
                for z_name, z_info in map_name_to_zone_info.items():
                    if z_name.replace("_", "").lower() == map_name_simplified:
                        zone_id, is_overworld = z_info
                        break
                else:
                    zone_id = None
                    is_overworld = 0

        if not zone_id:
            skipped_maps += 1
            skipped_map_names.append(map_name)
            continue

        processed_maps += 1

        # Get position offsets for this map if it's an overworld map
        x_offset, y_offset = 0, 0
        if is_overworld and map_name in map_positions:
            x_offset, y_offset = map_positions[map_name]

        # Get raw tile data for this map from tiles_raw table
        cursor.execute(
            """
        SELECT x, y, block_index, tileset_id, is_overworld
        FROM tiles_raw
        WHERE map_id = ?
        """,
            (map_id,),
        )

        raw_tiles = cursor.fetchall()

        if not raw_tiles:
            continue

        # Collect tiles for this map
        map_tiles = []

        # Process each raw tile
        for raw_x, raw_y, block_index, raw_tileset_id, raw_is_overworld in raw_tiles:
            # Each block corresponds to 4 tiles (2x2 grid)
            # We need to create 4 entries in the tiles table
            for position in range(4):
                # Calculate the actual x, y coordinates for this tile
                # Each block is 2x2 tiles, so we need to multiply by 2
                tile_x = raw_x * 2 + (position % 2) + x_offset
                tile_y = raw_y * 2 + (position // 2)

                # Add y_offset if applicable (for maps with position data)
                if map_name in map_positions:
                    tile_y += y_offset

                # Get the tile_image_id from our dictionary
                tile_image_id = block_pos_to_image_id.get(
                    (raw_tileset_id, block_index, position)
                )
                if not tile_image_id:
                    # Try with a default position if specific position not found
                    tile_image_id = block_pos_to_image_id.get(
                        (raw_tileset_id, block_index, 0)
                    )
                    if not tile_image_id:
                        continue

                # Add to map tiles
                map_tiles.append(
                    (
                        tile_x,
                        tile_y,
                        tile_x,
                        tile_y,
                        zone_id,
                        tile_image_id,
                        is_overworld,
                    )
                )

        # Sort map tiles by y-coordinate in descending order (top to bottom becomes bottom to top)
        map_tiles.sort(key=lambda t: (-t[1], t[0]))

        # Add to batch insert data
        tiles_data.extend(map_tiles)
        tile_count += len(map_tiles)

        # Execute batch insert if we've reached the batch size
        if len(tiles_data) >= BATCH_SIZE:
            cursor.executemany(
                """
            INSERT INTO tiles (x, y, local_x, local_y, zone_id, tile_image_id, is_overworld)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
                tiles_data,
            )
            conn.commit()
            tiles_data = []

    # Insert any remaining tiles
    if tiles_data:
        cursor.executemany(
            """
        INSERT INTO tiles (x, y, local_x, local_y, zone_id, tile_image_id, is_overworld)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
            tiles_data,
        )
        conn.commit()

    # Print information about skipped maps
    print(f"\nSkipped {skipped_maps} maps due to missing zone_id mapping:")
    for i, map_name in enumerate(skipped_map_names[:20], 1):
        print(f"  {i}. {map_name}")
    if len(skipped_map_names) > 20:
        print(f"  ... and {len(skipped_map_names) - 20} more")

    elapsed_time = time.time() - start_time
    print(
        f"Created {tile_count} tiles from {processed_maps} maps (skipped {skipped_maps} maps) in {elapsed_time:.2f} seconds"
    )


def main():
    """Main function"""
    total_start_time = time.time()

    print("Creating new tables...")
    conn = create_new_tables()

    print("\nPopulating zones table...")
    populate_zones(conn)

    print("\nExtracting tile images...")
    block_pos_to_image_id = extract_tile_images(conn)

    print("\nPopulating tiles table...")
    populate_tiles(conn, block_pos_to_image_id)

    # Print summary
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM zones")
    zone_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM tile_images")
    tile_image_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM tiles")
    tile_count = cursor.fetchone()[0]

    total_elapsed_time = time.time() - total_start_time

    print("\nSummary:")
    print(f"- Created {zone_count} zones")
    print(f"- Extracted {tile_image_count} unique tile images")
    print(f"- Created {tile_count} tiles")
    print(f"- Total time: {total_elapsed_time:.2f} seconds")

    print("\nDone!")
    conn.close()


if __name__ == "__main__":
    main()
