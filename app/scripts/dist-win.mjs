import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const distDir = path.resolve(process.cwd(), "dist");
const maxAttempts = 6;

function runNodeScript(scriptPath, args = []) {
  const fullScriptPath = path.resolve(process.cwd(), scriptPath);
  const result = spawnSync(process.execPath, [fullScriptPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) {
    process.stderr.write(`spawn error: ${String(result.error)}\n`);
  }

  return result;
}

function killIfRunning(imageName) {
  try {
    execFileSync("taskkill", ["/F", "/IM", imageName], { stdio: "ignore" });
  } catch {
    // Process may be absent.
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function cleanupNsisArtifacts() {
  if (!fs.existsSync(distDir)) return;

  killIfRunning("7za.exe");
  killIfRunning("app-builder.exe");

  for (const name of fs.readdirSync(distDir)) {
    if (
      name.endsWith(".nsis.7z") ||
      name.endsWith(".nsis.zip") ||
      name.endsWith(".nsis.exe")
    ) {
      fs.rmSync(path.join(distDir, name), { force: true });
    }
  }
}

function shouldRetry(output) {
  const normalized = output.toLowerCase();
  return (
    normalized.includes("7za.exe") &&
    normalized.includes(".nsis.7z") &&
    (
      normalized.includes("exit code: 1") ||
      normalized.includes("exit code: 4294967295") ||
      normalized.includes("exit code: -1") ||
      normalized.includes("access is denied") ||
      normalized.includes("cannot open file") ||
      normalized.includes("command failed")
    )
  );
}

cleanupNsisArtifacts();

const tscRendererResult = runNodeScript("node_modules/typescript/bin/tsc", [
  "-p",
  "tsconfig.json"
]);
if (tscRendererResult.status !== 0) {
  process.exit(tscRendererResult.status ?? 1);
}

const viteBuildResult = runNodeScript("node_modules/vite/bin/vite.js", ["build"]);
if (viteBuildResult.status !== 0) {
  process.exit(viteBuildResult.status ?? 1);
}

const tscElectronResult = runNodeScript("node_modules/typescript/bin/tsc", [
  "-p",
  "tsconfig.electron.json"
]);
if (tscElectronResult.status !== 0) {
  process.exit(tscElectronResult.status ?? 1);
}

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  const builderResult = runNodeScript("node_modules/electron-builder/cli.js", [
    "--win",
    "nsis",
    "--config.npmRebuild=false",
    "--config.win.signAndEditExecutable=false"
  ]);

  if (builderResult.status === 0) {
    process.exit(0);
  }

  const combinedOutput = `${builderResult.stdout ?? ""}\n${builderResult.stderr ?? ""}`;
  const canRetry = shouldRetry(combinedOutput) && attempt < maxAttempts;
  if (!canRetry) {
    process.exit(builderResult.status ?? 1);
  }

  process.stderr.write(
    `\nRetrying electron-builder (${attempt + 1}/${maxAttempts}) after 7za NSIS packaging failure...\n`
  );
  cleanupNsisArtifacts();
  sleep(4000);
}
