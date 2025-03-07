#!/usr/bin/env python3
"""
Update Zone Coordinates

This script updates the coordinates of overworld zones to be relative to Pallet Town.
It starts with Pallet Town (zone_id 1) at coordinates (0,0) and recursively updates
connected zones based on their map connections.

Coordinate System:
- Pallet Town's top-left tile is at (0,0)
- For zones to the north, y coordinates are negative with no overlap
  (e.g., Route 1's bottom row is at y=-1, its top row is at y=-36)
- For zones further north (like Viridian City), coordinates continue to decrease
  (e.g., Viridian City's bottom row is at y=-37, just above Route 1's top row)
- For zones to the south, y coordinates are positive and start at Pallet Town's height
- For zones to the west, x coordinates are negative with no overlap
- For zones to the east, x coordinates are positive and start at Pallet Town's width

This ensures there's no overlap between adjacent zones.

For now, it processes zone IDs 1 (Pallet Town), 13 (Route 1), and 2 (Viridian City).

Usage:
    python update_zone_coordinates.py
"""

import sqlite3
import time

# Constants
PALLET_TOWN_ZONE_ID = 1
ROUTE_1_ZONE_ID = 13
VIRIDIAN_CITY_ZONE_ID = 2
BLOCK_SIZE = 2  # Each block is 2x2 tiles

# Map name mappings between zones table and map_connections table
MAP_NAME_MAPPINGS = {
    "PalletTown": "PALLET_TOWN",
    "Route1": "ROUTE_1",
    "ViridianCity": "VIRIDIAN_CITY",
}

# Zones to process
ZONES_TO_PROCESS = [PALLET_TOWN_ZONE_ID, ROUTE_1_ZONE_ID, VIRIDIAN_CITY_ZONE_ID]


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


def process_zone_connections(conn):
    """Process zone connections for the specified zones"""
    cursor = conn.cursor()
    processed_zones = set()
    zone_queue = [(PALLET_TOWN_ZONE_ID, 0, 0)]  # (zone_id, x_offset, y_offset)

    while zone_queue:
        current_zone_id, current_x_offset, current_y_offset = zone_queue.pop(0)

        if (
            current_zone_id in processed_zones
            or current_zone_id not in ZONES_TO_PROCESS
        ):
            continue

        # First, reset the zone to its original position (0,0)
        cursor.execute(
            "SELECT MIN(x), MIN(y) FROM tiles WHERE zone_id = ?", (current_zone_id,)
        )
        min_x, min_y = cursor.fetchone()

        # Reset to (0,0)
        update_zone_coordinates(conn, current_zone_id, -min_x, -min_y)

        # Then apply the calculated offsets
        updated_tiles = update_zone_coordinates(
            conn, current_zone_id, current_x_offset, current_y_offset
        )
        zone_name = get_zone_name(cursor, current_zone_id)
        print(
            f"Updated {updated_tiles} tiles for {zone_name} (zone_id {current_zone_id}) with offsets ({current_x_offset}, {current_y_offset})"
        )

        # Mark this zone as processed
        processed_zones.add(current_zone_id)

        # Get the map name for this zone
        current_map_name = MAP_NAME_MAPPINGS.get(zone_name, zone_name)

        # Find all connections from this map
        cursor.execute(
            """
            SELECT to_map_id, direction, offset
            FROM map_connections
            WHERE from_map_id = ?
            """,
            (current_map_name,),
        )
        outgoing_connections = cursor.fetchall()

        # Find all connections to this map
        cursor.execute(
            """
            SELECT from_map_id, direction, offset
            FROM map_connections
            WHERE to_map_id = ?
            """,
            (current_map_name,),
        )
        incoming_connections = cursor.fetchall()

        # Process all connections
        for connections in [outgoing_connections, incoming_connections]:
            for connected_map_name, direction, offset in connections:
                # Get the zone ID for the connected map
                connected_zone_id = get_zone_id_by_map_name(cursor, connected_map_name)

                if (
                    not connected_zone_id
                    or connected_zone_id in processed_zones
                    or connected_zone_id not in ZONES_TO_PROCESS
                ):
                    continue

                # Calculate new offsets
                if connected_map_name == current_map_name:
                    # This is a reverse connection
                    if direction == "north":
                        direction = "south"
                    elif direction == "south":
                        direction = "north"
                    elif direction == "east":
                        direction = "west"
                    elif direction == "west":
                        direction = "east"

                x_offset, y_offset = calculate_zone_offset(
                    cursor, current_zone_id, connected_zone_id, direction, offset
                )

                # Add the connected zone to the queue with the calculated offsets
                new_x_offset = current_x_offset + x_offset
                new_y_offset = current_y_offset + y_offset
                zone_queue.append((connected_zone_id, new_x_offset, new_y_offset))


def main():
    """Main function"""
    start_time = time.time()

    # Connect to the database
    conn = sqlite3.connect("pokemon.db")
    cursor = conn.cursor()

    try:
        # Process zone connections
        process_zone_connections(conn)

        # Verify the results
        for zone_id in ZONES_TO_PROCESS:
            cursor.execute(
                "SELECT MIN(x), MAX(x), MIN(y), MAX(y) FROM tiles WHERE zone_id = ?",
                (zone_id,),
            )
            coords = cursor.fetchone()
            zone_name = get_zone_name(cursor, zone_id)
            print(
                f"{zone_name} coordinates: x={coords[0]} to {coords[1]}, y={coords[2]} to {coords[3]}"
            )

        elapsed_time = time.time() - start_time
        print(f"\nTotal time: {elapsed_time:.2f} seconds")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
