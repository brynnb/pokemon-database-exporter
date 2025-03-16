const sqlite3 = require("sqlite3").verbose();
const WebSocket = require("ws");

// Constants for movement directions (based on the original Game Boy constants)
const DIRECTIONS = {
  UP: "UP",
  DOWN: "DOWN",
  LEFT: "LEFT",
  RIGHT: "RIGHT",
};

// Constants for movement types
const MOVEMENT_TYPES = {
  UP_DOWN: "UP_DOWN",
  LEFT_RIGHT: "LEFT_RIGHT",
  ANY_DIR: "ANY_DIR",
};

// Constants for sprite frames
const SPRITE_FRAMES = {
  DOWN: 0, // 0th frame for facing down
  UP: 1, // 1st frame for facing up
  LEFT: 2, // 2nd frame for facing left
  RIGHT: 2, // 2nd frame for facing right (mirrored)
  WALK_DOWN: 3, // 3rd frame for walking down
  WALK_UP: 4, // 4th frame for walking up
  WALK_LEFT: 5, // 5th frame for walking left
  WALK_RIGHT: 5, // 5th frame for walking right (mirrored)
};

// Class to manage walking NPCs
class NPCMovementManager {
  constructor(db, wss) {
    this.db = db;
    this.wss = wss;
    this.walkingNPC = null;
    this.walkAnimationCounter = 0;
    this.movementDelay = 0;
    this.isMoving = false;
    this.currentDirection = null;
    this.walkInterval = null;
    this.animationInterval = null;
    this.isAlternateFrame = false;

    // Store original position to reset if needed
    this.originalPosition = {
      x: null,
      y: null,
    };
  }

  // Initialize by finding the first walking NPC
  async initialize() {
    try {
      this.walkingNPC = await this.getFirstWalkingNPC();

      if (this.walkingNPC) {
        // Store the original position
        this.originalPosition = {
          x: this.walkingNPC.x,
          y: this.walkingNPC.y,
        };

        // Initialize sprite frame and flip properties
        this.walkingNPC.frame = SPRITE_FRAMES.DOWN;
        this.walkingNPC.flipX = false;

        console.log(
          `Found walking NPC: ${this.walkingNPC.name} at position (${this.walkingNPC.x}, ${this.walkingNPC.y})`
        );

        // Start the movement loop
        this.startMovementLoop();
        // Start the animation loop
        this.startAnimationLoop();
      } else {
        console.log(
          "No walking NPCs found in the database. Checking if we can create one..."
        );

        // Try to create a walking NPC
        const createdNPC = await this.createWalkingNPC();
        if (createdNPC) {
          this.walkingNPC = createdNPC;

          // Store the original position
          this.originalPosition = {
            x: this.walkingNPC.x,
            y: this.walkingNPC.y,
          };

          // Initialize sprite frame and flip properties
          this.walkingNPC.frame = SPRITE_FRAMES.DOWN;
          this.walkingNPC.flipX = false;

          console.log(
            `Created walking NPC: ${this.walkingNPC.name} at position (${this.walkingNPC.x}, ${this.walkingNPC.y})`
          );

          // Start the movement loop
          this.startMovementLoop();
          // Start the animation loop
          this.startAnimationLoop();
        } else {
          console.log("Could not create a walking NPC");
        }
      }
    } catch (error) {
      console.error("Error initializing NPC movement:", error);
    }
  }

