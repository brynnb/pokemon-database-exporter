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
- **+/-**: Zoom in/out
- **S**: Save screenshot
- **O**: Save outline screenshot
- **ESC**: Quit the viewer
