#!/bin/bash

# Activate the virtual environment
source ../venv/bin/activate

# Unalias python if it exists
if alias python &>/dev/null; then
    unalias python
fi

# Function to run the pygame tile viewer
run_pygame() {
    echo "Running Pygame Tile Viewer..."
    ../venv/bin/python tile_viewer.py "$@"
}

# Check command line arguments
if [ $# -eq 0 ]; then
    echo "Usage: $0 [zone_id]"
    echo "  zone_id: Optional zone ID to display (default: 15)"
    run_pygame
    exit 0
fi

# Run the pygame viewer
run_pygame "$@" 