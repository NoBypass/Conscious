(() => {
  const app = window.Conscious;
  const { config } = app;
  const { formatDuration, formatDateKeyForTooltip } = app.domain.shared;
  const metrics = app.domain.metrics;
  const state = app.ui.inpageState;

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
        <div class="conscious-heatmap-tooltip-line">${videoCount} video${videoCount === 1 ? "s" : ""}</div>
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
      cell.classList.toggle("is-selected", dayKey === state.selectedHeatmapDayKey);
      cell.style.gridColumn = String(weekIndex + 1);
      cell.style.gridRow = String(weekday + 1);
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("tabindex", "0");

      const activate = (event) => {
        if (!watchedSeconds) return;
        state.selectedHeatmapDayKey = state.selectedHeatmapDayKey === dayKey ? null : dayKey;
        app.ui.inpage.renderHistory(state.latestHistory);
        if (state.selectedHeatmapDayKey) {
          showTooltip(event, dayKey, watchedSeconds, videoCount);
        } else {
          hideTooltip();
        }
      };

      cell.addEventListener("mouseenter", (event) => {
        if (state.selectedHeatmapDayKey === dayKey) return;
        if (!watchedSeconds) return;
        showTooltip(event, dayKey, watchedSeconds, videoCount);
      });

      cell.addEventListener("mousemove", (event) => {
        if (state.selectedHeatmapDayKey === dayKey) return;
        if (!watchedSeconds) return;
        showTooltip(event, dayKey, watchedSeconds, videoCount);
      });

      cell.addEventListener("mouseleave", () => {
        if (state.selectedHeatmapDayKey === dayKey) return;
        hideTooltip();
      });

      cell.addEventListener("click", activate);
      cell.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate(event);
        }
      });

      fragment.appendChild(cell);
    });

    grid.appendChild(fragment);

    const visibleDays = dayKeys.filter((dayKey) => {
      const bucket = daily.get(dayKey);
      return Number(bucket?.watchedSeconds || 0) > 0;
    }).length;
    const selectedLabel = state.selectedHeatmapDayKey ? `Selected ${formatDateKeyForTooltip(state.selectedHeatmapDayKey)}.` : "";
    summary.textContent =
      visibleDays > 0
        ? `${visibleDays} active day${visibleDays === 1 ? "" : "s"} in the last ${config.heatmapWeeks} weeks. ${selectedLabel}`.trim()
        : `No recorded watch activity in the last ${config.heatmapWeeks} weeks.`;
  };

  app.ui = app.ui || {};
  app.ui.inpageHeatmap = {
    renderHeatmap
  };
})();

