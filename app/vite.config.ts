import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import * as fs from "fs";
import * as path from "path";

const packageJsonPath = path.resolve(__dirname, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as { version: string };
const [majorRaw, , patchRaw] = packageJson.version.split(".");
const displayVersion = `${Number(majorRaw) || 1}.${String(Number(patchRaw) || 0).padStart(2, "0")}`;
const appDisplayName = `NES Emulator ${displayVersion}`;

export default defineConfig({
  base: "./",
  plugins: [react()],
  define: {
    __APP_DISPLAY_NAME__: JSON.stringify(appDisplayName)
  },
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true
  },
  server: {
    host: "127.0.0.1",
    port: 5173
  }
});
