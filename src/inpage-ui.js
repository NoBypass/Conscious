(() => {
  const INPAGE_SHORTS_STORAGE_KEY = "shortsDisabled";
  const INPAGE_DAILY_TIMER_STORAGE_KEY = "dailyWatchTimerEnabled";
  const INPAGE_HEADER_DECLUTTER_STORAGE_KEY = "headerDeclutterEnabled";
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
  const DAY_MS = 24 * 60 * 60 * 1000;
  const GRAPH_BUCKET_MINUTES = 15;
  const GRAPH_BUCKET_COUNT = (24 * 60) / GRAPH_BUCKET_MINUTES;
  const SVG_NS = "http://www.w3.org/2000/svg";

  let bootstrapTimer = null;
  let observer = null;
  let hasLoadedSettingsSnapshot = false;
  let hasLoadedHistorySnapshot = false;

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

  function formatDurationCompact(totalSeconds) {
    const rounded = Math.max(0, Math.round(totalSeconds || 0));
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
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

  function getBucketIndexFromDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 0;
    const totalMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
    return Math.max(0, Math.min(GRAPH_BUCKET_COUNT - 1, Math.floor(totalMinutes / GRAPH_BUCKET_MINUTES)));
  }

  function getBucketLabel(bucketIndex) {
    const clamped = Math.max(0, Math.min(GRAPH_BUCKET_COUNT, bucketIndex));
    const minutes = clamped * GRAPH_BUCKET_MINUTES;
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  function getUtcDayStartMs(dayKey) {
    const date = parseUtcDateKey(dayKey);
    if (Number.isNaN(date.getTime())) return NaN;
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }

  function getDaysOnRecord(dayKeys) {
    if (!dayKeys.length) return 0;
    const earliest = dayKeys.reduce((minKey, key) => (key < minKey ? key : minKey), dayKeys[0]);
    const startMs = getUtcDayStartMs(earliest);
    if (!Number.isFinite(startMs)) return 0;

    const now = new Date();
    const todayStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    if (todayStartMs < startMs) return 0;
    return Math.floor((todayStartMs - startMs) / DAY_MS) + 1;
  }

  function createBucketSeries() {
    return Array.from({ length: GRAPH_BUCKET_COUNT }, () => 0);
  }

  function buildTimelineByDay(history) {
    const timelineByDay = new Map();

    const ensureDaySeries = (dayKey) => {
      if (!timelineByDay.has(dayKey)) timelineByDay.set(dayKey, createBucketSeries());
      return timelineByDay.get(dayKey);
    };

    history.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;

      const timeline = entry.timelineByDay;
      let hasTimeline = false;

      if (timeline && typeof timeline === "object") {
        Object.entries(timeline).forEach(([dayKey, buckets]) => {
          if (!dayKey || !buckets || typeof buckets !== "object") return;
          hasTimeline = true;
          const daySeries = ensureDaySeries(dayKey);

          Object.entries(buckets).forEach(([bucketRaw, secondsRaw]) => {
            const bucket = Number(bucketRaw);
            const seconds = Number(secondsRaw || 0);
            if (!Number.isFinite(bucket) || bucket < 0 || bucket >= GRAPH_BUCKET_COUNT || seconds <= 0) return;
            daySeries[bucket] += seconds;
          });
        });
      }

      if (hasTimeline) return;

      const watchByDay = entry.watchByDay && typeof entry.watchByDay === "object" ? entry.watchByDay : null;
      if (watchByDay && Object.keys(watchByDay).length > 0) {
        Object.entries(watchByDay).forEach(([dayKey, secondsRaw]) => {
          const seconds = Number(secondsRaw || 0);
          if (!dayKey || seconds <= 0) return;
          // Legacy entries do not have intraday buckets, so place them at noon as a neutral fallback.
          ensureDaySeries(dayKey)[Math.floor(GRAPH_BUCKET_COUNT / 2)] += seconds;
        });
        return;
      }

      const fallbackDay = String(entry.lastWatchedAt || "").slice(0, 10);
      const fallbackSeconds = Number(entry.watchedSeconds || 0);
      if (!fallbackDay || fallbackSeconds <= 0) return;

      const fallbackDate = new Date(entry.lastWatchedAt || `${fallbackDay}T12:00:00Z`);
      const bucket = getBucketIndexFromDate(fallbackDate);
      ensureDaySeries(fallbackDay)[bucket] += fallbackSeconds;
    });

    return timelineByDay;
  }

  function buildCumulativeSeries(series) {
    let running = 0;
    return series.map((value) => {
      running += Number(value || 0);
      return running;
    });
  }

  function createSvgElement(tagName, attributes) {
    const element = document.createElementNS(SVG_NS, tagName);
    Object.entries(attributes || {}).forEach(([key, value]) => {
      element.setAttribute(key, String(value));
    });
    return element;
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

    const firstDate = parseUtcDateKey(dayKeys[0]);
    const firstWeekdayMondayFirst = Number.isNaN(firstDate.getTime())
      ? 0
      : (firstDate.getUTCDay() + 6) % 7;
    const firstMondayUtcMs = Number.isNaN(firstDate.getTime())
      ? 0
      : firstDate.getTime() - firstWeekdayMondayFirst * DAY_MS;

    let maxWeekIndex = 0;
    dayKeys.forEach((dayKey) => {
      const date = parseUtcDateKey(dayKey);
      if (Number.isNaN(date.getTime())) return;
      const weekIndex = Math.floor((date.getTime() - firstMondayUtcMs) / (7 * DAY_MS));
      if (weekIndex > maxWeekIndex) maxWeekIndex = weekIndex;
    });

    grid.style.setProperty("--heatmap-weeks", String(Math.max(1, maxWeekIndex + 1)));

    const fragment = document.createDocumentFragment();

    dayKeys.forEach((dayKey, index) => {
      const bucket = daily.get(dayKey);
      const watchedSeconds = Number(bucket?.watchedSeconds || 0);
      const videoCount = bucket ? bucket.videoIds.size : 0;
      const level = getHeatLevel(watchedSeconds, maxWatchedSeconds);

      const date = parseUtcDateKey(dayKey);
      const weekday = Number.isNaN(date.getTime()) ? index % 7 : (date.getUTCDay() + 6) % 7;
      const weekIndex = Number.isNaN(date.getTime())
        ? Math.floor(index / 7)
        : Math.floor((date.getTime() - firstMondayUtcMs) / (7 * DAY_MS));

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
      const toggle = root.querySelector("#conscious-shorts-toggle");
      const dailyTimerToggle = root.querySelector("#conscious-daily-timer-toggle");
      const headerDeclutterToggle = root.querySelector("#conscious-header-declutter-toggle");
      if (toggle) {
        toggle.addEventListener("change", () => {
          safeChromeCall(() => {
            chrome.storage.sync.set({ [INPAGE_SHORTS_STORAGE_KEY]: toggle.checked });
          });
        });
      }

      if (dailyTimerToggle) {
        dailyTimerToggle.addEventListener("change", () => {
          safeChromeCall(() => {
            chrome.storage.sync.set({ [INPAGE_DAILY_TIMER_STORAGE_KEY]: dailyTimerToggle.checked });
          });
        });
      }

      if (headerDeclutterToggle) {
        headerDeclutterToggle.addEventListener("change", () => {
          safeChromeCall(() => {
            chrome.storage.sync.set({
              [INPAGE_HEADER_DECLUTTER_STORAGE_KEY]: headerDeclutterToggle.checked
            });
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

  function loadSettingsState() {
    const root = document.getElementById("conscious-page-root");
    if (!root) return;

    safeChromeCall(() => {
      chrome.storage.sync.get(
        {
          [INPAGE_SHORTS_STORAGE_KEY]: false,
          [INPAGE_DAILY_TIMER_STORAGE_KEY]: false,
          [INPAGE_HEADER_DECLUTTER_STORAGE_KEY]: false
        },
        (result) => {
          const isDisabled = Boolean(result[INPAGE_SHORTS_STORAGE_KEY]);
          const dailyTimerEnabled = Boolean(result[INPAGE_DAILY_TIMER_STORAGE_KEY]);
          const headerDeclutterEnabled = Boolean(result[INPAGE_HEADER_DECLUTTER_STORAGE_KEY]);
          const checkbox = root.querySelector("#conscious-shorts-toggle");
          const dailyTimerCheckbox = root.querySelector("#conscious-daily-timer-toggle");
          const headerDeclutterCheckbox = root.querySelector("#conscious-header-declutter-toggle");
          const state = root.querySelector("#conscious-shorts-state");
          const dailyTimerState = root.querySelector("#conscious-daily-timer-state");
          const headerDeclutterState = root.querySelector("#conscious-header-declutter-state");
          if (
            !checkbox ||
            !state ||
            !dailyTimerCheckbox ||
            !dailyTimerState ||
            !headerDeclutterCheckbox ||
            !headerDeclutterState
          ) {
            return;
          }

          checkbox.checked = isDisabled;
          state.textContent = isDisabled
            ? "Shorts are blocked across YouTube."
            : "Shorts are currently allowed.";

          dailyTimerCheckbox.checked = dailyTimerEnabled;
          dailyTimerState.textContent = dailyTimerEnabled
            ? "Daily watch timer is shown in the top bar."
            : "Daily watch timer is hidden.";

          headerDeclutterCheckbox.checked = headerDeclutterEnabled;
          headerDeclutterState.textContent = headerDeclutterEnabled
            ? "Voice search and Create buttons are hidden."
            : "Voice search and Create buttons are visible.";
        }
        );
    });
  }

  function renderDayTrendGraph(history) {
    const root = document.getElementById("conscious-page-root");
    if (!root) return;

    const svg = root.querySelector("#conscious-day-trend-svg");
    const empty = root.querySelector("#conscious-day-trend-empty");
    const subtext = root.querySelector("#conscious-day-trend-subtitle");
    if (!svg || !empty || !subtext) return;

    const dailySummary = buildDailyWatchSummary(history);
    const timelineByDay = buildTimelineByDay(history);
    const recordDayKeys = Array.from(dailySummary.keys());
    const daysOnRecord = getDaysOnRecord(recordDayKeys);
    const now = new Date();
    const todayKey = getUtcDateKey(now);
    const todayBucket = getBucketIndexFromDate(now);

    const averageBaseSeries = createBucketSeries();
    if (daysOnRecord > 0) {
      const earliest = recordDayKeys.reduce((minKey, key) => (key < minKey ? key : minKey), recordDayKeys[0]);
      const earliestStartMs = getUtcDayStartMs(earliest);
      if (Number.isFinite(earliestStartMs)) {
        for (let dayOffset = 0; dayOffset < daysOnRecord; dayOffset += 1) {
          const dayMs = earliestStartMs + dayOffset * DAY_MS;
          const dayKey = getUtcDateKey(new Date(dayMs));
          const daySeries = timelineByDay.get(dayKey);
          if (!daySeries) continue;
          for (let index = 0; index < GRAPH_BUCKET_COUNT; index += 1) {
            averageBaseSeries[index] += Number(daySeries[index] || 0);
          }
        }
      }

      for (let index = 0; index < GRAPH_BUCKET_COUNT; index += 1) {
        averageBaseSeries[index] /= daysOnRecord;
      }
    }

    const todaySeries = timelineByDay.get(todayKey) || createBucketSeries();
    const todayCumulative = buildCumulativeSeries(todaySeries);
    const averageCumulative = buildCumulativeSeries(averageBaseSeries);

    const maxValue = Math.max(
      1,
      ...todayCumulative,
      ...averageCumulative
    );

    const hasAnyData = recordDayKeys.length > 0 && (todayCumulative.some((v) => v > 0) || averageCumulative.some((v) => v > 0));

    svg.innerHTML = "";
    if (!hasAnyData) {
      empty.hidden = false;
      subtext.textContent = "Graph will appear once watch-time history accumulates.";
      return;
    }

    empty.hidden = true;
    subtext.textContent = `Today vs average day over ${daysOnRecord} day${daysOnRecord === 1 ? "" : "s"} on record.`;

    const width = 760;
    const height = 220;
    const paddingLeft = 44;
    const paddingRight = 12;
    const paddingTop = 12;
    const paddingBottom = 28;
    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;
    const pointsCount = GRAPH_BUCKET_COUNT - 1;

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    const xForIndex = (index) => paddingLeft + (index / pointsCount) * plotWidth;
    const yForValue = (value) => paddingTop + (1 - value / maxValue) * plotHeight;

    const xAxis = createSvgElement("line", {
      x1: paddingLeft,
      y1: paddingTop + plotHeight,
      x2: paddingLeft + plotWidth,
      y2: paddingTop + plotHeight,
      class: "conscious-trend-axis"
    });
    const yAxis = createSvgElement("line", {
      x1: paddingLeft,
      y1: paddingTop,
      x2: paddingLeft,
      y2: paddingTop + plotHeight,
      class: "conscious-trend-axis"
    });
    svg.appendChild(xAxis);
    svg.appendChild(yAxis);

    const avgPoints = averageCumulative
      .map((value, index) => `${xForIndex(index)},${yForValue(value)}`)
      .join(" ");
    const avgLine = createSvgElement("polyline", {
      points: avgPoints,
      class: "conscious-trend-line conscious-trend-line-average"
    });
    svg.appendChild(avgLine);

    const todayPoints = [];
    for (let index = 0; index < GRAPH_BUCKET_COUNT; index += 1) {
      if (index > todayBucket) break;
      todayPoints.push(`${xForIndex(index)},${yForValue(todayCumulative[index])}`);
    }

    const todayLine = createSvgElement("polyline", {
      points: todayPoints.join(" "),
      class: "conscious-trend-line conscious-trend-line-today"
    });
    svg.appendChild(todayLine);

    const nowMarker = createSvgElement("line", {
      x1: xForIndex(todayBucket),
      y1: paddingTop,
      x2: xForIndex(todayBucket),
      y2: paddingTop + plotHeight,
      class: "conscious-trend-now-marker"
    });
    svg.appendChild(nowMarker);

    [0, 24, 48, 72, 96].forEach((bucketIndex) => {
      const x = xForIndex(Math.min(pointsCount, bucketIndex));
      const label = createSvgElement("text", {
        x,
        y: height - 8,
        class: "conscious-trend-axis-label",
        "text-anchor": bucketIndex === 0 ? "start" : bucketIndex === 96 ? "end" : "middle"
      });
      label.textContent = getBucketLabel(bucketIndex);
      svg.appendChild(label);
    });

    const yTop = createSvgElement("text", {
      x: paddingLeft - 6,
      y: paddingTop + 10,
      class: "conscious-trend-axis-label",
      "text-anchor": "end"
    });
    yTop.textContent = formatDurationCompact(maxValue);
    svg.appendChild(yTop);

    const yBottom = createSvgElement("text", {
      x: paddingLeft - 6,
      y: paddingTop + plotHeight,
      class: "conscious-trend-axis-label",
      "text-anchor": "end"
    });
    yBottom.textContent = "0m";
    svg.appendChild(yBottom);

    svg.setAttribute(
      "aria-label",
      `Today cumulative watch time is ${formatDuration(todayCumulative[todayBucket] || 0)} by ${getBucketLabel(todayBucket)}. Average full-day total is ${formatDuration(averageCumulative[averageCumulative.length - 1] || 0)}.`
    );
  }

  function renderStats(history) {
    const root = document.getElementById("conscious-page-root");
    if (!root) return;

    const totalVideosEl = root.querySelector("#conscious-stat-total-videos");
    const totalTimeEl = root.querySelector("#conscious-stat-total-time");
    const avgPerDayEl = root.querySelector("#conscious-stat-avg-day");
    const rangeEl = root.querySelector("#conscious-stats-range");
    if (!totalVideosEl || !totalTimeEl || !avgPerDayEl || !rangeEl) return;

    const totalVideos = history.reduce((count, entry) => {
      const watchedSeconds = Number(entry?.watchedSeconds || 0);
      return count + (watchedSeconds > 0 ? 1 : 0);
    }, 0);

    const totalSeconds = history.reduce((sum, entry) => sum + Number(entry?.watchedSeconds || 0), 0);
    const dailySummary = buildDailyWatchSummary(history);
    const daysOnRecord = getDaysOnRecord(Array.from(dailySummary.keys()));
    const averagePerDay = daysOnRecord > 0 ? totalSeconds / daysOnRecord : 0;

    totalVideosEl.textContent = new Intl.NumberFormat().format(totalVideos);
    totalTimeEl.textContent = formatDuration(totalSeconds);
    avgPerDayEl.textContent = formatDurationCompact(averagePerDay);
    rangeEl.textContent = daysOnRecord > 0
      ? `Based on ${daysOnRecord} day${daysOnRecord === 1 ? "" : "s"} on record.`
      : "No history on record yet.";

    renderDayTrendGraph(history);
  }

  function renderHistory(history) {
    const root = document.getElementById("conscious-page-root");
    if (!root) return;

    const list = root.querySelector("#conscious-history-list");
    const empty = root.querySelector("#conscious-history-empty");
    if (!list || !empty) return;

    renderStats(history);
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

      if (!hasLoadedSettingsSnapshot) {
        loadSettingsState();
        hasLoadedSettingsSnapshot = true;
      }

      if (!hasLoadedHistorySnapshot) {
        loadHistory();
        hasLoadedHistorySnapshot = true;
      }
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
      if (
        areaName === "sync" &&
        (
          changes[INPAGE_SHORTS_STORAGE_KEY] ||
          changes[INPAGE_DAILY_TIMER_STORAGE_KEY] ||
          changes[INPAGE_HEADER_DECLUTTER_STORAGE_KEY]
        )
      ) {
        loadSettingsState();
      }

      if (areaName === "local" && changes[INPAGE_HISTORY_STORAGE_KEY] && isConsciousRoute()) {
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
