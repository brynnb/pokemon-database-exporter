import { Scene } from "phaser";
import { TileImageCacheEntry, getTileImageUrl } from "../api";
import { DEFAULT_ZONE_ID, DEFAULT_ZOOM, OVERWORLD_MODE } from "../constants";
import { CameraController } from "../controllers/CameraController";
import { MapRenderer } from "../renderers/MapRenderer";
import { MapDataService } from "../services/MapDataService";
import { TileManager } from "../managers/TileManager";
import { UiManager } from "../managers/UiManager";
import {
  TileUpdateEvent,
  webSocketService,
} from "../services/WebSocketService";
import WebFont from "webfontloader";

export class TileViewer extends Scene {
  // Services and managers
  private mapDataService: MapDataService;
  private tileManager: TileManager;
  private mapRenderer: MapRenderer;
  private cameraController: CameraController;
  private uiManager: UiManager;

  // Data
  private tiles: any[] = [];
  private zoneInfo: any = null;
  private items: any[] = [];
  private npcs: any[] = [];
  private warps: any[] = [];

  // View mode tracking
  private isOverworldMode: boolean = OVERWORLD_MODE;

  // Phaser elements
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private mapContainer: Phaser.GameObjects.Container;

  // Loading text for preload phase
  private preloadText: Phaser.GameObjects.Text;

  // Event handlers
  private handleTileUpdateBound: (event: TileUpdateEvent) => void;
  private handleConnectedBound: () => void;
  private handleDisconnectedBound: () => void;

  constructor() {
    super("TileViewer");
    this.mapDataService = new MapDataService();

    // Bind event handlers to this instance
    this.handleTileUpdateBound = this.handleTileUpdate.bind(this);
    this.handleConnectedBound = () =>
      console.log("Connected to WebSocket server");
    this.handleDisconnectedBound = () => {};
  }

  preload() {
    // Create a simple loading text for the preload phase with a fallback font
    this.preloadText = this.add.text(10, 50, "Loading...", {
      fontFamily: "monospace, Arial",
      fontSize: "18px",
      color: "#ffffff",
      backgroundColor: "#000000",
      padding: { x: 5, y: 5 },
    });
    this.preloadText.setScrollFactor(0);
    this.preloadText.setDepth(1000);

    // Initialize the tile manager
    this.tileManager = new TileManager(this);

    // Load the Pokemon font using WebFontLoader
    try {
      WebFont.load({
        custom: {
          families: ["Pokemon Pixel Font"],
          urls: ["style.css"],
        },
        active: () => {
          console.log("Pokemon font loaded successfully");
          // Refresh UI elements when font is loaded
          if (this.uiManager) {
            this.uiManager.refreshTextElements();
          }
        },
        inactive: () => {
          console.warn("Pokemon font failed to load, using fallback fonts");
        },
      });
    } catch (e) {
      console.error("Error loading WebFont:", e);
    }

    // Add error handler for the item-marker (poke_ball) image
    this.load.on("loaderror", (fileObj: any) => {
      if (fileObj.key === "item-marker") {
        console.warn("Failed to load poke_ball.png, using fallback");
      }
    });

    // Preload common tiles
    this.tileManager.preloadCommonTiles();
  }

  create(data?: any) {
    console.log("Creating TileViewer scene", data);

    // Ensure we're starting with a clean state
    this.tiles = [];
    this.items = [];
    this.warps = [];
    this.npcs = [];
    this.zoneInfo = null;

    // Set up scene cleanup
    this.events.once("shutdown", this.cleanupResources, this);

    // Create map container - ensure any existing one is destroyed first
    const existingContainer = this.children.getByName("mapContainer");
    if (existingContainer) {
      console.log("Found existing map container, destroying it");
      existingContainer.destroy();
    }

    // Create a fresh map container
    this.mapContainer = this.add.container(0, 0);
    this.mapContainer.name = "mapContainer"; // Add a name for easier debugging

    // Initialize managers and controllers
    this.mapRenderer = new MapRenderer(this, this.mapContainer);
    this.cameraController = new CameraController(this);

    // Reset camera to ensure we're starting fresh
    this.cameraController.resetCamera();

    this.uiManager = new UiManager(this);

    // Try to refresh UI elements if the font is already loaded
    try {
      if (document.fonts && document.fonts.check("12px 'Pokemon Pixel Font'")) {
        console.log("Pokemon font already loaded, refreshing UI");
        this.uiManager.refreshTextElements();
      }
    } catch (e) {
      console.warn("Font check not supported:", e);
    }

    // Set up keyboard input
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
    }

    // Configure camera to ignore UI elements
    this.cameraController.configureIgnoreElements(
      this.uiManager.getUiElements(),
      this.mapContainer
    );

