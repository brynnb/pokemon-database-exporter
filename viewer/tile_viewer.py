#!/usr/bin/env python3
"""
Tile Viewer

This script displays tiles from the database for a specific zone.
It uses Pygame to render the tiles based on their positions.

Usage:
    python tile_viewer.py [zone_id]
    python tile_viewer.py overworld  # Display all overworld maps
    python tile_viewer.py 1,2,3      # Display specific zones by ID
"""

import os
import sys
import sqlite3
import pygame
from PIL import Image
import io
from collections import defaultdict

# Constants
TILE_SIZE = 16  # Size of each tile in pixels
MIN_ZOOM = 0.1  # Minimum zoom level
MAX_ZOOM = 5.0  # Maximum zoom level
DEFAULT_ZOOM = 0.5  # Default zoom level (equivalent to original SCALE)
ZOOM_STEP = 0.1  # How much to zoom in/out per scroll
ZONE_ID = 15  # Default zone ID to display
DB_PATH = "../pokemon.db"  # Path to the database relative to this script

# Overworld mode
OVERWORLD_MODE = False
# Multiple zones mode
MULTI_ZONE_MODE = False
ZONE_IDS = []


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
    print("Loading tile images...")

    # Create a default colored tile for missing images
    default_colors = {}

    for image_id, image_path in cursor.fetchall():
        try:
            # Load the image using PIL
            # Adjust the image path to be relative to the script location
            adjusted_path = os.path.join("..", image_path)

            # If the image doesn't exist, create a colored tile based on the ID
            if not os.path.exists(adjusted_path):
                # Create a colored tile based on the image_id
                if image_id not in default_colors:
                    # Generate a pseudo-random color based on the image_id
                    r = (image_id * 73) % 256
                    g = (image_id * 127) % 256
                    b = (image_id * 191) % 256
                    default_colors[image_id] = (r, g, b)

                # Create a new image with the color
                img = Image.new("RGB", (TILE_SIZE, TILE_SIZE), default_colors[image_id])

                # Draw a border and the ID number for identification
                from PIL import ImageDraw

                draw = ImageDraw.Draw(img)
                draw.rectangle(
                    [(0, 0), (TILE_SIZE - 1, TILE_SIZE - 1)], outline=(255, 255, 255)
                )

                # Convert PIL image to Pygame surface
                mode = img.mode
                size = img.size
                data = img.tobytes()
                py_image = pygame.image.fromstring(data, size, mode)
            else:
                # Load the actual image if it exists
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

    print(f"Loaded {len(tile_images)} tile images")
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

    tiles = cursor.fetchall()
    conn.close()
    return tiles


def get_overworld_zones():
    """Get all zones that are marked as overworld"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT id, name FROM zones WHERE is_overworld = 1
    """
    )

    zones = cursor.fetchall()
    conn.close()
    return zones


def get_map_connections():
    """Get all map connections from the database"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT from_map_id, to_map_id, direction, offset
        FROM map_connections
        """
    )

    map_connections = defaultdict(list)
    for from_map_id, to_map_id, direction, offset in cursor.fetchall():
        map_connections[from_map_id].append(
            {"to_map_id": to_map_id, "direction": direction, "offset": offset}
        )

    conn.close()
    return map_connections


