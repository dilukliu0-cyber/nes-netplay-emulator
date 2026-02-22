import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const appRoot = process.cwd();
const projectRoot = path.resolve(appRoot, "..");
const distDir = path.join(appRoot, "dist");

const portableExe = fs
  .readdirSync(distDir)
  .filter((name) => /\.exe$/i.test(name) && !/^unins/i.test(name))
  .map((name) => path.join(distDir, name))
  .map((fullPath) => ({ fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs }))
  .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];

if (!portableExe) {
  throw new Error("Cannot find built portable exe in app/dist");
}

const target = path.join(projectRoot, "NES Emulator.exe");
try {
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Copy-Item -Path '${portableExe.fullPath}' -Destination '${target}' -Force`
    ],
    { stdio: "inherit" }
  );
} catch (error) {
  if (error && typeof error === "object") {
    throw new Error("Cannot update NES Emulator.exe because it is locked. Close the app and run npm run dist:one again.");
  }
  throw error;
}
console.log(`Updated root exe: ${target}`);
