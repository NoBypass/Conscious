const STORAGE_KEY = "shortsDisabled";
const REDIRECT_TARGET = "https://www.youtube.com/";
const HIDDEN_ATTR = "data-shorts-switch-hidden";

const SHORTS_CONTAINER_SELECTORS = [
  "ytd-reel-shelf-renderer",
  "ytd-rich-shelf-renderer[is-shorts]",
  "ytm-shorts-lockup-view-model"
];

const SHORTS_LINK_SELECTOR = "a[href^='/shorts/']";

let shortsDisabled = false;
let observer = null;

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

function handleSettingUpdate(newValue) {
  shortsDisabled = Boolean(newValue);
  if (shortsDisabled) {
    applyBlocking();
    startObserver();
  } else {
    stopObserver();
    restoreHiddenElements();
  }
}

chrome.storage.sync.get({ [STORAGE_KEY]: false }, (result) => {
  handleSettingUpdate(result[STORAGE_KEY]);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync" || !changes[STORAGE_KEY]) return;
  handleSettingUpdate(changes[STORAGE_KEY].newValue);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "SHORTS_TOGGLE_UPDATED") return;
  handleSettingUpdate(Boolean(message.value));
  sendResponse({ ok: true });
});

window.addEventListener("yt-navigate-finish", () => {
  applyBlocking();
});

window.addEventListener("popstate", () => {
  guardShortsRoute();
});
