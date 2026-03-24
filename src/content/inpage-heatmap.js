(() => {
  const NS = window.ConsciousInpage;
  const { constants, metrics } = NS;

  NS.renderHeatmap = function renderHeatmap(history) {
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
      title.textContent = NS.formatDateKeyForTooltip(dayKey);

      const watchLine = document.createElement("div");
      watchLine.className = "conscious-heatmap-tooltip-line";
      watchLine.textContent = `${NS.formatDuration(watchedSeconds)} watched`;

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

      const nextLeft = Math.min(Math.max(8, event.clientX + constants.heatmapTooltipOffset), maxX);
      const nextTop = Math.min(Math.max(8, event.clientY + constants.heatmapTooltipOffset), maxY);

      tooltip.style.left = `${nextLeft}px`;
      tooltip.style.top = `${nextTop}px`;
    };

    const daily = metrics.buildDailyWatchSummary(history);
    const dayKeys = metrics.buildHeatmapDayKeys(constants.heatmapWeeks * 7);

    let maxWatchedSeconds = 0;
    let totalSecondsInRange = 0;

    dayKeys.forEach((dayKey) => {
      const bucket = daily.get(dayKey);
      const watchedSeconds = Number(bucket?.watchedSeconds || 0);
      maxWatchedSeconds = Math.max(maxWatchedSeconds, watchedSeconds);
      totalSecondsInRange += watchedSeconds;
    });

    grid.innerHTML = "";

    const firstDate = NS.parseUtcDateKey(dayKeys[0]);
    const firstWeekdayMondayFirst = Number.isNaN(firstDate.getTime()) ? 0 : (firstDate.getUTCDay() + 6) % 7;
    const firstMondayUtcMs = Number.isNaN(firstDate.getTime())
      ? 0
      : firstDate.getTime() - firstWeekdayMondayFirst * constants.dayMs;

    let maxWeekIndex = 0;
    dayKeys.forEach((dayKey) => {
      const date = NS.parseUtcDateKey(dayKey);
      if (Number.isNaN(date.getTime())) return;
      const weekIndex = Math.floor((date.getTime() - firstMondayUtcMs) / (7 * constants.dayMs));
      if (weekIndex > maxWeekIndex) maxWeekIndex = weekIndex;
    });

    grid.style.setProperty("--heatmap-weeks", String(Math.max(1, maxWeekIndex + 1)));

    const fragment = document.createDocumentFragment();

    dayKeys.forEach((dayKey, index) => {
      const bucket = daily.get(dayKey);
      const watchedSeconds = Number(bucket?.watchedSeconds || 0);
      const videoCount = bucket ? bucket.videoIds.size : 0;
      const level = metrics.getHeatLevel(watchedSeconds, maxWatchedSeconds);

      const date = NS.parseUtcDateKey(dayKey);
      const weekday = Number.isNaN(date.getTime()) ? index % 7 : (date.getUTCDay() + 6) % 7;
      const weekIndex = Number.isNaN(date.getTime())
        ? Math.floor(index / 7)
        : Math.floor((date.getTime() - firstMondayUtcMs) / (7 * constants.dayMs));

      const cell = document.createElement("div");
      cell.className = "conscious-heatmap-cell";
      cell.dataset.level = String(level);
      cell.style.gridColumn = String(weekIndex + 1);
      cell.style.gridRow = String(weekday + 1);
      cell.setAttribute("role", "gridcell");
      cell.setAttribute(
        "aria-label",
        `${NS.formatDateKeyForTooltip(dayKey)}: ${NS.formatDuration(watchedSeconds)} watched across ${videoCount} video${videoCount === 1 ? "" : "s"}`
      );
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
    summary.textContent = `${NS.formatDuration(totalSecondsInRange)} watched in the last ${constants.heatmapWeeks} weeks across ${activeDays} active day${activeDays === 1 ? "" : "s"}.`;
  };
})();

