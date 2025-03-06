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
        zone_id INTEGER NOT NULL,
        tile_image_id INTEGER NOT NULL,
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

    # Get all maps and their tilesets
    cursor.execute(
        """
    SELECT m.id, m.name, m.tileset_id, t.name 
    FROM maps m
    JOIN tilesets t ON m.tileset_id = t.id
    ORDER BY m.id
    """
    )

    maps = cursor.fetchall()

    # Create a zone for the overworld (all outdoor areas)
    cursor.execute(
        """
    INSERT INTO zones (name, tileset_id, is_overworld)
    VALUES (?, ?, 1)
    """,
        ("Overworld", 0),
    )  # Assuming tileset_id 0 is the overworld tileset

    overworld_zone_id = cursor.lastrowid

    # Track which tilesets we've already created zones for
    processed_tilesets = {0}  # Already processed the overworld tileset
    overworld_maps = 0

    # Process each map
    for map_id, map_name, tileset_id, tileset_name in maps:
        # If it's the overworld tileset, add this map to the overworld zone
        if tileset_id == 0:
            overworld_maps += 1
        elif tileset_id not in processed_tilesets:
            # Create a new zone for this tileset
            cursor.execute(
                """
            INSERT INTO zones (name, tileset_id, is_overworld)
            VALUES (?, ?, 0)
            """,
                (tileset_name, tileset_id),
            )

            processed_tilesets.add(tileset_id)

    conn.commit()
    print(
        f"Created {len(processed_tilesets)} zones ({overworld_maps} maps in Overworld zone)"
    )


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
    """Populate the tiles table based on the maps and zones tables"""
    cursor = conn.cursor()

    # Get all zones
    cursor.execute("SELECT id, tileset_id, is_overworld FROM zones")
    zones = cursor.fetchall()

    # Create a mapping of tileset_id to zone_id
    tileset_to_zone = {}
    overworld_zone_id = None

    for zone_id, tileset_id, is_overworld in zones:
        if is_overworld:
            overworld_zone_id = zone_id
        else:
            tileset_to_zone[tileset_id] = zone_id

    # Get all maps
    cursor.execute(
        """
    SELECT id, name, width, height, tileset_id, blk_data
    FROM maps
    WHERE blk_data IS NOT NULL
    """
    )

    maps = cursor.fetchall()
    total_maps = len(maps)

    print(f"Processing {total_maps} maps...")
    tile_count = 0
    processed_maps = 0
    skipped_maps = 0
    start_time = time.time()

    # Prepare for batch insert
    tiles_data = []

    for i, (map_id, map_name, width, height, tileset_id, blk_data) in enumerate(
        maps, 1
    ):
        # Update progress every 5 maps
        if i % 5 == 0 or i == total_maps:
            sys.stdout.write(
                f"\rProcessed {i}/{total_maps} maps, created {tile_count} tiles"
            )
            sys.stdout.flush()

        # Determine which zone this map belongs to
        if tileset_id == 0:  # Overworld tileset
            zone_id = overworld_zone_id
        else:
            zone_id = tileset_to_zone.get(tileset_id)
            if not zone_id:
                skipped_maps += 1
                continue

        processed_maps += 1

        # Convert blk_data to a list of integers
        try:
            # If blk_data is already a bytes object
            if isinstance(blk_data, bytes):
                blk_bytes = list(blk_data)
            # If blk_data is a string representation of hex
            elif isinstance(blk_data, str) and all(
                c in "0123456789ABCDEFabcdef" for c in blk_data
            ):
                blk_bytes = [
                    int(blk_data[i : i + 2], 16) for i in range(0, len(blk_data), 2)
                ]
            else:
                # Try to convert from binary string
                blk_bytes = list(map(ord, blk_data))
        except Exception as e:
            continue

        # Verify we have the expected number of blocks
        expected_blocks = width * height
        if len(blk_bytes) < expected_blocks:
            # Pad with zeros if needed
            blk_bytes.extend([0] * (expected_blocks - len(blk_bytes)))
        elif len(blk_bytes) > expected_blocks:
            # Truncate if needed
            blk_bytes = blk_bytes[:expected_blocks]

        # Process each block in the map
        for y in range(height):
            for x in range(width):
                # Get the block index from the map data
                block_pos = y * width + x
                if block_pos < len(blk_bytes):
                    block_index = blk_bytes[block_pos]

                    # Each block corresponds to 4 tiles (2x2 grid)
                    # We need to create 4 entries in the tiles table
                    for position in range(4):
                        # Calculate the actual x, y coordinates for this tile
                        # Each block is 2x2 tiles, so we need to multiply by 2
                        tile_x = x * 2 + (position % 2)
                        tile_y = y * 2 + (position // 2)

                        # Get the tile_image_id from our dictionary
                        tile_image_id = block_pos_to_image_id.get(
                            (tileset_id, block_index, position)
                        )
                        if not tile_image_id:
                            # Try with a default position if specific position not found
                            tile_image_id = block_pos_to_image_id.get(
                                (tileset_id, block_index, 0)
                            )
                            if not tile_image_id:
                                continue

                        # Add to batch insert data
                        tiles_data.append((tile_x, tile_y, zone_id, tile_image_id))
                        tile_count += 1

                        # Execute batch insert if we've reached the batch size
                        if len(tiles_data) >= BATCH_SIZE:
                            cursor.executemany(
                                """
                            INSERT INTO tiles (x, y, zone_id, tile_image_id)
                            VALUES (?, ?, ?, ?)
                            """,
                                tiles_data,
                            )
                            conn.commit()
                            tiles_data = []

    # Insert any remaining tiles
    if tiles_data:
        cursor.executemany(
            """
        INSERT INTO tiles (x, y, zone_id, tile_image_id)
        VALUES (?, ?, ?, ?)
        """,
            tiles_data,
        )
        conn.commit()

    elapsed_time = time.time() - start_time
    print(
        f"\nCreated {tile_count} tiles from {processed_maps} maps (skipped {skipped_maps} maps) in {elapsed_time:.2f} seconds"
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
