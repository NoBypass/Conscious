(() => {
  const app = window.Conscious;
  const { config } = app;

  const GRAPH_BUCKET_COUNT = config.graphBucketCount;

  const getCurrentVideoId = () => {
    if (window.location.pathname !== "/watch") return null;
    const value = new URLSearchParams(window.location.search).get("v");
    return value || null;
  };

  const isPlaceholderTitle = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    return !normalized || normalized === "youtube" || normalized === "unknown title";
  };

  const getCurrentVideoTitle = () => {
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
  };

  const getDayKeyFromTimestamp = (timestampMs) => new Date(timestampMs).toISOString().slice(0, 10);

  const getBucketIndexFromTimestamp = (timestampMs) => {
    const date = new Date(timestampMs);
    if (Number.isNaN(date.getTime())) return 0;
    const totalMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
    return Math.max(0, Math.min(GRAPH_BUCKET_COUNT - 1, Math.floor(totalMinutes / config.graphBucketMinutes)));
  };

  const addPendingTimelineMilliseconds = (session, timestampMs, milliseconds) => {
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
  };

  const mergePendingTimeline = (target, source) => {
    if (!source || typeof source !== "object") return;

    if (!target.pendingTimelineByDayMs || typeof target.pendingTimelineByDayMs !== "object") {
      target.pendingTimelineByDayMs = {};
    }

    Object.entries(source).forEach(([dayKey, buckets]) => {
      if (!dayKey || !buckets || typeof buckets !== "object") return;

      if (!target.pendingTimelineByDayMs[dayKey] || typeof target.pendingTimelineByDayMs[dayKey] !== "object") {
        target.pendingTimelineByDayMs[dayKey] = {};
      }

      Object.entries(buckets).forEach(([bucketKey, bucketMsRaw]) => {
        const bucketMs = Number(bucketMsRaw || 0);
        if (bucketMs <= 0) return;
        target.pendingTimelineByDayMs[dayKey][bucketKey] =
          Number(target.pendingTimelineByDayMs[dayKey][bucketKey] || 0) + bucketMs;
      });
    });
  };

  const getMediaProgressDelta = (videoElement, session) => {
    if (!videoElement || !session || !Number.isFinite(videoElement.currentTime)) return 0;

    const rawDelta = videoElement.currentTime - Number(session.lastMediaTime || 0);
    session.lastMediaTime = videoElement.currentTime;

    if (rawDelta <= 0) return 0;
    if (rawDelta > 15) return 0;
    return rawDelta;
  };

  const createSession = (videoId, title, url, mediaTime) => ({
    videoId,
    title,
    url,
    pendingMilliseconds: 0,
    pendingTimelineByDayMs: {},
    lastTickMs: Date.now(),
    lastMediaTime: mediaTime
  });

  const mergeSessionIntoHistory = ({ history, session, nowIso, secondsToSave }) => {
    const dayKey = nowIso.slice(0, 10);
    const existing = history.find((entry) => entry.videoId === session.videoId);

    const mergeTimelineByDay = (target, pendingTimelineByDayMs) => {
      const timelineByDay = target.timelineByDay && typeof target.timelineByDay === "object" ? target.timelineByDay : {};

      Object.entries(pendingTimelineByDayMs).forEach(([pendingDayKey, buckets]) => {
        if (!pendingDayKey || !buckets || typeof buckets !== "object") return;
        const dayTimeline =
          timelineByDay[pendingDayKey] && typeof timelineByDay[pendingDayKey] === "object"
            ? timelineByDay[pendingDayKey]
            : {};

        Object.entries(buckets).forEach(([bucketKey, bucketMsRaw]) => {
          const bucket = Number(bucketKey);
          const bucketMs = Number(bucketMsRaw || 0);
          if (!Number.isFinite(bucket) || bucket < 0 || bucket >= GRAPH_BUCKET_COUNT || bucketMs <= 0) {
            return;
          }
          dayTimeline[bucket] = Number(dayTimeline[bucket] || 0) + bucketMs / 1000;
        });

        timelineByDay[pendingDayKey] = dayTimeline;
      });

      target.timelineByDay = timelineByDay;
    };

    const pendingTimelineByDayMs =
      session.pendingTimelineByDayMs && typeof session.pendingTimelineByDayMs === "object"
        ? session.pendingTimelineByDayMs
        : {};

    if (existing) {
      existing.title = session.title || existing.title || "Unknown title";
      existing.url = session.url || existing.url || "";
      existing.lastWatchedAt = nowIso;
      existing.watchedSeconds = Number(existing.watchedSeconds || 0) + secondsToSave;
      const watchByDay = existing.watchByDay && typeof existing.watchByDay === "object" ? existing.watchByDay : {};
      watchByDay[dayKey] = Number(watchByDay[dayKey] || 0) + secondsToSave;
      existing.watchByDay = watchByDay;
      mergeTimelineByDay(existing, pendingTimelineByDayMs);
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
      mergeTimelineByDay(nextEntry, pendingTimelineByDayMs);
      history.push(nextEntry);
    }

    history.sort((a, b) => String(b.lastWatchedAt).localeCompare(String(a.lastWatchedAt)));
    return history.slice(0, config.historyLimit);
  };

  app.domain.watchHistory = {
    getCurrentVideoId,
    getCurrentVideoTitle,
    addPendingTimelineMilliseconds,
    mergePendingTimeline,
    getMediaProgressDelta,
    createSession,
    mergeSessionIntoHistory
  };
})();

