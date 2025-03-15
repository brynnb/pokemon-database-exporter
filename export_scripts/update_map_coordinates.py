#!/usr/bin/env python3
"""
Update Map Coordinates

This script updates the coordinates of overworld maps to be relative to Pallet Town.
It starts with Pallet Town (map_id 1) at coordinates (0,0) and recursively updates
connected maps based on their map connections.

Coordinate System:
- Pallet Town's top-left tile is at (0,0)
- For maps to the north, y coordinates are negative with no overlap
  (e.g., Route 1's bottom row is at y=-1, its top row is at y=-36)
- For maps further north (like Viridian City), coordinates continue to decrease
  (e.g., Viridian City's bottom row is at y=-37, just above Route 1's top row)
- For maps to the south, y coordinates are positive and start at Pallet Town's height
- For maps to the west, x coordinates are negative with no overlap
- For maps to the east, x coordinates are positive and start at Pallet Town's width

This ensures there's no overlap between adjacent maps.

The script processes up to a given number of maps, starting with Pallet Town and branching out
to adjacent maps based on the map_connections table. The maps are processed in
breadth-first order, ensuring that each map's coordinates are updated relative to
its connected maps that have already been processed.

Usage:
    python update_map_coordinates.py
"""

import sqlite3
import time

# Constants
PALLET_TOWN_MAP_ID = 1
MAX_MAPS_TO_PROCESS = 37  # Maximum number of maps to process
BLOCK_SIZE = 2  # Each block is 2x2 tiles

# Map name mappings between maps table and map_connections table
MAP_NAME_MAPPINGS = {
    "PALLET_TOWN": "PALLET_TOWN",
    "ROUTE_1": "ROUTE_1",
    "VIRIDIAN_CITY": "VIRIDIAN_CITY",
}


def get_map_dimensions(cursor, map_id):
    """Get the width and height of a map in blocks"""
    cursor.execute(
        """
    SELECT width, height
    FROM maps
    WHERE id = ?
    """,
        (map_id,),
    )
    row = cursor.fetchone()
    if row:
        return row[0], row[1]
    return 0, 0


def update_map_coordinates(conn, map_id, x_offset, y_offset):
    """Update the coordinates of all tiles in a map"""
    cursor = conn.cursor()
    cursor.execute(
        """
    UPDATE tiles
    SET x = local_x + ?, y = local_y + ?
    WHERE map_id = ?
    """,
        (x_offset, y_offset, map_id),
    )
    conn.commit()
    return cursor.rowcount


def get_map_name(cursor, map_id):
    """Get the name of a map"""
    cursor.execute(
        """
    SELECT name
    FROM maps
    WHERE id = ?
    """,
        (map_id,),
    )
    row = cursor.fetchone()
    return row[0] if row else None


def get_map_id_by_map_name(cursor, map_name):
    """Get the map_id for a map name"""
    # Try exact match
    cursor.execute(
        """
    SELECT id
    FROM maps
    WHERE name = ?
    """,
        (map_name,),
    )
    row = cursor.fetchone()
    if row:
        return row[0]

    # Try case-insensitive match
    cursor.execute(
        """
    SELECT id
    FROM maps
    WHERE UPPER(name) = UPPER(?)
    """,
        (map_name,),
    )
    row = cursor.fetchone()
    return row[0] if row else None


def get_zone_dimensions(cursor, zone_id):
    """Get the width and height of a zone in tiles"""
    cursor.execute(
        """
        SELECT MAX(x) - MIN(x) + 1, MAX(y) - MIN(y) + 1 
        FROM tiles 
        WHERE zone_id = ?
        """,
        (zone_id,),
    )
    return cursor.fetchone()


def update_zone_coordinates(conn, zone_id, x_offset, y_offset):
    """Update the coordinates of a zone by applying the given offsets"""
    cursor = conn.cursor()

    # Update the coordinates
    cursor.execute(
        """
        UPDATE tiles
        SET x = x + ?, y = y + ?
        WHERE zone_id = ?
        """,
        (x_offset, y_offset, zone_id),
    )

    conn.commit()
    return cursor.rowcount


