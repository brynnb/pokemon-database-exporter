#!/usr/bin/env python3
"""
Web Tile Viewer

This script creates a web server that displays tiles from the database.
It uses Flask to serve the web pages and allows viewing different zones.

Usage:
    python web_tile_viewer.py
"""

import os
import sqlite3
import base64
from io import BytesIO
from PIL import Image
from flask import Flask, render_template, request, jsonify, send_file

# Constants
TILE_SIZE = 16  # Size of each tile in pixels
SCALE = 2  # Scale factor for display
DEFAULT_ZONE_ID = 15  # Default zone ID to display
DB_PATH = "../pokemon.db"  # Path to the database relative to this script

# Initialize Flask app with the correct template folder
app = Flask(__name__, template_folder="templates")


def get_zones():
    """Get a list of all zones"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT id, name FROM zones ORDER BY id
    """
    )

    zones = [{"id": zone_id, "name": name} for zone_id, name in cursor.fetchall()]

    conn.close()
    return zones


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


def get_tile_image(tile_image_id):
    """Get a specific tile image as base64 data"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT image_path FROM tile_images WHERE id = ?
    """,
        (tile_image_id,),
    )

    result = cursor.fetchone()
    conn.close()

    if not result:
        return None

    image_path = result[0]
    try:
        # Adjust the image path to be relative to the script location
        adjusted_path = os.path.join("..", image_path)
        img = Image.open(adjusted_path)
        img = img.resize((TILE_SIZE * SCALE, TILE_SIZE * SCALE), Image.NEAREST)

        # Convert to base64
        buffered = BytesIO()
        img.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode()
        return f"data:image/png;base64,{img_str}"
    except Exception as e:
        print(f"Error loading image {image_path}: {e}")
        return None


def generate_zone_image(zone_id):
    """Generate a complete image for a zone"""
    # Get zone info
    zone_info = get_zone_info(zone_id)

    # Load tiles for the zone
    tiles = load_tiles(zone_id)

    # Calculate the size of the map in pixels
    map_width = zone_info["width"] * TILE_SIZE * SCALE
    map_height = zone_info["height"] * TILE_SIZE * SCALE

    # Create a new image for the map
    map_image = Image.new("RGB", (map_width, map_height), (0, 0, 0))

    # Load and draw the tiles on the map image
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    for (x, y), tile_image_id in tiles.items():
        cursor.execute(
            """
            SELECT image_path FROM tile_images WHERE id = ?
        """,
            (tile_image_id,),
        )

        result = cursor.fetchone()
        if result:
            try:
                image_path = result[0]
                # Adjust the image path to be relative to the script location
                adjusted_path = os.path.join("..", image_path)
                img = Image.open(adjusted_path)
                img = img.resize((TILE_SIZE * SCALE, TILE_SIZE * SCALE), Image.NEAREST)

                # Calculate position relative to min_x and min_y
                rel_x = (x - zone_info["min_x"]) * TILE_SIZE * SCALE
                rel_y = (y - zone_info["min_y"]) * TILE_SIZE * SCALE
                map_image.paste(img, (rel_x, rel_y))
            except Exception as e:
                print(f"Error loading image {image_path}: {e}")

    conn.close()

    # Return the image as a BytesIO object
    img_io = BytesIO()
    map_image.save(img_io, "PNG")
    img_io.seek(0)
    return img_io


@app.route("/")
def index():
    """Main page"""
    zones = get_zones()
    return render_template("index.html", zones=zones, default_zone_id=DEFAULT_ZONE_ID)


@app.route("/zone/<int:zone_id>")
def zone_data(zone_id):
    """Get data for a specific zone"""
    zone_info = get_zone_info(zone_id)
    return jsonify(zone_info)


@app.route("/zone_image/<int:zone_id>")
def zone_image(zone_id):
    """Get the complete image for a zone"""
    img_io = generate_zone_image(zone_id)
    return send_file(img_io, mimetype="image/png")


@app.route("/tiles/<int:zone_id>")
def tiles_data(zone_id):
    """Get all tiles for a specific zone"""
    tiles = load_tiles(zone_id)

    # Convert dictionary keys to strings for JSON
    tiles_json = {f"{x},{y}": tile_id for (x, y), tile_id in tiles.items()}
    return jsonify(tiles_json)


