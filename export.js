const { execSync } = require("child_process");
const path = require("path");

// Log with timestamp
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// Run a command and log its output
function runCommand(command) {
  log(`Running: ${command}`);
  try {
    const output = execSync(command, { encoding: "utf8" });
    log(output.trim());
    return true;
  } catch (error) {
    log(`Error: ${error.message}`);
    return false;
  }
}

// Main export function
async function runExports() {
  log("Starting Pokemon data exports...");

  // Run item exports
  const itemsSuccess = runCommand("python3 export_items.py");
  if (!itemsSuccess) {
    log("Item export failed");
  }

  // Run move exports
  const movesSuccess = runCommand("python3 export_moves.py");
  if (!movesSuccess) {
    log("Move export failed");
  }

  // Run map exports
  const mapsSuccess = runCommand("python3 export_map.py");
  if (!mapsSuccess) {
    log("Map export failed");
  } else {
    log("Map export successful");

    // Render some popular maps
    const popularMaps = [
      "PALLET_TOWN",
      "VIRIDIAN_CITY",
      "PEWTER_CITY",
      "CERULEAN_CITY",
      "CELADON_CITY",
      "LAVENDER_TOWN",
      "VERMILION_CITY",
      "SAFFRON_CITY",
      "CINNABAR_ISLAND",
      "INDIGO_PLATEAU",
      "BIKE_SHOP",
    ];

    // Create maps directory if it doesn't exist
    runCommand("mkdir -p exported_maps");

    // Render each map
    let renderedCount = 0;
    for (const map of popularMaps) {
      log(`Rendering map: ${map}`);
      const renderSuccess = runCommand(
        `python3 export_map.py --render ${map} --output exported_maps/${map.toLowerCase()}.png`
      );
      if (renderSuccess) {
        renderedCount++;
      }
    }

    log(`Successfully rendered ${renderedCount} of ${popularMaps.length} maps`);
  }

  log("All exports completed");
}

// Run the exports
runExports().catch((error) => {
  console.error("Export process failed:", error);
  process.exit(1);
});
