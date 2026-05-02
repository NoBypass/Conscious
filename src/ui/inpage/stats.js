(() => {
  const app = window.Conscious;
  const { formatDuration, formatDurationCompact } = app.domain.shared;
  const metrics = app.domain.metrics;

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

    app.ui.inpageDayTrend.renderDayTrendGraph(history);
  };

  app.ui = app.ui || {};
  app.ui.inpageStats = {
    renderStats
  };
})();

