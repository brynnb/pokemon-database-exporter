import { Scene } from "phaser";
import { TILE_SIZE } from "../constants";

export class UiManager {
  private scene: Scene;
  private infoText: Phaser.GameObjects.Text;
  private modeText: Phaser.GameObjects.Text;
  private loadingText: Phaser.GameObjects.Text;
  private tileHighlight: Phaser.GameObjects.Graphics;
  private backToOverworldButton: Phaser.GameObjects.Container;
  private padding = 10; // Padding between UI elements

  constructor(scene: Scene) {
    this.scene = scene;

    // Check for existing UI elements and destroy them
    this.cleanupExistingUi();

    this.createUiElements();
    this.createTileHighlight();
    this.createBackToOverworldButton();
  }

  cleanupExistingUi() {
    // Check for existing UI elements by name
    const uiElementNames = [
      "infoText",
      "modeText",
      "loadingText",
      "tileHighlight",
      "backToOverworldButton",
    ];

    for (const name of uiElementNames) {
      const existingElement = this.scene.children.getByName(name);
      if (existingElement) {
        console.log(`Found existing UI element: ${name}, destroying it`);
        existingElement.destroy();
      }
    }
  }

  createUiElements() {
    // Add info text for displaying tile information
    this.infoText = this.scene.add.text(10, 10, "", {
      fontFamily: "'Pokemon Pixel Font', monospace, Arial",
      fontSize: "12px",
      color: "#ffffff",
      backgroundColor: "#000000",
      padding: { x: 5, y: 5 },
    });
    this.infoText.setDepth(1000); // Ensure it's always on top
    this.infoText.setScrollFactor(0);
    this.infoText.name = "infoText";

    // Add view mode indicator
    this.modeText = this.scene.add.text(10, 30, "Overworld View", {
      fontFamily: "'Pokemon Pixel Font', monospace, Arial",
      fontSize: "12px",
      color: "#ffffff",
      backgroundColor: "#000000",
      padding: { x: 5, y: 5 },
    });
    this.modeText.setDepth(1000); // Ensure it's always on top
    this.modeText.setScrollFactor(0);
    this.modeText.name = "modeText";

    // Add loading text
    this.loadingText = this.scene.add.text(10, 50, "Loading map data...", {
      fontFamily: "'Pokemon Pixel Font', monospace, Arial",
      fontSize: "12px",
      color: "#ffffff",
      backgroundColor: "#000000",
      padding: { x: 5, y: 5 },
    });
    this.loadingText.setScrollFactor(0);
    this.loadingText.setDepth(1000); // Ensure it's always on top
    this.loadingText.name = "loadingText";

    // Position elements correctly
    this.updateElementPositions();
  }

  createTileHighlight() {
    this.tileHighlight = this.scene.add.graphics();
    this.tileHighlight.setDepth(500); // Set depth to be above tiles but below UI
    this.tileHighlight.name = "tileHighlight";
  }

  updateElementPositions() {
    const infoTextHeight = this.infoText.height;
    const modeTextHeight = this.modeText.height;

    // Position modeText below infoText
    this.modeText.setPosition(10, 10 + infoTextHeight + this.padding);

    // Position loadingText below modeText
    this.loadingText.setPosition(
      10,
      10 + infoTextHeight + this.padding + modeTextHeight + this.padding
    );
  }

  updateTileInfo(
    pointer: Phaser.Input.Pointer,
    tiles: any[],
    items: any[],
    zoneInfo: any,
    getWorldPoint: (x: number, y: number) => Phaser.Math.Vector2,
    warps: any[] = []
  ) {
    // Convert screen coordinates to world coordinates
    const worldPoint = getWorldPoint(pointer.x, pointer.y);

    // Convert world coordinates to tile coordinates
    const tileX = Math.floor(worldPoint.x / TILE_SIZE);
    const tileY = Math.floor(worldPoint.y / TILE_SIZE);

    // Update the tile highlight position
    this.updateTileHighlight(tileX, tileY);

    // Check if we have zone info
    if (!zoneInfo) {
      this.infoText.setText("No zone info available");
      this.updateElementPositions();
      return;
    }

    // Build info text
    let info = `Tile: (${tileX}, ${tileY})`;

    // In overworld mode, find the zone for this tile
    const tile = tiles.find((t) => t.x === tileX && t.y === tileY);

    // Always show local coordinates, displaying "none" when not available
    if (tile && tile.local_x !== undefined && tile.local_y !== undefined) {
      info += `\nLocal Coords: (${tile.local_x}, ${tile.local_y})`;
    } else {
      info += `\nLocal Coords: none`;
    }

    // Always show Zone ID, displaying "none" when not available
    if (tile && tile.zone_id) {
      info += `\nZone ID: ${tile.zone_id}`;

      // Use zone_name directly from the tile object
      if (tile.zone_name) {
        info += ` (${tile.zone_name})`;
      } else {
        info += ` (no name)`;
      }
    } else {
      info += `\nZone ID: none`;
    }

    if (zoneInfo.tileset_id) {
      info += `\nTileset ID: ${zoneInfo.tileset_id}`;
    }

    // Always display Tile ID, showing "n/a" when no tile is found
    info += `\nTile ID: ${tile ? tile.tile_image_id : "none"}`;

    // Find item at this position
    const item = items.find((i) => i.x === tileX && i.y === tileY);
    if (item) {
      info += `\nItem: ${item.name}`;
      if (item.description) {
        info += `\nDescription: ${item.description}`;
      }
    }

    // Find warp at this position
    const warp = warps.find((w) => w.x === tileX && w.y === tileY);
    if (warp) {
      info += `\nWarp: (${warp.x}, ${warp.y})`;
      info += `\nDestination: Zone ${warp.destination_map} at (${warp.destination_x}, ${warp.destination_y})`;
    }

    // Update the info text
    this.infoText.setText(info);

    // Update positions after text content changes
    this.updateElementPositions();

    // Update the mode text with the current view name
    this.setModeText(`View: ${zoneInfo.name}`);
  }

