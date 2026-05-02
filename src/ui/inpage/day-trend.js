(() => {
  const app = window.Conscious;
  const { config } = app;
  const { formatDuration, formatDurationCompact } = app.domain.shared;
  const metrics = app.domain.metrics;

  const renderDayTrendGraph = (history) => {
    const root = document.getElementById("conscious-page-root");
    if (!root) return;

    const svg = root.querySelector("#conscious-day-trend-svg");
    const tooltip = root.querySelector("#conscious-day-trend-tooltip");
    const empty = root.querySelector("#conscious-day-trend-empty");
    const subtitle = root.querySelector("#conscious-day-trend-subtitle");
    if (!svg || !tooltip || !empty || !subtitle) return;

    const dailySummary = metrics.buildDailyWatchSummary(history);
    const timelineByDay = metrics.buildTimelineByDay(history);
    const recordDayKeys = Array.from(dailySummary.keys());
    const daysOnRecord = metrics.getDaysOnRecord(recordDayKeys);
    const now = new Date();
    const todayKey = app.domain.shared.getUtcDateKey(now);
    const todayBucket = metrics.getBucketIndexFromDate(now);

    const averageBaseSeries = metrics.createBucketSeries();
    if (daysOnRecord > 0) {
      const earliest = recordDayKeys.reduce((minKey, key) => (key < minKey ? key : minKey), recordDayKeys[0]);
      const earliestStartMs = metrics.getUtcDayStartMs(earliest);
      if (Number.isFinite(earliestStartMs)) {
        for (let dayOffset = 0; dayOffset < daysOnRecord; dayOffset += 1) {
          const dayMs = earliestStartMs + dayOffset * config.dayMs;
          const dayKey = app.domain.shared.getUtcDateKey(new Date(dayMs));
          const daySeries = timelineByDay.get(dayKey);
          if (!daySeries) continue;
          for (let index = 0; index < config.graphBucketCount; index += 1) {
            averageBaseSeries[index] += Number(daySeries[index] || 0);
          }
        }
      }

      for (let index = 0; index < config.graphBucketCount; index += 1) {
        averageBaseSeries[index] /= daysOnRecord;
      }
    }

    const todaySeries = timelineByDay.get(todayKey) || metrics.createBucketSeries();
    const todayCumulative = metrics.buildCumulativeSeries(todaySeries);
    const averageCumulative = metrics.buildCumulativeSeries(averageBaseSeries);

    const maxValue = Math.max(1, ...todayCumulative, ...averageCumulative);
    const hasAnyData =
      recordDayKeys.length > 0 &&
      (todayCumulative.some((value) => value > 0) || averageCumulative.some((value) => value > 0));

    svg.innerHTML = "";
    tooltip.hidden = true;
    if (!hasAnyData) {
      empty.hidden = false;
      subtitle.textContent = "Graph will appear once watch-time history accumulates.";
      svg.onmousemove = null;
      svg.onmouseleave = null;
      return;
    }

    empty.hidden = true;
    subtitle.textContent = `Today vs average day over ${daysOnRecord} day${daysOnRecord === 1 ? "" : "s"} on record.`;

    const renderedRect = svg.getBoundingClientRect();
    const width = Math.max(640, Math.round(renderedRect.width || 760));
    const height = Math.max(180, Math.round(renderedRect.height || 220));
    const paddingLeft = Math.max(44, Math.round(width * 0.058));
    const paddingRight = Math.max(12, Math.round(width * 0.016));
    const paddingTop = 12;
    const paddingBottom = 28;
    const plotWidth = Math.max(1, width - paddingLeft - paddingRight);
    const plotHeight = Math.max(1, height - paddingTop - paddingBottom);
    const pointsCount = config.graphBucketCount - 1;

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    const xForIndex = (index) => paddingLeft + (index / pointsCount) * plotWidth;
    const yForValue = (value) => paddingTop + (1 - value / maxValue) * plotHeight;
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    const appendAxis = () => {
      svg.appendChild(
        metrics.createSvgElement("line", {
          x1: paddingLeft,
          y1: paddingTop + plotHeight,
          x2: paddingLeft + plotWidth,
          y2: paddingTop + plotHeight,
          class: "conscious-trend-axis"
        })
      );

      svg.appendChild(
        metrics.createSvgElement("line", {
          x1: paddingLeft,
          y1: paddingTop,
          x2: paddingLeft,
          y2: paddingTop + plotHeight,
          class: "conscious-trend-axis"
        })
      );
    };

    appendAxis();

    const averagePoints = averageCumulative.map((value, index) => ({ x: xForIndex(index), y: yForValue(value), value }));
    svg.appendChild(
      metrics.createSvgElement("path", {
        d: metrics.buildSmoothPath(averagePoints),
        class: "conscious-trend-line conscious-trend-line-average"
      })
    );

    const todayPoints = [];
    for (let index = 0; index < config.graphBucketCount; index += 1) {
      if (index > todayBucket) break;
      todayPoints.push({ x: xForIndex(index), y: yForValue(todayCumulative[index]), value: todayCumulative[index] });
    }

    svg.appendChild(
      metrics.createSvgElement("path", {
        d: metrics.buildSmoothPath(todayPoints),
        class: "conscious-trend-line conscious-trend-line-today"
      })
    );

    svg.appendChild(
      metrics.createSvgElement("line", {
        x1: xForIndex(todayBucket),
        y1: paddingTop,
        x2: xForIndex(todayBucket),
        y2: paddingTop + plotHeight,
        class: "conscious-trend-now-marker"
      })
    );

    const hoverMarker = metrics.createSvgElement("line", {
      x1: paddingLeft,
      y1: paddingTop,
      x2: paddingLeft,
      y2: paddingTop + plotHeight,
      class: "conscious-trend-hover-marker"
    });
    hoverMarker.style.display = "none";
    svg.appendChild(hoverMarker);

    const hoverAvgPoint = metrics.createSvgElement("circle", {
      cx: paddingLeft,
      cy: paddingTop + plotHeight,
      r: 3.8,
      class: "conscious-trend-hover-point conscious-trend-hover-point-average"
    });
    hoverAvgPoint.style.display = "none";
    svg.appendChild(hoverAvgPoint);

    const hoverTodayPoint = metrics.createSvgElement("circle", {
      cx: paddingLeft,
      cy: paddingTop + plotHeight,
      r: 4.1,
      class: "conscious-trend-hover-point conscious-trend-hover-point-today"
    });
    hoverTodayPoint.style.display = "none";
    svg.appendChild(hoverTodayPoint);

    [0, 24, 48, 72, 96].forEach((bucketIndex) => {
      const x = xForIndex(Math.min(pointsCount, bucketIndex));
      const label = metrics.createSvgElement("text", {
        x,
        y: height - 8,
        class: "conscious-trend-axis-label",
        "text-anchor": bucketIndex === 0 ? "start" : bucketIndex === 96 ? "end" : "middle"
      });
      label.textContent = metrics.getBucketLabel(bucketIndex);
      svg.appendChild(label);
    });

    const yTop = metrics.createSvgElement("text", {
      x: paddingLeft - 6,
      y: paddingTop + 10,
      class: "conscious-trend-axis-label",
      "text-anchor": "end"
    });
    yTop.textContent = formatDurationCompact(maxValue);
    svg.appendChild(yTop);

    const yBottom = metrics.createSvgElement("text", {
      x: paddingLeft - 6,
      y: paddingTop + plotHeight,
      class: "conscious-trend-axis-label",
      "text-anchor": "end"
    });
    yBottom.textContent = "0m";
    svg.appendChild(yBottom);

    const hideHover = () => {
      hoverMarker.style.display = "none";
      hoverAvgPoint.style.display = "none";
      hoverTodayPoint.style.display = "none";
      tooltip.hidden = true;
    };

    function showHover(event) {
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        hideHover();
        return;
      }

      const plotLeftPx = rect.left + (paddingLeft / width) * rect.width;
      const plotRightPx = rect.left + ((paddingLeft + plotWidth) / width) * rect.width;
      const plotTopPx = rect.top + (paddingTop / height) * rect.height;
      const plotBottomPx = rect.top + ((paddingTop + plotHeight) / height) * rect.height;

      if (
        event.clientX < plotLeftPx ||
        event.clientX > plotRightPx ||
        event.clientY < plotTopPx ||
        event.clientY > plotBottomPx
      ) {
        hideHover();
        return;
      }

      const plotWidthPx = Math.max(1, plotRightPx - plotLeftPx);
      const relativePlotX = clamp(event.clientX - plotLeftPx, 0, plotWidthPx);
      const hoverBucket = Math.round((relativePlotX / plotWidthPx) * pointsCount);
      const hoverX = xForIndex(hoverBucket);
      const averageAtBucket = Number(averageCumulative[hoverBucket] || 0);
      const todayAtBucket = hoverBucket <= todayBucket ? Number(todayCumulative[hoverBucket] || 0) : null;

      hoverMarker.style.display = "block";
      hoverMarker.setAttribute("x1", String(hoverX));
      hoverMarker.setAttribute("x2", String(hoverX));

      hoverAvgPoint.style.display = "block";
      hoverAvgPoint.setAttribute("cx", String(hoverX));
      hoverAvgPoint.setAttribute("cy", String(yForValue(averageAtBucket)));

      if (todayAtBucket === null) {
        hoverTodayPoint.style.display = "none";
      } else {
        hoverTodayPoint.style.display = "block";
        hoverTodayPoint.setAttribute("cx", String(hoverX));
        hoverTodayPoint.setAttribute("cy", String(yForValue(todayAtBucket)));
      }

      tooltip.hidden = false;
      tooltip.innerHTML = `
        <div class="conscious-day-trend-tooltip-title">${metrics.getBucketLabel(hoverBucket)}</div>
        <div class="conscious-day-trend-tooltip-line">Today: ${todayAtBucket === null ? "Not reached yet" : formatDuration(todayAtBucket)}</div>
        <div class="conscious-day-trend-tooltip-line">Average: ${formatDuration(averageAtBucket)}</div>
      `;

      const tooltipRect = tooltip.getBoundingClientRect();
      const maxX = Math.max(8, window.innerWidth - tooltipRect.width - 8);
      const maxY = Math.max(8, window.innerHeight - tooltipRect.height - 8);
      tooltip.style.left = `${clamp(event.clientX + 14, 8, maxX)}px`;
      tooltip.style.top = `${clamp(event.clientY + 14, 8, maxY)}px`;
    }

    svg.onmousemove = showHover;
    svg.onmouseleave = hideHover;

    svg.setAttribute(
      "aria-label",
      `Today cumulative watch time is ${formatDuration(todayCumulative[todayBucket] || 0)} by ${metrics.getBucketLabel(todayBucket)}. Average full-day total is ${formatDuration(averageCumulative[averageCumulative.length - 1] || 0)}.`
    );
  };

  app.ui = app.ui || {};
  app.ui.inpageDayTrend = {
    renderDayTrendGraph
  };
})();

