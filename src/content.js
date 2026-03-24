const SHORTS_STORAGE_KEY = "shortsDisabled";
const HISTORY_STORAGE_KEY = "watchHistory";
const REDIRECT_TARGET = "https://www.youtube.com/";
const HIDDEN_ATTR = "data-shorts-switch-hidden";
const SHORTS_TOGGLE_MESSAGE = "SHORTS_TOGGLE_UPDATED";
const HISTORY_UPDATED_MESSAGE = "WATCH_HISTORY_UPDATED";
const REQUEST_HISTORY_SYNC_MESSAGE = "REQUEST_HISTORY_SYNC";
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
let wasVideoPlaying = false;
let lastKnownUrl = window.location.href;
let writeQueue = Promise.resolve();

function hideElement(element) {
  if (!element || element.getAttribute(HIDDEN_ATTR) === "1") return;

  element.setAttribute(HIDDEN_ATTR, "1");
  element.dataset.shortsSwitchPrevDisplay = element.style.display || "";
  element.style.setProperty("display", "none", "important");
}

function restoreHiddenElements() {
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

function isPlaceholderTitle(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || normalized === "youtube" || normalized === "unknown title";
}

function getCurrentVideoTitle() {
  const heading = document.querySelector("h1.ytd-watch-metadata yt-formatted-string");
  if (heading && heading.textContent) {
    const headingTitle = heading.textContent.trim();
    if (!isPlaceholderTitle(headingTitle)) {
      return headingTitle;
    }
  }

  const playerTitle = window.ytInitialPlayerResponse?.videoDetails?.title;
  if (!isPlaceholderTitle(playerTitle)) {
    return String(playerTitle).trim();
  }

  const ogTitle = document.querySelector("meta[property='og:title']")?.getAttribute("content")?.trim();
  if (!isPlaceholderTitle(ogTitle)) {
    return ogTitle;
  }

  const metaTitle = document.querySelector("meta[name='title']")?.getAttribute("content")?.trim();
  if (!isPlaceholderTitle(metaTitle)) {
    return metaTitle;
  }

  const pageTitle = (document.title || "").replace(/\s*-\s*YouTube\s*$/, "").trim();
  if (!isPlaceholderTitle(pageTitle)) {
    return pageTitle;
  }

  return "";
}

function getVideoElement() {
  return document.querySelector("video");
}

function notifyHistoryUpdated() {
  chrome.runtime.sendMessage({ type: HISTORY_UPDATED_MESSAGE }, () => {
    void chrome.runtime.lastError;
  });
}

function queueHistoryWrite(updater) {
  writeQueue = writeQueue
    .catch(() => undefined)
    .then(
      () =>
        new Promise((resolve) => {
          chrome.storage.local.get({ [HISTORY_STORAGE_KEY]: [] }, (result) => {
            const history = Array.isArray(result[HISTORY_STORAGE_KEY])
              ? result[HISTORY_STORAGE_KEY]
              : [];

            const updatedHistory = updater(history);
            chrome.storage.local.set({ [HISTORY_STORAGE_KEY]: updatedHistory }, () => {
              notifyHistoryUpdated();
              resolve();
            });
          });
        })
    );

  return writeQueue;
}

function persistWatchDuration(session, force) {
  if (!session) return Promise.resolve();

  const millisecondsToSave = force
    ? session.pendingMilliseconds
    : session.pendingMilliseconds - (session.pendingMilliseconds % 1000);

  const minimumToPersist = force ? 1 : 1000;
  if (millisecondsToSave < minimumToPersist) return Promise.resolve();

  session.pendingMilliseconds -= millisecondsToSave;
  const secondsToSave = millisecondsToSave / 1000;

  return queueHistoryWrite((history) => {
    const nowIso = new Date().toISOString();
    const dayKey = nowIso.slice(0, 10);
    const existing = history.find((entry) => entry.videoId === session.videoId);

    if (existing) {
      existing.title = session.title || existing.title || "Unknown title";
      existing.url = session.url || existing.url || "";
      existing.lastWatchedAt = nowIso;
      existing.watchedSeconds = Number(existing.watchedSeconds || 0) + secondsToSave;
      const watchByDay =
        existing.watchByDay && typeof existing.watchByDay === "object" ? existing.watchByDay : {};
      watchByDay[dayKey] = Number(watchByDay[dayKey] || 0) + secondsToSave;
      existing.watchByDay = watchByDay;
    } else {
      history.push({
        videoId: session.videoId,
        title: session.title || "Unknown title",
        url: session.url || "",
        watchedSeconds: secondsToSave,
        lastWatchedAt: nowIso,
        watchByDay: {
          [dayKey]: secondsToSave
        }
      });
    }

    history.sort((a, b) => String(b.lastWatchedAt).localeCompare(String(a.lastWatchedAt)));
    return history.slice(0, HISTORY_LIMIT);
  });
}

function flushActiveWatchSession(force) {
  if (!activeWatchSession) return;
  void persistWatchDuration(activeWatchSession, force);
}

function resetWatchSession(videoId) {
  const videoElement = getVideoElement();
  const mediaTime = videoElement && Number.isFinite(videoElement.currentTime) ? videoElement.currentTime : 0;

  activeWatchSession = {
    videoId,
    title: getCurrentVideoTitle(),
    url: window.location.href,
    pendingMilliseconds: 0,
    lastTickMs: Date.now(),
    lastMediaTime: mediaTime
  };
}

function syncWatchSessionToPage() {
  const videoId = getCurrentVideoId();

  if (!videoId) {
    flushActiveWatchSession(true);
    activeWatchSession = null;
    wasVideoPlaying = false;
    return;
  }

  if (!activeWatchSession || activeWatchSession.videoId !== videoId) {
    flushActiveWatchSession(true);
    resetWatchSession(videoId);
    wasVideoPlaying = false;
    return;
  }

  activeWatchSession.title = getCurrentVideoTitle() || activeWatchSession.title;
  activeWatchSession.url = window.location.href;
}

function getMediaProgressDelta(videoElement, session) {
  if (!videoElement || !session || !Number.isFinite(videoElement.currentTime)) return 0;

  const rawDelta = videoElement.currentTime - Number(session.lastMediaTime || 0);
  session.lastMediaTime = videoElement.currentTime;

  if (rawDelta <= 0) return 0;
  if (rawDelta > 15) return 0;
  return rawDelta;
}

function updateWatchTimer() {
  if (window.location.href !== lastKnownUrl) {
    lastKnownUrl = window.location.href;
    syncWatchSessionToPage();
  }

  if (!activeWatchSession) return;

  const refreshedTitle = getCurrentVideoTitle();
  if (!isPlaceholderTitle(refreshedTitle)) {
    activeWatchSession.title = refreshedTitle;
  }

  const now = Date.now();
  const elapsedMs = now - activeWatchSession.lastTickMs;
  activeWatchSession.lastTickMs = now;

  if (elapsedMs <= 0 || elapsedMs > 15000) return;

  const videoElement = getVideoElement();
  const isActivelyWatching =
    Boolean(videoElement) &&
    !videoElement.paused &&
    !videoElement.ended &&
    videoElement.readyState >= 2;

  if (wasVideoPlaying && !isActivelyWatching) {
    flushActiveWatchSession(true);
  }
  wasVideoPlaying = isActivelyWatching;

  if (!isActivelyWatching) {
    if (videoElement && Number.isFinite(videoElement.currentTime)) {
      activeWatchSession.lastMediaTime = videoElement.currentTime;
    }
    return;
  }

  const mediaDeltaSeconds = getMediaProgressDelta(videoElement, activeWatchSession);
  const fallbackSeconds = elapsedMs / 1000;
  const secondsToAdd = mediaDeltaSeconds > 0 ? mediaDeltaSeconds : fallbackSeconds;

  if (secondsToAdd <= 0) return;

  activeWatchSession.pendingMilliseconds += Math.round(secondsToAdd * 1000);

  if (activeWatchSession.pendingMilliseconds >= 10000) {
    flushActiveWatchSession(false);
  }
}

function handleNavigationEvent() {
  guardShortsRoute();
  applyBlocking();
  syncWatchSessionToPage();
  lastKnownUrl = window.location.href;
}

chrome.storage.sync.get({ [SHORTS_STORAGE_KEY]: false }, (result) => {
  handleShortsSettingUpdate(result[SHORTS_STORAGE_KEY]);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes[SHORTS_STORAGE_KEY]) {
    handleShortsSettingUpdate(changes[SHORTS_STORAGE_KEY].newValue);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message) return;

  if (message.type === SHORTS_TOGGLE_MESSAGE) {
    handleShortsSettingUpdate(Boolean(message.value));
    sendResponse({ ok: true });
    return;
  }

  if (message.type === REQUEST_HISTORY_SYNC_MESSAGE) {
    flushActiveWatchSession(true);
    sendResponse({ ok: true });
  }
});

window.addEventListener("yt-navigate-start", () => {
  flushActiveWatchSession(true);
});

window.addEventListener("yt-navigate-finish", handleNavigationEvent);
window.addEventListener("popstate", handleNavigationEvent);
window.addEventListener("hashchange", handleNavigationEvent);

window.addEventListener("pagehide", () => {
  flushActiveWatchSession(true);
});

window.addEventListener("beforeunload", () => {
  flushActiveWatchSession(true);
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    flushActiveWatchSession(true);
  }
});

setInterval(updateWatchTimer, 1000);
handleNavigationEvent();
