#!/usr/bin/env python3

import os
import shutil
import glob
from PIL import Image


def extract_tileset_signs():
    """
    Extract sign tiles from forest.png and cavern.png tilesets
    """
    dest_dir = "sprites"
    os.makedirs(dest_dir, exist_ok=True)

    # Define the tileset files and crop coordinates
    tilesets = {
        "forest": {
            "file": os.path.join("pokemon-game-data", "gfx", "tilesets", "forest.png"),
            "crop": (8, 16, 24, 32),  # left, top, right, bottom (16x16 pixels)
            "output": os.path.join(dest_dir, "forest_sign.png"),
        },
        "cavern": {
            "file": os.path.join("pokemon-game-data", "gfx", "tilesets", "cavern.png"),
            "crop": (112, 0, 128, 16),  # top right 16x16 pixels
            "output": os.path.join(dest_dir, "cavern_sign.png"),
        },
    }

    extracted_count = 0

    for tileset_name, tileset_info in tilesets.items():
        try:
            # Open the tileset image
            img = Image.open(tileset_info["file"])

            # Crop the sign tile
            sign_tile = img.crop(tileset_info["crop"])

            # Save the sign tile
            sign_tile.save(tileset_info["output"])

            print(f"Extracted: {os.path.basename(tileset_info['output'])}")
            extracted_count += 1

        except Exception as e:
            print(f"Error extracting {tileset_name} sign: {e}")

    print(f"\nSuccessfully extracted {extracted_count} sign tiles")
    return extracted_count > 0


def copy_sprite_files():
    """
    Copy PNG files from pokemon-game-data/gfx/sprites to the sprites folder
    """
    # Define source and destination directories
    source_dir = os.path.join("pokemon-game-data", "gfx", "sprites")
    dest_dir = "sprites"

    # Ensure destination directory exists
    os.makedirs(dest_dir, exist_ok=True)

    # Find all PNG files in the source directory
    png_files = glob.glob(os.path.join(source_dir, "*.png"))

    if not png_files:
        print(f"No PNG files found in {source_dir}")
        return False

    # Copy each PNG file to the destination directory
    copied_count = 0
    for png_file in png_files:
        filename = os.path.basename(png_file)
        dest_path = os.path.join(dest_dir, filename)

        try:
            shutil.copy2(png_file, dest_path)
            copied_count += 1
            print(f"Copied: {filename}")
        except Exception as e:
            print(f"Error copying {filename}: {e}")

    print(f"\nSuccessfully copied {copied_count} PNG files to {dest_dir}")
    return True


if __name__ == "__main__":
    print("Starting sprite file copy process...")

    # Copy sprite files
    sprite_success = copy_sprite_files()

    # Extract tileset signs
    sign_success = extract_tileset_signs()

    if sprite_success and sign_success:
        print("File copy process completed successfully")
    else:
        print("File copy process failed")
        exit(1)
