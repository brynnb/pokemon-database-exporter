import { Scene } from "phaser";
import { TILE_SIZE } from "../constants";

export class UiManager {
  private scene: Scene;
  private infoText: Phaser.GameObjects.Text;
  private modeText: Phaser.GameObjects.Text;
  private loadingText: Phaser.GameObjects.Text;

  constructor(scene: Scene) {
    this.scene = scene;
    this.createUiElements();
  }

  createUiElements() {
    // Add info text for displaying tile information
    this.infoText = this.scene.add.text(10, 10, "", {
      fontFamily: "Arial",
      fontSize: "16px",
      color: "#ffffff",
      backgroundColor: "#000000",
    });
    this.infoText.setDepth(1000); // Ensure it's always on top
    this.infoText.setScrollFactor(0);

    // Add view mode indicator
    this.modeText = this.scene.add.text(10, 30, "Overworld View", {
      fontFamily: "Arial",
      fontSize: "16px",
      color: "#ffffff",
      backgroundColor: "#000000",
    });
    this.modeText.setDepth(1000); // Ensure it's always on top
    this.modeText.setScrollFactor(0);

    // Add loading text
    this.loadingText = this.scene.add.text(10, 50, "Loading map data...", {
      color: "#ffffff",
      fontSize: "18px",
      backgroundColor: "#000000",
    });
    this.loadingText.setScrollFactor(0);
    this.loadingText.setDepth(1000); // Ensure it's always on top
  }

  updateTileInfo(
    pointer: Phaser.Input.Pointer,
    tiles: any[],
    items: any[],
    zoneInfo: any,
    getWorldPoint: (x: number, y: number) => Phaser.Math.Vector2
  ) {
    // Convert screen coordinates to world coordinates
    const worldPoint = getWorldPoint(pointer.x, pointer.y);

    // Convert world coordinates to tile coordinates
    const tileX = Math.floor(worldPoint.x / TILE_SIZE);
    const tileY = Math.floor(worldPoint.y / TILE_SIZE);

    // Check if we have zone info
    if (!zoneInfo) {
      this.infoText.setText("No zone info available");
      return;
    }

    // Build info text
    let info = `Tile: (${tileX}, ${tileY})`;

    // In overworld mode, find the zone for this tile
    const tile = tiles.find((t) => t.x === tileX && t.y === tileY);
    if (tile && tile.zone_id) {
      // Try to find the zone name from another tile with the same zone_id
      const zoneNameTile = tiles.find(
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
    info += `\nView: ${zoneInfo.name}`;

    if (zoneInfo.tileset_id) {
      info += `\nTileset ID: ${zoneInfo.tileset_id}`;
    }

    if (zoneInfo.is_overworld) {
      info += `\nOverworld: Yes`;
    }

    // Find tile at this position
    if (tile) {
      info += `\nTile ID: ${tile.tile_image_id}`;
    }

    // Find item at this position
    const item = items.find((i) => i.x === tileX && i.y === tileY);
    if (item) {
      info += `\nItem: ${item.name}`;
      if (item.description) {
        info += `\nDescription: ${item.description}`;
      }
    }

    // Update the info text
    this.infoText.setText(info);
  }

  setLoadingText(text: string) {
    this.loadingText.setText(text);
    this.loadingText.setVisible(true);
  }

  hideLoadingText() {
    this.loadingText.setVisible(false);
  }

  setModeText(text: string) {
    this.modeText.setText(text);
  }

  getUiElements() {
    return [this.infoText, this.modeText, this.loadingText];
  }

  handleResize() {
    // Ensure text elements stay in the correct position
    this.infoText.setPosition(10, 10);
    this.modeText.setPosition(10, 30);
    this.loadingText.setPosition(10, 50);
  }
}