def get_maps_for_zones(zone_ids):
    """Get all maps for the specified zones"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Get the tileset_ids for the zones
    placeholders = ",".join(["?"] * len(zone_ids))
    cursor.execute(
        f"""
        SELECT id, tileset_id FROM zones WHERE id IN ({placeholders})
        """,
        zone_ids,
    )

    zone_tilesets = {zone_id: tileset_id for zone_id, tileset_id in cursor.fetchall()}

    # Get maps for each zone based on tileset_id
    maps_in_zones = []
    for zone_id, tileset_id in zone_tilesets.items():
        if tileset_id is not None:
            cursor.execute(
                """
                SELECT id, name, width, height
                FROM maps
                WHERE tileset_id = ?
                """,
                (tileset_id,),
            )

            for map_id, name, width, height in cursor.fetchall():
                maps_in_zones.append((map_id, name, width, height, zone_id))

    conn.close()
    return maps_in_zones


def get_map_tiles(map_id, zone_id):
    """Get all tiles for a specific map"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Get the map dimensions
    cursor.execute(
        """
        SELECT width, height FROM maps WHERE id = ?
        """,
        (map_id,),
    )

    result = cursor.fetchone()
    if not result:
        conn.close()
        return []

    width, height = result
    width_tiles = width * 2  # Convert blocks to tiles
    height_tiles = height * 2

    # Get all tiles for this zone
    cursor.execute(
        """
        SELECT x, y, tile_image_id FROM tiles WHERE zone_id = ?
        """,
        (zone_id,),
    )

    tiles = cursor.fetchall()
    conn.close()

    return tiles


def calculate_map_positions(maps_in_zones, map_connections):
    """Calculate the absolute position of each map based on connections"""
    if not maps_in_zones:
        return {}

    # Get map dimensions
    map_dimensions = {}
    for map_id, name, width, height, zone_id in maps_in_zones:
        map_dimensions[map_id] = {
            "width": width * 2,  # Convert block dimensions to tile dimensions
            "height": height * 2,
            "name": name,
            "zone_id": zone_id,
        }

    # Start with the first map at position (0, 0)
    root_map_id = maps_in_zones[0][0]  # First map's ID

    map_positions = {
        root_map_id: {"x": 0, "y": 0, "zone_id": map_dimensions[root_map_id]["zone_id"]}
    }

    # Create a set of map IDs for quick lookup
    map_ids = {map_id for map_id, _, _, _, _ in maps_in_zones}

    # Use breadth-first search to position all connected maps
    queue = [root_map_id]
    processed = set([root_map_id])

    while queue:
        current_map_id = queue.pop(0)

        # Skip if this map is not in our list
        if current_map_id not in map_ids:
            continue

        current_pos = map_positions[current_map_id]
        current_width = map_dimensions[current_map_id]["width"]
        current_height = map_dimensions[current_map_id]["height"]

        # Process all connections from this map
        if current_map_id in map_connections:
            for connection in map_connections[current_map_id]:
                to_map_id = connection["to_map_id"]

                # Skip if not in our list or already processed
                if to_map_id not in map_ids or to_map_id in processed:
                    continue

                direction = connection["direction"]
                offset = connection["offset"] * 2  # Convert block offset to tile offset

                # Calculate position based on direction and offset
                if direction == "north":
                    # If map A connects to map B to the north, map B is BELOW map A
                    new_x = current_pos["x"] + offset
                    new_y = current_pos["y"] + current_height
                elif direction == "south":
                    # If map A connects to map B to the south, map B is ABOVE map A
                    new_x = current_pos["x"] + offset
                    new_y = current_pos["y"] - map_dimensions[to_map_id]["height"]
                elif direction == "west":
                    # If map A connects to map B to the west, map B is to the LEFT of map A
                    new_x = current_pos["x"] - map_dimensions[to_map_id]["width"]
                    # For east-west connections, use the offset to determine vertical alignment
                    new_y = current_pos["y"] + offset
                elif direction == "east":
                    # If map A connects to map B to the east, map B is to the RIGHT of map A
                    new_x = current_pos["x"] + current_width
                    # For east-west connections, use the offset to determine vertical alignment
                    new_y = current_pos["y"] + offset
                else:
                    continue

                # Store the position
                map_positions[to_map_id] = {
                    "x": new_x,
                    "y": new_y,
                    "zone_id": map_dimensions[to_map_id]["zone_id"],
                }

                # Add to queue for processing
                queue.append(to_map_id)
                processed.add(to_map_id)

    # For any maps that weren't connected, position them in a grid
    grid_x, grid_y = 0, 0
    max_width = 0
    grid_spacing = 5  # Spacing between unconnected maps

    for map_id, _, width, height, zone_id in maps_in_zones:
        if map_id not in map_positions:
            # Convert block dimensions to tile dimensions
            width_tiles = width * 2
            height_tiles = height * 2

            # Position in grid
            map_positions[map_id] = {"x": grid_x, "y": grid_y, "zone_id": zone_id}

            # Update grid position for next map
            max_width = max(max_width, width_tiles)
            grid_y += height_tiles + grid_spacing

            # Start a new column if we've placed too many maps vertically
            if grid_y > 100:  # Arbitrary limit
                grid_y = 0
                grid_x += max_width + grid_spacing
                max_width = 0

    return map_positions


