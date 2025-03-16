import { Scene } from "phaser";
import { getSpriteUrl } from "../api";
import { TILE_SIZE } from "../constants";

export class SpriteManager {
  private scene: Scene;
  private spriteCache: Map<string, string> = new Map();

  constructor(scene: Scene) {
    this.scene = scene;
    this.createFallbackSprites();
  }

  private createFallbackSprites() {
    // Create a fallback item marker if the poke_ball image fails to load
    if (!this.scene.textures.exists("item-marker-fallback")) {
      const graphics = this.scene.make.graphics({ x: 0, y: 0 });
      graphics.fillStyle(0xff0000);
      graphics.fillCircle(TILE_SIZE / 4, TILE_SIZE / 4, TILE_SIZE / 4);
      graphics.generateTexture(
        "item-marker-fallback",
        TILE_SIZE / 2,
        TILE_SIZE / 2
      );
      graphics.destroy();
    }

    // Create a fallback NPC sprite
    if (!this.scene.textures.exists("npc-fallback")) {
      const npcGraphics = this.scene.make.graphics({ x: 0, y: 0 });
      npcGraphics.fillStyle(0x0000ff); // Blue color for fallback NPC
      npcGraphics.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      npcGraphics.lineStyle(1, 0xffffff);
      npcGraphics.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);
      npcGraphics.generateTexture("npc-fallback", TILE_SIZE, TILE_SIZE);
      npcGraphics.destroy();
    }
  }

  async loadSprite(spriteName: string, spriteKey: string): Promise<string> {
    // Check if we've already loaded this sprite
    if (this.scene.textures.exists(spriteKey)) {
      console.log(`Sprite ${spriteKey} already loaded, reusing`);
      return spriteKey;
    }

    try {
      // Get the sprite URL
      const spriteUrl = getSpriteUrl(spriteName);
      console.log(`Loading sprite: ${spriteName} -> ${spriteUrl}`);

      // Store in cache for future reference
      this.spriteCache.set(spriteName, spriteKey);

      // Load the sprite
      this.scene.load.image(spriteKey, spriteUrl);

      // Add error handler for this specific sprite
      this.scene.load.once(`filecomplete-image-${spriteKey}`, () => {
        console.log(`Successfully loaded sprite: ${spriteKey}`);
      });

      this.scene.load.once(`loaderror`, (fileObj: any) => {
        if (fileObj.key === spriteKey) {
          console.error(
            `Failed to load sprite: ${spriteKey}, URL: ${spriteUrl}`
          );
        }
      });

      // Start the load
      await new Promise<void>((resolve) => {
        this.scene.load.once("complete", () => {
          resolve();
        });
        this.scene.load.start();
      });

      // Verify the texture was loaded
      if (this.scene.textures.exists(spriteKey)) {
        console.log(`Verified sprite ${spriteKey} is loaded`);
        return spriteKey;
      } else {
        console.warn(`Sprite ${spriteKey} failed to load despite no error`);
        return "item-marker-fallback";
      }
    } catch (error) {
      console.error(`Error loading sprite ${spriteName}:`, error);
      return "item-marker-fallback";
    }
  }

  preloadCommonSprites() {
    // Load the poke_ball image for items using the sprite API
    this.scene.load.image("item-marker", getSpriteUrl("poke_ball.png"));
  }

  clearCache() {
    this.spriteCache.clear();
  }
}
