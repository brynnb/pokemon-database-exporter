const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

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

  // Validate that tileId is a number
  if (isNaN(parseInt(tileId))) {
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
        // Fall back to the old calculation method if not in database
        const adjustedTileId = parseInt(tileId) - 1;
        const imagePath = path.join(
          __dirname,
          "..",
          "tile_images",
          `tile_${adjustedTileId}.png`
        );

        if (require("fs").existsSync(imagePath)) {
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

      // Convert the relative path to an absolute path
      const imagePath = path.join(__dirname, "..", dbImagePath);

      // Check if the file exists
      if (require("fs").existsSync(imagePath)) {
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.sendFile(imagePath);
      } else {
        // Try the calculated path as a fallback
        const adjustedTileId = parseInt(tileId) - 1;
        const calculatedPath = path.join(
          __dirname,
          "..",
          "tile_images",
          `tile_${adjustedTileId}.png`
        );

        if (require("fs").existsSync(calculatedPath)) {
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

// Add an endpoint to serve sprite images
app.get("/api/sprite/:name", (req, res) => {
  const spriteName = req.params.name;

  // Validate the sprite name to prevent directory traversal
  if (!spriteName || spriteName.includes("..") || spriteName.includes("/")) {
    return res.status(400).send("Invalid sprite name");
  }

  // Construct the path to the sprite
  const spritePath = path.join(__dirname, "..", "sprites", spriteName);

  // Check if the file exists
  if (require("fs").existsSync(spritePath)) {
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.sendFile(spritePath);
  } else {
    return res.status(404).send("Sprite not found");
  }
});

// Connect to the SQLite database
const db = new sqlite3.Database("../pokemon.db", (err) => {
  if (err) {
    console.error("Error connecting to the database:", err.message);
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
    "SELECT t.id, t.x, t.y, t.tile_image_id, t.local_x, t.local_y, t.zone_id, z.name as zone_name FROM tiles t JOIN zones z ON t.zone_id = z.id WHERE t.zone_id = ?",
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
    `SELECT o.id, o.x, o.y, o.zone_id, o.spriteset_id as sprite_id, o.name 
     FROM objects o
     JOIN zones z ON o.zone_id = z.id
     WHERE o.object_type = 'npc' AND z.is_overworld = 1`,
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

// API endpoint to get warps
app.get("/api/warps", (req, res) => {
  db.all(
    `SELECT w.id, w.source_zone_id as zone_id, w.x, w.y, 
            w.destination_zone_id, w.destination_map, w.destination_x, w.destination_y
     FROM warps w
     JOIN zones z ON w.source_zone_id = z.id
     WHERE w.x IS NOT NULL AND w.y IS NOT NULL AND z.is_overworld = 1`,
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

// WebSocket connection handler
wss.on("connection", (ws, req) => {
  console.log("New client connected");

  // Send initial connection message
  ws.send(
    JSON.stringify({ type: "connection", message: "Connected to server" })
  );

  // Handle client messages
  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);

      // Handle different message types if needed
      if (data.type === "subscribe") {
        // Client is subscribing to updates
        ws.send(
          JSON.stringify({
            type: "subscribed",
            message: "Subscribed to tile updates",
          })
        );
      }
    } catch (error) {
      console.error("Error processing message:", error);
    }
  });
});

// Set up the tile alternating test
let currentTileImageId = 19;
setInterval(() => {
  // Toggle between tile image 19 and 20
  currentTileImageId = currentTileImageId === 19 ? 20 : 19;

  // Update the tile in the database
  db.run(
    "UPDATE tiles SET tile_image_id = ? WHERE id = 341",
    [currentTileImageId],
    (err) => {
      if (err) {
        console.error("Error updating tile:", err);
        return;
      }

      // Broadcast the update to all connected clients
      const updateMessage = JSON.stringify({
        type: "tileUpdate",
        tileId: 341,
        newTileImageId: currentTileImageId,
      });

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(updateMessage);
        }
      });
    }
  );
}, 1000);

// Catch-all route to serve the main index.html for client-side routing
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle process termination
process.on("SIGINT", () => {
  db.close((err) => {
    if (err) {
      console.error("Error closing the database:", err.message);
    }
    process.exit(0);
  });
});