def load_all_overworld_tiles():
    """Load all tiles that are marked as overworld"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Get all tiles marked as overworld
    cursor.execute(
        """
        SELECT x, y, tile_image_id, zone_id FROM tiles WHERE is_overworld = 1
    """
    )

    tiles = cursor.fetchall()

    # Get the global bounds to calculate offsets
    cursor.execute(
        """
        SELECT MIN(x), MIN(y), MAX(x), MAX(y) FROM tiles WHERE is_overworld = 1
    """
    )

    min_global_x, min_global_y, max_global_x, max_global_y = cursor.fetchone()

    # Handle case where no tiles exist
    if (
        min_global_x is None
        or min_global_y is None
        or max_global_x is None
        or max_global_y is None
    ):
        min_global_x, min_global_y, max_global_x, max_global_y = 0, 0, 0, 0

    # Get all overworld zones for coloring
    cursor.execute(
        """
        SELECT id, name FROM zones WHERE is_overworld = 1
    """
    )

    zone_colors = {}
    for zone_id, zone_name in cursor.fetchall():
        # Generate a semi-transparent color for zone borders
        # Use a hash of the zone_id to get a consistent color
        import hashlib

        hash_val = int(hashlib.md5(str(zone_id).encode()).hexdigest(), 16)
        r = (hash_val & 0xFF0000) >> 16
        g = (hash_val & 0x00FF00) >> 8
        b = hash_val & 0x0000FF
        zone_colors[zone_id] = (r, g, b, 128)  # Semi-transparent color

    conn.close()

    return (
        tiles,
        zone_colors,
        {
            "min_x": min_global_x,
            "min_y": min_global_y,
            "max_x": max_global_x,
            "max_y": max_global_y,
            "width": max_global_x - min_global_x + 1,
            "height": max_global_y - min_global_y + 1,
            "name": "All Overworld Maps",
        },
    )


def load_specific_zones(zone_ids):
    """Load tiles for specific zones"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Create placeholders for the IN clause
    placeholders = ",".join(["?" for _ in zone_ids])

    # Get all tiles for the specified zones
    cursor.execute(
        f"""
        SELECT x, y, tile_image_id, zone_id FROM tiles WHERE zone_id IN ({placeholders})
        """,
        zone_ids,
    )

    tiles = cursor.fetchall()

    # Get the global bounds to calculate offsets
    cursor.execute(
        f"""
        SELECT MIN(x), MIN(y), MAX(x), MAX(y) FROM tiles WHERE zone_id IN ({placeholders})
        """,
        zone_ids,
    )

    min_global_x, min_global_y, max_global_x, max_global_y = cursor.fetchone()

    # Handle case where no tiles exist
    if (
        min_global_x is None
        or min_global_y is None
        or max_global_x is None
        or max_global_y is None
    ):
        min_global_x, min_global_y, max_global_x, max_global_y = 0, 0, 0, 0

    # Get zone names for the title
    cursor.execute(
        f"""
        SELECT id, name FROM zones WHERE id IN ({placeholders})
        """,
        zone_ids,
    )

    zone_names = [name for _, name in cursor.fetchall()]
    title = ", ".join(zone_names)

    # Generate colors for each zone
    zone_colors = {}
    for zone_id in zone_ids:
        # Generate a semi-transparent color for zone borders
        # Use a hash of the zone_id to get a consistent color
        import hashlib

        hash_val = int(hashlib.md5(str(zone_id).encode()).hexdigest(), 16)
        r = (hash_val & 0xFF0000) >> 16
        g = (hash_val & 0x00FF00) >> 8
        b = hash_val & 0x0000FF
        zone_colors[zone_id] = (r, g, b, 128)  # Semi-transparent color

    conn.close()

    return (
        tiles,
        zone_colors,
        {
            "min_x": min_global_x,
            "min_y": min_global_y,
            "max_x": max_global_x,
            "max_y": max_global_y,
            "width": max_global_x - min_global_x + 1,
            "height": max_global_y - min_global_y + 1,
            "name": title,
        },
    )


