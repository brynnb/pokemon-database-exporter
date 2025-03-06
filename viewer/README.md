# Pokemon Tile Viewer

This project provides three different ways to view the tiles from the Pokemon database:

1. **Pygame Viewer** - An interactive viewer using Pygame
2. **Simple Image Viewer** - A static image generator using Pillow
3. **Web Viewer** - A web-based viewer using Flask

## Prerequisites

Before using any of the viewers, make sure you have the required dependencies installed:

```bash
pip install pygame pillow flask
```

## 1. Pygame Viewer

The Pygame viewer provides an interactive way to view the tiles with panning capabilities.

### Usage

```bash
python tile_viewer.py [zone_id]
```

If no zone_id is provided, it will default to zone 15.

### Controls

- **Arrow keys**: Pan the view
- **Mouse drag**: Pan the view
- **ESC**: Quit the viewer

## 2. Simple Image Viewer

The simple image viewer generates a static PNG image of the zone and opens it with your default image viewer.

### Usage

```bash
python simple_tile_viewer.py [zone_id]
```

If no zone_id is provided, it will default to zone 15.

The generated images are saved in the `zone_images` directory.

## 3. Web Viewer

The web viewer provides a browser-based interface to view and download zone images.

### Usage

```bash
python web_tile_viewer.py
```

Then open your web browser and navigate to:

```
http://127.0.0.1:5000
```

### Features

- Select different zones from a dropdown menu
- View zone images in the browser
- Download zone images as PNG files
