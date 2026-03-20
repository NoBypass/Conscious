(() => {
  const INPAGE_SHORTS_STORAGE_KEY = "shortsDisabled";
  const INPAGE_HISTORY_STORAGE_KEY = "watchHistory";
  const HISTORY_DISPLAY_LIMIT = 100;
  const FULL_GUIDE_ITEM_ID = "conscious-guide-item-full";
  const MINI_GUIDE_ITEM_ID = "conscious-guide-item-mini";
  const CONSCIOUS_BASE_PATH = "/feed/history";
  const CONSCIOUS_QUERY_KEY = "conscious";
  const CONSCIOUS_QUERY_VALUE = "1";

  let bootstrapTimer = null;
  let observer = null;

  function hasExtensionContext() {
    return typeof chrome !== "undefined" && Boolean(chrome.runtime && chrome.runtime.id);
  }

  function cleanupInvalidatedContext() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (bootstrapTimer) {
      window.clearTimeout(bootstrapTimer);
      bootstrapTimer = null;
    }
  }

  function safeChromeCall(operation) {
    if (!hasExtensionContext()) return false;
    try {
      operation();
      return true;
    } catch (error) {
      if (String(error).includes("Extension context invalidated")) {
        cleanupInvalidatedContext();
        return false;
      }
      throw error;
    }
  }

  function isConsciousRoute() {
    if (window.location.pathname !== CONSCIOUS_BASE_PATH) return false;
    const params = new URLSearchParams(window.location.search);
    return params.get(CONSCIOUS_QUERY_KEY) === CONSCIOUS_QUERY_VALUE;
  }

  function getConsciousUrl() {
    const url = new URL(window.location.href);
    url.pathname = CONSCIOUS_BASE_PATH;
    url.searchParams.set(CONSCIOUS_QUERY_KEY, CONSCIOUS_QUERY_VALUE);
    return `${url.pathname}?${url.searchParams.toString()}`;
  }

  function navigateToConsciousRoute() {
    const target = getConsciousUrl();
    if (`${window.location.pathname}${window.location.search}` === target) return;

    if (window.history && typeof window.history.pushState === "function") {
      window.history.pushState({}, "", target);
      window.dispatchEvent(new Event("yt-navigate-start"));
      window.dispatchEvent(new Event("yt-navigate-finish"));
      return;
    }

    window.location.assign(target);
  }

  function formatDuration(totalSeconds) {
    const rounded = Math.max(0, Math.round(totalSeconds || 0));
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    const seconds = rounded % 60;

    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  function formatLastWatched(isoDate) {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return "Unknown time";
    return date.toLocaleString();
  }

  function updateGuideActiveState() {
    const active = isConsciousRoute();
    document.querySelectorAll(".conscious-guide-button").forEach((button) => {
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function ensureConsciousPageRoot() {
    let root = document.getElementById("conscious-page-root");
    if (!root) {
      root = document.createElement("section");
      root.id = "conscious-page-root";
      root.hidden = true;
      root.innerHTML = `
        <div class="conscious-page-shell">
          <header class="conscious-page-header">
            <h1 class="conscious-page-title">Conscious</h1>
            <p class="conscious-page-subtitle">Track your watch time and control Shorts in one place.</p>
          </header>

          <div class="conscious-settings-card">
            <div class="conscious-toggle-row">
              <div>
                <h2 class="conscious-card-title">Shorts</h2>
                <p id="conscious-shorts-state" class="conscious-card-subtitle"></p>
              </div>
              <label class="conscious-switch">
                <input id="conscious-shorts-toggle" type="checkbox" />
                <span>Disable all Shorts</span>
              </label>
            </div>
          </div>

          <div class="conscious-history-card">
            <h2 class="conscious-card-title">Watch history</h2>
            <p id="conscious-history-empty" class="conscious-empty" hidden>No watch history yet.</p>
            <ul id="conscious-history-list" class="conscious-history-list"></ul>
          </div>
        </div>
      `;
      const toggle = root.querySelector("#conscious-shorts-toggle");
      if (toggle) {
        toggle.addEventListener("change", () => {
          safeChromeCall(() => {
            chrome.storage.sync.set({ [INPAGE_SHORTS_STORAGE_KEY]: toggle.checked });
          });
        });
      }
    }

    const targetHost =
      getHistoryBrowseContentHost() ||
      document.querySelector("ytd-page-manager") ||
      document.body;

    if (root.parentElement !== targetHost) {
      targetHost.appendChild(root);
    }

    return root;
  }

  function loadShortsState() {
    const root = document.getElementById("conscious-page-root");
    if (!root) return;

    safeChromeCall(() => {
      chrome.storage.sync.get({ [INPAGE_SHORTS_STORAGE_KEY]: false }, (result) => {
        const isDisabled = Boolean(result[INPAGE_SHORTS_STORAGE_KEY]);
        const checkbox = root.querySelector("#conscious-shorts-toggle");
        const state = root.querySelector("#conscious-shorts-state");
        if (!checkbox || !state) return;

        checkbox.checked = isDisabled;
        state.textContent = isDisabled
          ? "Shorts are blocked across YouTube."
          : "Shorts are currently allowed.";
      });
    });
  }

  function renderHistory(history) {
    const root = document.getElementById("conscious-page-root");
    if (!root) return;

    const list = root.querySelector("#conscious-history-list");
    const empty = root.querySelector("#conscious-history-empty");
    if (!list || !empty) return;

    list.innerHTML = "";
    if (!history.length) {
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    const fragment = document.createDocumentFragment();

    history.slice(0, HISTORY_DISPLAY_LIMIT).forEach((entry) => {
      const item = document.createElement("li");
      item.className = "conscious-history-item";

      const link = document.createElement("a");
      link.className = "conscious-history-link";
      link.href = entry.url || `https://www.youtube.com/watch?v=${entry.videoId || ""}`;
      link.textContent = entry.title || "Unknown title";

      const meta = document.createElement("div");
      meta.className = "conscious-history-meta";
      meta.textContent = `${formatDuration(entry.watchedSeconds)} watched - ${formatLastWatched(entry.lastWatchedAt)}`;

      item.appendChild(link);
      item.appendChild(meta);
      fragment.appendChild(item);
    });

    list.appendChild(fragment);
  }

  function loadHistory() {
    safeChromeCall(() => {
      chrome.storage.local.get({ [INPAGE_HISTORY_STORAGE_KEY]: [] }, (result) => {
        const history = Array.isArray(result[INPAGE_HISTORY_STORAGE_KEY])
          ? result[INPAGE_HISTORY_STORAGE_KEY]
          : [];
        renderHistory(history);
      });
    });
  }

  function getHistoryBrowseContentHost() {
    return (
      document.querySelector("ytd-page-manager ytd-browse[page-subtype='history'] #contents") ||
      document.querySelector("ytd-page-manager ytd-browse[page-subtype='history'] #primary") ||
      document.querySelector("ytd-page-manager ytd-browse[page-subtype='history']") ||
      null
    );
  }

  function setNativePageVisibility(showNativePage) {
    const contentHost = getHistoryBrowseContentHost();
    if (!contentHost) return;

    const managedChildren = Array.from(contentHost.children).filter(
      (node) => node.id !== "conscious-page-root"
    );

    managedChildren.forEach((node) => {
      if (showNativePage) {
        if (!node.hasAttribute("data-conscious-hidden")) return;
        const previous = node.dataset.consciousPrevDisplay || "";
        if (previous) {
          node.style.display = previous;
        } else {
          node.style.removeProperty("display");
        }
        node.removeAttribute("data-conscious-hidden");
        delete node.dataset.consciousPrevDisplay;
        return;
      }

      if (!node.hasAttribute("data-conscious-hidden")) {
        node.setAttribute("data-conscious-hidden", "1");
        node.dataset.consciousPrevDisplay = node.style.display || "";
      }
      node.style.display = "none";
    });
  }

  function renderRoutePage() {
    const root = ensureConsciousPageRoot();
    const isRoute = isConsciousRoute();

    root.hidden = !isRoute;
    setNativePageVisibility(!isRoute);
    updateGuideActiveState();

    if (isRoute) {
      loadShortsState();
      loadHistory();
    }
  }

  function createGuideItem(itemId, compact) {
    const wrapper = document.createElement("div");
    wrapper.id = itemId;
    wrapper.className = `conscious-guide-item ${compact ? "is-mini" : ""}`.trim();

    const button = document.createElement("button");
    button.type = "button";
    button.className = "conscious-guide-button";
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = compact
      ? `<span class="conscious-guide-icon">C</span>`
      : `
        <span class="conscious-guide-icon">C</span>
        <span class="conscious-guide-label">Conscious</span>
      `;

    button.addEventListener("click", () => {
      if (!isConsciousRoute()) {
        navigateToConsciousRoute();
        return;
      }
      renderRoutePage();
    });

    wrapper.appendChild(button);
    return wrapper;
  }

  function isVisibleContainer(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function findExpandedGuideContainer() {
    const candidates = [
      ...Array.from(document.querySelectorAll("ytd-guide-section-renderer #items")),
      ...Array.from(document.querySelectorAll("tp-yt-app-drawer #sections #items")),
      ...Array.from(document.querySelectorAll("ytd-guide-renderer #items"))
    ];

    return (
      candidates.find((node) => {
        const host =
          node.closest("ytd-guide-section-renderer") ||
          node.closest("tp-yt-app-drawer") ||
          node.closest("ytd-guide-renderer") ||
          node;
        return isVisibleContainer(host);
      }) || null
    );
  }

  function findMiniGuideContainer() {
    const candidates = [
      ...Array.from(document.querySelectorAll("ytd-mini-guide-renderer #items")),
      ...Array.from(document.querySelectorAll("ytd-mini-guide-renderer"))
    ];

    return (
      candidates.find((node) => {
        const host = node.closest("ytd-mini-guide-renderer") || node;
        return isVisibleContainer(host);
      }) || null
    );
  }

  function upsertGuideItem(container, itemId, compact) {
    if (!container) return;

    let item = document.getElementById(itemId);
    if (!item) item = createGuideItem(itemId, compact);

    if (item.parentElement !== container || container.firstElementChild !== item) {
      container.prepend(item);
    }
  }

  function ensureGuideEntry() {
    upsertGuideItem(findExpandedGuideContainer(), FULL_GUIDE_ITEM_ID, false);
    upsertGuideItem(findMiniGuideContainer(), MINI_GUIDE_ITEM_ID, true);
    updateGuideActiveState();
  }

  function bootstrap() {
    if (!hasExtensionContext()) return;
    ensureGuideEntry();
    renderRoutePage();
  }

  function scheduleBootstrap() {
    if (bootstrapTimer) return;
    bootstrapTimer = window.setTimeout(() => {
      bootstrapTimer = null;
      bootstrap();
    }, 120);
  }

  if (hasExtensionContext()) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "sync" && changes[INPAGE_SHORTS_STORAGE_KEY]) {
        loadShortsState();
      }

      if (areaName === "local" && changes[INPAGE_HISTORY_STORAGE_KEY]) {
        loadHistory();
      }
    });
  }

  window.addEventListener("yt-navigate-finish", scheduleBootstrap);
  window.addEventListener("popstate", scheduleBootstrap);

  observer = new MutationObserver(scheduleBootstrap);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  bootstrap();
})();
