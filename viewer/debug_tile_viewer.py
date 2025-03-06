#!/usr/bin/env python3
"""
Debug Tile Viewer

This script displays tiles from the database for a specific zone with map boundaries.
It uses Pygame to render the tiles based on their positions and draws map boundaries.

Usage:
    python debug_tile_viewer.py [zone_id]
"""

import os
import sys
import sqlite3
import pygame
from PIL import Image
import io
import random

# Constants
TILE_SIZE = 16  # Size of each tile in pixels
MIN_ZOOM = 0.5  # Minimum zoom level
MAX_ZOOM = 5.0  # Maximum zoom level
DEFAULT_ZOOM = 1.0  # Default zoom level (equivalent to original SCALE)
ZOOM_STEP = 0.1  # How much to zoom in/out per scroll
ZONE_ID = 1  # Default zone ID to display
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
            # Convert PIL image to Pygame surface at original size
            mode = img.mode
            size = img.size
            data = img.tobytes()
            py_image = pygame.image.fromstring(data, size, mode)
            # Store the original image (we'll scale it during rendering based on zoom level)
            tile_images[image_id] = py_image
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


def get_map_boundaries(zone_id):
    """Get the boundaries of each map in the zone"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Get the tileset_id for the zone
    cursor.execute(
        """
        SELECT tileset_id FROM zones WHERE id = ?
    """,
        (zone_id,),
    )
    result = cursor.fetchone()
    if not result:
        conn.close()
        return []

    tileset_id = result[0]

    # Get all maps for this tileset
    cursor.execute(
        """
        SELECT id, name, width, height FROM maps WHERE tileset_id = ?
    """,
        (tileset_id,),
    )
    maps = cursor.fetchall()

    # Get map positions from the tiles table
    map_boundaries = []

    # For each map, find its position in the zone
    for map_id, name, width, height in maps:
        # Find the min/max x/y coordinates for this map
        # This approach is more direct - we'll look at the map connections
        cursor.execute(
            """
            SELECT from_map_id, to_map_id, direction, offset 
            FROM map_connections
            WHERE from_map_id = ? OR to_map_id = ?
            """,
            (map_id, map_id),
        )

        connections = cursor.fetchall()

        # For now, just use the map dimensions to create a boundary
        # We'll use a different color for each map
        color = (
            random.randint(100, 255),
            random.randint(100, 255),
            random.randint(100, 255),
        )

        # Find the position of this map in the zone using a simpler approach
        cursor.execute(
            """
            SELECT MIN(x), MIN(y), MAX(x), MAX(y)
            FROM tiles
            WHERE zone_id = ?
            GROUP BY (x / ?) * 1000 + (y / ?)
            HAVING COUNT(*) >= ?
            """,
            (zone_id, width, height, width * height / 2),
        )

        results = cursor.fetchall()

        for result in results:
            if result[0] is not None:
                min_x, min_y, max_x, max_y = result
                # Only add if the dimensions are close to the expected map size
                if (max_x - min_x + 1) <= width * 2 and (
                    max_y - min_y + 1
                ) <= height * 2:
                    map_boundaries.append(
                        {
                            "id": map_id,
                            "name": name,
                            "min_x": min_x,
                            "min_y": min_y,
                            "max_x": max_x,
                            "max_y": max_y,
                            "width": width,
                            "height": height,
                            "color": color,
                        }
                    )

    conn.close()
    return map_boundaries


def check_tile_images(zone_id):
    """Check if tile images are correctly associated with tiles"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Get the tileset_id for the zone
    cursor.execute(
        """
        SELECT tileset_id FROM zones WHERE id = ?
    """,
        (zone_id,),
    )
    result = cursor.fetchone()
    if not result:
        conn.close()
        return "No tileset found for zone"

    tileset_id = result[0]

    # Check if all tile_image_ids in the tiles table exist in the tile_images table
    cursor.execute(
        """
        SELECT COUNT(DISTINCT t.tile_image_id) 
        FROM tiles t
        LEFT JOIN tile_images ti ON t.tile_image_id = ti.id
        WHERE t.zone_id = ? AND ti.id IS NULL
        """,
        (zone_id,),
    )

    missing_images = cursor.fetchone()[0]

    # Check if all tile_image_ids in the tiles table have the correct tileset_id
    cursor.execute(
        """
        SELECT COUNT(DISTINCT t.tile_image_id) 
        FROM tiles t
        JOIN tile_images ti ON t.tile_image_id = ti.id
        WHERE t.zone_id = ? AND ti.tileset_id != ?
        """,
        (zone_id, tileset_id),
    )

    wrong_tileset = cursor.fetchone()[0]

    # Get some sample tiles with their image_ids
    cursor.execute(
        """
        SELECT t.x, t.y, t.tile_image_id, ti.tileset_id, ti.block_index, ti.position
        FROM tiles t
        JOIN tile_images ti ON t.tile_image_id = ti.id
        WHERE t.zone_id = ?
        LIMIT 10
        """,
        (zone_id,),
    )

    samples = cursor.fetchall()

    conn.close()

    return {
        "missing_images": missing_images,
        "wrong_tileset": wrong_tileset,
        "samples": samples,
    }


