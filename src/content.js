const SHORTS_STORAGE_KEY = "shortsDisabled";
const HISTORY_STORAGE_KEY = "watchHistory";
const REDIRECT_TARGET = "https://www.youtube.com/";
const HIDDEN_ATTR = "data-shorts-switch-hidden";
const SHORTS_TOGGLE_MESSAGE = "SHORTS_TOGGLE_UPDATED";
const HISTORY_UPDATED_MESSAGE = "WATCH_HISTORY_UPDATED";
const HISTORY_LIMIT = 200;

const SHORTS_CONTAINER_SELECTORS = [
  "ytd-reel-shelf-renderer",
  "ytd-rich-shelf-renderer[is-shorts]",
  "ytm-shorts-lockup-view-model"
];

const SHORTS_LINK_SELECTOR = "a[href^='/shorts/']";

let shortsDisabled = false;
let observer = null;
let activeWatchSession = null;

function hideElement(element) {
  if (!element || element.getAttribute(HIDDEN_ATTR) === "1") return;

  element.setAttribute(HIDDEN_ATTR, "1");
  element.dataset.shortsSwitchPrevDisplay = element.style.display || "";
  element.style.setProperty("display", "none", "important");
}

function restoreHiddenElements() {
  // Restore only elements this extension changed so user toggles are reversible.
  const nodes = document.querySelectorAll(`[${HIDDEN_ATTR}='1']`);
  nodes.forEach((node) => {
    const previous = node.dataset.shortsSwitchPrevDisplay || "";
    if (previous) {
      node.style.display = previous;
    } else {
      node.style.removeProperty("display");
    }
    node.removeAttribute(HIDDEN_ATTR);
    delete node.dataset.shortsSwitchPrevDisplay;
  });
}

function hideBySelectors() {
  SHORTS_CONTAINER_SELECTORS.forEach((selector) => {
    const nodes = document.querySelectorAll(selector);
    nodes.forEach((node) => hideElement(node));
  });
}

function hideShortsLinksAndCards() {
  const links = document.querySelectorAll(SHORTS_LINK_SELECTOR);
  links.forEach((link) => {
    const card =
      link.closest("ytd-guide-entry-renderer") ||
      link.closest("ytd-mini-guide-entry-renderer") ||
      link.closest("ytd-rich-item-renderer") ||
      link.closest("ytd-grid-video-renderer") ||
      link.closest("ytd-video-renderer") ||
      link.closest("ytd-compact-video-renderer") ||
      link;
    hideElement(card);
  });
}

function guardShortsRoute() {
  if (!shortsDisabled) return;
  if (window.location.pathname.startsWith("/shorts/")) {
    window.location.replace(REDIRECT_TARGET);
  }
}

function applyBlocking() {
  if (!shortsDisabled) return;
  guardShortsRoute();
  hideBySelectors();
  hideShortsLinksAndCards();
}

