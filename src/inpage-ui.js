(() => {
  const NS = window.ConsciousInpage;
  const { constants, state } = NS;

  function updateGuideActiveState() {
    const active = NS.isConsciousRoute();
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

            <div class="conscious-toggle-row">
              <div>
                <h2 class="conscious-card-title">Daily timer</h2>
                <p id="conscious-daily-timer-state" class="conscious-card-subtitle"></p>
              </div>
              <label class="conscious-switch">
                <input id="conscious-daily-timer-toggle" type="checkbox" />
                <span>Show daily top-bar timer</span>
              </label>
            </div>

            <div class="conscious-toggle-row">
              <div>
                <h2 class="conscious-card-title">Header declutter</h2>
                <p id="conscious-header-declutter-state" class="conscious-card-subtitle"></p>
              </div>
              <label class="conscious-switch">
                <input id="conscious-header-declutter-toggle" type="checkbox" />
                <span>Hide voice search and Create</span>
              </label>
            </div>
          </div>

          <div class="conscious-history-card conscious-stats-card">
            <div class="conscious-heatmap-header">
              <h2 class="conscious-card-title">Statistics</h2>
              <p id="conscious-stats-range" class="conscious-card-subtitle"></p>
            </div>
            <div class="conscious-stats-grid" role="list" aria-label="Watch statistics">
              <article class="conscious-stat-block" role="listitem">
                <p class="conscious-stat-label">Videos watched</p>
                <p id="conscious-stat-total-videos" class="conscious-stat-value">0</p>
              </article>
              <article class="conscious-stat-block" role="listitem">
                <p class="conscious-stat-label">Time watched</p>
                <p id="conscious-stat-total-time" class="conscious-stat-value">0m</p>
              </article>
              <article class="conscious-stat-block" role="listitem">
                <p class="conscious-stat-label">Avg per day</p>
                <p id="conscious-stat-avg-day" class="conscious-stat-value">0m</p>
              </article>
            </div>

            <div class="conscious-day-trend">
              <div class="conscious-heatmap-header conscious-day-trend-header">
                <h3 class="conscious-card-title">Today vs average day</h3>
                <p id="conscious-day-trend-subtitle" class="conscious-card-subtitle"></p>
              </div>
              <svg
                id="conscious-day-trend-svg"
                class="conscious-day-trend-svg"
                role="img"
                aria-label="Cumulative watch-time trend"
                preserveAspectRatio="none"
              ></svg>
              <div id="conscious-day-trend-tooltip" class="conscious-day-trend-tooltip" hidden></div>
              <p id="conscious-day-trend-empty" class="conscious-empty" hidden>No watch-time curve yet.</p>
              <div class="conscious-day-trend-legend" aria-hidden="true">
                <span class="conscious-day-trend-legend-item conscious-day-trend-legend-average">Average day</span>
                <span class="conscious-day-trend-legend-item conscious-day-trend-legend-today">Today</span>
              </div>
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

      const shortsToggle = root.querySelector("#conscious-shorts-toggle");
      const dailyTimerToggle = root.querySelector("#conscious-daily-timer-toggle");
      const headerDeclutterToggle = root.querySelector("#conscious-header-declutter-toggle");

      if (shortsToggle) {
        shortsToggle.addEventListener("change", () => {
          NS.safeChromeCall(() => {
            chrome.storage.sync.set({ [constants.shortsKey]: shortsToggle.checked });
          });
        });
      }

      if (dailyTimerToggle) {
        dailyTimerToggle.addEventListener("change", () => {
          NS.safeChromeCall(() => {
            chrome.storage.sync.set({ [constants.dailyTimerKey]: dailyTimerToggle.checked });
          });
        });
      }

      if (headerDeclutterToggle) {
        headerDeclutterToggle.addEventListener("change", () => {
          NS.safeChromeCall(() => {
            chrome.storage.sync.set({ [constants.headerDeclutterKey]: headerDeclutterToggle.checked });
          });
        });
      }
    }

    const targetHost =
      NS.getHistoryBrowseRoot() ||
      NS.getHistoryBrowseContentHost() ||
      document.querySelector("ytd-page-manager") ||
      document.body;

    if (root.parentElement !== targetHost) {
      targetHost.appendChild(root);
    }

    return root;
  }

  function loadSettingsState() {
    const root = document.getElementById("conscious-page-root");
    if (!root) return;

    NS.safeChromeCall(() => {
      chrome.storage.sync.get(
        {
          [constants.shortsKey]: false,
          [constants.dailyTimerKey]: false,
          [constants.headerDeclutterKey]: false
        },
        (result) => {
          const isShortsDisabled = Boolean(result[constants.shortsKey]);
          const isDailyTimerEnabled = Boolean(result[constants.dailyTimerKey]);
          const isHeaderDeclutterEnabled = Boolean(result[constants.headerDeclutterKey]);

          const shortsCheckbox = root.querySelector("#conscious-shorts-toggle");
          const dailyTimerCheckbox = root.querySelector("#conscious-daily-timer-toggle");
          const headerDeclutterCheckbox = root.querySelector("#conscious-header-declutter-toggle");

          const shortsState = root.querySelector("#conscious-shorts-state");
          const dailyTimerState = root.querySelector("#conscious-daily-timer-state");
          const headerDeclutterState = root.querySelector("#conscious-header-declutter-state");

          if (
            !shortsCheckbox ||
            !dailyTimerCheckbox ||
            !headerDeclutterCheckbox ||
            !shortsState ||
            !dailyTimerState ||
            !headerDeclutterState
          ) {
            return;
          }

          shortsCheckbox.checked = isShortsDisabled;
          shortsState.textContent = isShortsDisabled
            ? "Shorts are blocked across YouTube."
            : "Shorts are currently allowed.";

          dailyTimerCheckbox.checked = isDailyTimerEnabled;
          dailyTimerState.textContent = isDailyTimerEnabled
            ? "Daily watch timer is shown in the top bar."
            : "Daily watch timer is hidden.";

          headerDeclutterCheckbox.checked = isHeaderDeclutterEnabled;
          headerDeclutterState.textContent = isHeaderDeclutterEnabled
            ? "Voice search and Create buttons are hidden."
            : "Voice search and Create buttons are visible.";
        }
      );
    });
  }

  function renderHistory(history) {
    const root = document.getElementById("conscious-page-root");
    if (!root) return;

    const list = root.querySelector("#conscious-history-list");
    const empty = root.querySelector("#conscious-history-empty");
    if (!list || !empty) return;

    NS.renderStats(history);
    NS.renderHeatmap(history);

    list.innerHTML = "";
    if (!history.length) {
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    const fragment = document.createDocumentFragment();

    history.slice(0, constants.historyDisplayLimit).forEach((entry) => {
      const item = document.createElement("li");
      item.className = "conscious-history-item";

      const link = document.createElement("a");
      link.className = "conscious-history-link";
      link.href = entry.url || `https://www.youtube.com/watch?v=${entry.videoId || ""}`;
      link.textContent = entry.title || "Unknown title";

      const meta = document.createElement("div");
      meta.className = "conscious-history-meta";
      meta.textContent = `${NS.formatDuration(entry.watchedSeconds)} watched - ${NS.formatLastWatched(entry.lastWatchedAt)}`;

      item.appendChild(link);
      item.appendChild(meta);
      fragment.appendChild(item);
    });

    list.appendChild(fragment);
  }

  function loadHistory() {
    NS.safeChromeCall(() => {
      chrome.storage.local.get({ [constants.historyKey]: [] }, (result) => {
        const history = Array.isArray(result[constants.historyKey]) ? result[constants.historyKey] : [];
        renderHistory(history);
      });
    });
  }

  function renderRoutePage() {
    const root = ensureConsciousPageRoot();
    const isRoute = NS.isConsciousRoute();

    root.hidden = !isRoute;
    NS.setNativePageVisibility(!isRoute);
    updateGuideActiveState();

    if (!isRoute) {
      NS.setConsciousSessionRoute(false);
      return;
    }

    NS.setConsciousSessionRoute(true);

    if (!state.hasLoadedSettingsSnapshot) {
      loadSettingsState();
      state.hasLoadedSettingsSnapshot = true;
    }

    if (!state.hasLoadedHistorySnapshot) {
      loadHistory();
      state.hasLoadedHistorySnapshot = true;
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
    button.innerHTML = `
      <span class="conscious-guide-icon" aria-hidden="true">
        <svg class="conscious-guide-icon-svg conscious-guide-icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
        </svg>
        <svg class="conscious-guide-icon-svg conscious-guide-icon-solid" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.375 2.25c-1.035 0-1.875.84-1.875 1.875v15.75c0 1.035.84 1.875 1.875 1.875h.75c1.035 0 1.875-.84 1.875-1.875V4.125c0-1.036-.84-1.875-1.875-1.875h-.75ZM9.75 8.625c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875h-.75a1.875 1.875 0 0 1-1.875-1.875V8.625ZM3 13.125c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v6.75c0 1.035-.84 1.875-1.875 1.875h-.75A1.875 1.875 0 0 1 3 19.875v-6.75Z" />
        </svg>
      </span>
      <span class="conscious-guide-label">Conscious</span>
    `;

    button.addEventListener("click", () => {
      if (!NS.isConsciousRoute()) {
        NS.navigateToConsciousRoute();
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
    upsertGuideItem(findExpandedGuideContainer(), constants.fullGuideItemId, false);
    upsertGuideItem(findMiniGuideContainer(), constants.miniGuideItemId, true);
    updateGuideActiveState();
  }

  function bootstrap() {
    if (!NS.hasExtensionContext()) return;

    if (NS.shouldRestoreConsciousRoute() && window.history && typeof window.history.replaceState === "function") {
      window.history.replaceState(window.history.state, "", NS.getConsciousUrl());
    }

    ensureGuideEntry();
    renderRoutePage();
  }

  function scheduleBootstrap() {
    if (state.bootstrapTimer) return;
    state.bootstrapTimer = window.setTimeout(() => {
      state.bootstrapTimer = null;
      bootstrap();
    }, 120);
  }

  if (NS.hasExtensionContext()) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (
        areaName === "sync" &&
        (changes[constants.shortsKey] ||
          changes[constants.dailyTimerKey] ||
          changes[constants.headerDeclutterKey])
      ) {
        loadSettingsState();
      }

      if (areaName === "local" && changes[constants.historyKey] && NS.isConsciousRoute()) {
        loadHistory();
      }
    });
  }

  window.addEventListener("yt-navigate-finish", scheduleBootstrap);
  window.addEventListener("popstate", scheduleBootstrap);

  state.observer = new MutationObserver(scheduleBootstrap);
  state.observer.observe(document.documentElement, { childList: true, subtree: true });

  bootstrap();
})();
