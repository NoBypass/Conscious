(() => {
  const app = window.Conscious;
  const { config } = app;
  const { formatDuration, formatDurationCompact, formatLastWatched, formatDateKeyForTooltip } = app.domain.shared;
  const metrics = app.domain.metrics;
  const youtubeDom = app.adapters.youtubeInpage;
  let latestHistory = [];
  let selectedHeatmapDayKey = null;

  const ensurePageRoot = (onToggleChange) => {
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
            <div class="conscious-stats-grid" aria-label="Watch statistics">
              <article class="conscious-stat-block">
                <p class="conscious-stat-label">Videos watched</p>
                <p id="conscious-stat-total-videos" class="conscious-stat-value">0</p>
              </article>
              <article class="conscious-stat-block">
                <p class="conscious-stat-label">Time watched</p>
                <p id="conscious-stat-total-time" class="conscious-stat-value">0m</p>
              </article>
              <article class="conscious-stat-block">
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

      const bindToggle = (selector, key) => {
        const node = root.querySelector(selector);
        if (!node) return;
        node.addEventListener("change", () => {
          onToggleChange(key, Boolean(node.checked));
        });
      };

      bindToggle("#conscious-shorts-toggle", app.keys.shorts);
      bindToggle("#conscious-daily-timer-toggle", app.keys.dailyTimer);
      bindToggle("#conscious-header-declutter-toggle", app.keys.headerDeclutter);
    }

    const targetHost =
      youtubeDom.getHistoryBrowseRoot() ||
      youtubeDom.getHistoryBrowseContentHost() ||
      document.querySelector("ytd-page-manager") ||
      document.body;

    if (root.parentElement !== targetHost) {
      targetHost.appendChild(root);
    }

    return root;
  };

  const renderSettings = ({ shortsDisabled, dailyTimerEnabled, headerDeclutterEnabled }) => {
    const root = document.getElementById("conscious-page-root");
    if (!root) return;

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

    shortsCheckbox.checked = shortsDisabled;
    shortsState.textContent = shortsDisabled ? "Shorts are blocked across YouTube." : "Shorts are currently allowed.";

    dailyTimerCheckbox.checked = dailyTimerEnabled;
    dailyTimerState.textContent = dailyTimerEnabled
      ? "Daily watch timer is shown in the top bar."
      : "Daily watch timer is hidden.";

    headerDeclutterCheckbox.checked = headerDeclutterEnabled;
    headerDeclutterState.textContent = headerDeclutterEnabled
      ? "Voice search and Create buttons are hidden."
      : "Voice search and Create buttons are visible.";
  };

  const getEntryWatchedSecondsForDay = (entry, dayKey) => {
    if (!entry || !dayKey) return 0;

    const watchByDay = entry.watchByDay && typeof entry.watchByDay === "object" ? entry.watchByDay : null;
    if (watchByDay && Object.prototype.hasOwnProperty.call(watchByDay, dayKey)) {
      return Number(watchByDay[dayKey] || 0);
    }

    const fallbackDay = String(entry.lastWatchedAt || "").slice(0, 10);
    if (fallbackDay !== dayKey) return 0;
    return Number(entry.watchedSeconds || 0);
  };

  const buildHistoryListEntries = (history) => {
    if (!selectedHeatmapDayKey) {
      return history.slice(0, config.historyDisplayLimit).map((entry) => ({
        entry,
        watchedSecondsForDisplay: Number(entry?.watchedSeconds || 0)
      }));
    }

    return history
      .map((entry) => ({
        entry,
        watchedSecondsForDisplay: getEntryWatchedSecondsForDay(entry, selectedHeatmapDayKey)
      }))
      .filter(({ watchedSecondsForDisplay }) => watchedSecondsForDisplay > 0);
  };

  const renderHistoryList = (history) => {
    const root = document.getElementById("conscious-page-root");
    if (!root) return;

    const list = root.querySelector("#conscious-history-list");
    const empty = root.querySelector("#conscious-history-empty");
    if (!list || !empty) return;

    const rows = buildHistoryListEntries(history);
    list.innerHTML = "";

    if (!rows.length) {
      empty.hidden = false;
      empty.textContent = selectedHeatmapDayKey
        ? `No watch activity on ${formatDateKeyForTooltip(selectedHeatmapDayKey)} yet. Click the selected day again to show all videos.`
        : "No watch history yet.";
      return;
    }

    empty.hidden = true;
    const fragment = document.createDocumentFragment();

    rows.forEach(({ entry, watchedSecondsForDisplay }) => {
      const item = document.createElement("li");
      item.className = "conscious-history-item";

      const link = document.createElement("a");
      link.className = "conscious-history-link";
      link.href = entry.url || `https://www.youtube.com/watch?v=${entry.videoId || ""}`;
      link.textContent = entry.title || "Unknown title";

      const meta = document.createElement("div");
      meta.className = "conscious-history-meta";
      meta.textContent = selectedHeatmapDayKey
        ? `${formatDuration(watchedSecondsForDisplay)} watched that day - ${formatLastWatched(entry.lastWatchedAt)}`
        : `${formatDuration(watchedSecondsForDisplay)} watched - ${formatLastWatched(entry.lastWatchedAt)}`;

      item.appendChild(link);
      item.appendChild(meta);
      fragment.appendChild(item);
    });

    list.appendChild(fragment);
  };

  const renderHistory = (history) => {
    const root = document.getElementById("conscious-page-root");
    if (!root) return;

    latestHistory = Array.isArray(history) ? history : [];

    if (selectedHeatmapDayKey) {
      const hasEntriesOnSelectedDay = latestHistory.some(
        (entry) => getEntryWatchedSecondsForDay(entry, selectedHeatmapDayKey) > 0
      );
      if (!hasEntriesOnSelectedDay) selectedHeatmapDayKey = null;
    }

    renderStats(latestHistory);
    renderHeatmap(latestHistory);
    renderHistoryList(latestHistory);
  };

  const renderStats = (history) => {
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
    const dailySummary = metrics.buildDailyWatchSummary(history);
    const daysOnRecord = metrics.getDaysOnRecord(Array.from(dailySummary.keys()));
    const averagePerDay = daysOnRecord > 0 ? totalSeconds / daysOnRecord : 0;

    totalVideosEl.textContent = new Intl.NumberFormat().format(totalVideos);
    totalTimeEl.textContent = formatDuration(totalSeconds);
    avgPerDayEl.textContent = formatDurationCompact(averagePerDay);
    rangeEl.textContent =
      daysOnRecord > 0
        ? `Based on ${daysOnRecord} day${daysOnRecord === 1 ? "" : "s"} on record.`
        : "No history on record yet.";

    renderDayTrendGraph(history);
  };

  const renderHeatmap = (history) => {
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
      tooltip.innerHTML = `
        <div class="conscious-heatmap-tooltip-title">${formatDateKeyForTooltip(dayKey)}</div>
        <div class="conscious-heatmap-tooltip-line">${formatDuration(watchedSeconds)} watched</div>
        <div class="conscious-heatmap-tooltip-line">${videoCount} video${videoCount === 1 ? "" : "s"}</div>
      `;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const rect = tooltip.getBoundingClientRect();
      const maxX = Math.max(8, viewportWidth - rect.width - 8);
      const maxY = Math.max(8, viewportHeight - rect.height - 8);

      const nextLeft = Math.min(Math.max(8, event.clientX + config.heatmapTooltipOffset), maxX);
      const nextTop = Math.min(Math.max(8, event.clientY + config.heatmapTooltipOffset), maxY);

      tooltip.style.left = `${nextLeft}px`;
      tooltip.style.top = `${nextTop}px`;
    };

    const daily = metrics.buildDailyWatchSummary(history);
    const dayKeys = metrics.buildHeatmapDayKeys(config.heatmapWeeks * 7);

    let maxWatchedSeconds = 0;
    let totalSecondsInRange = 0;

    dayKeys.forEach((dayKey) => {
      const bucket = daily.get(dayKey);
      const watchedSeconds = Number(bucket?.watchedSeconds || 0);
      maxWatchedSeconds = Math.max(maxWatchedSeconds, watchedSeconds);
      totalSecondsInRange += watchedSeconds;
    });

    grid.innerHTML = "";

    const firstDate = app.domain.shared.parseUtcDateKey(dayKeys[0]);
    const firstWeekdayMondayFirst = Number.isNaN(firstDate.getTime()) ? 0 : (firstDate.getUTCDay() + 6) % 7;
    const firstMondayUtcMs = Number.isNaN(firstDate.getTime())
      ? 0
      : firstDate.getTime() - firstWeekdayMondayFirst * config.dayMs;

    let maxWeekIndex = 0;
    dayKeys.forEach((dayKey) => {
      const date = app.domain.shared.parseUtcDateKey(dayKey);
      if (Number.isNaN(date.getTime())) return;
      const weekIndex = Math.floor((date.getTime() - firstMondayUtcMs) / (7 * config.dayMs));
      if (weekIndex > maxWeekIndex) maxWeekIndex = weekIndex;
    });

    grid.style.setProperty("--heatmap-weeks", String(Math.max(1, maxWeekIndex + 1)));

    const fragment = document.createDocumentFragment();

    dayKeys.forEach((dayKey, index) => {
      const bucket = daily.get(dayKey);
      const watchedSeconds = Number(bucket?.watchedSeconds || 0);
      const videoCount = bucket ? bucket.videoIds.size : 0;
      const level = metrics.getHeatLevel(watchedSeconds, maxWatchedSeconds);

      const date = app.domain.shared.parseUtcDateKey(dayKey);
      const weekday = Number.isNaN(date.getTime()) ? index % 7 : (date.getUTCDay() + 6) % 7;
      const weekIndex = Number.isNaN(date.getTime())
        ? Math.floor(index / 7)
        : Math.floor((date.getTime() - firstMondayUtcMs) / (7 * config.dayMs));

      const cell = document.createElement("div");
      cell.className = "conscious-heatmap-cell";
      cell.dataset.level = String(level);
      cell.classList.toggle("is-selected", dayKey === selectedHeatmapDayKey);
      cell.style.gridColumn = String(weekIndex + 1);
      cell.style.gridRow = String(weekday + 1);
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("tabindex", "0");
      cell.setAttribute("aria-selected", dayKey === selectedHeatmapDayKey ? "true" : "false");
      cell.setAttribute(
        "aria-label",
        `${formatDateKeyForTooltip(dayKey)}: ${formatDuration(watchedSeconds)} watched across ${videoCount} video${videoCount === 1 ? "" : "s"}`
      );
      cell.addEventListener("mouseenter", (event) => showTooltip(event, dayKey, watchedSeconds, videoCount));
      cell.addEventListener("mousemove", (event) => showTooltip(event, dayKey, watchedSeconds, videoCount));
      cell.addEventListener("mouseleave", hideTooltip);
      cell.addEventListener("click", () => {
        selectedHeatmapDayKey = selectedHeatmapDayKey === dayKey ? null : dayKey;
        renderHeatmap(latestHistory);
        renderHistoryList(latestHistory);
      });
      cell.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectedHeatmapDayKey = selectedHeatmapDayKey === dayKey ? null : dayKey;
        renderHeatmap(latestHistory);
        renderHistoryList(latestHistory);
      });

      fragment.appendChild(cell);
    });

    grid.appendChild(fragment);
    grid.onmouseleave = hideTooltip;

    const activeDays = dayKeys.reduce((count, dayKey) => count + (daily.has(dayKey) ? 1 : 0), 0);
    summary.textContent = `${formatDuration(totalSecondsInRange)} watched in the last ${config.heatmapWeeks} weeks across ${activeDays} active day${activeDays === 1 ? "" : "s"}.`;
  };

  const renderDayTrendGraph = (history) => {
    const root = document.getElementById("conscious-page-root");
    if (!root) return;

    const svg = root.querySelector("#conscious-day-trend-svg");
    const tooltip = root.querySelector("#conscious-day-trend-tooltip");
    const empty = root.querySelector("#conscious-day-trend-empty");
    const subtext = root.querySelector("#conscious-day-trend-subtitle");
    if (!svg || !tooltip || !empty || !subtext) return;

    const dailySummary = metrics.buildDailyWatchSummary(history);
    const timelineByDay = metrics.buildTimelineByDay(history);
    const recordDayKeys = Array.from(dailySummary.keys());
    const daysOnRecord = metrics.getDaysOnRecord(recordDayKeys);
    const now = new Date();
    const todayKey = app.domain.shared.getUtcDateKey(now);
    const todayBucket = metrics.getBucketIndexFromDate(now);

    const averageBaseSeries = metrics.createBucketSeries();
    if (daysOnRecord > 0) {
      const earliest = recordDayKeys.reduce((minKey, key) => (key < minKey ? key : minKey), recordDayKeys[0]);
      const earliestStartMs = metrics.getUtcDayStartMs(earliest);
      if (Number.isFinite(earliestStartMs)) {
        for (let dayOffset = 0; dayOffset < daysOnRecord; dayOffset += 1) {
          const dayMs = earliestStartMs + dayOffset * config.dayMs;
          const dayKey = app.domain.shared.getUtcDateKey(new Date(dayMs));
          const daySeries = timelineByDay.get(dayKey);
          if (!daySeries) continue;
          for (let index = 0; index < config.graphBucketCount; index += 1) {
            averageBaseSeries[index] += Number(daySeries[index] || 0);
          }
        }
      }

      for (let index = 0; index < config.graphBucketCount; index += 1) {
        averageBaseSeries[index] /= daysOnRecord;
      }
    }

    const todaySeries = timelineByDay.get(todayKey) || metrics.createBucketSeries();
    const todayCumulative = metrics.buildCumulativeSeries(todaySeries);
    const averageCumulative = metrics.buildCumulativeSeries(averageBaseSeries);

    const maxValue = Math.max(1, ...todayCumulative, ...averageCumulative);
    const hasAnyData =
      recordDayKeys.length > 0 &&
      (todayCumulative.some((value) => value > 0) || averageCumulative.some((value) => value > 0));

    svg.innerHTML = "";
    tooltip.hidden = true;
    if (!hasAnyData) {
      empty.hidden = false;
      subtext.textContent = "Graph will appear once watch-time history accumulates.";
      svg.onmousemove = null;
      svg.onmouseleave = null;
      return;
    }

    empty.hidden = true;
    subtext.textContent = `Today vs average day over ${daysOnRecord} day${daysOnRecord === 1 ? "" : "s"} on record.`;

    const renderedRect = svg.getBoundingClientRect();
    const width = Math.max(640, Math.round(renderedRect.width || 760));
    const height = Math.max(180, Math.round(renderedRect.height || 220));
    const paddingLeft = Math.max(44, Math.round(width * 0.058));
    const paddingRight = Math.max(12, Math.round(width * 0.016));
    const paddingTop = 12;
    const paddingBottom = 28;
    const plotWidth = Math.max(1, width - paddingLeft - paddingRight);
    const plotHeight = Math.max(1, height - paddingTop - paddingBottom);
    const pointsCount = config.graphBucketCount - 1;

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    const xForIndex = (index) => paddingLeft + (index / pointsCount) * plotWidth;
    const yForValue = (value) => paddingTop + (1 - value / maxValue) * plotHeight;
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    const appendAxis = () => {
      svg.appendChild(metrics.createSvgElement("line", {
        x1: paddingLeft,
        y1: paddingTop + plotHeight,
        x2: paddingLeft + plotWidth,
        y2: paddingTop + plotHeight,
        class: "conscious-trend-axis"
      }));

      svg.appendChild(metrics.createSvgElement("line", {
        x1: paddingLeft,
        y1: paddingTop,
        x2: paddingLeft,
        y2: paddingTop + plotHeight,
        class: "conscious-trend-axis"
      }));
    };

    appendAxis();

    const averagePoints = averageCumulative.map((value, index) => ({ x: xForIndex(index), y: yForValue(value), value }));
    svg.appendChild(metrics.createSvgElement("path", {
      d: metrics.buildSmoothPath(averagePoints),
      class: "conscious-trend-line conscious-trend-line-average"
    }));

    const todayPoints = [];
    for (let index = 0; index < config.graphBucketCount; index += 1) {
      if (index > todayBucket) break;
      todayPoints.push({ x: xForIndex(index), y: yForValue(todayCumulative[index]), value: todayCumulative[index] });
    }

    svg.appendChild(metrics.createSvgElement("path", {
      d: metrics.buildSmoothPath(todayPoints),
      class: "conscious-trend-line conscious-trend-line-today"
    }));

    svg.appendChild(metrics.createSvgElement("line", {
      x1: xForIndex(todayBucket),
      y1: paddingTop,
      x2: xForIndex(todayBucket),
      y2: paddingTop + plotHeight,
      class: "conscious-trend-now-marker"
    }));

    const hoverMarker = metrics.createSvgElement("line", {
      x1: paddingLeft,
      y1: paddingTop,
      x2: paddingLeft,
      y2: paddingTop + plotHeight,
      class: "conscious-trend-hover-marker"
    });
    hoverMarker.style.display = "none";
    svg.appendChild(hoverMarker);

    const hoverAvgPoint = metrics.createSvgElement("circle", {
      cx: paddingLeft,
      cy: paddingTop + plotHeight,
      r: 3.8,
      class: "conscious-trend-hover-point conscious-trend-hover-point-average"
    });
    hoverAvgPoint.style.display = "none";
    svg.appendChild(hoverAvgPoint);

    const hoverTodayPoint = metrics.createSvgElement("circle", {
      cx: paddingLeft,
      cy: paddingTop + plotHeight,
      r: 4.1,
      class: "conscious-trend-hover-point conscious-trend-hover-point-today"
    });
    hoverTodayPoint.style.display = "none";
    svg.appendChild(hoverTodayPoint);

    [0, 24, 48, 72, 96].forEach((bucketIndex) => {
      const x = xForIndex(Math.min(pointsCount, bucketIndex));
      const label = metrics.createSvgElement("text", {
        x,
        y: height - 8,
        class: "conscious-trend-axis-label",
        "text-anchor": bucketIndex === 0 ? "start" : bucketIndex === 96 ? "end" : "middle"
      });
      label.textContent = metrics.getBucketLabel(bucketIndex);
      svg.appendChild(label);
    });

    const yTop = metrics.createSvgElement("text", {
      x: paddingLeft - 6,
      y: paddingTop + 10,
      class: "conscious-trend-axis-label",
      "text-anchor": "end"
    });
    yTop.textContent = formatDurationCompact(maxValue);
    svg.appendChild(yTop);

    const yBottom = metrics.createSvgElement("text", {
      x: paddingLeft - 6,
      y: paddingTop + plotHeight,
      class: "conscious-trend-axis-label",
      "text-anchor": "end"
    });
    yBottom.textContent = "0m";
    svg.appendChild(yBottom);

    const hideHover = () => {
      hoverMarker.style.display = "none";
      hoverAvgPoint.style.display = "none";
      hoverTodayPoint.style.display = "none";
      tooltip.hidden = true;
    };

    function showHover(event) {
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        hideHover();
        return;
      }

      const plotLeftPx = rect.left + (paddingLeft / width) * rect.width;
      const plotRightPx = rect.left + ((paddingLeft + plotWidth) / width) * rect.width;
      const plotTopPx = rect.top + (paddingTop / height) * rect.height;
      const plotBottomPx = rect.top + ((paddingTop + plotHeight) / height) * rect.height;

      if (
        event.clientX < plotLeftPx ||
        event.clientX > plotRightPx ||
        event.clientY < plotTopPx ||
        event.clientY > plotBottomPx
      ) {
        hideHover();
        return;
      }

      const plotWidthPx = Math.max(1, plotRightPx - plotLeftPx);
      const relativePlotX = clamp(event.clientX - plotLeftPx, 0, plotWidthPx);
      const hoverBucket = Math.round((relativePlotX / plotWidthPx) * pointsCount);
      const hoverX = xForIndex(hoverBucket);
      const averageAtBucket = Number(averageCumulative[hoverBucket] || 0);
      const todayAtBucket = hoverBucket <= todayBucket ? Number(todayCumulative[hoverBucket] || 0) : null;

      hoverMarker.style.display = "block";
      hoverMarker.setAttribute("x1", String(hoverX));
      hoverMarker.setAttribute("x2", String(hoverX));

      hoverAvgPoint.style.display = "block";
      hoverAvgPoint.setAttribute("cx", String(hoverX));
      hoverAvgPoint.setAttribute("cy", String(yForValue(averageAtBucket)));

      if (todayAtBucket === null) {
        hoverTodayPoint.style.display = "none";
      } else {
        hoverTodayPoint.style.display = "block";
        hoverTodayPoint.setAttribute("cx", String(hoverX));
        hoverTodayPoint.setAttribute("cy", String(yForValue(todayAtBucket)));
      }

      tooltip.hidden = false;
      tooltip.innerHTML = `
        <div class="conscious-day-trend-tooltip-title">${metrics.getBucketLabel(hoverBucket)}</div>
        <div class="conscious-day-trend-tooltip-line">Today: ${todayAtBucket === null ? "Not reached yet" : formatDuration(todayAtBucket)}</div>
        <div class="conscious-day-trend-tooltip-line">Average: ${formatDuration(averageAtBucket)}</div>
      `;

      const tooltipRect = tooltip.getBoundingClientRect();
      const maxX = Math.max(8, window.innerWidth - tooltipRect.width - 8);
      const maxY = Math.max(8, window.innerHeight - tooltipRect.height - 8);
      tooltip.style.left = `${clamp(event.clientX + 14, 8, maxX)}px`;
      tooltip.style.top = `${clamp(event.clientY + 14, 8, maxY)}px`;
    }

    svg.onmousemove = showHover;
    svg.onmouseleave = hideHover;

    svg.setAttribute(
      "aria-label",
      `Today cumulative watch time is ${formatDuration(todayCumulative[todayBucket] || 0)} by ${metrics.getBucketLabel(todayBucket)}. Average full-day total is ${formatDuration(averageCumulative[averageCumulative.length - 1] || 0)}.`
    );
  };

  const updateGuideActiveState = (isActiveRoute) => {
    document.querySelectorAll(".conscious-guide-button").forEach((button) => {
      button.classList.toggle("is-active", isActiveRoute);
      button.setAttribute("aria-pressed", isActiveRoute ? "true" : "false");
    });
  };

  const createGuideItem = (itemId, compact, onClick) => {
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

    button.addEventListener("click", onClick);
    wrapper.appendChild(button);
    return wrapper;
  };

  const upsertGuideItem = (container, itemId, compact, onClick) => {
    if (!container) return;

    let item = document.getElementById(itemId);
    if (!item) item = createGuideItem(itemId, compact, onClick);

    if (item.parentElement !== container || container.firstElementChild !== item) {
      container.prepend(item);
    }
  };

  const ensureGuideEntries = (onClick, isActiveRoute) => {
    upsertGuideItem(youtubeDom.findExpandedGuideContainer(), config.fullGuideItemId, false, onClick);
    upsertGuideItem(youtubeDom.findMiniGuideContainer(), config.miniGuideItemId, true, onClick);
    updateGuideActiveState(isActiveRoute);
  };

  app.ui.inpage = {
    ensurePageRoot,
    renderSettings,
    renderHistory,
    updateGuideActiveState,
    ensureGuideEntries
  };
})();
