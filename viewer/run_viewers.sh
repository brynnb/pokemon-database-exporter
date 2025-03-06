#!/bin/bash

# Activate the virtual environment
source ../venv/bin/activate

# Unalias python if it exists
if alias python &>/dev/null; then
    unalias python
fi

# Function to run the simple tile viewer
run_simple() {
    echo "Running Simple Tile Viewer..."
    ../venv/bin/python simple_tile_viewer.py "$@"
}

# Function to run the web tile viewer
run_web() {
    echo "Running Web Tile Viewer..."
    echo "Open http://127.0.0.1:5000 in your web browser"
    ../venv/bin/python web_tile_viewer.py
}

# Function to run the pygame tile viewer
run_pygame() {
    echo "Running Pygame Tile Viewer..."
    ../venv/bin/python tile_viewer.py "$@"
}

# Check command line arguments
if [ $# -eq 0 ]; then
    echo "Usage: $0 [simple|web|pygame] [zone_id]"
    echo "  simple: Run the simple tile viewer"
    echo "  web: Run the web tile viewer"
    echo "  pygame: Run the pygame tile viewer"
    echo "  zone_id: Optional zone ID to display (default: 15)"
    exit 1
fi

# Run the appropriate viewer
case "$1" in
    simple)
        shift
        run_simple "$@"
        ;;
    web)
        run_web
        ;;
    pygame)
        shift
        run_pygame "$@"
        ;;
    *)
        echo "Unknown viewer: $1"
        echo "Usage: $0 [simple|web|pygame] [zone_id]"
        exit 1
        ;;
esac 