def get_zone_name(cursor, zone_id):
    """Get the name of a zone by its ID"""
    cursor.execute("SELECT name FROM zones WHERE id = ?", (zone_id,))
    result = cursor.fetchone()
    return result[0] if result else None


def get_zone_id_by_map_name(cursor, map_name):
    """Get the zone ID for a given map name"""
    # Try to find a matching zone name directly
    cursor.execute("SELECT id FROM zones WHERE name = ?", (map_name,))
    result = cursor.fetchone()
    if result:
        return result[0]

    # Try to find a matching zone using the reverse mapping
    for zone_name, map_id in MAP_NAME_MAPPINGS.items():
        if map_id == map_name:
            cursor.execute("SELECT id FROM zones WHERE name = ?", (zone_name,))
            result = cursor.fetchone()
            if result:
                return result[0]

    return None


def get_connection_details(cursor, from_zone_id, to_zone_id):
    """Get connection details between two zones"""
    # Get zone names
    from_zone_name = get_zone_name(cursor, from_zone_id)
    to_zone_name = get_zone_name(cursor, to_zone_id)

    if not from_zone_name or not to_zone_name:
        return None, None

    # Convert zone names to map names used in map_connections table
    from_map_name = MAP_NAME_MAPPINGS.get(from_zone_name, from_zone_name)
    to_map_name = MAP_NAME_MAPPINGS.get(to_zone_name, to_zone_name)

    # Check for direct connection
    cursor.execute(
        """
        SELECT direction, offset
        FROM map_connections
        WHERE from_map_id = ? AND to_map_id = ?
        """,
        (from_map_name, to_map_name),
    )
    result = cursor.fetchone()

    if result:
        return result[0], result[1]

    # Check for reverse connection
    cursor.execute(
        """
        SELECT direction, offset
        FROM map_connections
        WHERE from_map_id = ? AND to_map_id = ?
        """,
        (to_map_name, from_map_name),
    )
    result = cursor.fetchone()

    if result:
        # Reverse the direction
        direction = result[0]
        if direction == "north":
            return "south", result[1]
        elif direction == "south":
            return "north", result[1]
        elif direction == "east":
            return "west", result[1]
        elif direction == "west":
            return "east", result[1]

    return None, None


def calculate_zone_offset(
    cursor, from_zone_id, to_zone_id, direction, connection_offset
):
    """Calculate the x and y offsets for a zone based on its connection"""
    # Get dimensions of zones
    from_width, from_height = get_zone_dimensions(cursor, from_zone_id)
    to_width, to_height = get_zone_dimensions(cursor, to_zone_id)

    # Calculate new offsets based on direction and connection offset
    x_offset, y_offset = 0, 0

    if direction == "north":
        # Connected zone is north of current zone
        # For north connections, offset is an x-axis offset (horizontal shift)
        x_offset = connection_offset * BLOCK_SIZE
        # Adjust to make y coordinates end at -1 (no overlap with y=0)
        y_offset = -to_height

    elif direction == "south":
        # Connected zone is south of current zone
        # For south connections, offset is an x-axis offset (horizontal shift)
        x_offset = connection_offset * BLOCK_SIZE
        y_offset = from_height

    elif direction == "east":
        # Connected zone is east of current zone
        # For east connections, offset is a y-axis offset (vertical shift)
        x_offset = from_width
        y_offset = connection_offset * BLOCK_SIZE

    elif direction == "west":
        # Connected zone is west of current zone
        # For west connections, offset is a y-axis offset (vertical shift)
        # Adjust to make x coordinates end at -1 (no overlap with x=0)
        x_offset = -to_width
        y_offset = connection_offset * BLOCK_SIZE

    return x_offset, y_offset


def get_all_map_connections(cursor):
    """Get all map connections from the database"""
    cursor.execute(
        "SELECT from_map_id, to_map_id, direction, offset FROM map_connections"
    )
    return cursor.fetchall()


def get_all_zone_names(cursor):
    """Get all zone names from the database"""
    cursor.execute("SELECT id, name FROM zones WHERE is_overworld = 1")
    return {row[0]: row[1] for row in cursor.fetchall()}


