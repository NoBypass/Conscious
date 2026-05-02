(() => {
  const app = window.Conscious;
  const { config } = app;
  const { formatDuration, formatLastWatched, formatDateKeyForTooltip } = app.domain.shared;
  const state = app.ui.inpageState;

  const historyThumbnailPlaceholder = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" role="img" aria-label="Video thumbnail unavailable">
      <rect width="320" height="180" rx="18" fill="#d9d9d9"/>
      <path d="M141 68l58 32-58 32z" fill="#8a8a8a"/>
    </svg>
  `)}`;

  const getHistoryThumbnailUrl = (videoId) => {
    const safeVideoId = String(videoId || "").trim();
    return safeVideoId ? `https://i.ytimg.com/vi/${encodeURIComponent(safeVideoId)}/mqdefault.jpg` : "";
  };

  const getEntryWatchedSecondsForDay = (entry, dayKey) => {
    if (!entry || !dayKey) return 0;

    const watchByDay = entry.watchByDay && typeof entry.watchByDay === "object" ? entry.watchByDay : null;
    if (!watchByDay || !Object.prototype.hasOwnProperty.call(watchByDay, dayKey)) return 0;

    return Number(watchByDay[dayKey] || 0);
  };

  const buildHistoryListEntries = (history) => {
    if (!state.selectedHeatmapDayKey) {
      return history.slice(0, config.historyDisplayLimit).map((entry) => ({
        entry,
        watchedSecondsForDisplay: Number(entry?.watchedSeconds || 0)
      }));
    }

    return history
      .map((entry) => ({
        entry,
        watchedSecondsForDisplay: getEntryWatchedSecondsForDay(entry, state.selectedHeatmapDayKey)
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
      empty.textContent = state.selectedHeatmapDayKey
        ? `No watch activity on ${formatDateKeyForTooltip(state.selectedHeatmapDayKey)} yet. Click the selected day again to show all videos.`
        : "No watch history yet.";
      return;
    }

    empty.hidden = true;
    const fragment = document.createDocumentFragment();

    rows.forEach(({ entry, watchedSecondsForDisplay }) => {
      const item = document.createElement("li");
      item.className = "conscious-history-item";

      const thumbnail = document.createElement("div");
      thumbnail.className = "conscious-history-thumbnail";
      thumbnail.setAttribute("aria-hidden", "true");

      if (entry.videoId) {
        const img = document.createElement("img");
        img.className = "conscious-history-thumbnail-image";
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        img.referrerPolicy = "no-referrer";
        img.src = getHistoryThumbnailUrl(entry.videoId);
        img.onerror = () => {
          img.onerror = null;
          img.src = historyThumbnailPlaceholder;
          img.classList.add("is-fallback");
        };
        thumbnail.appendChild(img);
      } else {
        thumbnail.classList.add("is-placeholder");
        const placeholder = document.createElement("span");
        placeholder.className = "conscious-history-thumbnail-placeholder";
        placeholder.textContent = "No preview";
        thumbnail.appendChild(placeholder);
      }

      const content = document.createElement("div");
      content.className = "conscious-history-content";

      const link = document.createElement("a");
      link.className = "conscious-history-link";
      link.href = entry.url || `https://www.youtube.com/watch?v=${entry.videoId || ""}`;
      link.textContent = entry.title || "Unknown title";

      const meta = document.createElement("div");
      meta.className = "conscious-history-meta";
      meta.textContent = state.selectedHeatmapDayKey
        ? `${formatDuration(watchedSecondsForDisplay)} watched that day - ${formatLastWatched(entry.lastWatchedAt)}`
        : `${formatDuration(watchedSecondsForDisplay)} watched - ${formatLastWatched(entry.lastWatchedAt)}`;

      content.appendChild(link);
      content.appendChild(meta);
      item.appendChild(thumbnail);
      item.appendChild(content);
      fragment.appendChild(item);
    });

    list.appendChild(fragment);
  };

  app.ui = app.ui || {};
  app.ui.inpageHistoryList = {
    getEntryWatchedSecondsForDay,
    renderHistoryList
  };
})();

