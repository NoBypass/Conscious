# Conscious (Chrome Extension)

Conscious helps you control YouTube use by blocking Shorts and showing your watch history with tracked watch time.

## Features

- **Disable Shorts toggle** in popup.
- Redirects direct `/shorts/...` URLs back to YouTube home when Shorts are disabled.
- Hides Shorts shelves and Shorts links/cards in common YouTube layouts.
- Tracks watch time on standard YouTube watch pages (`/watch?v=...`).
- Stores and displays recent watch history in the popup (title, link, total watched time, last watched time).

## Data storage

- `chrome.storage.sync`
  - `shortsDisabled`: whether Shorts blocking is enabled.
- `chrome.storage.local`
  - `watchHistory`: array of tracked watch history entries.

## Project structure

- `manifest.json`: Extension configuration (Manifest V3).
- `src/content.js`: Shorts blocking plus watch-time tracking.
- `src/popup.html`: Popup UI (toggle + history view).
- `src/popup.js`: Toggle handling and history rendering.
- `src/popup.css`: Popup styling.
- `scripts/validate.mjs`: Local validation script.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this project folder.
5. Open YouTube, browse videos, then open the extension popup to see history.

## Local validation

```bash
npm test
```

This checks required files and manifest basics.