  updateTileHighlight(tileX: number, tileY: number) {
    // Clear previous highlight
    this.tileHighlight.clear();

    const darkGrey = 0x444444;
    const x = tileX * TILE_SIZE;
    const y = tileY * TILE_SIZE;
    const size = TILE_SIZE;
    const bracketSize = 4; // Size of the corner brackets

    // Set line style
    this.tileHighlight.lineStyle(1, darkGrey);

    // Draw top-left corner bracket
    this.tileHighlight.beginPath();
    this.tileHighlight.moveTo(x, y + bracketSize);
    this.tileHighlight.lineTo(x, y);
    this.tileHighlight.lineTo(x + bracketSize, y);
    this.tileHighlight.strokePath();

    // Draw top-right corner bracket
    this.tileHighlight.beginPath();
    this.tileHighlight.moveTo(x + size - bracketSize, y);
    this.tileHighlight.lineTo(x + size, y);
    this.tileHighlight.lineTo(x + size, y + bracketSize);
    this.tileHighlight.strokePath();

    // Draw bottom-right corner bracket
    this.tileHighlight.beginPath();
    this.tileHighlight.moveTo(x + size, y + size - bracketSize);
    this.tileHighlight.lineTo(x + size, y + size);
    this.tileHighlight.lineTo(x + size - bracketSize, y + size);
    this.tileHighlight.strokePath();

    // Draw bottom-left corner bracket
    this.tileHighlight.beginPath();
    this.tileHighlight.moveTo(x + bracketSize, y + size);
    this.tileHighlight.lineTo(x, y + size);
    this.tileHighlight.lineTo(x, y + size - bracketSize);
    this.tileHighlight.strokePath();
  }

  setLoadingText(text: string) {
    this.loadingText.setText(text);
    this.loadingText.setVisible(true);
    this.updateElementPositions();
  }

  hideLoadingText() {
    this.loadingText.setVisible(false);
  }

  setModeText(text: string) {
    this.modeText.setText(text);
    this.updateElementPositions();
  }

  getUiElements() {
    return [
      this.infoText,
      this.modeText,
      this.loadingText,
      this.backToOverworldButton,
    ];
  }

  handleResize() {
    // Reset the position of the top element
    this.infoText.setPosition(10, 10);

    // Update positions of other elements
    this.updateElementPositions();

    // Reposition the back to overworld button
    if (this.backToOverworldButton) {
      const { width } = this.scene.scale;
      const buttonWidth = 180;
      const buttonHeight = 40;
      this.backToOverworldButton.setPosition(
        width - buttonWidth / 2 - this.padding,
        buttonHeight / 2 + this.padding
      );
    }
  }

  createBackToOverworldButton() {
    // Create a container for the button
    this.backToOverworldButton = this.scene.add.container(0, 0);
    this.backToOverworldButton.setDepth(1000);
    this.backToOverworldButton.setScrollFactor(0);
    this.backToOverworldButton.name = "backToOverworldButton";

    // Create button background
    const buttonWidth = 180;
    const buttonHeight = 40;
    const buttonBackground = this.scene.add.rectangle(
      0,
      0,
      buttonWidth,
      buttonHeight,
      0x333333
    );
    buttonBackground.setStrokeStyle(2, 0xffffff);

    // Create button text
    const buttonText = this.scene.add.text(0, 0, "Back to Overworld", {
      fontFamily: "'Pokemon Pixel Font', monospace, Arial",
      fontSize: "16px",
      color: "#ffffff",
    });
    buttonText.setOrigin(0.5, 0.5);

    // Add elements to container
    this.backToOverworldButton.add(buttonBackground);
    this.backToOverworldButton.add(buttonText);

    // Position the button in the top right corner
    const { width } = this.scene.scale;
    this.backToOverworldButton.setPosition(
      width - buttonWidth / 2 - this.padding,
      buttonHeight / 2 + this.padding
    );

    // Make the button interactive
    buttonBackground.setInteractive({ useHandCursor: true });

    // Add hover effects
    buttonBackground.on("pointerover", () => {
      buttonBackground.setFillStyle(0x555555);
    });

    buttonBackground.on("pointerout", () => {
      buttonBackground.setFillStyle(0x333333);
    });

    // Add click event
    buttonBackground.on("pointerdown", () => {
      // Emit an event that the TileViewer can listen for
      this.scene.events.emit("backToOverworldClicked");
    });

    // Hide by default
    this.backToOverworldButton.setVisible(false);
  }

  showBackToOverworldButton() {
    this.backToOverworldButton.setVisible(true);
  }

  hideBackToOverworldButton() {
    this.backToOverworldButton.setVisible(false);
  }

  // Add this method to refresh text elements after fonts are loaded
  refreshTextElements() {
    // Force a redraw of text elements by setting their text again
    if (this.infoText) {
      const currentText = this.infoText.text;
      this.infoText.setText(currentText);
    }
    
    if (this.modeText) {
      const currentText = this.modeText.text;
      this.modeText.setText(currentText);
    }
    
    if (this.loadingText) {
      const currentText = this.loadingText.text;
      this.loadingText.setText(currentText);
    }
    
    // Refresh button text if it exists
    if (this.backToOverworldButton && this.backToOverworldButton.list) {
      const buttonText = this.backToOverworldButton.list.find(
        child => child instanceof Phaser.GameObjects.Text
      ) as Phaser.GameObjects.Text;
      
      if (buttonText) {
        const currentText = buttonText.text;
        buttonText.setText(currentText);
      }
    }
  }
}
