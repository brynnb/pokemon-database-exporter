import { Scene } from "phaser";
import { TILE_SIZE } from "../constants";

export class UiManager {
  private scene: Scene;
  private infoText: Phaser.GameObjects.Text;
  private modeText: Phaser.GameObjects.Text;
  private loadingText: Phaser.GameObjects.Text;
  private tileHighlight: Phaser.GameObjects.Graphics;
  private padding = 10; // Padding between UI elements

  constructor(scene: Scene) {
    this.scene = scene;
    this.createUiElements();
    this.createTileHighlight();
  }

  createUiElements() {
    // Add info text for displaying tile information
    this.infoText = this.scene.add.text(10, 10, "", {
      fontFamily: "Arial",
      fontSize: "16px",
      color: "#ffffff",
      backgroundColor: "#000000",
      padding: { x: 5, y: 5 },
    });
    this.infoText.setDepth(1000); // Ensure it's always on top
    this.infoText.setScrollFactor(0);

    // Add view mode indicator
    this.modeText = this.scene.add.text(10, 30, "Overworld View", {
      fontFamily: "Arial",
      fontSize: "16px",
      color: "#ffffff",
      backgroundColor: "#000000",
      padding: { x: 5, y: 5 },
    });
    this.modeText.setDepth(1000); // Ensure it's always on top
    this.modeText.setScrollFactor(0);

    // Add loading text
    this.loadingText = this.scene.add.text(10, 50, "Loading map data...", {
      color: "#ffffff",
      fontSize: "18px",
      backgroundColor: "#000000",
      padding: { x: 5, y: 5 },
    });
    this.loadingText.setScrollFactor(0);
    this.loadingText.setDepth(1000); // Ensure it's always on top

    // Position elements correctly
    this.updateElementPositions();
  }

  createTileHighlight() {
    this.tileHighlight = this.scene.add.graphics();
    this.tileHighlight.setDepth(500); // Set depth to be above tiles but below UI
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
      info += `\nDestination: Zone ${warp.destination_zone_id} at (${warp.destination_x}, ${warp.destination_y})`;
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
    return [this.infoText, this.modeText, this.loadingText];
  }

  handleResize() {
    // Reset the position of the top element
    this.infoText.setPosition(10, 10);

    // Update positions of other elements
    this.updateElementPositions();
  }
}
