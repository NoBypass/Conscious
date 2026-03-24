(() => {
  const INPAGE_SHORTS_STORAGE_KEY = "shortsDisabled";
  const INPAGE_HISTORY_STORAGE_KEY = "watchHistory";
  const HISTORY_DISPLAY_LIMIT = 100;
  const HEATMAP_WEEKS = 52;
  const HEATMAP_LEVELS = 5;
  const FULL_GUIDE_ITEM_ID = "conscious-guide-item-full";
  const MINI_GUIDE_ITEM_ID = "conscious-guide-item-mini";
  const CONSCIOUS_BASE_PATH = "/feed/history";
  const CONSCIOUS_QUERY_KEY = "conscious";
  const CONSCIOUS_QUERY_VALUE = "1";
  const CONSCIOUS_SESSION_ROUTE_KEY = "consciousRouteActive";
  const HEATMAP_TOOLTIP_OFFSET = 12;

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

  function setConsciousSessionRoute(active) {
    try {
      if (active) {
        window.sessionStorage.setItem(CONSCIOUS_SESSION_ROUTE_KEY, "1");
      } else {
        window.sessionStorage.removeItem(CONSCIOUS_SESSION_ROUTE_KEY);
      }
    } catch (_error) {
      // Ignore storage access issues from restrictive browser settings.
    }
  }

  function shouldRestoreConsciousRoute() {
    if (window.location.pathname !== CONSCIOUS_BASE_PATH) return false;
    if (isConsciousRoute()) return false;

    try {
      return window.sessionStorage.getItem(CONSCIOUS_SESSION_ROUTE_KEY) === "1";
    } catch (_error) {
      return false;
    }
  }

  function getConsciousUrl() {
    const url = new URL(window.location.href);
    url.pathname = CONSCIOUS_BASE_PATH;
    url.searchParams.set(CONSCIOUS_QUERY_KEY, CONSCIOUS_QUERY_VALUE);
    return `${url.pathname}?${url.searchParams.toString()}`;
  }

  function navigateToConsciousRoute() {
    const target = getConsciousUrl();
    setConsciousSessionRoute(true);
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

  function getUtcDateKey(date) {
    return date.toISOString().slice(0, 10);
  }

  function parseUtcDateKey(key) {
    return new Date(`${key}T00:00:00Z`);
  }

  function formatDateKeyForTooltip(key) {
    const date = parseUtcDateKey(key);
    if (Number.isNaN(date.getTime())) return key;
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  function buildDailyWatchSummary(history) {
    const daily = new Map();

    history.forEach((entry) => {
      const watchByDay = entry && typeof entry.watchByDay === "object" ? entry.watchByDay : null;

      if (watchByDay && Object.keys(watchByDay).length > 0) {
        Object.entries(watchByDay).forEach(([dayKey, watchedSecondsRaw]) => {
          const watchedSeconds = Number(watchedSecondsRaw || 0);
          if (!dayKey || watchedSeconds <= 0) return;

          if (!daily.has(dayKey)) {
            daily.set(dayKey, { watchedSeconds: 0, videoIds: new Set() });
          }

          const bucket = daily.get(dayKey);
          bucket.watchedSeconds += watchedSeconds;
          if (entry.videoId) bucket.videoIds.add(entry.videoId);
        });
        return;
      }

      const fallbackDay = String(entry.lastWatchedAt || "").slice(0, 10);
      const fallbackSeconds = Number(entry.watchedSeconds || 0);
      if (!fallbackDay || fallbackSeconds <= 0) return;

      if (!daily.has(fallbackDay)) {
        daily.set(fallbackDay, { watchedSeconds: 0, videoIds: new Set() });
      }

      const bucket = daily.get(fallbackDay);
      bucket.watchedSeconds += fallbackSeconds;
      if (entry.videoId) bucket.videoIds.add(entry.videoId);
    });

    return daily;
  }

  function getHeatLevel(watchedSeconds, maxWatchedSeconds) {
    if (watchedSeconds <= 0 || maxWatchedSeconds <= 0) return 0;
    const normalized = Math.min(1, Math.sqrt(watchedSeconds / maxWatchedSeconds));
    return Math.max(1, Math.ceil(normalized * (HEATMAP_LEVELS - 1)));
  }

  function buildHeatmapDayKeys(totalDays) {
    const today = new Date();
    const keys = [];

    for (let index = totalDays - 1; index >= 0; index -= 1) {
      const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - index));
      keys.push(getUtcDateKey(date));
    }

    return keys;
  }

  function renderHeatmap(history) {
    const root = document.getElementById("conscious-page-root");
    if (!root) return;

    const grid = root.querySelector("#conscious-heatmap-grid");
    const summary = root.querySelector("#conscious-heatmap-summary");
    if (!grid || !summary) return;

    const getTooltip = () => {
      let tooltip = document.getElementById("conscious-heatmap-tooltip");
      if (tooltip) return tooltip;

      tooltip = document.createElement("div");
      tooltip.id = "conscious-heatmap-tooltip";
      tooltip.className = "conscious-heatmap-tooltip";
      tooltip.hidden = true;

      const container = root.querySelector(".conscious-history-card") || root;
      container.appendChild(tooltip);
      return tooltip;
    };

    const hideTooltip = () => {
      const tooltip = document.getElementById("conscious-heatmap-tooltip");
      if (!tooltip) return;
      tooltip.hidden = true;
    };

    const showTooltip = (event, dayKey, watchedSeconds, videoCount) => {
      const tooltip = getTooltip();
      tooltip.hidden = false;
      tooltip.innerHTML = "";

      const title = document.createElement("div");
      title.className = "conscious-heatmap-tooltip-title";
      title.textContent = formatDateKeyForTooltip(dayKey);

      const watchLine = document.createElement("div");
      watchLine.className = "conscious-heatmap-tooltip-line";
      watchLine.textContent = `${formatDuration(watchedSeconds)} watched`;

      const videosLine = document.createElement("div");
      videosLine.className = "conscious-heatmap-tooltip-line";
      videosLine.textContent = `${videoCount} video${videoCount === 1 ? "" : "s"}`;

      tooltip.appendChild(title);
      tooltip.appendChild(watchLine);
      tooltip.appendChild(videosLine);

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const rect = tooltip.getBoundingClientRect();
      const maxX = Math.max(8, viewportWidth - rect.width - 8);
      const maxY = Math.max(8, viewportHeight - rect.height - 8);

      const nextLeft = Math.min(Math.max(8, event.clientX + HEATMAP_TOOLTIP_OFFSET), maxX);
      const nextTop = Math.min(Math.max(8, event.clientY + HEATMAP_TOOLTIP_OFFSET), maxY);

      tooltip.style.left = `${nextLeft}px`;
      tooltip.style.top = `${nextTop}px`;
    };

    const daily = buildDailyWatchSummary(history);
    const dayKeys = buildHeatmapDayKeys(HEATMAP_WEEKS * 7);

    let maxWatchedSeconds = 0;
    let totalSecondsInRange = 0;

    dayKeys.forEach((dayKey) => {
      const bucket = daily.get(dayKey);
      const watchedSeconds = Number(bucket?.watchedSeconds || 0);
      maxWatchedSeconds = Math.max(maxWatchedSeconds, watchedSeconds);
      totalSecondsInRange += watchedSeconds;
    });

    grid.innerHTML = "";
    grid.style.setProperty("--heatmap-weeks", String(HEATMAP_WEEKS));

    const fragment = document.createDocumentFragment();

    dayKeys.forEach((dayKey, index) => {
      const bucket = daily.get(dayKey);
      const watchedSeconds = Number(bucket?.watchedSeconds || 0);
      const videoCount = bucket ? bucket.videoIds.size : 0;
      const level = getHeatLevel(watchedSeconds, maxWatchedSeconds);

      const date = parseUtcDateKey(dayKey);
      const weekday = Number.isNaN(date.getTime()) ? index % 7 : date.getUTCDay();
      const weekIndex = Math.floor(index / 7);

      const cell = document.createElement("div");
      cell.className = "conscious-heatmap-cell";
      cell.dataset.level = String(level);
      cell.style.gridColumn = String(weekIndex + 1);
      cell.style.gridRow = String(weekday + 1);
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", `${formatDateKeyForTooltip(dayKey)}: ${formatDuration(watchedSeconds)} watched across ${videoCount} video${videoCount === 1 ? "" : "s"}`);
      cell.addEventListener("mouseenter", (event) => {
        showTooltip(event, dayKey, watchedSeconds, videoCount);
      });
      cell.addEventListener("mousemove", (event) => {
        showTooltip(event, dayKey, watchedSeconds, videoCount);
      });
      cell.addEventListener("mouseleave", hideTooltip);

      fragment.appendChild(cell);
    });

    grid.appendChild(fragment);
    grid.onmouseleave = hideTooltip;

    const activeDays = dayKeys.reduce((count, dayKey) => count + (daily.has(dayKey) ? 1 : 0), 0);
    summary.textContent = `${formatDuration(totalSecondsInRange)} watched in the last ${HEATMAP_WEEKS} weeks across ${activeDays} active day${activeDays === 1 ? "" : "s"}.`;
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
            <div class="conscious-heatmap-header">
              <h2 class="conscious-card-title">Watch history</h2>
              <p id="conscious-heatmap-summary" class="conscious-card-subtitle"></p>
            </div>
            <div
              id="conscious-heatmap-grid"
              class="conscious-heatmap-grid"
              role="grid"
              aria-label="Daily watch activity heatmap"
            ></div>
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
      getHistoryBrowseRoot() ||
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

    renderHeatmap(history);

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

  function getHistoryBrowseRoot() {
    return document.querySelector("ytd-page-manager ytd-browse[page-subtype='history']") || null;
  }

  function getHistoryBrowseContentHost() {
    return (
      document.querySelector("ytd-page-manager ytd-browse[page-subtype='history'] #contents") ||
      document.querySelector("ytd-page-manager ytd-browse[page-subtype='history'] #primary") ||
      getHistoryBrowseRoot() ||
      null
    );
  }

  function setNativePageVisibility(showNativePage) {
    const browseRoot = getHistoryBrowseRoot();
    if (!browseRoot) return;

    if (showNativePage) {
      browseRoot.removeAttribute("data-conscious-native-hidden");
      return;
    }

    browseRoot.setAttribute("data-conscious-native-hidden", "1");
  }

  function renderRoutePage() {
    const root = ensureConsciousPageRoot();
    const isRoute = isConsciousRoute();

    root.hidden = !isRoute;
    setNativePageVisibility(!isRoute);
    updateGuideActiveState();

    if (isRoute) {
      setConsciousSessionRoute(true);
      loadShortsState();
      loadHistory();
      return;
    }

    setConsciousSessionRoute(false);
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

    if (shouldRestoreConsciousRoute() && window.history && typeof window.history.replaceState === "function") {
      window.history.replaceState(window.history.state, "", getConsciousUrl());
    }

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
