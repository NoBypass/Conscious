(() => {
  const NS = window.ConsciousContent;
  const { keys, state } = NS;
  const HISTORY_DAY_RETENTION = 120;
  const TIMELINE_RECENT_ENTRY_COUNT = 80;

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

  function getRecentDaySubset(dayMap, keepDays) {
    if (!dayMap || typeof dayMap !== "object") return {};

    const keysByDateDesc = Object.keys(dayMap)
      .filter(Boolean)
      .sort((a, b) => String(b).localeCompare(String(a)));

    const subset = {};
    keysByDateDesc.slice(0, keepDays).forEach((dayKey) => {
      subset[dayKey] = dayMap[dayKey];
    });

    return subset;
  }

  function compactHistoryForStorage(history) {
    return history.map((entry, index) => {
      if (!entry || typeof entry !== "object") return entry;

      const keepTimeline = index < TIMELINE_RECENT_ENTRY_COUNT;
      return {
        ...entry,
        watchByDay: getRecentDaySubset(entry.watchByDay, HISTORY_DAY_RETENTION),
        timelineByDay: keepTimeline
          ? getRecentDaySubset(entry.timelineByDay, HISTORY_DAY_RETENTION)
          : {}
      };
    });
  }

  function setHistory(history, resolve, reject) {
    chrome.storage.local.set({ [keys.history]: history }, () => {
      const error = chrome.runtime?.lastError;
      if (error) {
        reject(new Error(error.message || "Failed to write watch history"));
        return;
      }
      resolve(history);
    });
  }

  function queueHistoryWrite(updater) {
    state.writeQueue = state.writeQueue
      .catch(() => undefined)
      .then(
        () =>
          new Promise((resolve, reject) => {
            chrome.storage.local.get({ [keys.history]: [] }, (result) => {
              const readError = chrome.runtime?.lastError;
              if (readError) {
                reject(new Error(readError.message || "Failed to read watch history"));
                return;
              }

              const history = Array.isArray(result[keys.history]) ? result[keys.history] : [];
              let updatedHistory;

              try {
                updatedHistory = updater(history);
              } catch (error) {
                reject(error);
                return;
              }

              setHistory(
                updatedHistory,
                resolve,
                (writeError) => {
                  const isQuotaIssue = /quota|max|exceed/i.test(String(writeError?.message || ""));
                  if (!isQuotaIssue) {
                    reject(writeError);
                    return;
                  }

                  const compactedHistory = compactHistoryForStorage(updatedHistory);
                  setHistory(compactedHistory, resolve, reject);
                }
              );
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
