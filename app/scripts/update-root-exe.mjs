import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { rcedit } from "rcedit";

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
const iconPath = path.join(appRoot, "build", "icon.ico");
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

if (fs.existsSync(iconPath)) {
  try {
    await rcedit(target, {
      icon: iconPath,
      "file-version": "2.0.0",
      "product-version": "2.0.0",
      "version-string": {
        ProductName: "NES Emulator 2",
        FileDescription: "NES emulator with online netplay support"
      }
    });
  } catch (error) {
    console.warn("Failed to patch icon/version on root exe:", error);
  }
}
console.log(`Updated root exe: ${target}`);
