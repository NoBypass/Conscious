(() => {
  const NS = window.ConsciousInpage;
  const { constants } = NS;

  NS.metrics = {
    buildDailyWatchSummary,
    getHeatLevel,
    buildHeatmapDayKeys,
    getBucketIndexFromDate,
    getBucketLabel,
    getUtcDayStartMs,
    getDaysOnRecord,
    createBucketSeries,
    buildTimelineByDay,
    buildCumulativeSeries,
    createSvgElement,
    buildSmoothPath
  };

  function buildDailyWatchSummary(history) {
    const daily = new Map();

    history.forEach((entry) => {
      const watchByDay = entry && typeof entry.watchByDay === "object" ? entry.watchByDay : null;

      if (watchByDay && Object.keys(watchByDay).length > 0) {
        Object.entries(watchByDay).forEach(([dayKey, watchedSecondsRaw]) => {
          const watchedSeconds = Number(watchedSecondsRaw || 0);
          if (!dayKey || watchedSeconds <= 0) return;

          if (!daily.has(dayKey)) {
            daily.set(dayKey, { watchedSeconds: 0, videoIds: new Set() });
          }

          const bucket = daily.get(dayKey);
          bucket.watchedSeconds += watchedSeconds;
          if (entry.videoId) bucket.videoIds.add(entry.videoId);
        });
        return;
      }

      const fallbackDay = String(entry.lastWatchedAt || "").slice(0, 10);
      const fallbackSeconds = Number(entry.watchedSeconds || 0);
      if (!fallbackDay || fallbackSeconds <= 0) return;

      if (!daily.has(fallbackDay)) {
        daily.set(fallbackDay, { watchedSeconds: 0, videoIds: new Set() });
      }

      const bucket = daily.get(fallbackDay);
      bucket.watchedSeconds += fallbackSeconds;
      if (entry.videoId) bucket.videoIds.add(entry.videoId);
    });

    return daily;
  }

  function getHeatLevel(watchedSeconds, maxWatchedSeconds) {
    if (watchedSeconds <= 0 || maxWatchedSeconds <= 0) return 0;
    const normalized = Math.min(1, Math.sqrt(watchedSeconds / maxWatchedSeconds));
    return Math.max(1, Math.ceil(normalized * (constants.heatmapLevels - 1)));
  }

  function buildHeatmapDayKeys(totalDays) {
    const today = new Date();
    const keys = [];

    for (let index = totalDays - 1; index >= 0; index -= 1) {
      const date = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - index)
      );
      keys.push(NS.getUtcDateKey(date));
    }

    return keys;
  }

  function getBucketIndexFromDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 0;
    const totalMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
    return Math.max(
      0,
      Math.min(constants.graphBucketCount - 1, Math.floor(totalMinutes / constants.graphBucketMinutes))
    );
  }

  function getBucketLabel(bucketIndex) {
    const clamped = Math.max(0, Math.min(constants.graphBucketCount, bucketIndex));
    const minutes = clamped * constants.graphBucketMinutes;
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  function getUtcDayStartMs(dayKey) {
    const date = NS.parseUtcDateKey(dayKey);
    if (Number.isNaN(date.getTime())) return NaN;
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }

  function getDaysOnRecord(dayKeys) {
    if (!dayKeys.length) return 0;

    const earliest = dayKeys.reduce((minKey, key) => (key < minKey ? key : minKey), dayKeys[0]);
    const startMs = getUtcDayStartMs(earliest);
    if (!Number.isFinite(startMs)) return 0;

    const now = new Date();
    const todayStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    if (todayStartMs < startMs) return 0;

    return Math.floor((todayStartMs - startMs) / constants.dayMs) + 1;
  }

  function createBucketSeries() {
    return Array.from({ length: constants.graphBucketCount }, () => 0);
  }

  function buildTimelineByDay(history) {
    const timelineByDay = new Map();

    const ensureDaySeries = (dayKey) => {
      if (!timelineByDay.has(dayKey)) timelineByDay.set(dayKey, createBucketSeries());
      return timelineByDay.get(dayKey);
    };

    history.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;

      const timeline = entry.timelineByDay;
      let hasTimeline = false;

      if (timeline && typeof timeline === "object") {
        Object.entries(timeline).forEach(([dayKey, buckets]) => {
          if (!dayKey || !buckets || typeof buckets !== "object") return;
          hasTimeline = true;
          const daySeries = ensureDaySeries(dayKey);

          Object.entries(buckets).forEach(([bucketRaw, secondsRaw]) => {
            const bucket = Number(bucketRaw);
            const seconds = Number(secondsRaw || 0);
            if (
              !Number.isFinite(bucket) ||
              bucket < 0 ||
              bucket >= constants.graphBucketCount ||
              seconds <= 0
            ) {
              return;
            }
            daySeries[bucket] += seconds;
          });
        });
      }

      if (hasTimeline) return;

      const watchByDay = entry.watchByDay && typeof entry.watchByDay === "object" ? entry.watchByDay : null;
      if (watchByDay && Object.keys(watchByDay).length > 0) {
        Object.entries(watchByDay).forEach(([dayKey, secondsRaw]) => {
          const seconds = Number(secondsRaw || 0);
          if (!dayKey || seconds <= 0) return;
          // Legacy entries do not have intraday buckets, so place them at noon as a neutral fallback.
          ensureDaySeries(dayKey)[Math.floor(constants.graphBucketCount / 2)] += seconds;
        });
        return;
      }

      const fallbackDay = String(entry.lastWatchedAt || "").slice(0, 10);
      const fallbackSeconds = Number(entry.watchedSeconds || 0);
      if (!fallbackDay || fallbackSeconds <= 0) return;

      const fallbackDate = new Date(entry.lastWatchedAt || `${fallbackDay}T12:00:00Z`);
      const bucket = getBucketIndexFromDate(fallbackDate);
      ensureDaySeries(fallbackDay)[bucket] += fallbackSeconds;
    });

    return timelineByDay;
  }

  function buildCumulativeSeries(series) {
    let running = 0;
    return series.map((value) => {
      running += Number(value || 0);
      return running;
    });
  }

  function createSvgElement(tagName, attributes) {
    const element = document.createElementNS(constants.svgNs, tagName);
    Object.entries(attributes || {}).forEach(([key, value]) => {
      element.setAttribute(key, String(value));
    });
    return element;
  }

  function buildSmoothPath(points) {
    if (!Array.isArray(points) || points.length === 0) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    let path = `M ${points[0].x} ${points[0].y}`;
    for (let index = 1; index < points.length; index += 1) {
      const prev = points[index - 1];
      const curr = points[index];
      const controlX = (prev.x + curr.x) / 2;
      path += ` C ${controlX} ${prev.y}, ${controlX} ${curr.y}, ${curr.x} ${curr.y}`;
    }
    return path;
  }
})();

