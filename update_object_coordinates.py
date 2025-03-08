#!/usr/bin/env python3
"""
Update Object Coordinates

This script updates the global coordinates (x, y) of objects in the database
based on their local coordinates (local_x, local_y) and the position of their zone.

Coordinate System:
- For overworld zones (is_overworld = 1), global coordinates are calculated by adding
  the zone's offset to the local coordinates. The zone's offset is determined by the
  global coordinates of the (0,0) local coordinates in that zone.
- For non-overworld zones (is_overworld = 0), global coordinates are the same as
  local coordinates.

This ensures that objects in the overworld have consistent global coordinates
that match the global coordinate system of the tiles.
"""

import sqlite3
import time


def get_zone_positions(cursor):
    """Get the positions of all zones"""
    # For overworld zones, get the global coordinates of the (0,0) local coordinates
    cursor.execute(
        """
        SELECT z.id, t.x, t.y
        FROM zones z
        JOIN tiles t ON z.id = t.zone_id
        WHERE z.is_overworld = 1 AND t.local_x = 0 AND t.local_y = 0
        GROUP BY z.id
        """
    )
    return {zone_id: (x, y) for zone_id, x, y in cursor.fetchall()}


def update_object_coordinates(conn):
    """Update the global coordinates of objects based on their zone's position"""
    cursor = conn.cursor()

    # Get zone positions for overworld zones
    zone_positions = get_zone_positions(cursor)

    # Update object coordinates for overworld zones
    total_updated = 0
    for zone_id, (offset_x, offset_y) in zone_positions.items():
        cursor.execute(
            """
            UPDATE objects
            SET x = local_x + ?,
                y = local_y + ?
            WHERE zone_id = ?
            """,
            (offset_x, offset_y, zone_id),
        )
        total_updated += cursor.rowcount

    # For non-overworld zones, set global coordinates equal to local coordinates
    cursor.execute(
        """
        UPDATE objects
        SET x = local_x,
            y = local_y
        WHERE zone_id IN (
            SELECT id FROM zones WHERE is_overworld = 0
        )
        """
    )
    total_updated += cursor.rowcount

    conn.commit()
    return total_updated


def main():
    """Main function"""
    # Connect to the database
    conn = sqlite3.connect("pokemon.db")

    # Update object coordinates
    updated_count = update_object_coordinates(conn)

    # Close the connection
    conn.close()

    print(f"Successfully updated coordinates for {updated_count} objects")


if __name__ == "__main__":
    main()
