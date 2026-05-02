(() => {
  const app = window.Conscious;
  const { state } = app;
  const storage = app.ports.storage;
  const shared = app.domain.shared;
  const dom = app.adapters.youtubeContent;

  const renderDailyTimer = () => {
    if (!state.dailyTimerEnabled) {
      dom.removeTimer();
      return;
    }

    const pendingSeconds = state.activeWatchSession
      ? Math.max(0, Number(state.activeWatchSession.pendingMilliseconds || 0) / 1000)
      : 0;
    const totalSeconds = state.cachedDailyWatchedSeconds + pendingSeconds;
    dom.upsertTimerText(`Today ${shared.formatClockDuration(totalSeconds)}`);
  };

  const refreshDailyTimerCache = () => {
    storage.refreshDailyCache(renderDailyTimer);
  };

  const clearDailyTimer = () => {
    dom.removeTimer();
  };

  const setDailyTimerEnabled = (isEnabled) => {
    state.dailyTimerEnabled = Boolean(isEnabled);

    if (state.dailyTimerEnabled) {
      refreshDailyTimerCache();
      renderDailyTimer();
    } else {
      clearDailyTimer();
    }
  };

  app.application.contentTimer = {
    renderDailyTimer,
    refreshDailyTimerCache,
    clearDailyTimer,
    setDailyTimerEnabled
  };
})();

