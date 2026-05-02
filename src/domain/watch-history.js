(() => {
  const app = window.Conscious;
  const { config } = app;
  const watchHistory = app.domain.watchHistory || (app.domain.watchHistory = {});

  const GRAPH_BUCKET_COUNT = config.graphBucketCount;

  const createRecordingSessionId = (videoId) => {
    const base = String(videoId || "video").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "video";
    const randomPart =
      typeof crypto !== "undefined" && crypto && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID().replace(/-/g, "")
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    return `${base}_${randomPart}`;
  };

  const normalizeDaySecondsMap = (value) => {
    const output = {};
    if (!value || typeof value !== "object") return output;

    Object.entries(value).forEach(([dayKey, secondsRaw]) => {
      const seconds = Number(secondsRaw || 0);
      if (!dayKey || seconds <= 0) return;
      output[dayKey] = Number((output[dayKey] || 0) + seconds);
    });

    return output;
  };

  const normalizeTimelineByDay = (value) => {
    const output = {};
    if (!value || typeof value !== "object") return output;

    Object.entries(value).forEach(([dayKey, buckets]) => {
      if (!dayKey || !buckets || typeof buckets !== "object") return;
      const dayBuckets = {};

      Object.entries(buckets).forEach(([bucketKey, secondsRaw]) => {
        const bucket = Number(bucketKey);
        const seconds = Number(secondsRaw || 0);
        if (!Number.isFinite(bucket) || bucket < 0 || bucket >= GRAPH_BUCKET_COUNT || seconds <= 0) return;
        dayBuckets[bucket] = Number((dayBuckets[bucket] || 0) + seconds);
      });

      if (Object.keys(dayBuckets).length > 0) output[dayKey] = dayBuckets;
    });

    return output;
  };

  const createSessionRecord = ({
    sessionId,
    startedAt,
    endedAt,
    watchedSeconds,
    watchByDay,
    timelineByDay,
    fallbackDayKey
  }) => {
    const normalizedWatchByDay = normalizeDaySecondsMap(watchByDay);
    const normalizedTimelineByDay = normalizeTimelineByDay(timelineByDay);
    const safeSessionId = String(sessionId || "").trim() || createRecordingSessionId("legacy");

    let safeStartedAt = String(startedAt || "").trim();
    let safeEndedAt = String(endedAt || "").trim();

    if (!safeEndedAt) safeEndedAt = new Date().toISOString();
    if (!safeStartedAt) safeStartedAt = safeEndedAt;

    const summedWatchByDay = Object.values(normalizedWatchByDay).reduce((sum, value) => sum + Number(value || 0), 0);
    const safeWatchedSeconds = Math.max(0, Number(watchedSeconds || summedWatchByDay || 0));

    if (Object.keys(normalizedWatchByDay).length === 0 && safeWatchedSeconds > 0) {
      const dayKey = fallbackDayKey || safeEndedAt.slice(0, 10);
      if (dayKey) normalizedWatchByDay[dayKey] = safeWatchedSeconds;
    }

    return {
      sessionId: safeSessionId,
      startedAt: safeStartedAt,
      endedAt: safeEndedAt,
      watchedSeconds: safeWatchedSeconds,
      watchByDay: normalizedWatchByDay,
      timelineByDay: normalizedTimelineByDay
    };
  };

  const ensureSessions = (entry) => {
    if (!entry || typeof entry !== "object") return [];

    if (Array.isArray(entry.sessions) && entry.sessions.length > 0) {
      return entry.sessions
        .map((session) =>
          createSessionRecord({
            sessionId: session.sessionId,
            startedAt: session.startedAt,
            endedAt: session.endedAt,
            watchedSeconds: session.watchedSeconds,
            watchByDay: session.watchByDay,
            timelineByDay: session.timelineByDay,
            fallbackDayKey: String(session.endedAt || entry.lastWatchedAt || "").slice(0, 10)
          })
        )
        .sort((a, b) => String(b.endedAt).localeCompare(String(a.endedAt)));
    }

    const fallbackDayKey = String(entry.lastWatchedAt || "").slice(0, 10);
    const migrated = createSessionRecord({
      sessionId: `legacy_${entry.videoId || "video"}_${fallbackDayKey || Date.now()}`,
      startedAt: entry.lastWatchedAt || new Date().toISOString(),
      endedAt: entry.lastWatchedAt || new Date().toISOString(),
      watchedSeconds: Number(entry.watchedSeconds || 0),
      watchByDay: entry.watchByDay,
      timelineByDay: entry.timelineByDay,
      fallbackDayKey
    });

    return migrated.watchedSeconds > 0 ? [migrated] : [];
  };

  const rebuildEntryAggregatesFromSessions = (entry) => {
    const sessions = ensureSessions(entry);
    const watchByDay = {};
    const timelineByDay = {};
    let watchedSeconds = 0;
    let lastWatchedAt = "";

    sessions.forEach((session) => {
      watchedSeconds += Number(session.watchedSeconds || 0);
      if (!lastWatchedAt || String(session.endedAt).localeCompare(String(lastWatchedAt)) > 0) {
        lastWatchedAt = session.endedAt;
      }

      Object.entries(session.watchByDay || {}).forEach(([dayKey, secondsRaw]) => {
        const seconds = Number(secondsRaw || 0);
        if (!dayKey || seconds <= 0) return;
        watchByDay[dayKey] = Number(watchByDay[dayKey] || 0) + seconds;
      });

      Object.entries(session.timelineByDay || {}).forEach(([dayKey, buckets]) => {
        if (!dayKey || !buckets || typeof buckets !== "object") return;
        if (!timelineByDay[dayKey] || typeof timelineByDay[dayKey] !== "object") {
          timelineByDay[dayKey] = {};
        }

        Object.entries(buckets).forEach(([bucketKey, secondsRaw]) => {
          const bucket = Number(bucketKey);
          const seconds = Number(secondsRaw || 0);
          if (!Number.isFinite(bucket) || bucket < 0 || bucket >= GRAPH_BUCKET_COUNT || seconds <= 0) return;
          timelineByDay[dayKey][bucket] = Number(timelineByDay[dayKey][bucket] || 0) + seconds;
        });
      });
    });

    entry.sessions = sessions;
    entry.watchByDay = watchByDay;
    entry.timelineByDay = timelineByDay;
    entry.watchedSeconds = watchedSeconds;
    entry.lastWatchedAt = lastWatchedAt || String(entry.lastWatchedAt || "") || new Date().toISOString();

    return entry;
  };

  const migrateHistory = (history) => {
    if (!Array.isArray(history)) return { history: [], didMigrate: true };

    let didMigrate = false;
    const migrated = history
      .filter((entry) => entry && typeof entry === "object" && entry.videoId)
      .map((entry) => {
        const hadSessions = Array.isArray(entry.sessions);
        const nextEntry = {
          videoId: entry.videoId,
          title: entry.title || "Unknown title",
          url: entry.url || "",
          sessions: ensureSessions(entry)
        };

        rebuildEntryAggregatesFromSessions(nextEntry);

        if (!hadSessions) didMigrate = true;
        return nextEntry;
      })
      .sort((a, b) => String(b.lastWatchedAt).localeCompare(String(a.lastWatchedAt)));

    if (migrated.length !== history.length) didMigrate = true;

    return { history: migrated, didMigrate };
  };

  const createSession = (videoId, title, url, mediaTime) => ({
    videoId,
    title,
    url,
    pendingMilliseconds: 0,
    pendingTimelineByDayMs: {},
    lastTickMs: Date.now(),
    lastMediaTime: mediaTime,
    recordingSessionId: createRecordingSessionId(videoId),
    recordingSessionStartedAt: new Date().toISOString(),
    hasRecordedActivity: false
  });

  const rotateRecordingSession = (session, timestampIso) => {
    if (!session) return;
    const nextStartIso = timestampIso || new Date().toISOString();
    session.recordingSessionId = createRecordingSessionId(session.videoId);
    session.recordingSessionStartedAt = nextStartIso;
    session.hasRecordedActivity = false;
  };

  const mergePendingTimelineIntoSession = (sessionRecord, pendingTimelineByDayMs) => {
    if (!sessionRecord.timelineByDay || typeof sessionRecord.timelineByDay !== "object") {
      sessionRecord.timelineByDay = {};
    }

    Object.entries(pendingTimelineByDayMs || {}).forEach(([pendingDayKey, buckets]) => {
      if (!pendingDayKey || !buckets || typeof buckets !== "object") return;
      if (!sessionRecord.timelineByDay[pendingDayKey] || typeof sessionRecord.timelineByDay[pendingDayKey] !== "object") {
        sessionRecord.timelineByDay[pendingDayKey] = {};
      }

      Object.entries(buckets).forEach(([bucketKey, bucketMsRaw]) => {
        const bucket = Number(bucketKey);
        const bucketMs = Number(bucketMsRaw || 0);
        if (!Number.isFinite(bucket) || bucket < 0 || bucket >= GRAPH_BUCKET_COUNT || bucketMs <= 0) return;

        sessionRecord.timelineByDay[pendingDayKey][bucket] =
          Number(sessionRecord.timelineByDay[pendingDayKey][bucket] || 0) + bucketMs / 1000;
      });
    });
  };

  const buildWatchByDayDelta = (secondsToSave, pendingTimelineByDayMs, fallbackDayKey) => {
    const byDay = {};
    let totalFromTimeline = 0;

    Object.entries(pendingTimelineByDayMs || {}).forEach(([dayKey, buckets]) => {
      if (!dayKey || !buckets || typeof buckets !== "object") return;

      Object.values(buckets).forEach((bucketMsRaw) => {
        const bucketMs = Number(bucketMsRaw || 0);
        if (bucketMs <= 0) return;
        const bucketSeconds = bucketMs / 1000;
        byDay[dayKey] = Number(byDay[dayKey] || 0) + bucketSeconds;
        totalFromTimeline += bucketSeconds;
      });
    });

    if (Object.keys(byDay).length === 0) {
      byDay[fallbackDayKey] = Number(secondsToSave || 0);
      return byDay;
    }

    const drift = Number(secondsToSave || 0) - totalFromTimeline;
    if (Math.abs(drift) > 0.001) {
      byDay[fallbackDayKey] = Number(byDay[fallbackDayKey] || 0) + drift;
    }

    return byDay;
  };

  const mergeSessionIntoHistory = ({ history, session, nowIso, secondsToSave }) => {
    const dayKey = nowIso.slice(0, 10);
    const existing = history.find((entry) => entry.videoId === session.videoId);

    const pendingTimelineByDayMs =
      session.pendingTimelineByDayMs && typeof session.pendingTimelineByDayMs === "object"
        ? session.pendingTimelineByDayMs
        : {};

    const watchByDayDelta = buildWatchByDayDelta(secondsToSave, pendingTimelineByDayMs, dayKey);

    const applyToEntry = (entry) => {
      entry.title = session.title || entry.title || "Unknown title";
      entry.url = session.url || entry.url || "";

      if (!Array.isArray(entry.sessions)) entry.sessions = [];

      let sessionRecord = entry.sessions.find((item) => item && item.sessionId === session.recordingSessionId);
      if (!sessionRecord) {
        sessionRecord = createSessionRecord({
          sessionId: session.recordingSessionId,
          startedAt: session.recordingSessionStartedAt || nowIso,
          endedAt: nowIso,
          watchedSeconds: 0,
          watchByDay: {},
          timelineByDay: {},
          fallbackDayKey: dayKey
        });
        entry.sessions.push(sessionRecord);
      }

      sessionRecord.endedAt = nowIso;
      sessionRecord.watchedSeconds = Number(sessionRecord.watchedSeconds || 0) + Number(secondsToSave || 0);

      if (!sessionRecord.watchByDay || typeof sessionRecord.watchByDay !== "object") {
        sessionRecord.watchByDay = {};
      }

      Object.entries(watchByDayDelta).forEach(([deltaDayKey, deltaSecondsRaw]) => {
        const deltaSeconds = Number(deltaSecondsRaw || 0);
        if (!deltaDayKey || deltaSeconds <= 0) return;
        sessionRecord.watchByDay[deltaDayKey] = Number(sessionRecord.watchByDay[deltaDayKey] || 0) + deltaSeconds;
      });

      mergePendingTimelineIntoSession(sessionRecord, pendingTimelineByDayMs);

      rebuildEntryAggregatesFromSessions(entry);
    };

    if (existing) {
      applyToEntry(existing);
    } else {
      const nextEntry = {
        videoId: session.videoId,
        title: session.title || "Unknown title",
        url: session.url || "",
        sessions: []
      };
      applyToEntry(nextEntry);
      history.push(nextEntry);
    }

    history.sort((a, b) => String(b.lastWatchedAt).localeCompare(String(a.lastWatchedAt)));
    return history;
  };

  watchHistory.createSession = createSession;
  watchHistory.rotateRecordingSession = rotateRecordingSession;
  watchHistory.rebuildEntryAggregatesFromSessions = rebuildEntryAggregatesFromSessions;
  watchHistory.migrateHistory = migrateHistory;
  watchHistory.mergeSessionIntoHistory = mergeSessionIntoHistory;
})();
