import { Scene } from "phaser";

// Constants
const TILE_SIZE = 16; // Size of each tile in pixels
const MIN_ZOOM = 0.1; // Minimum zoom level
const MAX_ZOOM = 5.0; // Maximum zoom level
const DEFAULT_ZOOM = 0.5; // Default zoom level
const ZOOM_STEP = 0.025; // How much to zoom in/out per scroll
const DEFAULT_ZONE_ID = 15; // Default zone ID to display
const API_BASE_URL = "http://localhost:3000/api"; // Base URL for our API
const OVERWORLD_MODE = true; // Always show overworld by default

// Define an interface for our cached image data
interface TileImageCacheEntry {
  key: string;
  path: string;
}

export class TileViewer extends Scene {
  // Map properties
  private tileImages: Map<number, Phaser.GameObjects.Image> = new Map();
  private tileImageCache: Map<number, TileImageCacheEntry> = new Map();
  private loadingTextures: Set<string> = new Set(); // Track which textures are being loaded
  private tiles: any[] = [];
  private zoneInfo: any = null;
  private items: any[] = [];
  private npcs: any[] = [];
  private zoneColors: Map<number, number> = new Map(); // Store zone colors for overworld mode

  // Camera controls
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private cameraControls = {
    isDragging: false,
    lastPointerPosition: { x: 0, y: 0 },
  };
  private zoomLevel: number = DEFAULT_ZOOM;

  // UI elements
  private infoText: Phaser.GameObjects.Text;
  private modeText: Phaser.GameObjects.Text;
  private mapContainer: Phaser.GameObjects.Container;
  private loadingText: Phaser.GameObjects.Text;

  constructor() {
    super("TileViewer");
  }

  preload() {
    // Create a placeholder tile if it doesn't exist
    if (!this.textures.exists("placeholder-tile")) {
      const graphics = this.make.graphics({ x: 0, y: 0 });
      graphics.fillStyle(0xcccccc);
      graphics.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      graphics.lineStyle(1, 0x000000);
      graphics.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);
      graphics.generateTexture("placeholder-tile", TILE_SIZE, TILE_SIZE);
      graphics.destroy();
    }

    // Create an item marker if it doesn't exist
    if (!this.textures.exists("item-marker")) {
      const graphics = this.make.graphics({ x: 0, y: 0 });
      graphics.fillStyle(0xff0000);
      graphics.fillCircle(TILE_SIZE / 4, TILE_SIZE / 4, TILE_SIZE / 4);
      graphics.generateTexture("item-marker", TILE_SIZE / 2, TILE_SIZE / 2);
      graphics.destroy();
    }

    // Preload some common tile images using the API endpoint
    for (let i = 1; i <= 10; i++) {
      this.load.image(`tile-${i}`, this.getTileImageUrl(i));
    }

    // Add loading text
    this.loadingText = this.add.text(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      "Loading map data...",
      {
        color: "#ffffff",
        fontSize: "24px",
      }
    );
    this.loadingText.setOrigin(0.5);

    // Set up scene cleanup
    this.events.on("shutdown", this.cleanupResources, this);