def render_map(tile_images, tiles, zone_info, map_boundaries, zoom_level):
    """Render the map at the specified zoom level with map boundaries"""
    # Calculate the size of the map in pixels with current zoom
    scaled_tile_size = int(TILE_SIZE * zoom_level)
    map_width = zone_info["width"] * scaled_tile_size
    map_height = zone_info["height"] * scaled_tile_size

    # Create a surface for the map
    map_surface = pygame.Surface((map_width, map_height))
    map_surface.fill((0, 0, 0))  # Fill with black

    # Draw the tiles on the map surface
    for (x, y), tile_image_id in tiles.items():
        if tile_image_id in tile_images:
            # Calculate position relative to min_x and min_y
            rel_x = (x - zone_info["min_x"]) * scaled_tile_size
            rel_y = (y - zone_info["min_y"]) * scaled_tile_size

            # Scale the tile image to the current zoom level
            scaled_image = pygame.transform.scale(
                tile_images[tile_image_id], (scaled_tile_size, scaled_tile_size)
            )

            map_surface.blit(scaled_image, (rel_x, rel_y))

    # Draw map boundaries
    for map_info in map_boundaries:
        # Calculate position relative to min_x and min_y
        rel_x1 = (map_info["min_x"] - zone_info["min_x"]) * scaled_tile_size
        rel_y1 = (map_info["min_y"] - zone_info["min_y"]) * scaled_tile_size
        rel_x2 = (map_info["max_x"] - zone_info["min_x"] + 1) * scaled_tile_size
        rel_y2 = (map_info["max_y"] - zone_info["min_y"] + 1) * scaled_tile_size

        # Draw rectangle around the map
        pygame.draw.rect(
            map_surface,
            map_info["color"],
            (rel_x1, rel_y1, rel_x2 - rel_x1, rel_y2 - rel_y1),
            max(1, int(2 * zoom_level)),
        )

    return map_surface, map_width, map_height


