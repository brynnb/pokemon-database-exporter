import { Scene } from "phaser";
import { MIN_ZOOM, MAX_ZOOM, DEFAULT_ZOOM, ZOOM_STEP } from "../constants";

// Define a constant for non-overworld zoom level
const NON_OVERWORLD_ZOOM = 2.0; // Much more zoomed in than DEFAULT_ZOOM

export class CameraController {
  private scene: Scene;
  private mainCamera: Phaser.Cameras.Scene2D.Camera;
  private uiCamera!: Phaser.Cameras.Scene2D.Camera; // UI camera for HUD elements
  private zoomLevel: number = DEFAULT_ZOOM;
  private isOverworld: boolean = true; // Track whether we're in overworld mode
  private cameraControls = {
    isDragging: false,
    lastPointerPosition: { x: 0, y: 0 },
  };

  // Store overworld camera state
  private overworldCameraState = {
    x: 0,
    y: 0,
    zoom: DEFAULT_ZOOM,
    saved: false,
  };

  constructor(scene: Scene) {
    this.scene = scene;
    this.mainCamera = scene.cameras.main;
    this.mainCamera.setBackgroundColor(0x000000);
    this.setupUiCamera();
    this.setupControls();
  }

  setupUiCamera() {
    // Create a separate camera for UI elements that won't be affected by zoom
    this.uiCamera = this.scene.cameras.add(
      0,
      0,
      this.mainCamera.width,
      this.mainCamera.height
    );
    this.uiCamera.setScroll(0, 0);
    this.uiCamera.transparent = true;
    this.uiCamera.setName("UICamera");
  }