    // Load either the overworld or the default zone
    if (OVERWORLD_MODE) {
      this.loadOverworldData();
    } else {
      this.loadMapData(DEFAULT_ZONE_ID);
    }
  }

  create() {
    // Set up camera
    this.cameras.main.setBackgroundColor(0x000000);

    // Create container for all map elements
    this.mapContainer = this.add.container(0, 0);

    // Set up keyboard input
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
    }

    // Set up mouse/touch input for dragging
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.cameraControls.isDragging = true;
      this.cameraControls.lastPointerPosition = { x: pointer.x, y: pointer.y };
    });

    this.input.on("pointerup", () => {
      this.cameraControls.isDragging = false;
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.cameraControls.isDragging) {
        const deltaX = pointer.x - this.cameraControls.lastPointerPosition.x;
        const deltaY = pointer.y - this.cameraControls.lastPointerPosition.y;

        // Adjust deltas based on zoom level to maintain consistent panning speed
        this.cameras.main.scrollX -= deltaX / this.zoomLevel;
        this.cameras.main.scrollY -= deltaY / this.zoomLevel;

        this.cameraControls.lastPointerPosition = {
          x: pointer.x,
          y: pointer.y,
        };
      }
    });

    // Set up mouse wheel for zooming
    this.input.on(
      "wheel",
      (pointer: any, gameObjects: any, deltaX: number, deltaY: number) => {
        // Zoom in/out based on wheel direction
        if (deltaY > 0) {
          this.zoomLevel = Math.max(MIN_ZOOM, this.zoomLevel - ZOOM_STEP);
        } else {
          this.zoomLevel = Math.min(MAX_ZOOM, this.zoomLevel + ZOOM_STEP);
        }

        // Apply zoom
        this.cameras.main.setZoom(this.zoomLevel);
      }
    );

    // Add info text for displaying tile information
    this.infoText = this.add.text(10, 10, "", {
      fontFamily: "Arial",
      fontSize: "16px",
      color: "#ffffff",
      backgroundColor: "#000000",
    });
    this.infoText.setScrollFactor(0); // Fix to camera

    // Add view mode indicator
    this.modeText = this.add.text(10, 30, "Overworld View", {
      fontFamily: "Arial",
      fontSize: "16px",
      color: "#ffffff",
      backgroundColor: "#000000",
    });
    this.modeText.setScrollFactor(0); // Fix to camera

    // Set up pointer move for tile info display
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.cameraControls.isDragging) {
        this.updateTileInfo(pointer);
      }
    });
  }

  update() {
    // Handle keyboard camera movement
    if (!this.cursors) return;

    const cameraMoveSpeed = 10 / this.zoomLevel; // Adjust speed based on zoom

    if (this.cursors.left.isDown) {
      this.cameras.main.scrollX -= cameraMoveSpeed;
    } else if (this.cursors.right.isDown) {
      this.cameras.main.scrollX += cameraMoveSpeed;
    }

    if (this.cursors.up.isDown) {
      this.cameras.main.scrollY -= cameraMoveSpeed;
    } else if (this.cursors.down.isDown) {
      this.cameras.main.scrollY += cameraMoveSpeed;
    }
  }

  async loadMapData(zoneId: number) {
    try {
      // Show loading text
      this.loadingText.setVisible(true);
      this.loadingText.setText("Loading zone info...");

      // Fetch zone info
      const zoneInfoResponse = await fetch(
        `${API_BASE_URL}/zone-info/${zoneId}`
      );
      this.zoneInfo = await zoneInfoResponse.json();

      if (!this.zoneInfo) {
        throw new Error(`Zone ${zoneId} not found`);
      }

      this.loadingText.setText("Loading tiles...");

      // Fetch tiles
      const tilesResponse = await fetch(`${API_BASE_URL}/tiles/${zoneId}`);
      this.tiles = await tilesResponse.json();

      this.loadingText.setText("Loading tile images...");

      // Fetch tile images
      const tileImagesResponse = await fetch(`${API_BASE_URL}/tile-images`);
      const tileImagesData = await tileImagesResponse.json();

      // Load tile images
      await this.loadTileImages(tileImagesData);

      this.loadingText.setText("Loading items...");

      try {
        // Fetch items
        const itemsResponse = await fetch(`${API_BASE_URL}/items`);
        const allItems = await itemsResponse.json();

        // Filter items for this zone
        if (Array.isArray(allItems)) {
          this.items = allItems.filter((item: any) => item.zone_id === zoneId);
        } else {
          console.warn("Items data is not an array:", allItems);
          this.items = [];
        }
      } catch (itemError) {
        console.error("Error loading items:", itemError);
        this.items = [];
      }

      // Render the map
      this.renderMap();

      // Remove any zone legend
      const existingLegend = this.children.getByName("zone-legend");
      if (existingLegend) {
        existingLegend.destroy();
      }

      // Update mode text to show we're viewing a specific zone
      if (this.zoneInfo && this.zoneInfo.name) {
        this.modeText.setText(`Zone View: ${this.zoneInfo.name}`);
      }

      // Hide loading text
      this.loadingText.setVisible(false);
    } catch (error: any) {
      console.error("Error loading map data:", error);
      this.loadingText.setText(
        `Error loading map data: ${
          error.message || "Unknown error"
        }. Check console for details.`
      );
    }
  }

  async loadOverworldData() {
    try {
      // Show loading text
      this.loadingText.setVisible(true);
      this.loadingText.setText("Loading overworld data...");

      // Get all overworld zones
      const overworldZonesResponse = await fetch(
        `${API_BASE_URL}/overworld-zones`
      );
      const overworldZones = await overworldZonesResponse.json();

      // Create a combined zone info object for all overworld zones
      this.zoneInfo = {
        name: "All Overworld Maps",
        is_overworld: true,
      };

      // Generate colors for each zone
      this.zoneColors.clear();
      overworldZones.forEach((zone: any) => {
        // Generate a semi-random color based on zone ID
        // Use a simple hash function to get a consistent color
        const hash = zone.id * 9973; // Use a prime number for better distribution
        const r = (hash & 0xff0000) >> 16;
        const g = (hash & 0x00ff00) >> 8;
        const b = hash & 0x0000ff;

        // Convert RGB to a Phaser-friendly hex color with alpha
        const color = Phaser.Display.Color.GetColor(r, g, b);
        this.zoneColors.set(zone.id, color);
      });

      this.loadingText.setText("Loading tiles...");

      // Load tiles from all overworld zones
      this.tiles = [];
      for (const zone of overworldZones) {
        const tilesResponse = await fetch(`${API_BASE_URL}/tiles/${zone.id}`);
        const zoneTiles = await tilesResponse.json();

        // Add these tiles to our collection
        if (Array.isArray(zoneTiles)) {
          // Add zone name to each tile for easier reference
          const tilesWithZoneName = zoneTiles.map((tile) => ({
            ...tile,
            zone_name: zone.name,
          }));
          this.tiles = [...this.tiles, ...tilesWithZoneName];
        }
      }

      this.loadingText.setText("Loading tile images...");

      // Fetch tile images
      const tileImagesResponse = await fetch(`${API_BASE_URL}/tile-images`);
      const tileImagesData = await tileImagesResponse.json();

      // Load tile images
      await this.loadTileImages(tileImagesData);

      this.loadingText.setText("Loading items...");

      try {
        // Fetch all items
        const itemsResponse = await fetch(`${API_BASE_URL}/items`);
        const allItems = await itemsResponse.json();

        // Use all items for overworld mode
        if (Array.isArray(allItems)) {
          this.items = allItems;
        } else {
          console.warn("Items data is not an array:", allItems);
          this.items = [];
        }
      } catch (itemError) {
        console.error("Error loading items:", itemError);
        this.items = [];
      }

      // Render the map
      this.renderMap();

      // Create zone legend
      this.createZoneLegend(overworldZones);

      // Update mode text
      this.modeText.setText("Overworld View");

      // Hide loading text
      this.loadingText.setVisible(false);
    } catch (error: any) {
      console.error("Error loading overworld data:", error);
      this.loadingText.setText(
        `Error loading overworld data: ${
          error.message || "Unknown error"
        }. Check console for details.`
      );
    }
  }

  // Helper method to get the tile image URL
  getTileImageUrl(tileId: number): string {
    return `${API_BASE_URL}/tile-image/${tileId}`;
  }

  async loadTileImages(tileImagesData: any[]) {
    // Create a fallback texture for missing tiles
    if (!this.textures.exists("missing-tile")) {
      const graphics = this.make.graphics({ x: 0, y: 0 });
      graphics.fillStyle(0xff00ff); // Magenta color for missing tiles
      graphics.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      graphics.lineStyle(1, 0x000000);
      graphics.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);
      graphics.generateTexture("missing-tile", TILE_SIZE, TILE_SIZE);
      graphics.destroy();
    }

    // Process all tile images
    for (const tileImage of tileImagesData) {
      const tileKey = `tile-${tileImage.id}`;

      // Skip if we've already loaded this texture in preload
      if (this.textures.exists(tileKey)) {
        continue;
      }

      // Always use the API endpoint for consistent handling
      const imgUrl = this.getTileImageUrl(tileImage.id);

      // Load the image
      this.load.image(tileKey, imgUrl);

      // Store the image path for later use
      this.tileImageCache.set(tileImage.id, {
        key: tileKey,
        path: imgUrl,
      });
    }

    // Start the load
    if (this.load.list.size > 0) {
      this.load.on("loaderror", (fileObj: any) => {
        // Handle loading errors by creating a fallback tile
        const tileId = fileObj.key.replace("tile-", "");
        console.warn(`Error loading tile ${tileId}, using fallback`);
        this.createFallbackTile(fileObj.key, tileId);
      });

      await new Promise<void>((resolve) => {
        this.load.once("complete", () => {
          resolve();
        });
        this.load.start();
      });
    }
  }

  // Helper method to create a fallback tile texture
  createFallbackTile(key: string, tileId: string) {
    // Create a new graphics object for this specific missing tile
    const graphics = this.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0xcccccc); // Light gray color for placeholder tiles
    graphics.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    graphics.lineStyle(1, 0x000000);
    graphics.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);

    // Draw the tile ID on the texture for debugging
    const text = this.add.text(TILE_SIZE / 2, TILE_SIZE / 2, tileId, {
      fontSize: "8px",
      color: "#000000",
    });
    text.setOrigin(0.5);

    // Generate the texture
    graphics.generateTexture(key, TILE_SIZE, TILE_SIZE);

    // Clean up
    graphics.destroy();
    text.destroy();
  }

  renderMap() {
    // Clear existing map
    this.mapContainer.removeAll();

    // Render each tile
    for (const tile of this.tiles) {
      const { x, y, tile_image_id, zone_id } = tile;

      // Calculate position
      const posX = x * TILE_SIZE;
      const posY = y * TILE_SIZE;

      // Create tile sprite using the texture (either preloaded or fallback)
      const tileKey = `tile-${tile_image_id}`;
      const tileSprite = this.add.image(posX, posY, tileKey);
      tileSprite.setOrigin(0, 0);
      tileSprite.setDisplaySize(TILE_SIZE, TILE_SIZE);

      // Store the tile_image_id and zone_id for later reference
      (tileSprite as any).tileImageId = tile_image_id;
      (tileSprite as any).zoneId = zone_id;

      // Apply zone color tint in overworld mode
      if (OVERWORLD_MODE && zone_id && this.zoneColors.has(zone_id)) {
        // Apply a very subtle tint to show zone boundaries
        tileSprite.setTint(this.zoneColors.get(zone_id)!);
      }

      // Add to container
      this.mapContainer.add(tileSprite);

      // Store reference
      this.tileImages.set(x * 1000 + y, tileSprite);
    }

    // Render items
    for (const item of this.items) {
      const itemSprite = this.add.image(
        item.x * TILE_SIZE + TILE_SIZE / 2,
        item.y * TILE_SIZE + TILE_SIZE / 2,
        "item-marker"
      );

      itemSprite.setDisplaySize(TILE_SIZE / 2, TILE_SIZE / 2);
      itemSprite.setTint(0xff0000); // Red tint for items

      // Store item data in the sprite for hover info
      (itemSprite as any).itemData = item;

      // Add to container
      this.mapContainer.add(itemSprite);
    }

    // Set initial camera position
    // Since we don't have width and height in the zone info anymore,
    // we'll calculate it from the tiles
    if (this.tiles.length > 0) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      // Find the bounds of the map
      for (const tile of this.tiles) {
        minX = Math.min(minX, tile.x);
        minY = Math.min(minY, tile.y);
        maxX = Math.max(maxX, tile.x);
        maxY = Math.max(maxY, tile.y);
      }

      const mapWidth = (maxX - minX + 1) * TILE_SIZE;
      const mapHeight = (maxY - minY + 1) * TILE_SIZE;

      // Center the camera on the map
      this.cameras.main.centerOn(
        minX * TILE_SIZE + mapWidth / 2,
        minY * TILE_SIZE + mapHeight / 2
      );
    }

    // Set initial zoom
    this.cameras.main.setZoom(this.zoomLevel);
  }

  updateTileInfo(pointer: Phaser.Input.Pointer) {
    // Convert screen coordinates to world coordinates
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);

    // Convert world coordinates to tile coordinates
    const tileX = Math.floor(worldPoint.x / TILE_SIZE);
    const tileY = Math.floor(worldPoint.y / TILE_SIZE);

    // Check if we have zone info
    if (!this.zoneInfo) {
      this.infoText.setText("No zone info available");
      return;
    }

    // Build info text
    let info = `Tile: (${tileX}, ${tileY})`;

    // In overworld mode, find the zone for this tile
    const tile = this.tiles.find((t) => t.x === tileX && t.y === tileY);
    if (tile && tile.zone_id) {
      // Try to find the zone name from another tile with the same zone_id
      const zoneNameTile = this.tiles.find(
        (t) => t.zone_id === tile.zone_id && t.zone_name
      );

      info += `\nZone ID: ${tile.zone_id}`;
      if (zoneNameTile && zoneNameTile.zone_name) {
        info += ` (${zoneNameTile.zone_name})`;
      }

      // Add local coordinates within the zone if available
      if (tile.local_x !== undefined && tile.local_y !== undefined) {
        info += `\nLocal Coords: (${tile.local_x}, ${tile.local_y})`;
      }
    }
    info += `\nView: ${this.zoneInfo.name}`;

    if (this.zoneInfo.tileset_id) {
      info += `\nTileset ID: ${this.zoneInfo.tileset_id}`;
    }

    if (this.zoneInfo.is_overworld) {
      info += `\nOverworld: Yes`;
    }

    // Find tile at this position
    if (tile) {
      info += `\nTile ID: ${tile.tile_image_id}`;
    }

    // Find item at this position
    const item = this.items.find((i) => i.x === tileX && i.y === tileY);
    if (item) {
      info += `\nItem: ${item.name}`;
      if (item.description) {
        info += `\nDescription: ${item.description}`;
      }
    }

    // Update the info text
    this.infoText.setText(info);
  }

  // Clean up resources when the scene is shut down
  cleanupResources() {
    // Clear all loading textures
    this.loadingTextures.clear();

    // Clear all cached data
    this.tileImageCache.clear();
    this.tileImages.clear();
    this.tiles = [];
    this.items = [];
    this.npcs = [];

    // Remove all children from the container
    if (this.mapContainer) {
      this.mapContainer.removeAll(true);
    }
  }

  // Create a legend showing zone colors
  createZoneLegend(zones: any[]) {
    // Remove any existing legend
    const existingLegend = this.children.getByName("zone-legend");
    if (existingLegend) {
      existingLegend.destroy();
    }

    if (zones.length === 0) {
      return;
    }

    // Create a container for the legend
    const legend = this.add.container(this.cameras.main.width - 200, 10);
    legend.setName("zone-legend");
    legend.setScrollFactor(0); // Fix to camera

    // Add background
    const bg = this.add.rectangle(
      0,
      0,
      180,
      Math.min(300, zones.length * 20 + 30),
      0x000000,
      0.7
    );
    legend.add(bg);

    // Add title
    const title = this.add.text(0, 5, "Zone Legend", {
      fontFamily: "Arial",
      fontSize: "14px",
      color: "#ffffff",
    });
    title.setOrigin(0.5, 0);
    legend.add(title);

    // Add zone entries (limit to 10 for space)
    const displayZones = zones.slice(0, 10);
    displayZones.forEach((zone, index) => {
      // Color box
      const color = this.zoneColors.get(zone.id) || 0xffffff;
      const colorBox = this.add.rectangle(-80, 30 + index * 20, 10, 10, color);
      legend.add(colorBox);

      // Zone name
      const text = this.add.text(
        -65,
        25 + index * 20,
        `${zone.id}: ${zone.name.substring(0, 15)}`,
        {
          fontFamily: "Arial",
          fontSize: "12px",
          color: "#ffffff",
        }
      );
      text.setOrigin(0, 0);
      legend.add(text);
    });

    // Add "more..." text if there are more zones
    if (zones.length > 10) {
      const moreText = this.add.text(
        0,
        30 + 10 * 20,
        `+ ${zones.length - 10} more zones...`,
        {
          fontFamily: "Arial",
          fontSize: "12px",
          color: "#aaaaaa",
        }
      );
      moreText.setOrigin(0.5, 0);
      legend.add(moreText);
    }

    return legend;
  }
}
