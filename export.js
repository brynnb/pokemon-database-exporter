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
    return;
  }
  log("Item export successful");

  // Run move exports
  const movesSuccess = runCommand("python3 export_moves.py");
  if (!movesSuccess) {
    log("Move export failed");
    return;
  }
  log("Move export successful");

  // Run pokemon exports
  const pokemonSuccess = runCommand("python3 export_pokemon.py");
  if (!pokemonSuccess) {
    log("Pokemon export failed");
    return;
  }
  log("Pokemon export successful");

  // Run map exports
  const mapsSuccess = runCommand("python3 export_map.py");
  if (!mapsSuccess) {
    log("Map export failed");
    return;
  }
  log("Map export successful");

  // Run objects exports
  const objectsSuccess = runCommand("python3 export_objects.py");
  if (!objectsSuccess) {
    log("Objects export failed");
    return;
  }
  log("Objects export successful");

  // Run create zones and tiles
  const zonesAndTilesSuccess = runCommand("python3 create_zones_and_tiles.py");
  if (!zonesAndTilesSuccess) {
    log("Create zones and tiles failed");
    return;
  }
  log("Create zones and tiles successful");

  // Run update overworld tiles
  const overworldTilesSuccess = runCommand("python3 update_overworld_tiles.py");
  if (!overworldTilesSuccess) {
    log("Update overworld tiles failed");
    return;
  }
  log("Update overworld tiles successful");

  // Run update zone coordinates
  const zoneCoordinatesSuccess = runCommand(
    "python3 update_zone_coordinates.py"
  );
  if (!zoneCoordinatesSuccess) {
    log("Update zone coordinates failed");
    return;
  }
  log("Update zone coordinates successful");

  log("All exports completed");
}

// Run the exports
runExports().catch((error) => {
  console.error("Export process failed:", error);
  process.exit(1);
});
