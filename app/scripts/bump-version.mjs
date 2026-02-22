import fs from "node:fs";
import path from "node:path";

const packageJsonPath = path.resolve(process.cwd(), "package.json");
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

const [majorRaw, minorRaw, patchRaw] = String(pkg.version || "1.0.0").split(".");
const major = Number(majorRaw);
const minor = Number(minorRaw);
const patch = Number(patchRaw);

if (!Number.isInteger(major) || !Number.isInteger(minor) || !Number.isInteger(patch)) {
  throw new Error(`Invalid version format: ${pkg.version}`);
}

const nextPatch = patch + 1;
const nextVersion = `${major}.${minor}.${nextPatch}`;
const displayVersion = `${major}.${String(nextPatch).padStart(2, "0")}`;

pkg.version = nextVersion;
pkg.build = pkg.build || {};
pkg.build.productName = `NES Emulator ${displayVersion}`;
pkg.build.artifactName = `NES Emulator Setup ${displayVersion}.\${ext}`;
pkg.build.extraMetadata = {
  ...(pkg.build.extraMetadata || {}),
  displayVersion
};
pkg.build.win = {
  ...(pkg.build.win || {}),
  executableName: `NES Emulator ${displayVersion}`
};

fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
console.log(`Version bumped: ${nextVersion} (display ${displayVersion})`);
