import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const distDir = path.resolve(process.cwd(), "dist");

function killIfRunning(imageName) {
  try {
    execFileSync("taskkill", ["/F", "/IM", imageName], { stdio: "ignore" });
  } catch {
    // Process may be absent.
  }
}

function removeWithRetry(filePath, retries = 20, delayMs = 300) {
  for (let i = 0; i < retries; i += 1) {
    try {
      if (fs.existsSync(filePath)) {
        fs.rmSync(filePath, { force: true });
      }
      return;
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
    }
  }
  if (fs.existsSync(filePath)) {
    throw new Error(`Locked file: ${filePath}`);
  }
}

if (fs.existsSync(distDir)) {
  killIfRunning("7za.exe");
  killIfRunning("app-builder.exe");

  for (const name of fs.readdirSync(distDir)) {
    if (name.endsWith(".nsis.7z")) {
      removeWithRetry(path.join(distDir, name));
    }
  }
}
