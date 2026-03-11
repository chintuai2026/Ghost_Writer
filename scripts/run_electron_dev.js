const { spawn, execFileSync } = require("child_process");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const electronBinary = require("electron");
const env = { ...process.env, NODE_ENV: "development" };

delete env.ELECTRON_RUN_AS_NODE;

function cleanupInstalledGhostWriter() {
  if (process.platform !== "win32") {
    return;
  }

  try {
    const electronPath = path.join(projectRoot, "node_modules", "electron", "dist", "electron.exe")
      .replace(/'/g, "''");

    execFileSync("powershell", [
      "-NoProfile",
      "-Command",
      "$ErrorActionPreference='SilentlyContinue'; " +
      `$electronPath = '${electronPath}'; ` +
      "Get-Process 'Ghost Writer' -ErrorAction SilentlyContinue | Stop-Process -Force; " +
      "Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $electronPath } | Stop-Process -Force; " +
      "Start-Sleep -Milliseconds 300"
    ], {
      cwd: projectRoot,
      stdio: "ignore",
      windowsHide: true,
    });
  } catch {
    // Best-effort dev cleanup only.
  }
}

cleanupInstalledGhostWriter();

const child = spawn(electronBinary, [path.join(projectRoot, "dist-electron", "main.js")], {
  cwd: projectRoot,
  stdio: "inherit",
  env,
  windowsHide: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error("[run_electron_dev] Failed to start Electron:", error);
  process.exit(1);
});
