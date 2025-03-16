const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");
const NPCMovementManager = require("./npcMovement");

const app = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Global reference to the NPC movement manager
let npcMovementManager = null;

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
  // console.log(`Sprite request for: ${spriteName}`);

  // Validate the sprite name to prevent directory traversal
  if (!spriteName || spriteName.includes("..") || spriteName.includes("/")) {
    console.error(`Invalid sprite name: ${spriteName}`);
    return res.status(400).send("Invalid sprite name");
  }

  // Construct the path to the sprite
  const spritePath = path.join(__dirname, "..", "sprites", spriteName);
  // console.log(`Looking for sprite at: ${spritePath}`);

  // Check if the file exists
  if (require("fs").existsSync(spritePath)) {
    // console.log(`Sprite found: ${spritePath}`);
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.sendFile(spritePath);
  } else {
    // Try lowercase version as fallback
    const lowercasePath = path.join(
      __dirname,
      "..",
      "sprites",
      spriteName.toLowerCase()
    );
    console.log(`Trying lowercase path: ${lowercasePath}`);

    if (require("fs").existsSync(lowercasePath)) {
      console.log(`Sprite found at lowercase path: ${lowercasePath}`);
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.sendFile(lowercasePath);
    }

    // List available sprites for debugging
    try {
      const fs = require("fs");
      const availableSprites = fs.readdirSync(
        path.join(__dirname, "..", "sprites")
      );
      // console.log(`Available sprites: ${availableSprites.join(", ")}`);
    } catch (err) {
      console.error(`Error listing sprites directory: ${err}`);
    }

    console.error(`Sprite not found: ${spriteName}`);
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

// API endpoint to get tiles for a specific map
app.get("/api/tiles/:mapId", (req, res) => {
  const mapId = req.params.mapId;
  db.all(
    "SELECT t.id, t.x, t.y, t.tile_image_id, t.local_x, t.local_y, t.map_id, m.name as map_name FROM tiles t JOIN maps m ON t.map_id = m.id WHERE t.map_id = ?",
    [mapId],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    }
  );
});

// API endpoint to get map info
app.get("/api/map-info/:mapId", (req, res) => {
  const mapId = req.params.mapId;
  db.get(
    "SELECT id, name, tileset_id, is_overworld FROM maps WHERE id = ?",
    [mapId],
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
    `SELECT o.id, o.x, o.y, o.map_id, o.item_id, i.name, i.short_name as description 
     FROM objects o
     JOIN items i ON o.item_id = i.id
     JOIN maps m ON o.map_id = m.id
     WHERE o.object_type = 'item' AND m.is_overworld = 1`,
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
    `SELECT o.id, o.x, o.y, o.map_id, o.sprite_name, o.name, o.action_type, o.action_direction 
     FROM objects o
     JOIN maps m ON o.map_id = m.id
     WHERE o.object_type = 'npc' AND m.is_overworld = 1 AND (o.action_type = 'STAY' OR o.action_type = 'WALK')`,
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

// API endpoint to get walking NPCs specifically
app.get("/api/walking-npcs", (req, res) => {
  db.all(
    `SELECT o.id, o.x, o.y, o.map_id, o.sprite_name, o.name, o.action_type, o.action_direction 
     FROM objects o
     JOIN maps m ON o.map_id = m.id
     WHERE o.object_type = 'npc' AND m.is_overworld = 1 AND o.action_type = 'WALK'`,
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

// API endpoint to get all current walking NPCs with their current positions
app.get("/api/walking-npcs/current", (req, res) => {
  if (npcMovementManager) {
    const npcs = npcMovementManager.getAllNPCs();
    if (npcs && npcs.length > 0) {
      res.json(npcs);
    } else {
      res.status(404).json({ error: "No walking NPCs found" });
    }
  } else {
    res.status(404).json({ error: "NPC movement manager not initialized" });
  }
});

// API endpoint to get a specific walking NPC by ID
app.get("/api/walking-npc/:id", (req, res) => {
  const npcId = parseInt(req.params.id);

  if (isNaN(npcId)) {
    return res.status(400).json({ error: "Invalid NPC ID" });
  }

  if (npcMovementManager) {
    const npc = npcMovementManager.getNPC(npcId);
    if (npc) {
      res.json(npc);
    } else {
      res.status(404).json({ error: `NPC with ID ${npcId} not found` });
    }
  } else {
    res.status(404).json({ error: "NPC movement manager not initialized" });
  }
});

// API endpoint to reset all walking NPCs to their original positions
app.post("/api/walking-npcs/reset", (req, res) => {
  if (npcMovementManager) {
    npcMovementManager.resetToOriginalPosition();
    res.json({
      success: true,
      message: "All NPCs reset to original positions",
    });
  } else {
    res.status(404).json({ error: "NPC movement manager not initialized" });
  }
});

// API endpoint to reset a specific walking NPC to its original position
app.post("/api/walking-npc/:id/reset", (req, res) => {
  const npcId = parseInt(req.params.id);

  if (isNaN(npcId)) {
    return res.status(400).json({ error: "Invalid NPC ID" });
  }

  if (npcMovementManager) {
    const success = npcMovementManager.resetNPCToOriginalPosition(npcId);
    if (success) {
      res.json({
        success: true,
        message: `NPC ${npcId} reset to original position`,
      });
    } else {
      res.status(404).json({
        error: `NPC with ID ${npcId} not found or could not be reset`,
      });
    }
  } else {
    res.status(404).json({ error: "NPC movement manager not initialized" });
  }
});

// For backward compatibility - redirect to the new endpoint
app.get("/api/walking-npc/current", (req, res) => {
  if (npcMovementManager) {
    const npcs = npcMovementManager.getAllNPCs();
    if (npcs && npcs.length > 0) {
      // Return the first NPC for backward compatibility
      res.json(npcs[0]);
    } else {
      res.status(404).json({ error: "No walking NPC found" });
    }
  } else {
    res.status(404).json({ error: "NPC movement manager not initialized" });
  }
});

// For backward compatibility - redirect to the new endpoint
app.post("/api/walking-npc/reset", (req, res) => {
  if (npcMovementManager) {
    npcMovementManager.resetToOriginalPosition();
    const npcs = npcMovementManager.getAllNPCs();
    res.json({
      success: true,
      npc: npcs && npcs.length > 0 ? npcs[0] : null,
      message: "All NPCs reset to original positions",
    });
  } else {
    res.status(404).json({ error: "No walking NPC found" });
  }
});

// API endpoint to get overworld maps
app.get("/api/overworld-maps", (req, res) => {
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
     JOIN maps m ON w.source_map_id = m.id
     WHERE w.x IS NOT NULL AND w.y IS NOT NULL AND m.is_overworld = 1`,
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

  // Initialize the NPC movement manager
  npcMovementManager = new NPCMovementManager(db, wss);
  npcMovementManager.initialize().catch((err) => {
    console.error("Failed to initialize NPC movement manager:", err);
  });
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
