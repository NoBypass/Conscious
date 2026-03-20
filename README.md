# YouTube Shorts Switch (Chrome Extension)

A minimal Chrome extension that adds a user-controlled toggle to disable all YouTube Shorts.

## What it does

- Adds a popup toggle: **Disable all Shorts**.
- When enabled, it:
  - Redirects direct `/shorts/...` URLs back to YouTube home.
  - Hides Shorts shelves and Shorts links/cards in common YouTube layouts.
  - Keeps applying the filter while YouTube updates the page dynamically.

## Project structure

- `manifest.json`: Extension configuration (Manifest V3).
- `src/content.js`: Shorts blocking and redirect logic.
- `src/popup.html`: Popup UI.
- `src/popup.js`: Reads/saves the toggle using `chrome.storage.sync`.
- `src/popup.css`: Popup styling.
- `scripts/validate.mjs`: Small local validation script.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this project folder.
5. Open YouTube and use the extension popup to enable or disable blocking.

## Local validation

```bash
npm test
```

This checks the manifest and required files exist.

