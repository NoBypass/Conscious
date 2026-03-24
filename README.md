# Conscious (Chrome Extension)

> Note: It's vibecoded ~~slop~~

Conscious adds a custom YouTube subpage and sidebar entry to help you control and review your viewing behavior.

## Features

- Adds a **Conscious** button to the YouTube left sidebar.
- Clicking it navigates to a custom route: `/feed/history?conscious=1`.
- On that page, you can toggle **Disable all Shorts**.
- On that page, you can toggle a **daily top-bar timer** for YouTube watch time.
- On that page, you can toggle **header declutter** (hides voice search and Create).
- Tracks watch time on standard YouTube watch pages (`/watch?v=...`).
- Shows watch history with title, total watched duration, and last watched time.
- Shows a daily heatmap with per-day watch duration and video counts.
- Shows a day trend graph comparing today's cumulative watch curve to your historical average day.

## Data storage

- `chrome.storage.sync`
  - `shortsDisabled`: whether Shorts blocking is enabled.
  - `dailyWatchTimerEnabled`: whether the top-bar daily timer is enabled.
  - `headerDeclutterEnabled`: whether voice search and Create are hidden in the masthead.
- `chrome.storage.local`
  - `watchHistory`: tracked watch history entries.

## Architecture

This project now follows a layered structure to keep behavior loosely coupled and easier to extend:

- `src/domain/`: pure logic and reusable computations.
- `src/ports/`: browser-facing ports (storage access).
- `src/adapters/`: YouTube DOM adapters.
- `src/application/`: orchestration and feature runtime flows.
- `src/ui/`: in-page rendering and view composition.
- `src/entry/`: script entry points loaded by `manifest.json`.

### Project structure

- `manifest.json`: Extension configuration (Manifest V3).
- `src/domain/constants.js`: global keys/config/state and namespace setup.
- `src/domain/formatters.js`: shared formatters and route/session helpers.
- `src/domain/watch-history.js`: watch-session domain logic.
- `src/domain/inpage-metrics.js`: in-page metrics aggregation and chart helpers.
- `src/ports/storage-port.js`: `chrome.storage` read/write + write queue.
- `src/adapters/youtube/content-dom.js`: DOM operations for content features.
- `src/adapters/youtube/inpage-dom.js`: DOM operations for in-page route and guide containers.
- `src/application/content-app.js`: content-side runtime orchestration.
- `src/ui/inpage/page.js`: Conscious page UI + heatmap/stats/trend rendering.
- `src/application/inpage-app.js`: in-page runtime orchestration.
- `src/entry/content-script.js`: content runtime entrypoint.
- `src/entry/inpage-script.js`: in-page runtime entrypoint.
- `src/inpage.css`: YouTube-style page and sidebar styles.
- `scripts/validate.mjs`: local validation script.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this project folder.
5. Open YouTube and click **Conscious** in the left sidebar.

## Local validation

```bash
npm test
```
