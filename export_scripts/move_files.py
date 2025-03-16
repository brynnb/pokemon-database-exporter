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

            extracted_count += 1

        except Exception as e:
            print(f"Error extracting {tileset_name} sign: {e}")

    print(f"Successfully extracted {extracted_count} sign tiles")
    return extracted_count > 0


def make_white_pixels_transparent(source_path, dest_path, filename="image"):
    """
    Make white pixels transparent in an image
    """
    try:
        # Open the image
        img = Image.open(source_path)

        # Convert to RGBA if not already
        if img.mode != "RGBA":
            img = img.convert("RGBA")

        # Get the pixel data
        data = img.getdata()

        # Create a new list of pixel data with white pixels made transparent
        new_data = []
        for item in data:
            # If the pixel is white (255, 255, 255), make it transparent
            if item[0] >= 240 and item[1] >= 240 and item[2] >= 240:
                new_data.append((255, 255, 255, 0))
            else:
                new_data.append(item)

        # Update the image with the new data
        img.putdata(new_data)

        # Save the image
        img.save(dest_path)
        return True

    except Exception as e:
        print(f"Error processing {filename}: {e}")
        return False


def copy_sprite_files():
    """
    Copy sprite files from pokemon-game-data to sprites directory
    """
    # Create sprites directory if it doesn't exist
    dest_dir = "sprites"
    os.makedirs(dest_dir, exist_ok=True)

    # Define source directories and file patterns
    sprite_sources = [
        {
            "dir": os.path.join("pokemon-game-data", "gfx", "sprites"),
            "pattern": "*.png",
            "make_transparent": True,
        },
        {
            "dir": os.path.join("pokemon-game-data", "gfx", "tilesets"),
            "pattern": "*.png",
            "make_transparent": False,
        },
    ]

    copied_count = 0
    transparent_count = 0

    for source in sprite_sources:
        source_dir = source["dir"]
        pattern = source["pattern"]
        make_transparent = source["make_transparent"]

        # Find all matching files
        files = glob.glob(os.path.join(source_dir, pattern))

        for file_path in files:
            # Get the filename
            filename = os.path.basename(file_path)

            # Define the destination path
            dest_path = os.path.join(dest_dir, filename)

            try:
                # Copy the file
                shutil.copy2(file_path, dest_path)
                copied_count += 1

                # Make white pixels transparent if needed
                if make_transparent:
                    if make_white_pixels_transparent(dest_path, dest_path, filename):
                        transparent_count += 1

            except Exception as e:
                print(f"Error copying {filename}: {e}")

    print(f"Successfully copied {copied_count} sprite files")
    print(f"Successfully made {transparent_count} sprite files transparent")
    return copied_count > 0


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