@app.route("/tile_image/<int:tile_image_id>")
def tile_image(tile_image_id):
    """Get a specific tile image"""
    img_data = get_tile_image(tile_image_id)
    if img_data:
        return jsonify({"image": img_data})
    else:
        return jsonify({"error": "Image not found"}), 404


def create_templates():
    """Create the HTML templates for the web viewer"""
    os.makedirs("templates", exist_ok=True)

    # Create index.html
    with open("templates/index.html", "w") as f:
        f.write(
            """<!DOCTYPE html>
<html>
<head>
    <title>Pokemon Tile Viewer</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f0f0f0;
        }
        h1 {
            color: #333;
        }
        .container {
            display: flex;
            flex-direction: column;
            max-width: 1200px;
            margin: 0 auto;
        }
        .controls {
            background-color: #fff;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        select, button {
            padding: 8px;
            margin-right: 10px;
            border-radius: 4px;
            border: 1px solid #ccc;
        }
        button {
            background-color: #4CAF50;
            color: white;
            border: none;
            cursor: pointer;
        }
        button:hover {
            background-color: #45a049;
        }
        .map-container {
            position: relative;
            overflow: auto;
            background-color: #000;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            max-height: 600px;
        }
        .map-info {
            background-color: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 10px;
            position: absolute;
            top: 10px;
            left: 10px;
            border-radius: 5px;
            z-index: 10;
        }
        .loading {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 400px;
            font-size: 24px;
            color: white;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Pokemon Tile Viewer</h1>
        
        <div class="controls">
            <label for="zone-select">Select Zone:</label>
            <select id="zone-select">
                {% for zone in zones %}
                <option value="{{ zone.id }}" {% if zone.id == default_zone_id %}selected{% endif %}>
                    {{ zone.id }}: {{ zone.name }}
                </option>
                {% endfor %}
            </select>
            <button id="view-button">View Zone</button>
            <button id="download-button">Download Image</button>
        </div>
        
        <div class="map-container">
            <div class="map-info" id="map-info"></div>
            <div class="loading" id="loading">Loading...</div>
            <img id="map-image" style="display: none;">
        </div>
    </div>
    
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const zoneSelect = document.getElementById('zone-select');
            const viewButton = document.getElementById('view-button');
            const downloadButton = document.getElementById('download-button');
            const mapInfo = document.getElementById('map-info');
            const loading = document.getElementById('loading');
            const mapImage = document.getElementById('map-image');
            
            // Load the default zone
            loadZone({{ default_zone_id }});
            
            // Event listeners
            viewButton.addEventListener('click', function() {
                const zoneId = zoneSelect.value;
                loadZone(zoneId);
            });
            
            downloadButton.addEventListener('click', function() {
                const zoneId = zoneSelect.value;
                const zoneName = zoneSelect.options[zoneSelect.selectedIndex].text;
                downloadZoneImage(zoneId, zoneName);
            });
            
            function loadZone(zoneId) {
                loading.style.display = 'flex';
                mapImage.style.display = 'none';
                
                // Get zone info
                fetch(`/zone/${zoneId}`)
                    .then(response => response.json())
                    .then(zoneInfo => {
                        mapInfo.textContent = `Zone ${zoneId}: ${zoneInfo.name} - Size: ${zoneInfo.width}x${zoneInfo.height}`;
                        
                        // Load the zone image
                        mapImage.src = `/zone_image/${zoneId}?t=${new Date().getTime()}`;
                        mapImage.onload = function() {
                            loading.style.display = 'none';
                            mapImage.style.display = 'block';
                        };
                    })
                    .catch(error => {
                        console.error('Error loading zone:', error);
                        mapInfo.textContent = `Error loading zone ${zoneId}`;
                        loading.style.display = 'none';
                    });
            }
            
            function downloadZoneImage(zoneId, zoneName) {
                const link = document.createElement('a');
                link.href = `/zone_image/${zoneId}`;
                link.download = `zone_${zoneId}_${zoneName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        });
    </script>
</body>
</html>"""
        )


def main():
    # Create the templates
    create_templates()

    # Start the Flask app
    print("Starting web server...")
    print("Open http://127.0.0.1:5000 in your web browser")
    app.run(debug=True)


if __name__ == "__main__":
    main()
