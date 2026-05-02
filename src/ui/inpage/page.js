(() => {
  const app = window.Conscious;
  const state = app.ui.inpageState;
  const root = app.ui.inpageRoot;
  const stats = app.ui.inpageStats;
  const heatmap = app.ui.inpageHeatmap;
  const historyList = app.ui.inpageHistoryList;
  const guide = app.ui.inpageGuide;

  const renderHistory = (history) => {
    state.latestHistory = Array.isArray(history) ? history : [];

    if (state.selectedHeatmapDayKey) {
      const hasEntriesOnSelectedDay = state.latestHistory.some(
        (entry) => historyList.getEntryWatchedSecondsForDay(entry, state.selectedHeatmapDayKey) > 0
      );
      if (!hasEntriesOnSelectedDay) state.selectedHeatmapDayKey = null;
    }

    stats.renderStats(state.latestHistory);
    heatmap.renderHeatmap(state.latestHistory);
    historyList.renderHistoryList(state.latestHistory);
  };

  app.ui.inpage = {
    ensurePageRoot: root.ensurePageRoot,
    renderSettings: root.renderSettings,
    renderHistory,
    updateGuideActiveState: guide.updateGuideActiveState,
    ensureGuideEntries: guide.ensureGuideEntries
  };
})();
