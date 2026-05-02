(() => {
  const app = window.Conscious;
  const { config } = app;
  const watchHistory = app.domain.watchHistory || (app.domain.watchHistory = {});

  const GRAPH_BUCKET_COUNT = config.graphBucketCount;

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

  watchHistory.addPendingTimelineMilliseconds = addPendingTimelineMilliseconds;
  watchHistory.mergePendingTimeline = mergePendingTimeline;
})();

