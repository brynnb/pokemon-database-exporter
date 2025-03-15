import { Scene } from "phaser";
import { TileImageCacheEntry } from "../api";
import { TILE_SIZE } from "../constants";

export class MapRenderer {
  private scene: Scene;
  private mapContainer: Phaser.GameObjects.Container;
  private tileImages: Map<number, Phaser.GameObjects.Image> = new Map();

  constructor(scene: Scene, mapContainer: Phaser.GameObjects.Container) {
    this.scene = scene;
    this.mapContainer = mapContainer;
  }

  renderMap(tiles: any[], items: any[], warps: any[] = []) {
    console.log(
      `Rendering map with ${tiles.length} tiles, ${items.length} items, ${warps.length} warps`
    );

    // Clear existing map - ensure proper cleanup
    this.clear();

    // Render each tile
    for (const tile of tiles) {
      const { x, y, tile_image_id, map_id } = tile;

      // Calculate position
      const posX = x * TILE_SIZE;
      const posY = y * TILE_SIZE;

      // Create tile sprite using the texture (either preloaded or fallback)
      const tileKey = `tile-${tile_image_id}`;

      // Create the tile sprite normally
      const tileSprite = this.scene.add.image(posX, posY, tileKey);
      tileSprite.setOrigin(0, 0);
      tileSprite.setDisplaySize(TILE_SIZE, TILE_SIZE);

      // Store the tile_image_id and map_id for later reference
      (tileSprite as any).tileImageId = tile_image_id;
      (tileSprite as any).mapId = map_id;

      // Add to container
      this.mapContainer.add(tileSprite);

      // Store reference
      this.tileImages.set(x * 1000 + y, tileSprite);
    }

    // Render items
    for (const item of items) {
      // Use the item-marker texture (poke_ball.png)
      const textureKey = this.scene.textures.exists("item-marker")
        ? "item-marker"
        : "item-marker-fallback";

      const itemSprite = this.scene.add.image(
        item.x * TILE_SIZE + TILE_SIZE / 2,
        item.y * TILE_SIZE + TILE_SIZE / 2,
        textureKey
      );

      // Set appropriate size based on the texture used
      if (textureKey === "item-marker-fallback") {
        itemSprite.setDisplaySize(TILE_SIZE / 2, TILE_SIZE / 2);
      } else {
        // Set an appropriate size for the poke_ball image
        itemSprite.setDisplaySize(TILE_SIZE * 0.75, TILE_SIZE * 0.75);
      }

      // Store item data in the sprite for hover info
      (itemSprite as any).itemData = item;

      // Add to container
      this.mapContainer.add(itemSprite);
    }

    // Render warps
    for (const warp of warps) {
      // Create a transparent red square for each warp
      const warpGraphics = this.scene.add.rectangle(
        warp.x * TILE_SIZE + TILE_SIZE / 2,
        warp.y * TILE_SIZE + TILE_SIZE / 2,
        TILE_SIZE,
        TILE_SIZE,
        0xff0000,
        0.5
      );

      // Store warp data in the graphics object for hover info
      (warpGraphics as any).warpData = warp;

      // Make the warp interactive
      warpGraphics.setInteractive();

      // Add a pointer cursor on hover
      warpGraphics.on("pointerover", () => {
        this.scene.input.setDefaultCursor("pointer");
      });

      warpGraphics.on("pointerout", () => {
        this.scene.input.setDefaultCursor("default");
      });

      // Emit an event when the warp is clicked
      warpGraphics.on("pointerdown", () => {
        // Add a visual effect when clicking
        const flashEffect = this.scene.tweens.add({
          targets: warpGraphics,
          alpha: { from: 0.5, to: 1 },
          duration: 150,
          yoyo: true,
          repeat: 2,
          onComplete: () => {
            // Emit the warp clicked event after the effect completes
            this.scene.events.emit("warpClicked", warp);
          },
        });
      });

      // Add to container
      this.mapContainer.add(warpGraphics);
    }

    return this.calculateMapBounds(tiles);
  }

  updateTile(x: number, y: number, newTileImageId: number): boolean {
    // Get the tile sprite at the specified position
    const tileSprite = this.tileImages.get(x * 1000 + y);

    if (!tileSprite) {
      console.warn(`No tile found at position (${x}, ${y})`);
      return false;
    }

    // Get the new texture key
    const newTileKey = `tile-${newTileImageId}`;

    // Check if the texture exists
    if (!this.scene.textures.exists(newTileKey)) {
      console.warn(`Texture ${newTileKey} does not exist`);
      return false;
    }

    // Update the texture
    tileSprite.setTexture(newTileKey);

    // Update the stored tile image ID
    (tileSprite as any).tileImageId = newTileImageId;

    return true;
  }

  calculateMapBounds(tiles: any[]) {
    if (tiles.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    // Find the bounds of the map
    for (const tile of tiles) {
      minX = Math.min(minX, tile.x);
      minY = Math.min(minY, tile.y);
      maxX = Math.max(maxX, tile.x);
      maxY = Math.max(maxY, tile.y);
    }

    const mapWidth = (maxX - minX + 1) * TILE_SIZE;
    const mapHeight = (maxY - minY + 1) * TILE_SIZE;

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: mapWidth,
      height: mapHeight,
      centerX: minX * TILE_SIZE + mapWidth / 2,
      centerY: minY * TILE_SIZE + mapHeight / 2,
    };
  }

  getTileAt(x: number, y: number) {
    return this.tileImages.get(x * 1000 + y);
  }

  clear() {
    console.log("Clearing map renderer");

    try {
      // Destroy all children to ensure proper cleanup
      if (this.mapContainer) {
        this.mapContainer.each((child: Phaser.GameObjects.GameObject) => {
          if (child) {
            child.destroy();
          }
        });

        // Remove all children from the container
        this.mapContainer.removeAll(true);
      }

      // Clear the tile images map
      this.tileImages.clear();
    } catch (error) {
      console.error("Error clearing map renderer:", error);
    }
  }

  private createTileSprite(tile: any): Phaser.GameObjects.Sprite {
    // Extract tile properties
    const { x, y, tile_image_id, map_id } = tile;

    // Create a sprite for the tile
    const tileSprite = this.scene.add.sprite(
      x * TILE_SIZE,
      y * TILE_SIZE,
      `tile_${tile_image_id}`
    );

    // Set the origin to the top-left corner
    tileSprite.setOrigin(0, 0);

    // Store the tile_image_id and map_id for later reference
    (tileSprite as any).tileImageId = tile_image_id;
    (tileSprite as any).mapId = map_id;

    return tileSprite;
  }
}
