(() => {
  const app = window.Conscious;
  const { keys, config, state } = app;
  const { safeChromeCall } = app.domain.shared;

  const getCurrentDayKey = () => new Date().toISOString().slice(0, 10);

  const getDailySecondsFromHistory = (history, dayKey) => {
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
  };

  const getRecentDaySubset = (dayMap, keepDays) => {
    if (!dayMap || typeof dayMap !== "object") return {};

    const keysByDateDesc = Object.keys(dayMap)
      .filter(Boolean)
      .sort((a, b) => String(b).localeCompare(String(a)));

    const subset = {};
    keysByDateDesc.slice(0, keepDays).forEach((dayKey) => {
      subset[dayKey] = dayMap[dayKey];
    });

    return subset;
  };

  const compactHistoryForStorage = (history) => {
    return history.map((entry, index) => {
      if (!entry || typeof entry !== "object") return entry;

      const keepTimeline = index < config.timelineRecentEntryCount;
      return {
        ...entry,
        watchByDay: getRecentDaySubset(entry.watchByDay, config.historyRetentionDays),
        timelineByDay: keepTimeline ? getRecentDaySubset(entry.timelineByDay, config.historyRetentionDays) : {}
      };
    });
  };

  const setHistory = (history, resolve, reject) => {
    chrome.storage.local.set({ [keys.history]: history }, () => {
      const error = chrome.runtime?.lastError;
      if (error) {
        reject(new Error(error.message || "Failed to write watch history"));
        return;
      }
      resolve(history);
    });
  };

  const queueHistoryWrite = (updater) => {
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

              setHistory(updatedHistory, resolve, (writeError) => {
                const isQuotaIssue = /quota|max|exceed/i.test(String(writeError?.message || ""));
                if (!isQuotaIssue) {
                  reject(writeError);
                  return;
                }

                const compactedHistory = compactHistoryForStorage(updatedHistory);
                setHistory(compactedHistory, resolve, reject);
              });
            });
          })
      );

    return state.writeQueue;
  };

  const getSyncSettings = (callback) => {
    safeChromeCall(() => {
      chrome.storage.sync.get(
        {
          [keys.shorts]: false,
          [keys.dailyTimer]: false,
          [keys.headerDeclutter]: false
        },
        callback
      );
    });
  };

  const setSyncSetting = (key, value) => {
    safeChromeCall(() => {
      chrome.storage.sync.set({ [key]: value });
    });
  };

  const getHistory = (callback) => {
    safeChromeCall(() => {
      chrome.storage.local.get({ [keys.history]: [] }, (result) => {
        const history = Array.isArray(result[keys.history]) ? result[keys.history] : [];
        callback(history);
      });
    });
  };

  const refreshDailyCache = (onUpdated) => {
    const dayKey = getCurrentDayKey();
    state.cachedDailyKey = dayKey;

    getHistory((history) => {
      state.cachedDailyWatchedSeconds = getDailySecondsFromHistory(history, dayKey);
      if (typeof onUpdated === "function") onUpdated();
    });
  };

  app.ports.storage = {
    getCurrentDayKey,
    getDailySecondsFromHistory,
    queueHistoryWrite,
    getSyncSettings,
    setSyncSetting,
    getHistory,
    refreshDailyCache
  };
})();