def main():
    # Initialize Pygame
    pygame.init()

    # Set up the display
    screen_info = pygame.display.Info()
    screen_width = min(1024, screen_info.current_w)
    screen_height = min(768, screen_info.current_h)
    screen = pygame.display.set_mode((screen_width, screen_height))

    # Parse command line arguments
    zone_id = ZONE_ID
    if len(sys.argv) > 1:
        try:
            zone_id = int(sys.argv[1])
        except ValueError:
            print(f"Invalid zone ID: {sys.argv[1]}")
            sys.exit(1)

    # Set window title
    pygame.display.set_caption(f"Debug Tile Viewer - Loading...")

    # Load tile images
    print("Loading tile images...")
    tile_images = load_tile_images()
    print(f"Loaded {len(tile_images)} tile images")

    # Get zone info
    zone_info = get_zone_info(zone_id)
    pygame.display.set_caption(
        f"Debug Tile Viewer - Zone {zone_id}: {zone_info['name']}"
    )

    # Load tiles for the zone
    print(f"Loading tiles for zone {zone_id}...")
    tiles = load_tiles(zone_id)
    print(f"Loaded {len(tiles)} tiles")

    # Check tile images
    print("Checking tile images...")
    tile_check = check_tile_images(zone_id)
    print(f"Missing images: {tile_check['missing_images']}")
    print(f"Wrong tileset: {tile_check['wrong_tileset']}")
    print("Sample tiles:")
    for x, y, tile_image_id, tileset_id, block_index, position in tile_check["samples"]:
        print(
            f"  Tile at ({x}, {y}): image_id={tile_image_id}, tileset={tileset_id}, block={block_index}, pos={position}"
        )

    # Get map boundaries
    print("Loading map boundaries...")
    map_boundaries = get_map_boundaries(zone_id)
    print(f"Loaded {len(map_boundaries)} map boundaries")

    # Variables for panning and zooming
    offset_x, offset_y = 0, 0
    zoom_level = DEFAULT_ZOOM
    dragging = False
    drag_start = None

    # Render the initial map
    map_surface, map_width, map_height = render_map(
        tile_images, tiles, zone_info, map_boundaries, zoom_level
    )

    # Main game loop
    running = True
    clock = pygame.time.Clock()

    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    running = False
                # Arrow keys for panning
                elif event.key == pygame.K_LEFT:
                    offset_x += 10
                elif event.key == pygame.K_RIGHT:
                    offset_x -= 10
                elif event.key == pygame.K_UP:
                    offset_y += 10
                elif event.key == pygame.K_DOWN:
                    offset_y -= 10
                # Plus and minus keys for zooming
                elif event.key == pygame.K_PLUS or event.key == pygame.K_EQUALS:
                    # Get mouse position for zoom center
                    mouse_x, mouse_y = pygame.mouse.get_pos()
                    # Calculate position relative to the map
                    map_x = mouse_x - offset_x
                    map_y = mouse_y - offset_y

                    # Calculate the position ratio (where in the map we are)
                    ratio_x = map_x / map_width if map_width > 0 else 0.5
                    ratio_y = map_y / map_height if map_height > 0 else 0.5

                    # Zoom in
                    old_zoom = zoom_level
                    zoom_level = min(MAX_ZOOM, zoom_level + ZOOM_STEP)

                    # Re-render the map at the new zoom level
                    map_surface, map_width, map_height = render_map(
                        tile_images, tiles, zone_info, map_boundaries, zoom_level
                    )

                    # Adjust offset to keep the mouse position at the same spot in the map
                    offset_x = mouse_x - ratio_x * map_width
                    offset_y = mouse_y - ratio_y * map_height

                elif event.key == pygame.K_MINUS:
                    # Get mouse position for zoom center
                    mouse_x, mouse_y = pygame.mouse.get_pos()
                    # Calculate position relative to the map
                    map_x = mouse_x - offset_x
                    map_y = mouse_y - offset_y

                    # Calculate the position ratio (where in the map we are)
                    ratio_x = map_x / map_width if map_width > 0 else 0.5
                    ratio_y = map_y / map_height if map_height > 0 else 0.5

                    # Zoom out
                    old_zoom = zoom_level
                    zoom_level = max(MIN_ZOOM, zoom_level - ZOOM_STEP)

                    # Re-render the map at the new zoom level
                    map_surface, map_width, map_height = render_map(
                        tile_images, tiles, zone_info, map_boundaries, zoom_level
                    )

                    # Adjust offset to keep the mouse position at the same spot in the map
                    offset_x = mouse_x - ratio_x * map_width
                    offset_y = mouse_y - ratio_y * map_height

            # Mouse wheel for zooming
            elif event.type == pygame.MOUSEWHEEL:
                # Get mouse position for zoom center
                mouse_x, mouse_y = pygame.mouse.get_pos()
                # Calculate position relative to the map
                map_x = mouse_x - offset_x
                map_y = mouse_y - offset_y

                # Calculate the position ratio (where in the map we are)
                ratio_x = map_x / map_width if map_width > 0 else 0.5
                ratio_y = map_y / map_height if map_height > 0 else 0.5

                # Zoom in or out based on scroll direction
                old_zoom = zoom_level
                if event.y > 0:  # Scroll up (zoom in)
                    zoom_level = min(MAX_ZOOM, zoom_level + ZOOM_STEP)
                else:  # Scroll down (zoom out)
                    zoom_level = max(MIN_ZOOM, zoom_level - ZOOM_STEP)

                # Re-render the map at the new zoom level
                map_surface, map_width, map_height = render_map(
                    tile_images, tiles, zone_info, map_boundaries, zoom_level
                )

                # Adjust offset to keep the mouse position at the same spot in the map
                offset_x = mouse_x - ratio_x * map_width
                offset_y = mouse_y - ratio_y * map_height

            # Mouse dragging for panning
            elif event.type == pygame.MOUSEBUTTONDOWN:
                if event.button == 1:  # Left mouse button
                    dragging = True
                    drag_start = event.pos
            elif event.type == pygame.MOUSEBUTTONUP:
                if event.button == 1:  # Left mouse button
                    dragging = False
            elif event.type == pygame.MOUSEMOTION:
                if dragging:
                    dx = event.pos[0] - drag_start[0]
                    dy = event.pos[1] - drag_start[1]
                    offset_x += dx
                    offset_y += dy
                    drag_start = event.pos

        # Limit offsets to prevent scrolling too far
        offset_x = min(screen_width, max(-(map_width - screen_width), offset_x))
        offset_y = min(screen_height, max(-(map_height - screen_height), offset_y))

        # Fill the screen with black
        screen.fill((0, 0, 0))

        # Draw the map surface with the current offset
        screen.blit(map_surface, (offset_x, offset_y))

        # Draw a simple HUD with zone info
        font = pygame.font.SysFont(None, 24)
        info_text = f"Zone {zone_id}: {zone_info['name']} - Size: {zone_info['width']}x{zone_info['height']} - Tiles: {len(tiles)}"
        text_surface = font.render(info_text, True, (255, 255, 255))
        screen.blit(text_surface, (10, 10))

        help_text = "Arrow keys or drag to pan, Mouse wheel to zoom, ESC to quit"
        help_surface = font.render(help_text, True, (200, 200, 200))
        screen.blit(help_surface, (10, 40))

        zoom_text = f"Zoom: {zoom_level:.1f}x"
        zoom_surface = font.render(zoom_text, True, (200, 200, 200))
        screen.blit(zoom_surface, (10, 70))

        # Update the display
        pygame.display.flip()

        # Cap the frame rate
        clock.tick(60)

    pygame.quit()


if __name__ == "__main__":
    main()