def update_map_name_mappings(zone_names):
    """Update the MAP_NAME_MAPPINGS dictionary with all zone names"""
    for zone_id, zone_name in zone_names.items():
        # Convert camelCase to UPPER_CASE with underscore
        if zone_name.startswith("Route"):
            # Special case for routes: Route1 -> ROUTE_1
            route_num = zone_name[5:]  # Extract the number part
            map_name = f"ROUTE_{route_num}"
        else:
            # For other names: CamelCase -> CAMEL_CASE
            map_name = (
                "".join(["_" + c if c.isupper() else c for c in zone_name])
                .upper()
                .lstrip("_")
            )

        MAP_NAME_MAPPINGS[zone_name] = map_name


def process_map_connections(conn):
    """Process map connections and update map coordinates"""
    cursor = conn.cursor()
    start_time = time.time()

    print(f"Starting with Pallet Town (map_id: {PALLET_TOWN_MAP_ID}) at origin (0,0)")

    # Initialize tracking variables
    processed_maps = set()
    map_queue = [(PALLET_TOWN_MAP_ID, 0, 0)]  # (map_id, x_offset, y_offset)

    while map_queue and len(processed_maps) < MAX_MAPS_TO_PROCESS:
        current_map_id, current_x_offset, current_y_offset = map_queue.pop(0)

        # Skip if already processed
        if current_map_id in processed_maps:
            continue

        # Update coordinates for all tiles in this map
        tiles_updated = update_map_coordinates(
            conn, current_map_id, current_x_offset, current_y_offset
        )

        # Mark this map as processed
        processed_maps.add(current_map_id)
        map_name = get_map_name(cursor, current_map_id)
        print(
            f"Processed map {current_map_id} ({map_name}) - Offset: ({current_x_offset}, {current_y_offset}) - {tiles_updated} tiles updated"
        )

        # Get all connections from this map
        cursor.execute(
            """
        SELECT north_connection, south_connection, west_connection, east_connection
        FROM maps
        WHERE id = ?
        """,
            (current_map_id,),
        )
        connections = cursor.fetchone()
        if not connections:
            continue

        north_connection, south_connection, west_connection, east_connection = (
            connections
        )

        # Get map dimensions
        map_width, map_height = get_map_dimensions(cursor, current_map_id)

        # Process north connection
        if north_connection and north_connection not in processed_maps:
            north_map_width, north_map_height = get_map_dimensions(
                cursor, north_connection
            )
            north_y_offset = current_y_offset - north_map_height * BLOCK_SIZE
            map_queue.append((north_connection, current_x_offset, north_y_offset))

        # Process south connection
        if south_connection and south_connection not in processed_maps:
            south_y_offset = current_y_offset + map_height * BLOCK_SIZE
            map_queue.append((south_connection, current_x_offset, south_y_offset))

        # Process west connection
        if west_connection and west_connection not in processed_maps:
            west_map_width, west_map_height = get_map_dimensions(
                cursor, west_connection
            )
            west_x_offset = current_x_offset - west_map_width * BLOCK_SIZE
            map_queue.append((west_connection, west_x_offset, current_y_offset))

        # Process east connection
        if east_connection and east_connection not in processed_maps:
            east_x_offset = current_x_offset + map_width * BLOCK_SIZE
            map_queue.append((east_connection, east_x_offset, current_y_offset))

    elapsed_time = time.time() - start_time
    print(
        f"\nProcessed {len(processed_maps)} maps out of maximum {MAX_MAPS_TO_PROCESS}"
    )
    return processed_maps


def main():
    """Main function"""
    # Connect to the database
    conn = sqlite3.connect("pokemon.db")
    cursor = conn.cursor()

    # Check if maps table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='maps'")
    if not cursor.fetchone():
        print("Error: 'maps' table not found in the database")
        conn.close()
        return

    # Set all coordinates to local coordinates initially
    cursor.execute(
        """
    UPDATE tiles
    SET x = local_x, y = local_y
    """
    )
    conn.commit()

    # Process map connections
    processed_maps = process_map_connections(conn)

    # Close the connection
    conn.close()

    print("\nMap coordinates updated successfully")


if __name__ == "__main__":
    main()
