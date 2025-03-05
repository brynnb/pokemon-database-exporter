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

  log("All exports completed");
}

// Run the exports
runExports().catch((error) => {
  console.error("Export process failed:", error);
  process.exit(1);
});
