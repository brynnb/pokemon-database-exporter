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
    this.walkingNPCs = []; // Array to store all walking NPCs
    this.npcStates = new Map(); // Map to store state for each NPC by ID
    this.walkInterval = null;
    this.animationInterval = null;
  }

  // Initialize by finding all walking NPCs
  async initialize() {
    try {
      // Get all walking NPCs from the database
      this.walkingNPCs = await this.getAllWalkingNPCs();

      if (this.walkingNPCs.length > 0) {
        console.log(`Found ${this.walkingNPCs.length} walking NPCs`);

        // Initialize state for each NPC
        this.walkingNPCs.forEach((npc) => {
          this.initializeNPCState(npc);
        });

        // Start the movement and animation loops
        this.startMovementLoop();
        this.startAnimationLoop();
      } else {
        console.log(
          "No walking NPCs found in the database. Checking if we can create one..."
        );

        // Try to create a walking NPC
        const createdNPC = await this.createWalkingNPC();
        if (createdNPC) {
          this.walkingNPCs.push(createdNPC);
          this.initializeNPCState(createdNPC);

          console.log(
            `Created walking NPC: ${createdNPC.name} at position (${createdNPC.x}, ${createdNPC.y})`
          );

          // Start the movement and animation loops
          this.startMovementLoop();
          this.startAnimationLoop();
        } else {
          console.log("Could not create a walking NPC");
        }
      }
    } catch (error) {
      console.error("Error initializing NPC movement:", error);
    }
  }

  // Initialize state for a single NPC
  initializeNPCState(npc) {
    // Store the original position and initialize state
    this.npcStates.set(npc.id, {
      originalPosition: { x: npc.x, y: npc.y },
      isMoving: false,
      movementDelay: Math.floor(Math.random() * 3), // Random initial delay
      currentDirection: null,
      isAlternateFrame: false,
      walkAnimationCounter: 0,
    });

    // Initialize sprite frame and flip properties
    npc.frame = SPRITE_FRAMES.DOWN;
    npc.flipX = false;

    console.log(
      `Initialized NPC: ${npc.name} at position (${npc.x}, ${npc.y})`
    );
  }

  // Get all NPCs with action_type = 'WALK' from the database
  getAllWalkingNPCs() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT o.id, o.x, o.y, o.map_id, o.sprite_name, o.name, o.action_type, o.action_direction 
         FROM objects o
         JOIN maps m ON o.map_id = m.id
         WHERE o.object_type = 'npc' AND m.is_overworld = 1 AND o.action_type = 'WALK'`,
        [],
        (err, rows) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(rows || []);
        }
      );
    });
  }

  // Start the movement loop for all NPCs
  startMovementLoop() {
    // Clear any existing interval
    if (this.walkInterval) {
      clearInterval(this.walkInterval);
    }

    // Set up the movement loop (runs every 1 second)
    this.walkInterval = setInterval(() => {
      this.updateAllNPCMovements();
    }, 1000);

    // console.log(`Started movement loop for ${this.walkingNPCs.length} NPCs`);
  }

  // Start the animation loop for all NPCs
  startAnimationLoop() {
    // Clear any existing interval
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
    }

    // Set up the animation loop (runs every 250ms to alternate frames)
    this.animationInterval = setInterval(() => {
      this.updateAllNPCAnimations();
    }, 250);

    // console.log(`Started animation loop for ${this.walkingNPCs.length} NPCs`);
  }

  // Update animations for all NPCs
  updateAllNPCAnimations() {
    this.walkingNPCs.forEach((npc) => {
      const state = this.npcStates.get(npc.id);
      if (state && state.isMoving && state.currentDirection) {
        state.isAlternateFrame = !state.isAlternateFrame;
        this.updateNPCAnimation(npc, state);
      }
    });
  }

  // Update the NPC's animation based on direction and movement state
  updateNPCAnimation(npc, state) {
    if (!state.currentDirection) return;

    switch (state.currentDirection) {
      case DIRECTIONS.UP:
        npc.frame = state.isAlternateFrame
          ? SPRITE_FRAMES.WALK_UP
          : SPRITE_FRAMES.UP;
        npc.flipX = false;
        break;
      case DIRECTIONS.DOWN:
        npc.frame = state.isAlternateFrame
          ? SPRITE_FRAMES.WALK_DOWN
          : SPRITE_FRAMES.DOWN;
        npc.flipX = false;
        break;
      case DIRECTIONS.LEFT:
        npc.frame = state.isAlternateFrame
          ? SPRITE_FRAMES.WALK_LEFT
          : SPRITE_FRAMES.LEFT;
        npc.flipX = false;
        break;
      case DIRECTIONS.RIGHT:
        npc.frame = state.isAlternateFrame
          ? SPRITE_FRAMES.WALK_RIGHT
          : SPRITE_FRAMES.RIGHT;
        npc.flipX = true;
        break;
    }

    // Broadcast the animation update
    this.broadcastNPCUpdate(npc);
  }

  // Update movement for all NPCs
  updateAllNPCMovements() {
    // Process each NPC independently
    this.walkingNPCs.forEach((npc) => {
      this.updateSingleNPCMovement(npc);
    });
  }

  // Update a single NPC's movement
  async updateSingleNPCMovement(npc) {
    try {
      const state = this.npcStates.get(npc.id);
      if (!state) return;

      // If NPC is currently moving, don't start a new movement
      if (state.isMoving) {
        return;
      }

      // Determine if it's time to move
      if (state.movementDelay > 0) {
        state.movementDelay--;
        return;
      }

      // Determine direction based on action_direction
      const direction = this.determineMovementDirection(npc);
      state.currentDirection = direction;

      // Set initial frame for the direction
      this.updateInitialFrameForDirection(npc, direction);

      // Check if the NPC can move in that direction
      const canMove = await this.canMoveInDirection(npc, direction);

      if (canMove) {
        // Set moving flag
        state.isMoving = true;

        // Update NPC position
        this.moveNPC(npc, direction);

        // Set a random delay before the next movement (1-3 seconds)
        state.movementDelay = Math.floor(Math.random() * 3) + 1;

        // Reset moving flag after a short delay (simulating movement time)
        setTimeout(() => {
          const currentState = this.npcStates.get(npc.id);
          if (currentState) {
            currentState.isMoving = false;
          }
        }, 500);
      } else {
        // Try again immediately with a different direction
        state.movementDelay = 0;
      }
    } catch (error) {
      console.error(`Error updating NPC ${npc.id} movement:`, error);
    }
  }

  // Set the initial frame for a direction
  updateInitialFrameForDirection(npc, direction) {
    switch (direction) {
      case DIRECTIONS.UP:
        npc.frame = SPRITE_FRAMES.UP;
        npc.flipX = false;
        break;
      case DIRECTIONS.DOWN:
        npc.frame = SPRITE_FRAMES.DOWN;
        npc.flipX = false;
        break;
      case DIRECTIONS.LEFT:
        npc.frame = SPRITE_FRAMES.LEFT;
        npc.flipX = false;
        break;
      case DIRECTIONS.RIGHT:
        npc.frame = SPRITE_FRAMES.RIGHT;
        npc.flipX = true;
        break;
    }

    // Broadcast the initial frame update
    this.broadcastNPCUpdate(npc);
  }

  // Determine which direction the NPC should move based on action_direction
  determineMovementDirection(npc) {
    const { action_direction } = npc;

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
  async canMoveInDirection(npc, direction) {
    const { x, y, map_id } = npc;

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
      const collision = await this.checkCollision(newX, newY, map_id, npc.id);
      if (collision) {
        return false;
      }

      return true;
    } catch (error) {
      console.error(`Error checking if NPC ${npc.id} can move:`, error);
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
  checkCollision(x, y, mapId, npcId) {
    return new Promise((resolve, reject) => {
      // Check for NPCs, items, or other objects at this position
      this.db.get(
        `SELECT * FROM objects 
         WHERE x = ? AND y = ? AND map_id = ? AND id != ?`,
        [x, y, mapId, npcId],
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
  moveNPC(npc, direction) {
    // Calculate the new position
    let newX = npc.x;
    let newY = npc.y;

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
    npc.x = newX;
    npc.y = newY;

    // console.log(`NPC ${npc.name} moved to (${newX}, ${newY})`);

    // Broadcast the update to all connected clients
    this.broadcastNPCUpdate(npc);
  }

  // Broadcast the NPC update to all connected clients
  broadcastNPCUpdate(npc) {
    const updateMessage = JSON.stringify({
      type: "npcUpdate",
      npc: {
        id: npc.id,
        x: npc.x,
        y: npc.y,
        sprite_name: npc.sprite_name,
        name: npc.name,
        map_id: npc.map_id,
        frame: npc.frame,
        flipX: npc.flipX,
      },
    });

    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(updateMessage);
      }
    });
  }

  // Reset all NPCs to their original positions
  resetToOriginalPosition() {
    this.walkingNPCs.forEach((npc) => {
      const state = this.npcStates.get(npc.id);
      if (state && state.originalPosition) {
        npc.x = state.originalPosition.x;
        npc.y = state.originalPosition.y;
        npc.frame = SPRITE_FRAMES.DOWN;
        npc.flipX = false;
        console.log(
          `Reset NPC ${npc.name} to original position (${state.originalPosition.x}, ${state.originalPosition.y})`
        );

        // Broadcast the update
        this.broadcastNPCUpdate(npc);
      }
    });
  }

  // Reset a specific NPC to its original position
  resetNPCToOriginalPosition(npcId) {
    const npc = this.walkingNPCs.find((n) => n.id === npcId);
    const state = this.npcStates.get(npcId);

    if (npc && state && state.originalPosition) {
      npc.x = state.originalPosition.x;
      npc.y = state.originalPosition.y;
      npc.frame = SPRITE_FRAMES.DOWN;
      npc.flipX = false;
      console.log(
        `Reset NPC ${npc.name} to original position (${state.originalPosition.x}, ${state.originalPosition.y})`
      );

      // Broadcast the update
      this.broadcastNPCUpdate(npc);
      return true;
    }
    return false;
  }

  // Stop the movement loop
  stopMovementLoop() {
    if (this.walkInterval) {
      clearInterval(this.walkInterval);
      this.walkInterval = null;
      console.log(`Stopped movement loop for ${this.walkingNPCs.length} NPCs`);
    }

    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
      console.log(`Stopped animation loop for ${this.walkingNPCs.length} NPCs`);
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

  // Get all walking NPCs (for API endpoint)
  getAllNPCs() {
    return this.walkingNPCs;
  }

  // Get a specific NPC by ID (for API endpoint)
  getNPC(npcId) {
    return this.walkingNPCs.find((npc) => npc.id === npcId);
  }
}

module.exports = NPCMovementManager;
