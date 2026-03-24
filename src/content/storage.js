(() => {
  const NS = window.ConsciousContent;
  const { keys, messages, state } = NS;

  function getCurrentDayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function getDailySecondsFromHistory(history, dayKey) {
    return history.reduce((sum, entry) => {
      if (!entry || typeof entry !== "object") return sum;

      const watchByDay = entry.watchByDay;
      if (watchByDay && typeof watchByDay === "object") {
        return sum + Number(watchByDay[dayKey] || 0);
      }

      const fallbackDay = String(entry.lastWatchedAt || "").slice(0, 10);
      if (fallbackDay !== dayKey) return sum;
      return sum + Number(entry.watchedSeconds || 0);
    }, 0);
  }

  function notifyHistoryUpdated() {
    chrome.runtime.sendMessage({ type: messages.historyUpdated }, () => {
      void chrome.runtime.lastError;
    });
  }

  function queueHistoryWrite(updater) {
    state.writeQueue = state.writeQueue
      .catch(() => undefined)
      .then(
        () =>
          new Promise((resolve) => {
            chrome.storage.local.get({ [keys.history]: [] }, (result) => {
              const history = Array.isArray(result[keys.history]) ? result[keys.history] : [];
              const updatedHistory = updater(history);

              chrome.storage.local.set({ [keys.history]: updatedHistory }, () => {
                notifyHistoryUpdated();
                resolve();
              });
            });
          })
      );

    return state.writeQueue;
  }

  function refreshDailyCache() {
    const dayKey = getCurrentDayKey();
    state.cachedDailyKey = dayKey;

    chrome.storage.local.get({ [keys.history]: [] }, (result) => {
      const history = Array.isArray(result[keys.history]) ? result[keys.history] : [];
      state.cachedDailyWatchedSeconds = getDailySecondsFromHistory(history, dayKey);
      NS.dailyTimer?.render();
    });
  }

  NS.storage = {
    getCurrentDayKey,
    getDailySecondsFromHistory,
    queueHistoryWrite,
    refreshDailyCache
  };
})();

