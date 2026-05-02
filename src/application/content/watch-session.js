(() => {
  const app = window.Conscious;
  const { state } = app;
  const storage = app.ports.storage;
  const domain = app.domain.watchHistory;
  const dom = app.adapters.youtubeContent;
  const timer = app.application.contentTimer;

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
      timer.refreshDailyTimerCache();
    }

    if (window.location.href !== state.lastKnownUrl) {
      state.lastKnownUrl = window.location.href;
      syncToPage();
      timer.renderDailyTimer();
    }

    if (!state.activeWatchSession) {
      timer.renderDailyTimer();
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
      timer.renderDailyTimer();
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

    timer.renderDailyTimer();
  };

  app.application.contentWatchSession = {
    persistWatchDuration,
    flushActive,
    resetSession,
    syncToPage,
    onTick
  };
})();

