#!/usr/bin/env node
// Starts the uvPaint desktop app with the Electron runtime installed alongside this package.
const { spawn } = require("node:child_process");
const path = require("node:path");

const electron = require("electron");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [path.join(__dirname, ".."), ...process.argv.slice(2)], {
  detached: true,
  stdio: "ignore",
  env,
});
child.on("error", (error) => {
  console.error(`uvPaint could not start: ${error.message}`);
  process.exit(1);
});
child.unref();