    // Handle pointer move for tile info - use once to avoid duplicate handlers
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.zoneInfo) {
        this.uiManager.updateTileInfo(
          pointer,
          this.tiles,
          this.items,
          this.zoneInfo,
          (x, y) => this.cameraController.getWorldPoint(x, y),
          this.warps
        );
      }
    });

    // Handle warp click event - use once to avoid duplicate handlers
    this.events.once("warpClicked", async (warp: any) => {
      if (warp && warp.destination_zone_id) {
        console.log(
          `Warp clicked: Destination zone ${warp.destination_zone_id}`
        );

        // Show loading text
        this.uiManager.setLoadingText("Warping to new location...");

        try {
          // Get destination zone info for a better message
          const destinationZoneInfo = await this.mapDataService.fetchZoneInfo(
            warp.destination_zone_id
          );
          if (destinationZoneInfo && destinationZoneInfo.name) {
            this.uiManager.setLoadingText(
              `Warping to ${destinationZoneInfo.name}...`
            );
          }

          // Store the destination zone ID in localStorage so we can load it after restart
          localStorage.setItem(
            "destinationZoneId",
            warp.destination_zone_id.toString()
          );

          // Force a complete scene restart to ensure clean state
          this.resetScene();
        } catch (error) {
          console.error("Error warping to destination:", error);
          // Still try to load the map even if we couldn't get the zone name
          localStorage.setItem(
            "destinationZoneId",
            warp.destination_zone_id.toString()
          );
          this.resetScene();
        }
      } else {
        console.warn("Invalid warp data or missing destination zone ID", warp);
      }
    });

    // Handle back to overworld button click - use once to avoid duplicate handlers
    this.events.once("backToOverworldClicked", () => {
      console.log("Back to overworld clicked");

      // Clear the current map
      this.mapRenderer.clear();

      // Show loading text
      this.uiManager.setLoadingText("Loading overworld map...");

      // Hide the back to overworld button
      this.uiManager.hideBackToOverworldButton();

      // Clear any stored destination zone ID
      localStorage.removeItem("destinationZoneId");

      // Set a flag to indicate we want to load the overworld
      localStorage.setItem("loadOverworld", "true");

      // Force a complete scene restart to ensure clean state
      this.resetScene();
    });

    // Handle window resize
    this.scale.on("resize", this.handleResize, this);

    // Set initial zoom
    this.cameraController.setZoom(DEFAULT_ZOOM);

    // Remove preload text
    if (this.preloadText) {
      this.preloadText.destroy();
    }

    // Check if we have data passed from resetScene
    let destinationZoneId = null;
    let loadOverworld = null;

    if (data) {
      destinationZoneId = data.destinationZoneId;
      loadOverworld = data.loadOverworld;
    } else {
      // Fall back to localStorage if no data was passed
      destinationZoneId = localStorage.getItem("destinationZoneId");
      loadOverworld = localStorage.getItem("loadOverworld");
    }

    // Clear localStorage to avoid duplicate loads
    localStorage.removeItem("destinationZoneId");
    localStorage.removeItem("loadOverworld");

    if (loadOverworld === "true") {
      console.log("Loading overworld from flag");

      // Set to overworld mode
      this.isOverworldMode = true;

      // Hide the back to overworld button
      this.uiManager.hideBackToOverworldButton();

      // Load the overworld map
      this.loadOverworldData();
    } else if (destinationZoneId) {
      // We're coming from a warp, load the destination zone
      const zoneId = parseInt(destinationZoneId, 10);

      console.log(`Loading destination zone ${zoneId} from warp`);

      // Set to zone view mode
      this.isOverworldMode = false;

      // Show the back to overworld button
      this.uiManager.showBackToOverworldButton();

      // Load the destination map
      this.loadMapData(zoneId);
    } else {
      // Normal startup - load map data after UI is initialized
      if (this.isOverworldMode) {
        this.loadOverworldData();
      } else {
        this.loadMapData(DEFAULT_ZONE_ID);
      }
    }
  }

  setupWebSocket() {
    try {
      console.log("Setting up WebSocket connection");

      // Disconnect from any existing connection first
      webSocketService.disconnect();

      // Wait a short time to ensure disconnection is complete
      setTimeout(() => {
        // Connect to the WebSocket server
        webSocketService.connect();

        // Listen for tile updates
        webSocketService.on("tileUpdate", this.handleTileUpdateBound);

        // Handle connection events if needed
        webSocketService.on("connected", this.handleConnectedBound);
        webSocketService.on("disconnected", this.handleDisconnectedBound);
      }, 100);
    } catch (error) {
      console.error("Error setting up WebSocket:", error);
    }
  }

  handleTileUpdate(event: TileUpdateEvent) {
    // Find the tile in our local data
    const tileIndex = this.tiles.findIndex((tile) => tile.id === event.tileId);

    if (tileIndex !== -1) {
      // Update the tile image ID in our local data
      this.tiles[tileIndex].tile_image_id = event.newTileImageId;

      // Get the tile's position
      const tile = this.tiles[tileIndex];

      // Update the tile sprite in the renderer
      this.mapRenderer.updateTile(tile.x, tile.y, event.newTileImageId);
    }
  }

  handleResize() {
    this.cameraController.handleResize();
    this.uiManager.handleResize();
  }

  update() {
    // Handle keyboard camera movement
    if (this.cursors) {
      this.cameraController.update(this.cursors);
    }
  }

  async loadMapData(zoneId: number) {
    try {
      // Show loading text
      this.uiManager.setLoadingText(`Loading zone ${zoneId}...`);

      // Always clear existing data when loading a specific zone
      this.mapRenderer.clear();
      this.tiles = [];
      this.items = [];
      this.warps = [];
      this.npcs = [];

      // Reset camera
      this.cameraController.resetCamera();

      // Remove any zone legend (which is only present in overworld view)
      this.removeZoneLegend();

      // Update mode
      this.isOverworldMode = false;

      // Show the back to overworld button
      this.uiManager.showBackToOverworldButton();

      // Fetch zone info
      this.zoneInfo = await this.mapDataService.fetchZoneInfo(zoneId);

      if (!this.zoneInfo) {
        throw new Error(`Zone ${zoneId} not found`);
      }

      this.uiManager.setLoadingText("Loading tiles...");

      // Fetch tiles
      this.tiles = await this.mapDataService.fetchTiles(zoneId);

      this.uiManager.setLoadingText("Loading tile images...");

      // Fetch tile images
      const tileImagesData = await this.mapDataService.fetchTileImages();

      // Load tile images
      await this.tileManager.loadTileImages(tileImagesData);

      this.uiManager.setLoadingText("Loading items...");

      try {
        // Fetch items
        const allItems = await this.mapDataService.fetchItems();

        // Filter items for this zone
        if (Array.isArray(allItems)) {
          this.items = allItems.filter((item: any) => item.zone_id === zoneId);
        } else {
          this.items = [];
        }
      } catch (itemError) {
        console.error("Error loading items:", itemError);
        this.items = [];
      }

      this.uiManager.setLoadingText("Loading warps...");

      try {
        // Fetch warps
        const allWarps = await this.mapDataService.fetchWarps();

        // Filter warps for this zone
        if (Array.isArray(allWarps)) {
          this.warps = allWarps.filter((warp: any) => warp.zone_id === zoneId);
        } else {
          this.warps = [];
        }
      } catch (warpError) {
        console.error("Error loading warps:", warpError);
        this.warps = [];
      }

      // Render the map
      const mapBounds = this.mapRenderer.renderMap(
        this.tiles,
        this.items,
        this.warps
      );

      // Center the camera on the map
      if (mapBounds.centerX !== undefined && mapBounds.centerY !== undefined) {
        // Reset camera zoom first
        this.cameraController.setZoom(DEFAULT_ZOOM);

        // Then center the camera
        this.cameraController.centerOnMap(mapBounds.centerX, mapBounds.centerY);
      }

      // Remove any zone legend
      this.removeZoneLegend();

      // Update mode text to show we're viewing a specific zone
      if (this.zoneInfo && this.zoneInfo.name) {
        this.uiManager.setModeText(`Zone View: ${this.zoneInfo.name}`);
      }

      // Hide loading text
      this.uiManager.hideLoadingText();

      // Connect to WebSocket server after all data is loaded
      this.setupWebSocket();
    } catch (error: any) {
      console.error("Error loading map data:", error);
      this.uiManager.setLoadingText(
        `Error loading map data: ${
          error.message || "Unknown error"
        }. Check console for details.`
      );
    }
  }

  async loadOverworldData() {
    try {
      // Show loading text
      this.uiManager.setLoadingText("Loading overworld data...");

      // Always clear existing data
      this.mapRenderer.clear();
      this.tiles = [];
      this.items = [];
      this.warps = [];
      this.npcs = [];

      // Reset camera
      this.cameraController.resetCamera();

      // Update mode
      this.isOverworldMode = true;

      // Hide the back to overworld button
      this.uiManager.hideBackToOverworldButton();

      // Get all overworld zones
      const overworldZones = await this.mapDataService.fetchOverworldZones();

      // Create a combined zone info object for all overworld zones
      this.zoneInfo = {
        name: "All Overworld Maps",
        is_overworld: true,
      };

      this.uiManager.setLoadingText("Loading tiles...");

      // Load tiles from all overworld zones
      this.tiles = [];
      for (const zone of overworldZones) {
        const zoneTiles = await this.mapDataService.fetchTiles(zone.id);

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

      this.uiManager.setLoadingText("Loading tile images...");

      // Fetch tile images
      const tileImagesData = await this.mapDataService.fetchTileImages();

      // Load tile images
      await this.tileManager.loadTileImages(tileImagesData);

      this.uiManager.setLoadingText("Loading items...");

      try {
        // Fetch all items
        const allItems = await this.mapDataService.fetchItems();

        // Use all items for overworld mode
        if (Array.isArray(allItems)) {
          this.items = allItems;
        } else {
          this.items = [];
        }
      } catch (itemError) {
        console.error("Error loading items:", itemError);
        this.items = [];
      }

      this.uiManager.setLoadingText("Loading NPCs...");

      try {
        // Fetch all NPCs
        this.npcs = await this.mapDataService.fetchNPCs();
      } catch (npcError) {
        console.error("Error loading NPCs:", npcError);
        this.npcs = [];
      }

      this.uiManager.setLoadingText("Loading warps...");

      try {
        // Fetch all warps
        this.warps = await this.mapDataService.fetchWarps();
      } catch (warpError) {
        console.error("Error loading warps:", warpError);
        this.warps = [];
      }

      // Render the map
      const mapBounds = this.mapRenderer.renderMap(
        this.tiles,
        this.items,
        this.warps
      );

      // Center the camera on the map
      if (mapBounds.centerX !== undefined && mapBounds.centerY !== undefined) {
        // Reset camera zoom first
        this.cameraController.setZoom(DEFAULT_ZOOM);

        // Then center the camera
        this.cameraController.centerOnMap(mapBounds.centerX, mapBounds.centerY);
      }

      // Create a legend for the zones
      this.createZoneLegend(overworldZones);

      // Update mode text
      this.uiManager.setModeText("Overworld View");

      // Hide loading text
      this.uiManager.hideLoadingText();

      // Connect to WebSocket server after all data is loaded
      this.setupWebSocket();
    } catch (error: any) {
      console.error("Error loading overworld data:", error);
      this.uiManager.setLoadingText(
        `Error loading overworld data: ${
          error.message || "Unknown error"
        }. Check console for details.`
      );
    }
  }

  createZoneLegend(zones: any[]) {
    // Implementation of zone legend creation
    // This is a placeholder for the actual implementation
  }

  cleanupResources() {
    console.log("Cleaning up resources");

    // Disconnect from WebSocket server
    try {
      webSocketService.disconnect();

      // Remove all event listeners
      webSocketService.off("tileUpdate", this.handleTileUpdateBound);
      webSocketService.off("connected", this.handleConnectedBound);
      webSocketService.off("disconnected", this.handleDisconnectedBound);
    } catch (error) {
      console.error("Error disconnecting WebSocket:", error);
    }

    // Clean up other resources
    if (this.mapRenderer) {
      try {
        this.mapRenderer.clear();
      } catch (error) {
        console.error("Error clearing map renderer:", error);
      }
    }

    if (this.tileManager) {
      try {
        this.tileManager.clearCache();
      } catch (error) {
        console.error("Error clearing tile manager cache:", error);
      }
    }

    // Clear all data
    this.tiles = [];
    this.items = [];
    this.warps = [];
    this.npcs = [];

    // Remove the map container and all its children
    if (this.mapContainer) {
      try {
        // First destroy all children
        this.mapContainer.each((child: Phaser.GameObjects.GameObject) => {
          child.destroy();
        });

        // Then remove all children
        this.mapContainer.removeAll(true);

        // Finally destroy the container itself
        this.mapContainer.destroy();
      } catch (error) {
        console.error("Error destroying map container:", error);
      }
    }

    // Remove any zone legend
    this.removeZoneLegend();

    // Remove resize listener
    this.scale.off("resize", this.handleResize, this);

    // Remove all event listeners
    this.input.off("pointermove");
    this.events.off("warpClicked");
    this.events.off("backToOverworldClicked");
  }

  removeZoneLegend() {
    const existingLegend = this.children.getByName("zone-legend");
    if (existingLegend) {
      existingLegend.destroy();
    }
  }

  resetScene() {
    console.log("Resetting scene");

    // First, store any data we need to pass to the new scene
    const data = {
      destinationZoneId: localStorage.getItem("destinationZoneId"),
      loadOverworld: localStorage.getItem("loadOverworld"),
    };

    // Clear localStorage to avoid duplicate loads
    localStorage.removeItem("destinationZoneId");
    localStorage.removeItem("loadOverworld");

    // Reset camera
    if (this.cameraController) {
      this.cameraController.resetCamera();
    }

    // Clean up resources
    this.cleanupResources();

    // Use a simpler approach - just restart the scene once
    this.scene.restart(data);
  }
}