function startObserver() {
  if (observer) return;

  let pending = false;
  observer = new MutationObserver(() => {
    if (!shortsDisabled || pending) return;
    pending = true;

    requestAnimationFrame(() => {
      applyBlocking();
      pending = false;
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

function stopObserver() {
  if (!observer) return;
  observer.disconnect();
  observer = null;
}

function handleShortsSettingUpdate(newValue) {
  shortsDisabled = Boolean(newValue);
  if (shortsDisabled) {
    applyBlocking();
    startObserver();
  } else {
    stopObserver();
    restoreHiddenElements();
  }
}

function getCurrentVideoId() {
  if (window.location.pathname !== "/watch") return null;
  const value = new URLSearchParams(window.location.search).get("v");
  return value || null;
}

function getCurrentVideoTitle() {
  const heading = document.querySelector("h1.ytd-watch-metadata yt-formatted-string");
  if (heading && heading.textContent) {
    return heading.textContent.trim();
  }

  const title = document.title || "";
  return title.replace(/\s*-\s*YouTube\s*$/, "").trim();
}

function notifyHistoryUpdated() {
  chrome.runtime.sendMessage({ type: HISTORY_UPDATED_MESSAGE }, () => {
    void chrome.runtime.lastError;
  });
}

function persistWatchDuration(session, force) {
  if (!session) return;

  const secondsToSave = force
    ? Math.floor(session.pendingSeconds)
    : Math.floor(session.pendingSeconds);

  if (secondsToSave < 1) return;

  session.pendingSeconds -= secondsToSave;

  chrome.storage.local.get({ [HISTORY_STORAGE_KEY]: [] }, (result) => {
    const history = Array.isArray(result[HISTORY_STORAGE_KEY])
      ? result[HISTORY_STORAGE_KEY]
      : [];

    const nowIso = new Date().toISOString();
    const existing = history.find((entry) => entry.videoId === session.videoId);

    if (existing) {
      existing.title = session.title || existing.title;
      existing.url = session.url || existing.url;
      existing.lastWatchedAt = nowIso;
      existing.watchedSeconds = (existing.watchedSeconds || 0) + secondsToSave;
    } else {
      history.push({
        videoId: session.videoId,
        title: session.title || "Unknown title",
        url: session.url,
        watchedSeconds: secondsToSave,
        lastWatchedAt: nowIso
      });
    }

    history.sort((a, b) => String(b.lastWatchedAt).localeCompare(String(a.lastWatchedAt)));
    const trimmed = history.slice(0, HISTORY_LIMIT);

    chrome.storage.local.set({ [HISTORY_STORAGE_KEY]: trimmed }, () => {
      notifyHistoryUpdated();
    });
  });
}

function flushActiveWatchSession(force) {
  if (!activeWatchSession) return;
  persistWatchDuration(activeWatchSession, force);
}

function resetWatchSession(videoId) {
  const title = getCurrentVideoTitle();
  activeWatchSession = {
    videoId,
    title,
    url: window.location.href,
    pendingSeconds: 0,
    lastTickMs: Date.now()
  };
}

function syncWatchSessionToPage() {
  const videoId = getCurrentVideoId();

  if (!videoId) {
    flushActiveWatchSession(true);
    activeWatchSession = null;
    return;
  }

  if (!activeWatchSession || activeWatchSession.videoId !== videoId) {
    flushActiveWatchSession(true);
    resetWatchSession(videoId);
    return;
  }

  activeWatchSession.title = getCurrentVideoTitle() || activeWatchSession.title;
  activeWatchSession.url = window.location.href;
}

function updateWatchTimer() {
  if (!activeWatchSession) return;

  const now = Date.now();
  const elapsedSeconds = (now - activeWatchSession.lastTickMs) / 1000;
  activeWatchSession.lastTickMs = now;

  if (elapsedSeconds <= 0 || elapsedSeconds > 10) return;

  const videoElement = document.querySelector("video");
  const isActivelyWatching =
    videoElement &&
    !videoElement.paused &&
    !videoElement.ended &&
    document.visibilityState === "visible";

  if (!isActivelyWatching) return;

  activeWatchSession.pendingSeconds += elapsedSeconds;

  if (activeWatchSession.pendingSeconds >= 10) {
    flushActiveWatchSession(false);
  }
}

chrome.storage.sync.get({ [SHORTS_STORAGE_KEY]: false }, (result) => {
  handleShortsSettingUpdate(result[SHORTS_STORAGE_KEY]);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes[SHORTS_STORAGE_KEY]) {
    handleShortsSettingUpdate(changes[SHORTS_STORAGE_KEY].newValue);
    return;
  }

  if (areaName === "local" && changes[HISTORY_STORAGE_KEY]) {
    notifyHistoryUpdated();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message) return;

  if (message.type === SHORTS_TOGGLE_MESSAGE) {
    handleShortsSettingUpdate(Boolean(message.value));
    sendResponse({ ok: true });
    return;
  }

  if (message.type === "REQUEST_HISTORY_SYNC") {
    flushActiveWatchSession(false);
    sendResponse({ ok: true });
  }
});

window.addEventListener("yt-navigate-finish", () => {
  applyBlocking();
  syncWatchSessionToPage();
});

window.addEventListener("popstate", () => {
  guardShortsRoute();
  syncWatchSessionToPage();
});

window.addEventListener("beforeunload", () => {
  flushActiveWatchSession(true);
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    flushActiveWatchSession(false);
  }
});

setInterval(updateWatchTimer, 1000);
syncWatchSessionToPage();
