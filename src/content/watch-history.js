(() => {
  const NS = window.ConsciousContent;
  const { config, state } = NS;
  const GRAPH_BUCKET_MINUTES = 15;
  const GRAPH_BUCKET_COUNT = (24 * 60) / GRAPH_BUCKET_MINUTES;

  function getCurrentVideoId() {
    if (window.location.pathname !== "/watch") return null;
    const value = new URLSearchParams(window.location.search).get("v");
    return value || null;
  }

  function isPlaceholderTitle(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return !normalized || normalized === "youtube" || normalized === "unknown title";
  }

  function getCurrentVideoTitle() {
    const heading = document.querySelector("h1.ytd-watch-metadata yt-formatted-string");
    if (heading && heading.textContent) {
      const headingTitle = heading.textContent.trim();
      if (!isPlaceholderTitle(headingTitle)) return headingTitle;
    }

    const playerTitle = window.ytInitialPlayerResponse?.videoDetails?.title;
    if (!isPlaceholderTitle(playerTitle)) return String(playerTitle).trim();

    const ogTitle = document.querySelector("meta[property='og:title']")?.getAttribute("content")?.trim();
    if (!isPlaceholderTitle(ogTitle)) return ogTitle;

    const metaTitle = document.querySelector("meta[name='title']")?.getAttribute("content")?.trim();
    if (!isPlaceholderTitle(metaTitle)) return metaTitle;

    const pageTitle = (document.title || "").replace(/\s*-\s*YouTube\s*$/, "").trim();
    if (!isPlaceholderTitle(pageTitle)) return pageTitle;

    return "";
  }

  function getVideoElement() {
    return document.querySelector("video");
  }

  function getDayKeyFromTimestamp(timestampMs) {
    return new Date(timestampMs).toISOString().slice(0, 10);
  }

  function getBucketIndexFromTimestamp(timestampMs) {
    const date = new Date(timestampMs);
    if (Number.isNaN(date.getTime())) return 0;
    const totalMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
    return Math.max(0, Math.min(GRAPH_BUCKET_COUNT - 1, Math.floor(totalMinutes / GRAPH_BUCKET_MINUTES)));
  }

  function addPendingTimelineMilliseconds(session, timestampMs, milliseconds) {
    if (!session || milliseconds <= 0) return;

    const dayKey = getDayKeyFromTimestamp(timestampMs);
    const bucketIndex = getBucketIndexFromTimestamp(timestampMs);

    if (!session.pendingTimelineByDayMs || typeof session.pendingTimelineByDayMs !== "object") {
      session.pendingTimelineByDayMs = {};
    }

    if (!session.pendingTimelineByDayMs[dayKey] || typeof session.pendingTimelineByDayMs[dayKey] !== "object") {
      session.pendingTimelineByDayMs[dayKey] = {};
    }

    session.pendingTimelineByDayMs[dayKey][bucketIndex] =
      Number(session.pendingTimelineByDayMs[dayKey][bucketIndex] || 0) + milliseconds;
  }

  function persistWatchDuration(session, force) {
    if (!session) return Promise.resolve();

    const minimumToPersist = force ? 1 : 1000;
    if (session.pendingMilliseconds < minimumToPersist) return Promise.resolve();

    const millisecondsToSave = session.pendingMilliseconds;
    session.pendingMilliseconds = 0;
    const secondsToSave = millisecondsToSave / 1000;

    const pendingTimelineByDayMs =
      session.pendingTimelineByDayMs && typeof session.pendingTimelineByDayMs === "object"
        ? session.pendingTimelineByDayMs
        : {};
    session.pendingTimelineByDayMs = {};

    return NS.storage.queueHistoryWrite((history) => {
      const nowIso = new Date().toISOString();
      const dayKey = nowIso.slice(0, 10);
      const existing = history.find((entry) => entry.videoId === session.videoId);

      const mergeTimelineByDay = (target) => {
        const timelineByDay =
          target.timelineByDay && typeof target.timelineByDay === "object" ? target.timelineByDay : {};

        Object.entries(pendingTimelineByDayMs).forEach(([pendingDayKey, buckets]) => {
          if (!pendingDayKey || !buckets || typeof buckets !== "object") return;
          const dayTimeline =
            timelineByDay[pendingDayKey] && typeof timelineByDay[pendingDayKey] === "object"
              ? timelineByDay[pendingDayKey]
              : {};

          Object.entries(buckets).forEach(([bucketKey, bucketMsRaw]) => {
            const bucket = Number(bucketKey);
            const bucketMs = Number(bucketMsRaw || 0);
            if (!Number.isFinite(bucket) || bucket < 0 || bucket >= GRAPH_BUCKET_COUNT || bucketMs <= 0) return;
            dayTimeline[bucket] = Number(dayTimeline[bucket] || 0) + bucketMs / 1000;
          });

          timelineByDay[pendingDayKey] = dayTimeline;
        });

        target.timelineByDay = timelineByDay;
      };

      if (existing) {
        existing.title = session.title || existing.title || "Unknown title";
        existing.url = session.url || existing.url || "";
        existing.lastWatchedAt = nowIso;
        existing.watchedSeconds = Number(existing.watchedSeconds || 0) + secondsToSave;
        const watchByDay =
          existing.watchByDay && typeof existing.watchByDay === "object" ? existing.watchByDay : {};
        watchByDay[dayKey] = Number(watchByDay[dayKey] || 0) + secondsToSave;
        existing.watchByDay = watchByDay;
        mergeTimelineByDay(existing);
      } else {
        const nextEntry = {
          videoId: session.videoId,
          title: session.title || "Unknown title",
          url: session.url || "",
          watchedSeconds: secondsToSave,
          lastWatchedAt: nowIso,
          watchByDay: {
            [dayKey]: secondsToSave
          },
          timelineByDay: {}
        };
        mergeTimelineByDay(nextEntry);
        history.push(nextEntry);
      }

      history.sort((a, b) => String(b.lastWatchedAt).localeCompare(String(a.lastWatchedAt)));
      const trimmed = history.slice(0, config.historyLimit);
      state.cachedDailyWatchedSeconds = NS.storage.getDailySecondsFromHistory(
        trimmed,
        NS.storage.getCurrentDayKey()
      );
      return trimmed;
    });
  }

  function flushActive(force) {
    if (!state.activeWatchSession) return;
    void persistWatchDuration(state.activeWatchSession, force);
  }

  function resetSession(videoId) {
    const videoElement = getVideoElement();
    const mediaTime = videoElement && Number.isFinite(videoElement.currentTime) ? videoElement.currentTime : 0;

    state.activeWatchSession = {
      videoId,
      title: getCurrentVideoTitle(),
      url: window.location.href,
      pendingMilliseconds: 0,
      pendingTimelineByDayMs: {},
      lastTickMs: Date.now(),
      lastMediaTime: mediaTime
    };
  }

  function syncToPage() {
    const videoId = getCurrentVideoId();

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

    state.activeWatchSession.title = getCurrentVideoTitle() || state.activeWatchSession.title;
    state.activeWatchSession.url = window.location.href;
  }

  function getMediaProgressDelta(videoElement, session) {
    if (!videoElement || !session || !Number.isFinite(videoElement.currentTime)) return 0;

    const rawDelta = videoElement.currentTime - Number(session.lastMediaTime || 0);
    session.lastMediaTime = videoElement.currentTime;

    if (rawDelta <= 0) return 0;
    if (rawDelta > 15) return 0;
    return rawDelta;
  }

  function updateTick() {
    const currentDayKey = NS.storage.getCurrentDayKey();
    if (currentDayKey !== state.cachedDailyKey) {
      state.cachedDailyKey = currentDayKey;
      state.cachedDailyWatchedSeconds = 0;
      NS.storage.refreshDailyCache();
    }

    if (window.location.href !== state.lastKnownUrl) {
      state.lastKnownUrl = window.location.href;
      syncToPage();
      NS.dailyTimer.render();
    }

    if (!state.activeWatchSession) {
      NS.dailyTimer.render();
      return;
    }

    const refreshedTitle = getCurrentVideoTitle();
    if (!isPlaceholderTitle(refreshedTitle)) {
      state.activeWatchSession.title = refreshedTitle;
    }

    const now = Date.now();
    const elapsedMs = now - state.activeWatchSession.lastTickMs;
    state.activeWatchSession.lastTickMs = now;

    if (elapsedMs <= 0 || elapsedMs > 15000) return;

    const videoElement = getVideoElement();
    const isActivelyWatching =
      Boolean(videoElement) &&
      !videoElement.paused &&
      !videoElement.ended &&
      videoElement.readyState >= 2;

    if (state.wasVideoPlaying && !isActivelyWatching) {
      flushActive(true);
    }
    state.wasVideoPlaying = isActivelyWatching;

    if (!isActivelyWatching) {
      if (videoElement && Number.isFinite(videoElement.currentTime)) {
        state.activeWatchSession.lastMediaTime = videoElement.currentTime;
      }
      NS.dailyTimer.render();
      return;
    }

    const mediaDeltaSeconds = getMediaProgressDelta(videoElement, state.activeWatchSession);
    const fallbackSeconds = elapsedMs / 1000;
    const secondsToAdd = mediaDeltaSeconds > 0 ? mediaDeltaSeconds : fallbackSeconds;

    if (secondsToAdd <= 0) return;

    const millisecondsToAdd = Math.round(secondsToAdd * 1000);
    state.activeWatchSession.pendingMilliseconds += millisecondsToAdd;
    addPendingTimelineMilliseconds(state.activeWatchSession, now, millisecondsToAdd);

    if (state.activeWatchSession.pendingMilliseconds >= 10000) {
      flushActive(false);
    }

    NS.dailyTimer.render();
  }

  function handleNavigation() {
    NS.shorts.guardRoute();
    NS.shorts.applyBlocking();
    syncToPage();
    state.lastKnownUrl = window.location.href;
    NS.dailyTimer.render();
  }

  NS.watchHistory = {
    flushActive,
    updateTick,
    handleNavigation
  };
})();
