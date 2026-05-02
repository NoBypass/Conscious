import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "manifest.json",
  "src/domain/constants.js",
  "src/domain/formatters.js",
  "src/domain/watch-history/video-details.js",
  "src/domain/watch-history/timeline.js",
  "src/domain/watch-history/media-progress.js",
  "src/domain/watch-history.js",
  "src/domain/inpage-metrics.js",
  "src/ports/storage-port.js",
  "src/adapters/youtube/content-dom.js",
  "src/adapters/youtube/inpage-dom.js",
  "src/application/content/shorts-blocker.js",
  "src/application/content/header-declutter.js",
  "src/application/content/daily-timer.js",
  "src/application/content/watch-session.js",
  "src/application/content-app.js",
  "src/ui/inpage/state.js",
  "src/ui/inpage/page-root.js",
  "src/ui/inpage/history-list.js",
  "src/ui/inpage/heatmap.js",
  "src/ui/inpage/day-trend.js",
  "src/ui/inpage/stats.js",
  "src/ui/inpage/guide.js",
  "src/ui/inpage/page.js",
  "src/application/inpage-app.js",
  "src/entry/content-script.js",
  "src/entry/inpage-script.js",
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