def render_map(tile_images, tiles, zone_info, zoom_level, zone_colors=None):
    """Render the map to a surface"""
    # Calculate the size of the map in pixels
    map_width = int(zone_info["width"] * TILE_SIZE * zoom_level)
    map_height = int(zone_info["height"] * TILE_SIZE * zoom_level)

    # Create a surface for the map
    map_surface = pygame.Surface((map_width, map_height), pygame.SRCALPHA)
    map_surface.fill((0, 0, 0, 0))  # Transparent background

    # Render each tile
    for tile in tiles:
        if OVERWORLD_MODE or MULTI_ZONE_MODE:
            x, y, tile_image_id, zone_id = tile
            # Draw a colored border around each zone's tiles
            if zone_colors and zone_id in zone_colors:
                border_color = zone_colors[zone_id]
                border_rect = pygame.Rect(
                    int((x - zone_info["min_x"]) * TILE_SIZE * zoom_level),
                    int((y - zone_info["min_y"]) * TILE_SIZE * zoom_level),
                    int(TILE_SIZE * zoom_level),
                    int(TILE_SIZE * zoom_level),
                )
                pygame.draw.rect(map_surface, border_color, border_rect, 1)
        else:
            x, y, tile_image_id = tile

        if tile_image_id in tile_images:
            # Get the original image
            original_image = tile_images[tile_image_id]

            # Scale the image based on the zoom level
            scaled_size = (int(TILE_SIZE * zoom_level), int(TILE_SIZE * zoom_level))
            scaled_image = pygame.transform.scale(original_image, scaled_size)

            # Calculate the position on the map
            pos_x = int((x - zone_info["min_x"]) * TILE_SIZE * zoom_level)
            pos_y = int((y - zone_info["min_y"]) * TILE_SIZE * zoom_level)

            # Draw the tile
            map_surface.blit(scaled_image, (pos_x, pos_y))

    return map_surface, map_width, map_height


