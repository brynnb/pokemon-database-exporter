import sqlite3
import sys

DB_PATH = "pokemon.db"


def update_overworld_tiles():
    """Update tiles to mark them as overworld based on their zone's is_overworld flag"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Get all zones marked as overworld
    cursor.execute("SELECT id, name FROM zones WHERE is_overworld = 1")
    overworld_zones = cursor.fetchall()

    if not overworld_zones:
        print("No zones marked as overworld found in the database.")
        conn.close()
        return

    print(f"Found {len(overworld_zones)} zones marked as overworld:")
    for zone_id, zone_name in overworld_zones:
        print(f"  - Zone {zone_id}: {zone_name}")

    # Count tiles in overworld zones
    cursor.execute(
        """
        SELECT COUNT(*) FROM tiles 
        WHERE zone_id IN (SELECT id FROM zones WHERE is_overworld = 1)
        """
    )
    total_tiles = cursor.fetchone()[0]

    if total_tiles == 0:
        print("No tiles found in overworld zones.")
        conn.close()
        return

    print(f"Found {total_tiles} tiles in overworld zones.")

    # Update tiles to mark them as overworld
    cursor.execute(
        """
        UPDATE tiles 
        SET is_overworld = 1 
        WHERE zone_id IN (SELECT id FROM zones WHERE is_overworld = 1)
        """
    )

    # Commit the changes
    conn.commit()

    # Verify the update
    cursor.execute("SELECT COUNT(*) FROM tiles WHERE is_overworld = 1")
    updated_tiles = cursor.fetchone()[0]

    print(f"Updated {updated_tiles} tiles to be marked as overworld.")

    conn.close()


if __name__ == "__main__":
    update_overworld_tiles()
