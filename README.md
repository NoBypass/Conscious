# Conscious (Chrome Extension)

> Note: It's vibecoded ~~slop~~

Conscious adds a custom YouTube subpage and sidebar entry to help you control and review your viewing behavior.

## Features

- Adds a **Conscious** button to the YouTube left sidebar.
- Clicking it navigates to a custom route: `/feed/conscious`.
- On that page, you can toggle **Disable all Shorts**.
- On that page, you can toggle a **daily top-bar timer** for YouTube watch time.
- Tracks watch time on standard YouTube watch pages (`/watch?v=...`).
- Shows watch history with title, total watched duration, and last watched time.
- Shows a daily heatmap with per-day watch duration and video counts.

## Data storage

- `chrome.storage.sync`
  - `shortsDisabled`: whether Shorts blocking is enabled.
  - `dailyWatchTimerEnabled`: whether the top-bar daily timer is enabled.
- `chrome.storage.local`
  - `watchHistory`: tracked watch history entries.

## Project structure

- `manifest.json`: Extension configuration (Manifest V3).
- `src/content.js`: Content bootstrap/orchestration.
- `src/content/shared.js`: Shared constants and mutable runtime state.
- `src/content/storage.js`: Storage utilities and daily cache logic.
- `src/content/shorts.js`: Shorts blocking feature.
- `src/content/watch-history.js`: Watch-session tracking and persistence.
- `src/content/daily-timer.js`: Top-bar daily timer UI.
- `src/inpage-ui.js`: Sidebar entry injection and `/feed/conscious` page rendering.
- `src/inpage.css`: YouTube-style page and sidebar styles.
- `scripts/validate.mjs`: Local validation script.

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
