import { Scene } from "phaser";
import { TileImageCacheEntry, getTileImageUrl } from "../api";
import { DEFAULT_ZONE_ID, DEFAULT_ZOOM, OVERWORLD_MODE } from "../constants";
import { CameraController } from "../controllers/CameraController";
import { MapRenderer } from "../renderers/MapRenderer";
import { MapDataService } from "../services/MapDataService";
import { TileManager } from "../managers/TileManager";
import { UiManager } from "../managers/UiManager";

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

  // Phaser elements
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private mapContainer: Phaser.GameObjects.Container;

  // Loading text for preload phase
  private preloadText: Phaser.GameObjects.Text;

  constructor() {
    super("TileViewer");
    this.mapDataService = new MapDataService();
  }

  preload() {
    // Create a simple loading text for the preload phase
    this.preloadText = this.add.text(10, 50, "Loading...", {
      color: "#ffffff",
      fontSize: "18px",
      backgroundColor: "#000000",
    });
    this.preloadText.setScrollFactor(0);
    this.preloadText.setDepth(1000);

    // Initialize the tile manager
    this.tileManager = new TileManager(this);

    // Preload common tiles
    this.tileManager.preloadCommonTiles();
  }

  create() {
    // Set up scene cleanup
    this.events.on("shutdown", this.cleanupResources, this);

    // Create map container
    this.mapContainer = this.add.container(0, 0);

    // Initialize managers and controllers
    this.mapRenderer = new MapRenderer(this, this.mapContainer);
    this.cameraController = new CameraController(this);
    this.uiManager = new UiManager(this);

    // Set up keyboard input
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
    }

    // Configure camera to ignore UI elements
    this.cameraController.configureIgnoreElements(
      this.uiManager.getUiElements(),
      this.mapContainer
    );

    // Set up pointer move for tile info display
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.cameraController.isDragging()) {
        this.uiManager.updateTileInfo(
          pointer,
          this.tiles,
          this.items,
          this.zoneInfo,
          (x, y) => this.cameraController.getWorldPoint(x, y)
        );
      }
    });

    // Handle window resize
    this.scale.on("resize", this.handleResize, this);

    // Set initial zoom
    this.cameraController.setZoom(DEFAULT_ZOOM);

    // Remove preload text
    if (this.preloadText) {
      this.preloadText.destroy();
    }

    // Load map data after UI is initialized
    if (OVERWORLD_MODE) {
      this.loadOverworldData();
    } else {
      this.loadMapData(DEFAULT_ZONE_ID);
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
      this.uiManager.setLoadingText("Loading zone info...");

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
          console.warn("Items data is not an array:", allItems);
          this.items = [];
        }
      } catch (itemError) {
        console.error("Error loading items:", itemError);
        this.items = [];
      }

      // Render the map
      const mapBounds = this.mapRenderer.renderMap(this.tiles, this.items);

      // Center the camera on the map
      if (mapBounds.centerX !== undefined && mapBounds.centerY !== undefined) {
        this.cameraController.centerOnMap(mapBounds.centerX, mapBounds.centerY);
      }

      // Remove any zone legend
      const existingLegend = this.children.getByName("zone-legend");
      if (existingLegend) {
        existingLegend.destroy();
      }

      // Update mode text to show we're viewing a specific zone
      if (this.zoneInfo && this.zoneInfo.name) {
        this.uiManager.setModeText(`Zone View: ${this.zoneInfo.name}`);
      }

      // Hide loading text
      this.uiManager.hideLoadingText();
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
          console.warn("Items data is not an array:", allItems);
          this.items = [];
        }
      } catch (itemError) {
        console.error("Error loading items:", itemError);
        this.items = [];
      }

      // Render the map
      const mapBounds = this.mapRenderer.renderMap(this.tiles, this.items);

      // Center the camera on the map
      if (mapBounds.centerX !== undefined && mapBounds.centerY !== undefined) {
        this.cameraController.centerOnMap(mapBounds.centerX, mapBounds.centerY);
      }

      // Update mode text
      this.uiManager.setModeText("Overworld View");

      // Hide loading text
      this.uiManager.hideLoadingText();
    } catch (error: any) {
      console.error("Error loading overworld data:", error);
      this.uiManager.setLoadingText(
        `Error loading overworld data: ${
          error.message || "Unknown error"
        }. Check console for details.`
      );
    }
  }

  // Clean up resources when the scene is shut down
  cleanupResources() {
    // Remove resize event listener
    this.scale.off("resize", this.handleResize, this);

    // Clean up camera controller
    this.cameraController.cleanup();

    // Clear all cached data
    this.tileManager.clearCache();
    this.tiles = [];
    this.items = [];
    this.npcs = [];

    // Clear the map renderer
    this.mapRenderer.clear();
  }
}
