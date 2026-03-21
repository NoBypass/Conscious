# Conscious (Chrome Extension)

> Note: It's vibecoded slop

Conscious adds a custom YouTube subpage and sidebar entry to help you control and review your viewing behavior.

## Features

- Adds a **Conscious** button to the YouTube left sidebar.
- Clicking it navigates to a custom route: `/feed/conscious`.
- On that page, you can toggle **Disable all Shorts**.
- Tracks watch time on standard YouTube watch pages (`/watch?v=...`).
- Shows watch history with title, total watched duration, and last watched time.

## Data storage

- `chrome.storage.sync`
  - `shortsDisabled`: whether Shorts blocking is enabled.
- `chrome.storage.local`
  - `watchHistory`: tracked watch history entries.

## Project structure

- `manifest.json`: Extension configuration (Manifest V3).
- `src/content.js`: Shorts blocking plus watch-time tracking.
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
