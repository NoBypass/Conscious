import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "manifest.json",
  "src/content.js",
  "src/content/shared.js",
  "src/content/storage.js",
  "src/content/shorts.js",
  "src/content/watch-history.js",
  "src/content/daily-timer.js",
  "src/inpage-ui.js",
  "src/inpage.css"
];

for (const file of requiredFiles) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing required file: ${file}`);
  }
}

const manifestPath = path.join(root, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

if (manifest.manifest_version !== 3) {
  throw new Error("manifest_version must be 3");
}

if (!Array.isArray(manifest.content_scripts) || manifest.content_scripts.length === 0) {
  throw new Error("content_scripts must exist");
}

console.log("Validation passed: extension files and manifest look good.");
