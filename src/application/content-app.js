(() => {
  const app = window.Conscious;
  const { config, state } = app;
  const storage = app.ports.storage;
  const domain = app.domain.watchHistory;
  const shared = app.domain.shared;
  const dom = app.adapters.youtubeContent;

  const guardShortsRoute = () => {
    if (!state.shortsDisabled) return;
    if (window.location.pathname.startsWith("/shorts/")) {
      window.location.replace(config.redirectTarget);
    }
  };

  const applyShortsBlocking = () => {
    if (!state.shortsDisabled) return;
    guardShortsRoute();
    dom.hideShortsContainers();
    dom.hideShortsLinksAndCards();
  };

  const startShortsObserver = () => {
    if (state.shortsObserver) return;

    let pending = false;
    state.shortsObserver = new MutationObserver(() => {
      if (!state.shortsDisabled || pending) return;
      pending = true;

      requestAnimationFrame(() => {
        applyShortsBlocking();
        pending = false;
      });
    });

    state.shortsObserver.observe(document.documentElement, { childList: true, subtree: true });
  };

  const stopShortsObserver = () => {
    if (!state.shortsObserver) return;
    state.shortsObserver.disconnect();
    state.shortsObserver = null;
  };

  const applyHeaderDeclutter = () => {
    if (!state.headerDeclutterEnabled) return;
    dom.hideVoiceSearch();
    dom.hideCreateButton();
  };

  const startHeaderObserver = () => {
    if (state.headerObserver) return;

    let pending = false;
    state.headerObserver = new MutationObserver(() => {
      if (!state.headerDeclutterEnabled || pending) return;
      pending = true;

      requestAnimationFrame(() => {
        applyHeaderDeclutter();
        pending = false;
      });
    });

    state.headerObserver.observe(document.documentElement, { childList: true, subtree: true });
  };

  const stopHeaderObserver = () => {
    if (!state.headerObserver) return;
    state.headerObserver.disconnect();
    state.headerObserver = null;
  };

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

  const updateFeatureSettings = (settings) => {
    state.shortsDisabled = Boolean(settings[app.keys.shorts]);
    state.dailyTimerEnabled = Boolean(settings[app.keys.dailyTimer]);
    state.headerDeclutterEnabled = Boolean(settings[app.keys.headerDeclutter]);

    if (state.shortsDisabled) {
      applyShortsBlocking();
      startShortsObserver();
    } else {
      stopShortsObserver();
      dom.restoreShorts();
    }

    if (state.headerDeclutterEnabled) {
      applyHeaderDeclutter();
      startHeaderObserver();
    } else {
      stopHeaderObserver();
      dom.restoreHeaderNodes();
    }

    if (state.dailyTimerEnabled) {
      storage.refreshDailyCache(renderDailyTimer);
      renderDailyTimer();
    } else {
      dom.removeTimer();
    }
  };

  const persistWatchDuration = (session, force) => {
    if (!session) return Promise.resolve();

    const minimumToPersist = force ? 1 : 1000;
    if (session.pendingMilliseconds < minimumToPersist) return Promise.resolve();

    const millisecondsToSave = session.pendingMilliseconds;
    const secondsToSave = millisecondsToSave / 1000;
    const pendingTimelineByDayMs = session.pendingTimelineByDayMs && typeof session.pendingTimelineByDayMs === "object"
      ? session.pendingTimelineByDayMs
      : {};

    session.pendingMilliseconds = 0;
    session.pendingTimelineByDayMs = {};

    return storage
      .queueHistoryWrite((history) => {
        return domain.mergeSessionIntoHistory({
          history,
          session,
          nowIso: new Date().toISOString(),
          secondsToSave
        });
      })
      .then((savedHistory) => {
        state.cachedDailyWatchedSeconds = storage.getDailySecondsFromHistory(savedHistory, storage.getCurrentDayKey());
      })
      .catch(() => {
        // Keep unsaved watch time so later flush attempts can recover it.
        session.pendingMilliseconds += millisecondsToSave;
        domain.mergePendingTimeline(session, pendingTimelineByDayMs);
      });
  };

  const flushActive = (force) => {
    if (!state.activeWatchSession) return;
    void persistWatchDuration(state.activeWatchSession, force);
  };

  const resetSession = (videoId) => {
    const videoElement = dom.getVideoElement();
    const mediaTime = videoElement && Number.isFinite(videoElement.currentTime) ? videoElement.currentTime : 0;
    state.activeWatchSession = domain.createSession(videoId, domain.getCurrentVideoTitle(), window.location.href, mediaTime);
  };

  const syncToPage = () => {
    const videoId = domain.getCurrentVideoId();

    if (!videoId) {
      flushActive(true);
      state.activeWatchSession = null;
      state.wasVideoPlaying = false;
      return;
    }

    if (!state.activeWatchSession || state.activeWatchSession.videoId !== videoId) {
      flushActive(true);
      resetSession(videoId);
      state.wasVideoPlaying = false;
      return;
    }

    state.activeWatchSession.title = domain.getCurrentVideoTitle() || state.activeWatchSession.title;
    state.activeWatchSession.url = window.location.href;
  };

  const onTick = () => {
    const currentDayKey = storage.getCurrentDayKey();
    if (currentDayKey !== state.cachedDailyKey) {
      state.cachedDailyKey = currentDayKey;
      state.cachedDailyWatchedSeconds = 0;
      storage.refreshDailyCache(renderDailyTimer);
    }

    if (window.location.href !== state.lastKnownUrl) {
      state.lastKnownUrl = window.location.href;
      syncToPage();
      renderDailyTimer();
    }

    if (!state.activeWatchSession) {
      renderDailyTimer();
      return;
    }

    const refreshedTitle = domain.getCurrentVideoTitle();
    if (refreshedTitle) {
      state.activeWatchSession.title = refreshedTitle;
    }

    const now = Date.now();
    const elapsedMs = now - state.activeWatchSession.lastTickMs;
    state.activeWatchSession.lastTickMs = now;

    if (elapsedMs <= 0 || elapsedMs > 15000) return;

    const videoElement = dom.getVideoElement();
    const isActivelyWatching = Boolean(videoElement) && !videoElement.paused && !videoElement.ended && videoElement.readyState >= 2;

    if (
      !state.wasVideoPlaying &&
      isActivelyWatching &&
      state.activeWatchSession.hasRecordedActivity &&
      state.activeWatchSession.pendingMilliseconds <= 0
    ) {
      domain.rotateRecordingSession(state.activeWatchSession);
    }

    if (state.wasVideoPlaying && !isActivelyWatching) {
      flushActive(true);
    }
    state.wasVideoPlaying = isActivelyWatching;

    if (!isActivelyWatching) {
      if (videoElement && Number.isFinite(videoElement.currentTime)) {
        state.activeWatchSession.lastMediaTime = videoElement.currentTime;
      }
      renderDailyTimer();
      return;
    }

    const mediaDeltaSeconds = domain.getMediaProgressDelta(videoElement, state.activeWatchSession, elapsedMs / 1000);
    const fallbackSeconds = elapsedMs / 1000;
    const secondsToAdd = mediaDeltaSeconds > 0 ? mediaDeltaSeconds : mediaDeltaSeconds < 0 ? 0 : fallbackSeconds;

    if (secondsToAdd <= 0) return;

    const millisecondsToAdd = Math.round(secondsToAdd * 1000);
    state.activeWatchSession.pendingMilliseconds += millisecondsToAdd;
    state.activeWatchSession.hasRecordedActivity = true;
    domain.addPendingTimelineMilliseconds(state.activeWatchSession, now, millisecondsToAdd);

    if (state.activeWatchSession.pendingMilliseconds >= 10000) {
      flushActive(false);
    }

    renderDailyTimer();
  };

  const handleNavigation = () => {
    guardShortsRoute();
    applyShortsBlocking();
    syncToPage();
    state.lastKnownUrl = window.location.href;
    renderDailyTimer();
  };

  const bootstrapContentApp = () => {
    storage.getSyncSettings((result) => {
      updateFeatureSettings(result);
    });

    storage.refreshDailyCache(renderDailyTimer);

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "sync") {
        const nextSettings = {
          [app.keys.shorts]: changes[app.keys.shorts] ? changes[app.keys.shorts].newValue : state.shortsDisabled,
          [app.keys.dailyTimer]: changes[app.keys.dailyTimer]
            ? changes[app.keys.dailyTimer].newValue
            : state.dailyTimerEnabled,
          [app.keys.headerDeclutter]: changes[app.keys.headerDeclutter]
            ? changes[app.keys.headerDeclutter].newValue
            : state.headerDeclutterEnabled
        };

        if (changes[app.keys.shorts] || changes[app.keys.dailyTimer] || changes[app.keys.headerDeclutter]) {
          updateFeatureSettings(nextSettings);
        }
      }

      if (areaName === "local" && changes[app.keys.history]) {
        storage.refreshDailyCache(renderDailyTimer);
      }
    });

    window.addEventListener("yt-navigate-start", () => flushActive(true));
    window.addEventListener("yt-navigate-finish", handleNavigation);
    window.addEventListener("popstate", handleNavigation);
    window.addEventListener("hashchange", handleNavigation);
    window.addEventListener("yt-navigate-finish", applyHeaderDeclutter);
    window.addEventListener("popstate", applyHeaderDeclutter);
    window.addEventListener("hashchange", applyHeaderDeclutter);
    window.addEventListener("pagehide", () => flushActive(true));
    window.addEventListener("beforeunload", () => flushActive(true));

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        flushActive(true);
        renderDailyTimer();
      }
    });

    setInterval(onTick, 1000);
    handleNavigation();
    applyHeaderDeclutter();
  };

  app.application.content = {
    bootstrapContentApp
  };
})();
