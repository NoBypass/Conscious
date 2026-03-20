const SHORTS_STORAGE_KEY = "shortsDisabled";
const HISTORY_STORAGE_KEY = "watchHistory";
const SHORTS_TOGGLE_MESSAGE = "SHORTS_TOGGLE_UPDATED";
const HISTORY_UPDATED_MESSAGE = "WATCH_HISTORY_UPDATED";
const REQUEST_HISTORY_SYNC_MESSAGE = "REQUEST_HISTORY_SYNC";
const HISTORY_DISPLAY_LIMIT = 50;

const checkbox = document.getElementById("shorts-toggle");
const status = document.getElementById("status");
const historyList = document.getElementById("history-list");
const historyEmpty = document.getElementById("history-empty");

function updateStatus(isDisabled) {
  status.textContent = isDisabled
    ? "Shorts are currently blocked."
    : "Shorts are currently allowed.";
}

function formatDuration(totalSeconds) {
  const rounded = Math.max(0, Math.round(totalSeconds || 0));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatLastWatched(isoDate) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderHistory(items) {
  historyList.innerHTML = "";

  if (!items.length) {
    historyEmpty.style.display = "block";
    return;
  }

  historyEmpty.style.display = "none";

  const fragment = document.createDocumentFragment();
  items.slice(0, HISTORY_DISPLAY_LIMIT).forEach((entry) => {
    const item = document.createElement("li");
    item.className = "history-item";

    const safeTitle = escapeHtml(entry.title || "Unknown title");
    const safeUrl = escapeHtml(entry.url || `https://www.youtube.com/watch?v=${entry.videoId || ""}`);
    const meta = `${formatDuration(entry.watchedSeconds)} watched - ${formatLastWatched(entry.lastWatchedAt)}`;

    item.innerHTML = `
      <a class="history-title" href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeTitle}</a>
      <div class="history-meta">${escapeHtml(meta)}</div>
    `;

    fragment.appendChild(item);
  });

  historyList.appendChild(fragment);
}

function loadHistory() {
  chrome.storage.local.get({ [HISTORY_STORAGE_KEY]: [] }, (result) => {
    const history = Array.isArray(result[HISTORY_STORAGE_KEY]) ? result[HISTORY_STORAGE_KEY] : [];
    renderHistory(history);
  });
}

function notifyOpenYouTubeTabs(isDisabled) {
  chrome.tabs.query({ url: ["*://*.youtube.com/*"] }, (tabs) => {
    tabs.forEach((tab) => {
      if (!tab.id) return;
      chrome.tabs.sendMessage(tab.id, {
        type: SHORTS_TOGGLE_MESSAGE,
        value: isDisabled
      });
    });
  });
}

function requestHistoryFlushFromTabs() {
  chrome.tabs.query({ url: ["*://*.youtube.com/*"] }, (tabs) => {
    tabs.forEach((tab) => {
      if (!tab.id) return;
      chrome.tabs.sendMessage(tab.id, { type: REQUEST_HISTORY_SYNC_MESSAGE });
    });
  });
}

chrome.storage.sync.get({ [SHORTS_STORAGE_KEY]: false }, (result) => {
  const isDisabled = Boolean(result[SHORTS_STORAGE_KEY]);
  checkbox.checked = isDisabled;
  updateStatus(isDisabled);
});

checkbox.addEventListener("change", () => {
  const isDisabled = checkbox.checked;
  chrome.storage.sync.set({ [SHORTS_STORAGE_KEY]: isDisabled }, () => {
    updateStatus(isDisabled);
    notifyOpenYouTubeTabs(isDisabled);
  });
});

chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== HISTORY_UPDATED_MESSAGE) return;
  loadHistory();
});

requestHistoryFlushFromTabs();
loadHistory();