def main():
    global OVERWORLD_MODE, MULTI_ZONE_MODE, ZONE_IDS

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
        if sys.argv[1].lower() == "overworld":
            OVERWORLD_MODE = True
        elif "," in sys.argv[1]:
            # Multiple zones mode
            MULTI_ZONE_MODE = True
            try:
                ZONE_IDS = [int(z.strip()) for z in sys.argv[1].split(",")]
                if not ZONE_IDS:
                    raise ValueError("No valid zone IDs provided")
            except ValueError as e:
                print(f"Invalid zone IDs: {sys.argv[1]}")
                print(
                    "Usage: python tile_viewer.py [zone_id|overworld|zone_id1,zone_id2,...]"
                )
                sys.exit(1)
        else:
            try:
                zone_id = int(sys.argv[1])
            except ValueError:
                print(f"Invalid zone ID: {sys.argv[1]}")
                print(
                    "Usage: python tile_viewer.py [zone_id|overworld|zone_id1,zone_id2,...]"
                )
                sys.exit(1)

    # Set window title
    pygame.display.set_caption(f"Tile Viewer - Loading...")

    # Load tile images
    print("Loading tile images...")
    tile_images = load_tile_images()
    print(f"Loaded {len(tile_images)} tile images")

    # Load tiles and zone info
    if OVERWORLD_MODE:
        print("Loading all overworld maps...")
        tiles, zone_colors, zone_info = load_all_overworld_tiles()
        print(f"Loaded {len(tiles)} tiles from all overworld maps")
        pygame.display.set_caption(f"Tile Viewer - All Overworld Maps")
    elif MULTI_ZONE_MODE:
        print(f"Loading zones {', '.join(map(str, ZONE_IDS))}...")
        tiles, zone_colors, zone_info = load_specific_zones(ZONE_IDS)
        print(f"Loaded {len(tiles)} tiles from specified zones")
        pygame.display.set_caption(f"Tile Viewer - {zone_info['name']}")
    else:
        # Get zone info
        zone_info = get_zone_info(zone_id)
        pygame.display.set_caption(f"Tile Viewer - Zone {zone_id}: {zone_info['name']}")

        # Load tiles for the zone
        print(f"Loading tiles for zone {zone_id}...")
        tiles = load_tiles(zone_id)
        zone_colors = None
        print(f"Loaded {len(tiles)} tiles")

    # Variables for panning and zooming
    offset_x, offset_y = 0, 0
    zoom_level = DEFAULT_ZOOM
    dragging = False
    drag_start = None

    # Render the initial map
    if OVERWORLD_MODE or MULTI_ZONE_MODE:
        map_surface, map_width, map_height = render_map(
            tile_images, tiles, zone_info, zoom_level, zone_colors
        )
    else:
        map_surface, map_width, map_height = render_map(
            tile_images, tiles, zone_info, zoom_level
        )

    # Center the map initially
    offset_x = (screen_width - map_width) // 2
    offset_y = (screen_height - map_height) // 2

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
                    if OVERWORLD_MODE or MULTI_ZONE_MODE:
                        map_surface, map_width, map_height = render_map(
                            tile_images, tiles, zone_info, zoom_level, zone_colors
                        )
                    else:
                        map_surface, map_width, map_height = render_map(
                            tile_images, tiles, zone_info, zoom_level
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
                    if OVERWORLD_MODE or MULTI_ZONE_MODE:
                        map_surface, map_width, map_height = render_map(
                            tile_images, tiles, zone_info, zoom_level, zone_colors
                        )
                    else:
                        map_surface, map_width, map_height = render_map(
                            tile_images, tiles, zone_info, zoom_level
                        )

                    # Adjust offset to keep the mouse position at the same spot in the map
                    offset_x = mouse_x - ratio_x * map_width
                    offset_y = mouse_y - ratio_y * map_height

                # Save screenshot
                elif event.key == pygame.K_s:
                    if MULTI_ZONE_MODE:
                        screenshot_path = (
                            f"zones_{'_'.join(map(str, ZONE_IDS))}_map_layout.png"
                        )
                    else:
                        screenshot_path = f"zone_{'overworld' if OVERWORLD_MODE else zone_id}_map_layout.png"
                    pygame.image.save(map_surface, screenshot_path)
                    print(f"Screenshot saved to {screenshot_path}")

                # Save screenshot with zone outlines
                elif event.key == pygame.K_o:
                    # Create a copy of the map surface with outlines
                    outline_surface = map_surface.copy()

                    # Draw outlines for each zone
                    if (OVERWORLD_MODE or MULTI_ZONE_MODE) and zone_colors:
                        for tile in tiles:
                            x, y, _, zone_id = tile
                            if zone_id in zone_colors:
                                border_color = zone_colors[zone_id]
                                # Make the border fully opaque
                                border_color = (
                                    border_color[0],
                                    border_color[1],
                                    border_color[2],
                                    255,
                                )
                                border_rect = pygame.Rect(
                                    int(
                                        (x - zone_info["min_x"])
                                        * TILE_SIZE
                                        * zoom_level
                                    ),
                                    int(
                                        (y - zone_info["min_y"])
                                        * TILE_SIZE
                                        * zoom_level
                                    ),
                                    int(TILE_SIZE * zoom_level),
                                    int(TILE_SIZE * zoom_level),
                                )
                                pygame.draw.rect(
                                    outline_surface, border_color, border_rect, 1
                                )

                    if MULTI_ZONE_MODE:
                        screenshot_path = (
                            f"zones_{'_'.join(map(str, ZONE_IDS))}_map_outlines.png"
                        )
                    else:
                        screenshot_path = f"zone_{'overworld' if OVERWORLD_MODE else zone_id}_map_outlines.png"
                    pygame.image.save(outline_surface, screenshot_path)
                    print(f"Outline screenshot saved to {screenshot_path}")

            elif event.type == pygame.MOUSEBUTTONDOWN:
                if event.button == 1:  # Left mouse button
                    dragging = True
                    drag_start = event.pos
                elif event.button == 4:  # Mouse wheel up
                    # Get mouse position for zoom center
                    mouse_x, mouse_y = event.pos
                    # Calculate position relative to the map
                    map_x = mouse_x - offset_x
                    map_y = mouse_y - offset_y

                    # Calculate the position ratio (where in the map we are)
                    ratio_x = map_x / map_width if map_width > 0 else 0.5
                    ratio_y = map_y / map_height if map_height > 0 else 0.5

                    # Zoom in
                    zoom_level = min(MAX_ZOOM, zoom_level + ZOOM_STEP)

                    # Re-render the map at the new zoom level
                    if OVERWORLD_MODE or MULTI_ZONE_MODE:
                        map_surface, map_width, map_height = render_map(
                            tile_images, tiles, zone_info, zoom_level, zone_colors
                        )
                    else:
                        map_surface, map_width, map_height = render_map(
                            tile_images, tiles, zone_info, zoom_level
                        )

                    # Adjust offset to keep the mouse position at the same spot in the map
                    offset_x = mouse_x - ratio_x * map_width
                    offset_y = mouse_y - ratio_y * map_height

                elif event.button == 5:  # Mouse wheel down
                    # Get mouse position for zoom center
                    mouse_x, mouse_y = event.pos
                    # Calculate position relative to the map
                    map_x = mouse_x - offset_x
                    map_y = mouse_y - offset_y

                    # Calculate the position ratio (where in the map we are)
                    ratio_x = map_x / map_width if map_width > 0 else 0.5
                    ratio_y = map_y / map_height if map_height > 0 else 0.5

                    # Zoom out
                    zoom_level = max(MIN_ZOOM, zoom_level - ZOOM_STEP)

                    # Re-render the map at the new zoom level
                    if OVERWORLD_MODE or MULTI_ZONE_MODE:
                        map_surface, map_width, map_height = render_map(
                            tile_images, tiles, zone_info, zoom_level, zone_colors
                        )
                    else:
                        map_surface, map_width, map_height = render_map(
                            tile_images, tiles, zone_info, zoom_level
                        )

                    # Adjust offset to keep the mouse position at the same spot in the map
                    offset_x = mouse_x - ratio_x * map_width
                    offset_y = mouse_y - ratio_y * map_height

            elif event.type == pygame.MOUSEBUTTONUP:
                if event.button == 1:  # Left mouse button
                    dragging = False

            elif event.type == pygame.MOUSEMOTION:
                if dragging:
                    # Calculate the difference between the current position and the drag start
                    dx = event.pos[0] - drag_start[0]
                    dy = event.pos[1] - drag_start[1]
                    # Update the offset
                    offset_x += dx
                    offset_y += dy
                    # Update the drag start
                    drag_start = event.pos

        # Clear the screen
        screen.fill((0, 0, 0))

        # Draw the map
        screen.blit(map_surface, (offset_x, offset_y))

        # Update the display
        pygame.display.flip()

        # Cap the frame rate
        clock.tick(60)

    pygame.quit()


if __name__ == "__main__":
    main()
