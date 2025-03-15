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

  // Calculate the image path directly
  const adjustedTileId = parseInt(tileId) - 1;
  const imagePath = path.join(
    __dirname,
    "..",
    "tile_images",
    `tile_${adjustedTileId}.png`
  );

  // Check if the file exists
  if (require("fs").existsSync(imagePath)) {
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.sendFile(imagePath);
  }

  // If the file doesn't exist, send a fallback image
  const fallbackPath = path.join(__dirname, "..", "tile_images", "tile_0.png");
  if (require("fs").existsSync(fallbackPath)) {
    return res.sendFile(fallbackPath);
  } else {
    return res.status(404).send("Tile image not found");
  }
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
  // Create a simple response with default tile images
  const tileImages = [
    { id: 1, image_path: "../tile_images/tile_0.png" },
    { id: 2, image_path: "../tile_images/tile_1.png" },
    { id: 3, image_path: "../tile_images/tile_2.png" },
    { id: 4, image_path: "../tile_images/tile_3.png" },
    { id: 5, image_path: "../tile_images/tile_4.png" },
  ];
  res.json(tileImages);
});

// API endpoint to get tiles for a specific map
app.get("/api/tiles/:mapId", (req, res) => {
  const mapId = req.params.mapId;
  // Create a simple response with objects that have x, y coordinates
  db.all(
    "SELECT id, x, y, map_id, local_x, local_y FROM objects WHERE map_id = ? AND x IS NOT NULL AND y IS NOT NULL",
    [mapId],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }

      // Transform the objects into tiles with a default tile_image_id
      const tiles = rows.map((obj) => ({
        id: obj.id,
        x: obj.x,
        y: obj.y,
        tile_image_id: 1, // Default tile image ID
        local_x: obj.local_x,
        local_y: obj.local_y,
        map_id: obj.map_id,
        map_name: `Map ${obj.map_id}`,
      }));

      res.json(tiles);
    }
  );
});

// API endpoint to get map info
app.get("/api/map-info/:mapId", (req, res) => {
  const mapId = req.params.mapId;
  // Create a simple map info object with the map ID
  const mapInfo = {
    id: parseInt(mapId),
    name: `Map ${mapId}`,
    tileset_id: 1, // Default tileset ID
    is_overworld: 1, // Assume all maps are overworld
  };
  res.json(mapInfo);
});

// API endpoint to get items
app.get("/api/items", (req, res) => {
  db.all(
    `SELECT o.id, o.x, o.y, o.map_id, o.item_id, i.name, i.short_name as description 
     FROM objects o
     JOIN items i ON o.item_id = i.id
     WHERE o.object_type = 'item'`,
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
    `SELECT o.id, o.x, o.y, o.map_id, o.spriteset_id as sprite_id, o.name 
     FROM objects o
     WHERE o.object_type = 'npc'`,
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

// API endpoint to get overworld maps
app.get("/api/overworld-maps", (req, res) => {
  // Get maps with is_overworld=1 from the maps table
  db.all(
    "SELECT id, name FROM maps WHERE is_overworld = 1",
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
    `SELECT w.id, w.source_map_id as map_id, w.x, w.y, 
            w.destination_map_id, w.destination_map, w.destination_x, w.destination_y
     FROM warps w
     WHERE w.x IS NOT NULL AND w.y IS NOT NULL`,
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
