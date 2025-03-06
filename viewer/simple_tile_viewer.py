#!/usr/bin/env python3
"""
Simple Tile Viewer

This script generates a static image of tiles from the database for a specific zone.
It uses Pillow to create an image file that can be viewed with any image viewer.

Usage:
    python simple_tile_viewer.py [zone_id]
"""

import os
import sys
import sqlite3
from PIL import Image, ImageDraw, ImageFont

# Constants
TILE_SIZE = 16  # Size of each tile in pixels
SCALE = 3  # Scale factor for display
ZONE_ID = 15  # Default zone ID to display
OUTPUT_DIR = "zone_images"  # Directory to save output images
DB_PATH = "../pokemon.db"  # Path to the database relative to this script


def load_tile_images():
    """Load all tile images from the database into a dictionary"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Get all tile images
    cursor.execute(
        """
        SELECT id, image_path FROM tile_images
    """
    )

    tile_images = {}
    for image_id, image_path in cursor.fetchall():
        try:
            # Load the image using PIL
            # Adjust the image path to be relative to the script location
            adjusted_path = os.path.join("..", image_path)
            img = Image.open(adjusted_path)
            # Resize the image
            img = img.resize((TILE_SIZE * SCALE, TILE_SIZE * SCALE), Image.NEAREST)
            tile_images[image_id] = img
        except Exception as e:
            print(f"Error loading image {image_path}: {e}")

    conn.close()
    return tile_images


def get_zone_info(zone_id):
    """Get information about the zone"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT name FROM zones WHERE id = ?
    """,
        (zone_id,),
    )

    result = cursor.fetchone()
    zone_name = result[0] if result else f"Unknown Zone {zone_id}"

    # Get the dimensions of the zone
    cursor.execute(
        """
        SELECT MIN(x), MIN(y), MAX(x), MAX(y) FROM tiles WHERE zone_id = ?
    """,
        (zone_id,),
    )

    min_x, min_y, max_x, max_y = cursor.fetchone()

    # Handle case where no tiles exist
    if min_x is None or min_y is None or max_x is None or max_y is None:
        min_x, min_y, max_x, max_y = 0, 0, 0, 0

    conn.close()

    return {
        "name": zone_name,
        "min_x": min_x,
        "min_y": min_y,
        "max_x": max_x,
        "max_y": max_y,
        "width": max_x - min_x + 1,
        "height": max_y - min_y + 1,
    }


def load_tiles(zone_id):
    """Load all tiles for a specific zone"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT x, y, tile_image_id FROM tiles WHERE zone_id = ?
    """,
        (zone_id,),
    )

    tiles = {}
    for x, y, tile_image_id in cursor.fetchall():
        tiles[(x, y)] = tile_image_id

    conn.close()
    return tiles


def main():
    # Parse command line arguments
    zone_id = ZONE_ID
    if len(sys.argv) > 1:
        try:
            zone_id = int(sys.argv[1])
        except ValueError:
            print(f"Invalid zone ID: {sys.argv[1]}")
            sys.exit(1)

    # Create output directory if it doesn't exist
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Load tile images
    print("Loading tile images...")
    tile_images = load_tile_images()
    print(f"Loaded {len(tile_images)} tile images")

    # Get zone info
    zone_info = get_zone_info(zone_id)
    print(f"Zone {zone_id}: {zone_info['name']}")

    # Load tiles for the zone
    print(f"Loading tiles for zone {zone_id}...")
    tiles = load_tiles(zone_id)
    print(f"Loaded {len(tiles)} tiles")

    # Calculate the size of the map in pixels
    map_width = zone_info["width"] * TILE_SIZE * SCALE
    map_height = zone_info["height"] * TILE_SIZE * SCALE

    # Create a new image for the map
    map_image = Image.new("RGB", (map_width, map_height), (0, 0, 0))

    # Draw the tiles on the map image
    for (x, y), tile_image_id in tiles.items():
        if tile_image_id in tile_images:
            # Calculate position relative to min_x and min_y
            rel_x = (x - zone_info["min_x"]) * TILE_SIZE * SCALE
            rel_y = (y - zone_info["min_y"]) * TILE_SIZE * SCALE
            map_image.paste(tile_images[tile_image_id], (rel_x, rel_y))

    # Add a title to the image
    draw = ImageDraw.Draw(map_image)
    try:
        # Try to use a system font
        font = ImageFont.truetype("Arial", 16)
    except IOError:
        # Fall back to default font
        font = ImageFont.load_default()

    title = f"Zone {zone_id}: {zone_info['name']} - Size: {zone_info['width']}x{zone_info['height']} - Tiles: {len(tiles)}"
    draw.text((10, 10), title, fill=(255, 255, 255), font=font)

    # Save the image
    output_path = os.path.join(OUTPUT_DIR, f"zone_{zone_id}.png")
    map_image.save(output_path)
    print(f"Map image saved to {output_path}")

    # Try to open the image with the default viewer
    try:
        if sys.platform == "darwin":  # macOS
            os.system(f"open {output_path}")
        elif sys.platform == "win32":  # Windows
            os.system(f"start {output_path}")
        else:  # Linux/Unix
            os.system(f"xdg-open {output_path}")
    except Exception as e:
        print(f"Could not open image automatically: {e}")
        print(f"Please open {output_path} manually")


if __name__ == "__main__":
    main()
