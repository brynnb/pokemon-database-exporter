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
    // Only log the summary lines, not all the individual items
    const summaryLines = output
      .trim()
      .split("\n")
      .filter(
        (line) =>
          line.includes("Successfully") ||
          line.includes("Found") ||
          line.includes("Processed") ||
          line.includes("Added") ||
          line.includes("Resolved") ||
          line.includes("Error")
      );

    summaryLines.forEach((line) => log(line));
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
  const itemsSuccess = runCommand("python3 export_scripts/export_items.py");
  if (!itemsSuccess) {
    log("Item export failed");
    return;
  }
  log("Item export successful");

  // Run move exports
  const movesSuccess = runCommand("python3 export_scripts/export_moves.py");
  if (!movesSuccess) {
    log("Move export failed");
    return;
  }
  log("Move export successful");

  // Run pokemon exports
  const pokemonSuccess = runCommand("python3 export_scripts/export_pokemon.py");
  if (!pokemonSuccess) {
    log("Pokemon export failed");
    return;
  }
  log("Pokemon export successful");

  // Run map exports
  const mapsSuccess = runCommand("python3 export_scripts/export_map.py");
  if (!mapsSuccess) {
    log("Map export failed");
    return;
  }
  log("Map export successful");

  // Run create zones and tiles
  const zonesAndTilesSuccess = runCommand(
    "python3 export_scripts/create_zones_and_tiles.py"
  );
  if (!zonesAndTilesSuccess) {
    log("Create zones and tiles failed");
    return;
  }
  log("Create zones and tiles successful");

  // Run update overworld tiles
  const overworldTilesSuccess = runCommand(
    "python3 export_scripts/update_overworld_tiles.py"
  );
  if (!overworldTilesSuccess) {
    log("Update overworld tiles failed");
    return;
  }
  log("Update overworld tiles successful");

  // Run update zone coordinates
  const zoneCoordinatesSuccess = runCommand(
    "python3 export_scripts/update_zone_coordinates.py"
  );
  if (!zoneCoordinatesSuccess) {
    log("Update zone coordinates failed");
    return;
  }
  log("Update zone coordinates successful");

  // Run warps exports
  const warpsSuccess = runCommand("python3 export_scripts/export_warps.py");
  if (!warpsSuccess) {
    log("Warps export failed");
    return;
  }
  log("Warps export successful");

  // Run objects exports
  const objectsSuccess = runCommand("python3 export_scripts/export_objects.py");
  if (!objectsSuccess) {
    log("Objects export failed");
    return;
  }
  log("Objects export successful");

  // Run update object coordinates
  const objectCoordinatesSuccess = runCommand(
    "python3 export_scripts/update_object_coordinates.py"
  );
  if (!objectCoordinatesSuccess) {
    log("Update object coordinates failed");
    return;
  }
  log("Update object coordinates successful");

  // Run move files script
  const moveFilesSuccess = runCommand("python3 export_scripts/move_files.py");
  if (!moveFilesSuccess) {
    log("Move files failed");
    return;
  }
  log("Move files successful");

  log("All exports completed");
}

// Run the exports
runExports().catch((error) => {
  console.error("Export process failed:", error);
  process.exit(1);
});
