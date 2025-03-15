#!/usr/bin/env python3
"""
Update Object Coordinates

This script updates the global coordinates (x, y) of objects in the database
based on their local coordinates (local_x, local_y) and the position of their map.

Coordinate System:
- For Pallet Town (map_id = 0), global coordinates are the same as local coordinates.
- For other overworld maps (is_overworld = 1), global coordinates are calculated by adding
  the map's offset to the local coordinates. The map's offset is determined by traversing
  the map connections starting from Pallet Town.
- For non-overworld maps (is_overworld = 0), global coordinates are the same as
  local coordinates.

This ensures that objects in the overworld have consistent global coordinates
that match the global coordinate system of the tiles.
"""

import sqlite3
import time


def get_map_positions(cursor):
    """Get the positions of all maps by traversing map connections from Pallet Town"""
    try:
        # Get all maps
        cursor.execute("SELECT id, name, is_overworld FROM maps")
        maps = {
            row[0]: {"name": row[1], "is_overworld": row[2]}
            for row in cursor.fetchall()
        }

        # Initialize map positions with Pallet Town as the reference point (0,0)
        map_positions = {0: (0, 0)}  # Pallet Town is the reference point

        # Get all map connections
        cursor.execute(
            """
            SELECT from_map_id, to_map_id, direction, offset
            FROM map_connections
        """
        )
        connections = cursor.fetchall()

        # Build a graph of map connections
        graph = {}
        for source, dest, direction, offset in connections:
            if source not in graph:
                graph[source] = []
            if dest not in graph:
                graph[dest] = []

            # Add bidirectional connections
            graph[source].append((dest, direction, offset))

            # Add reverse connection with opposite direction and negative offset
            reverse_direction = {
                "north": "south",
                "south": "north",
                "east": "west",
                "west": "east",
            }.get(direction)

            if reverse_direction:
                graph[dest].append((source, reverse_direction, -offset))

        # Traverse the graph starting from Pallet Town (map_id = 0)
        visited = set()

        def traverse(map_id, x_offset, y_offset):
            if map_id in visited:
                return

            visited.add(map_id)
            map_positions[map_id] = (x_offset, y_offset)

            if map_id not in graph:
                return

            for neighbor, direction, offset in graph[map_id]:
                if neighbor in visited:
                    continue

                # Calculate new offsets based on direction
                new_x_offset, new_y_offset = x_offset, y_offset

                if direction == "north":
                    new_y_offset -= offset
                elif direction == "south":
                    new_y_offset += offset
                elif direction == "east":
                    new_x_offset += offset
                elif direction == "west":
                    new_x_offset -= offset

                traverse(neighbor, new_x_offset, new_y_offset)

        # Start traversal from Pallet Town
        traverse(0, 0, 0)

        # For maps not connected to Pallet Town, use their (0,0) tile position if available
        for map_id in maps:
            if map_id not in map_positions and maps[map_id]["is_overworld"] == 1:
                try:
                    cursor.execute(
                        """
                        SELECT x, y
                        FROM tiles
                        WHERE map_id = ? AND local_x = 0 AND local_y = 0
                        LIMIT 1
                    """,
                        (map_id,),
                    )
                    result = cursor.fetchone()
                    if result:
                        map_positions[map_id] = (result[0], result[1])
                    else:
                        print(
                            f"Warning: Could not determine position for map {map_id} ({maps[map_id]['name']})"
                        )
                except sqlite3.OperationalError as e:
                    print(f"Warning: {e}")

        # Print the map positions for debugging
        print("Map positions:")
        for map_id, position in sorted(map_positions.items()):
            if map_id in maps:
                print(f"  {map_id} ({maps[map_id]['name']}): {position}")
            else:
                print(f"  {map_id}: {position}")

        return map_positions
    except sqlite3.OperationalError as e:
        print(f"Warning: {e}")
        print(
            "Warning: Could not retrieve map positions. Using simple coordinate mapping."
        )
        return {0: (0, 0)}  # Fallback to just Pallet Town


def update_object_coordinates(conn):
    """Update the global coordinates of objects based on their map's position"""
    cursor = conn.cursor()

    # Get map positions for overworld maps
    map_positions = get_map_positions(cursor)

    total_updated = 0

    # Check if objects table uses map_id or zone_id
    try:
        cursor.execute("PRAGMA table_info(objects)")
        columns = [column[1] for column in cursor.fetchall()]

        if "map_id" in columns:
            id_column = "map_id"
        elif "zone_id" in columns:
            id_column = "zone_id"
        else:
            print("Warning: Objects table has neither map_id nor zone_id column")
            return 0

        print(f"Objects table uses {id_column} column")

        # Update object coordinates for overworld maps
        for map_id, (offset_x, offset_y) in map_positions.items():
            try:
                cursor.execute(
                    f"""
                    UPDATE objects
                    SET x = local_x + ?,
                        y = local_y + ?
                    WHERE {id_column} = ?
                    """,
                    (offset_x, offset_y, map_id),
                )
                rows_updated = cursor.rowcount
                total_updated += rows_updated
                print(
                    f"Updated {rows_updated} objects for {id_column}={map_id} with offset ({offset_x}, {offset_y})"
                )
            except sqlite3.OperationalError as e:
                print(f"Warning: {e}")
                # Continue with other updates

        # For non-overworld maps, set global coordinates equal to local coordinates
        try:
            cursor.execute(
                f"""
                UPDATE objects
                SET x = local_x,
                    y = local_y
                WHERE {id_column} IN (
                    SELECT id FROM maps WHERE is_overworld = 0
                )
                """
            )
            rows_updated = cursor.rowcount
            total_updated += rows_updated
            print(f"Updated {rows_updated} objects for non-overworld maps")
        except sqlite3.OperationalError as e:
            print(f"Warning: {e}")
    except sqlite3.OperationalError as e:
        print(f"Warning: Could not update objects table: {e}")
        # Simplified approach: Set global coordinates equal to local coordinates for all objects
        try:
            cursor.execute(
                """
                UPDATE objects
                SET x = local_x,
                    y = local_y
                """
            )
            total_updated += cursor.rowcount
        except sqlite3.OperationalError as e:
            print(
                f"Warning: Could not update objects table with simplified approach: {e}"
            )

    # Also update tiles table if it exists
    try:
        for map_id, (offset_x, offset_y) in map_positions.items():
            cursor.execute(
                """
                UPDATE tiles
                SET x = local_x + ?,
                    y = local_y + ?
                WHERE map_id = ?
                """,
                (offset_x, offset_y, map_id),
            )
            rows_updated = cursor.rowcount
            print(
                f"Updated {rows_updated} tiles for map {map_id} with offset ({offset_x}, {offset_y})"
            )
            total_updated += rows_updated
    except sqlite3.OperationalError as e:
        print(f"Warning: Could not update tiles table: {e}")

    conn.commit()
    return total_updated


def main():
    """Main function"""
    # Connect to the database
    conn = sqlite3.connect("../pokemon.db")

    # Update object coordinates
    updated_count = update_object_coordinates(conn)

    # Close the connection
    conn.close()

    print(f"Successfully updated coordinates for {updated_count} objects and tiles")


if __name__ == "__main__":
    main()
