const { spawn } = require("child_process");
const path = require("path");

// Start the Vite development server
const viteProcess = spawn("npm", ["run", "dev"], {
  stdio: "inherit",
  shell: true,
});

// Start the API server
const apiProcess = spawn("node", ["server.js"], {
  stdio: "inherit",
  shell: true,
});

// Handle process termination
process.on("SIGINT", () => {
  console.log("Shutting down development servers...");
  viteProcess.kill();
  apiProcess.kill();
  process.exit(0);
});

console.log("Development servers started:");
console.log("- Vite server: http://localhost:8080");
console.log("- API server: http://localhost:3000");
console.log("Press Ctrl+C to stop both servers.");