  setupControls() {
    // Set up mouse/touch input for dragging
    this.scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.cameraControls.isDragging = true;
      this.cameraControls.lastPointerPosition = { x: pointer.x, y: pointer.y };
    });

    this.scene.input.on("pointerup", () => {
      this.cameraControls.isDragging = false;
    });

    this.scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.cameraControls.isDragging) {
        const deltaX = pointer.x - this.cameraControls.lastPointerPosition.x;
        const deltaY = pointer.y - this.cameraControls.lastPointerPosition.y;

        // Adjust deltas based on zoom level to maintain consistent panning speed
        this.mainCamera.scrollX -= deltaX / this.zoomLevel;
        this.mainCamera.scrollY -= deltaY / this.zoomLevel;

        this.cameraControls.lastPointerPosition = {
          x: pointer.x,
          y: pointer.y,
        };
      }
    });

    // Set up mouse wheel for zooming
    this.scene.input.on(
      "wheel",
      (pointer: any, gameObjects: any, deltaX: number, deltaY: number) => {
        // Zoom in/out based on wheel direction
        if (deltaY > 0) {
          this.zoomLevel = Math.max(MIN_ZOOM, this.zoomLevel - ZOOM_STEP);
        } else {
          this.zoomLevel = Math.min(MAX_ZOOM, this.zoomLevel + ZOOM_STEP);
        }

        // Apply zoom
        this.mainCamera.setZoom(this.zoomLevel);
      }
    );
  }

  handleResize() {
    // Resize the UI camera to match the main camera
    this.uiCamera.setSize(this.mainCamera.width, this.mainCamera.height);
  }

  update(cursors: Phaser.Types.Input.Keyboard.CursorKeys) {
    if (!cursors) return;

    const cameraMoveSpeed = 10 / this.zoomLevel; // Adjust speed based on zoom

    if (cursors.left.isDown) {
      this.mainCamera.scrollX -= cameraMoveSpeed;
    } else if (cursors.right.isDown) {
      this.mainCamera.scrollX += cameraMoveSpeed;
    }

    if (cursors.up.isDown) {
      this.mainCamera.scrollY -= cameraMoveSpeed;
    } else if (cursors.down.isDown) {
      this.mainCamera.scrollY += cameraMoveSpeed;
    }
  }

  centerOnMap(centerX: number, centerY: number) {
    this.mainCamera.centerOn(centerX, centerY);
  }

  setZoom(zoom: number) {
    this.zoomLevel = zoom;
    this.mainCamera.setZoom(zoom);
  }

  getZoom() {
    return this.zoomLevel;
  }

  getWorldPoint(x: number, y: number) {
    return this.mainCamera.getWorldPoint(x, y);
  }

  configureIgnoreElements(
    uiElements: Phaser.GameObjects.GameObject[],
    mapContainer: Phaser.GameObjects.Container
  ) {
    // Main camera should show the map container but ignore UI elements
    this.mainCamera.ignore(uiElements);

    // UI camera should only show UI elements and ignore the map
    this.uiCamera.ignore([mapContainer]);
  }

  cleanup() {
    // Remove the UI camera
    this.scene.cameras.remove(this.uiCamera);
  }

  isDragging() {
    return this.cameraControls.isDragging;
  }

  /**
   * Save the current camera position and zoom for the overworld view
   */
  saveOverworldCameraState() {
    if (this.isOverworld) {
      // Don't save if we're at the default position (0,0) with default zoom
      // This likely means the camera was just reset
      if (
        this.mainCamera.scrollX === 0 &&
        this.mainCamera.scrollY === 0 &&
        this.zoomLevel === DEFAULT_ZOOM
      ) {
        console.log("Not saving default camera position (0,0)");
        return;
      }

      this.overworldCameraState = {
        x: this.mainCamera.scrollX,
        y: this.mainCamera.scrollY,
        zoom: this.zoomLevel,
        saved: true,
      };
      console.log(
        "Saved overworld camera state:",
        JSON.stringify(this.overworldCameraState)
      );

      // Also save to localStorage as a backup in case of scene resets
      try {
        localStorage.setItem(
          "overworldCameraState",
          JSON.stringify(this.overworldCameraState)
        );
      } catch (e) {
        console.error("Failed to save camera state to localStorage:", e);
      }
    }
  }

  /**
   * Restore the saved overworld camera position and zoom
   * @returns True if a saved state was restored, false otherwise
   */
  restoreOverworldCameraState(): boolean {
    // First try to get from localStorage (more reliable across scene resets)
    try {
      const savedState = localStorage.getItem("overworldCameraState");
      if (savedState) {
        const state = JSON.parse(savedState);
        console.log(
          "Restoring overworld camera state from localStorage:",
          savedState
        );

        // Set zoom first to ensure proper positioning
        this.setZoom(state.zoom);

        // Then set scroll position
        this.mainCamera.setScroll(state.x, state.y);

        // Update memory state
        this.overworldCameraState = state;

        return true;
      }
    } catch (e) {
      console.error("Failed to restore camera state from localStorage:", e);
    }

    // Fall back to memory if localStorage failed
    if (this.overworldCameraState.saved) {
      console.log(
        "Restoring overworld camera state from memory:",
        JSON.stringify(this.overworldCameraState)
      );

      // Set zoom first to ensure proper positioning
      this.setZoom(this.overworldCameraState.zoom);

      // Then set scroll position
      this.mainCamera.setScroll(
        this.overworldCameraState.x,
        this.overworldCameraState.y
      );

      return true;
    }

    console.log("No saved overworld camera state to restore");
    return false;
  }

  /**
   * Set the view mode to overworld or non-overworld and adjust zoom accordingly
   * @param isOverworld Whether the current view is the overworld
   */
  setViewMode(isOverworld: boolean) {
    // Only save the camera state if we're switching from overworld to zone view
    // AND we have valid coordinates (not 0,0 which indicates a reset camera)
    if (
      this.isOverworld &&
      !isOverworld &&
      (this.mainCamera.scrollX !== 0 || this.mainCamera.scrollY !== 0)
    ) {
      console.log("Switching from overworld to zone view, saving camera state");
      this.saveOverworldCameraState();
    }

    // Update the mode
    this.isOverworld = isOverworld;

    // Set appropriate zoom level based on view mode
    if (isOverworld) {
      console.log("Setting view mode to overworld");
      // Don't set zoom here as we'll restore it in loadOverworldData
    } else {
      console.log("Setting view mode to zone view");
      // Always use the default zoom for zone views
      this.setZoom(NON_OVERWORLD_ZOOM);
      // Reset camera position for zone views
      this.mainCamera.setScroll(0, 0);
    }
  }

  /**
   * Get the current view mode
   * @returns Whether the current view is in overworld mode
   */
  isInOverworldMode(): boolean {
    return this.isOverworld;
  }

  resetCamera() {
    console.log("Resetting camera");

    // Reset zoom to appropriate default based on current view mode
    if (this.isOverworld) {
      this.setZoom(DEFAULT_ZOOM);
      // Clear saved state when explicitly resetting
      this.overworldCameraState.saved = false;
    } else {
      this.setZoom(NON_OVERWORLD_ZOOM);
    }

    // Reset camera position
    this.mainCamera.setScroll(0, 0);

    // Reset dragging state
    this.cameraControls.isDragging = false;
  }
}
