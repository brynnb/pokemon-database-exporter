const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());

// Serve static files from the 'dist' directory
app.use(express.static(path.join(__dirname, ".")));

// Remove direct access to parent directory
// app.use(express.static(path.join(__dirname, "..")));

// Remove direct access to tile_images directory
// app.use("/tile_images", express.static(path.join(__dirname, "../tile_images")));

// Add a specific endpoint to get a tile image by ID
app.get("/api/tile-image/:id", (req, res) => {
  const tileId = req.params.id;

  // Add detailed logging for debugging
  console.log(`Tile image request for ID: ${tileId}`);

  // Validate that tileId is a number
  if (isNaN(parseInt(tileId))) {
    console.log(`Invalid tile ID: ${tileId}`);
    return res.status(400).send("Invalid tile ID");
  }

  // Get the image path from the database instead of calculating it
  db.get(
    "SELECT image_path FROM tile_images WHERE id = ?",
    [tileId],
    (err, row) => {
      if (err) {
        console.error(`Database error for tile ${tileId}:`, err);
        return res.status(500).send("Database error");
      }

      if (!row) {
        console.log(`Tile ID ${tileId} not found in database`);

        // Fall back to the old calculation method if not in database
        const adjustedTileId = parseInt(tileId) - 1;
        const imagePath = path.join(
          __dirname,
          "..",
          "tile_images",
          `tile_${adjustedTileId}.png`
        );

        if (require("fs").existsSync(imagePath)) {
          console.log(`Serving calculated tile image: ${imagePath}`);
          res.setHeader("Cache-Control", "public, max-age=86400");
          return res.sendFile(imagePath);
        }

        // If all else fails, send the fallback image
        const fallbackPath = path.join(
          __dirname,
          "..",
          "tile_images",
          "tile_0.png"
        );
        if (require("fs").existsSync(fallbackPath)) {
          return res.sendFile(fallbackPath);
        } else {
          return res.status(404).send("Tile image not found");
        }
      }

      // Get the image path from the database
      const dbImagePath = row.image_path;
      console.log(`Database image path for tile ${tileId}: ${dbImagePath}`);

      // Convert the relative path to an absolute path
      const imagePath = path.join(__dirname, "..", dbImagePath);
      console.log(`Absolute image path: ${imagePath}`);

      // Check if the file exists
      if (require("fs").existsSync(imagePath)) {
        console.log(`Serving tile image from database path: ${imagePath}`);
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.sendFile(imagePath);
      } else {
        console.log(`Tile image not found at database path: ${imagePath}`);

        // Try the calculated path as a fallback
        const adjustedTileId = parseInt(tileId) - 1;
        const calculatedPath = path.join(
          __dirname,
          "..",
          "tile_images",
          `tile_${adjustedTileId}.png`
        );

        if (require("fs").existsSync(calculatedPath)) {
          console.log(`Serving calculated tile image: ${calculatedPath}`);
          res.setHeader("Cache-Control", "public, max-age=86400");
          return res.sendFile(calculatedPath);
        }

        // If all else fails, send the fallback image
        const fallbackPath = path.join(
          __dirname,
          "..",
          "tile_images",
          "tile_0.png"
        );
        if (require("fs").existsSync(fallbackPath)) {
          return res.sendFile(fallbackPath);
        } else {
          return res.status(404).send("Tile image not found");
        }
      }
    }
  );
});

// Connect to the SQLite database
const db = new sqlite3.Database("../pokemon.db", (err) => {
  if (err) {
    console.error("Error connecting to the database:", err.message);
  } else {
    console.log("Connected to the SQLite database.");
  }
});

// API endpoint to get tile images
app.get("/api/tile-images", (req, res) => {
  db.all("SELECT id, image_path FROM tile_images", [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// API endpoint to get tiles for a specific zone
app.get("/api/tiles/:zoneId", (req, res) => {
  const zoneId = req.params.zoneId;
  db.all(
    "SELECT x, y, tile_image_id, local_x, local_y FROM tiles WHERE zone_id = ?",
    [zoneId],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    }
  );
});

// API endpoint to get zone info
app.get("/api/zone-info/:zoneId", (req, res) => {
  const zoneId = req.params.zoneId;
  db.get(
    "SELECT id, name, tileset_id, is_overworld FROM zones WHERE id = ?",
    [zoneId],
    (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(row);
    }
  );
});

// API endpoint to get items
app.get("/api/items", (req, res) => {
  db.all(
    `SELECT o.id, o.x, o.y, o.zone_id, o.item_id, i.name, i.short_name as description 
     FROM objects o
     JOIN items i ON o.item_id = i.id
     JOIN zones z ON o.zone_id = z.id
     WHERE o.object_type = 'item' AND z.is_overworld = 1`,
    [],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    }
  );
});

// API endpoint to get NPCs
app.get("/api/npcs", (req, res) => {
  db.all(
    `SELECT n.id, n.x, n.y, n.zone_id, n.sprite_id, n.name 
     FROM npcs n
     JOIN zones z ON n.zone_id = z.id
     WHERE z.is_overworld = 1`,
    [],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    }
  );
});

// API endpoint to get overworld zones
app.get("/api/overworld-zones", (req, res) => {
  db.all(
    "SELECT id, name FROM zones WHERE is_overworld = 1",
    [],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    }
  );
});

// Catch-all route to serve the main index.html for client-side routing
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle process termination
process.on("SIGINT", () => {
  db.close((err) => {
    if (err) {
      console.error("Error closing the database:", err.message);
    } else {
      console.log("Database connection closed.");
    }
    process.exit(0);
  });
});