  // Get the first NPC with action_type = 'WALK' from the database
  getFirstWalkingNPC() {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT o.id, o.x, o.y, o.map_id, o.sprite_name, o.name, o.action_type, o.action_direction 
         FROM objects o
         JOIN maps m ON o.map_id = m.id
         WHERE o.object_type = 'npc' AND m.is_overworld = 1 AND o.action_type = 'WALK'
         LIMIT 1`,
        [],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(row);
        }
      );
    });
  }

  // Start the movement loop for the NPC
  startMovementLoop() {
    // Clear any existing interval
    if (this.walkInterval) {
      clearInterval(this.walkInterval);
    }

    // Set up the movement loop (runs every 1 second)
    this.walkInterval = setInterval(() => {
      this.updateNPCMovement();
    }, 1000);

    console.log(`Started movement loop for NPC ${this.walkingNPC.name}`);
  }

  // Start the animation loop for the NPC
  startAnimationLoop() {
    // Clear any existing interval
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
    }

    // Set up the animation loop (runs every 250ms to alternate frames)
    this.animationInterval = setInterval(() => {
      if (this.isMoving && this.walkingNPC) {
        this.isAlternateFrame = !this.isAlternateFrame;
        this.updateNPCAnimation();
      }
    }, 250);

    console.log(`Started animation loop for NPC ${this.walkingNPC.name}`);
  }

  // Update the NPC's animation based on direction and movement state
  updateNPCAnimation() {
    if (!this.walkingNPC || !this.currentDirection) return;

    switch (this.currentDirection) {
      case DIRECTIONS.UP:
        this.walkingNPC.frame = this.isAlternateFrame
          ? SPRITE_FRAMES.WALK_UP
          : SPRITE_FRAMES.UP;
        this.walkingNPC.flipX = false;
        break;
      case DIRECTIONS.DOWN:
        this.walkingNPC.frame = this.isAlternateFrame
          ? SPRITE_FRAMES.WALK_DOWN
          : SPRITE_FRAMES.DOWN;
        this.walkingNPC.flipX = false;
        break;
      case DIRECTIONS.LEFT:
        this.walkingNPC.frame = this.isAlternateFrame
          ? SPRITE_FRAMES.WALK_LEFT
          : SPRITE_FRAMES.LEFT;
        this.walkingNPC.flipX = false;
        break;
      case DIRECTIONS.RIGHT:
        this.walkingNPC.frame = this.isAlternateFrame
          ? SPRITE_FRAMES.WALK_RIGHT
          : SPRITE_FRAMES.RIGHT;
        this.walkingNPC.flipX = true;
        break;
    }

    // Broadcast the animation update
    this.broadcastNPCUpdate();
  }

  // Update the NPC's movement
  async updateNPCMovement() {
    try {
      // If NPC is currently moving, don't start a new movement
      if (this.isMoving) {
        return;
      }

      // Determine if it's time to move
      if (this.movementDelay > 0) {
        this.movementDelay--;
        return;
      }

      // Determine direction based on action_direction
      const direction = this.determineMovementDirection();
      this.currentDirection = direction;

      // Set initial frame for the direction
      this.updateInitialFrameForDirection(direction);

      // Check if the NPC can move in that direction
      const canMove = await this.canMoveInDirection(direction);

      if (canMove) {
        // Set moving flag
        this.isMoving = true;

        // Update NPC position
        this.moveNPC(direction);

        // Set a random delay before the next movement (1-3 seconds)
        this.movementDelay = Math.floor(Math.random() * 3) + 1;

        // Reset moving flag after a short delay (simulating movement time)
        setTimeout(() => {
          this.isMoving = false;
        }, 500);
      } else {
        // Try again immediately with a different direction
        this.movementDelay = 0;
      }
    } catch (error) {
      console.error("Error updating NPC movement:", error);
    }
  }

  // Set the initial frame for a direction
  updateInitialFrameForDirection(direction) {
    if (!this.walkingNPC) return;

    switch (direction) {
      case DIRECTIONS.UP:
        this.walkingNPC.frame = SPRITE_FRAMES.UP;
        this.walkingNPC.flipX = false;
        break;
      case DIRECTIONS.DOWN:
        this.walkingNPC.frame = SPRITE_FRAMES.DOWN;
        this.walkingNPC.flipX = false;
        break;
      case DIRECTIONS.LEFT:
        this.walkingNPC.frame = SPRITE_FRAMES.LEFT;
        this.walkingNPC.flipX = false;
        break;
      case DIRECTIONS.RIGHT:
        this.walkingNPC.frame = SPRITE_FRAMES.RIGHT;
        this.walkingNPC.flipX = true;
        break;
    }

    // Broadcast the initial frame update
    this.broadcastNPCUpdate();
  }

  // Determine which direction the NPC should move based on action_direction
  determineMovementDirection() {
    const { action_direction } = this.walkingNPC;

    // If the NPC has a specific movement pattern
    if (action_direction === MOVEMENT_TYPES.UP_DOWN) {
      // Only move up or down
      return Math.random() < 0.5 ? DIRECTIONS.UP : DIRECTIONS.DOWN;
    } else if (action_direction === MOVEMENT_TYPES.LEFT_RIGHT) {
      // Only move left or right
      return Math.random() < 0.5 ? DIRECTIONS.LEFT : DIRECTIONS.RIGHT;
    } else {
      // Can move in any direction
      const directions = [
        DIRECTIONS.UP,
        DIRECTIONS.DOWN,
        DIRECTIONS.LEFT,
        DIRECTIONS.RIGHT,
      ];
      return directions[Math.floor(Math.random() * directions.length)];
    }
  }

  // Check if the NPC can move in the specified direction
  async canMoveInDirection(direction) {
    const { x, y, map_id } = this.walkingNPC;

    // Calculate the new position
    let newX = x;
    let newY = y;

    switch (direction) {
      case DIRECTIONS.UP:
        newY--;
        break;
      case DIRECTIONS.DOWN:
        newY++;
        break;
      case DIRECTIONS.LEFT:
        newX--;
        break;
      case DIRECTIONS.RIGHT:
        newX++;
        break;
    }

    // Check if the new position is walkable
    try {
      // Check if there's a tile at the new position
      const tile = await this.getTileAt(newX, newY, map_id);
      if (!tile) {
        return false;
      }

      // Check if there's a collision at the new position (like another NPC, item, etc.)
      const collision = await this.checkCollision(newX, newY, map_id);
      if (collision) {
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error checking if NPC can move:", error);
      return false;
    }
  }

  // Get the tile at a specific position
  getTileAt(x, y, mapId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT * FROM tiles WHERE x = ? AND y = ? AND map_id = ?",
        [x, y, mapId],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(row);
        }
      );
    });
  }

  // Check if there's a collision at a specific position
  checkCollision(x, y, mapId) {
    return new Promise((resolve, reject) => {
      // Check for NPCs, items, or other objects at this position
      this.db.get(
        `SELECT * FROM objects 
         WHERE x = ? AND y = ? AND map_id = ? AND id != ?`,
        [x, y, mapId, this.walkingNPC.id],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          // If there's an object at this position, there's a collision
          resolve(!!row);
        }
      );
    });
  }

  // Move the NPC in the specified direction (in memory only)
  moveNPC(direction) {
    const { id, x, y } = this.walkingNPC;

    // Calculate the new position
    let newX = x;
    let newY = y;

    switch (direction) {
      case DIRECTIONS.UP:
        newY--;
        break;
      case DIRECTIONS.DOWN:
        newY++;
        break;
      case DIRECTIONS.LEFT:
        newX--;
        break;
      case DIRECTIONS.RIGHT:
        newX++;
        break;
    }

    // Update the local NPC object (in memory only)
    this.walkingNPC.x = newX;
    this.walkingNPC.y = newY;

    console.log(`NPC ${this.walkingNPC.name} moved to (${newX}, ${newY})`);

    // Broadcast the update to all connected clients
    this.broadcastNPCUpdate();
  }

  // Broadcast the NPC update to all connected clients
  broadcastNPCUpdate() {
    const updateMessage = JSON.stringify({
      type: "npcUpdate",
      npc: {
        id: this.walkingNPC.id,
        x: this.walkingNPC.x,
        y: this.walkingNPC.y,
        sprite_name: this.walkingNPC.sprite_name,
        name: this.walkingNPC.name,
        map_id: this.walkingNPC.map_id,
        frame: this.walkingNPC.frame,
        flipX: this.walkingNPC.flipX,
      },
    });

    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(updateMessage);
      }
    });
  }

  // Reset NPC to original position (useful when restarting)
  resetToOriginalPosition() {
    if (this.walkingNPC && this.originalPosition.x !== null) {
      this.walkingNPC.x = this.originalPosition.x;
      this.walkingNPC.y = this.originalPosition.y;
      this.walkingNPC.frame = SPRITE_FRAMES.DOWN;
      this.walkingNPC.flipX = false;
      console.log(
        `Reset NPC ${this.walkingNPC.name} to original position (${this.originalPosition.x}, ${this.originalPosition.y})`
      );
    }
  }

  // Stop the movement loop
  stopMovementLoop() {
    if (this.walkInterval) {
      clearInterval(this.walkInterval);
      this.walkInterval = null;
      console.log(
        `Stopped movement loop for NPC ${this.walkingNPC?.name || "unknown"}`
      );
    }

    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
      console.log(
        `Stopped animation loop for NPC ${this.walkingNPC?.name || "unknown"}`
      );
    }
  }

  // Create a walking NPC by converting an existing STAY NPC to WALK
  async createWalkingNPC() {
    try {
      // Find a suitable NPC to convert (first STAY NPC in an overworld map)
      const npc = await this.findSuitableNPCToConvert();

      if (!npc) {
        console.log("No suitable NPCs found to convert to walking");
        return null;
      }

      // Update the NPC in the database to be a walking NPC
      await this.convertNPCToWalking(npc.id);

      // Get the updated NPC
      const updatedNPC = await this.getNPCById(npc.id);

      // Add frame and flipX properties
      updatedNPC.frame = SPRITE_FRAMES.DOWN;
      updatedNPC.flipX = false;

      return updatedNPC;
    } catch (error) {
      console.error("Error creating walking NPC:", error);
      return null;
    }
  }

  // Find a suitable NPC to convert to walking
  findSuitableNPCToConvert() {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT o.id, o.x, o.y, o.map_id, o.sprite_name, o.name, o.action_type, o.action_direction 
         FROM objects o
         JOIN maps m ON o.map_id = m.id
         WHERE o.object_type = 'npc' AND m.is_overworld = 1 AND o.action_type = 'STAY'
         LIMIT 1`,
        [],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(row);
        }
      );
    });
  }

  // Convert an NPC to a walking NPC
  convertNPCToWalking(npcId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "UPDATE objects SET action_type = 'WALK', action_direction = 'ANY_DIR' WHERE id = ?",
        [npcId],
        (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        }
      );
    });
  }

  // Get an NPC by ID
  getNPCById(npcId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT o.id, o.x, o.y, o.map_id, o.sprite_name, o.name, o.action_type, o.action_direction 
         FROM objects o
         JOIN maps m ON o.map_id = m.id
         WHERE o.id = ?`,
        [npcId],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(row);
        }
      );
    });
  }
}

module.exports = NPCMovementManager;
