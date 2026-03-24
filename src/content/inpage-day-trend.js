(() => {
  const NS = window.ConsciousInpage;
  const { metrics, constants } = NS;

  NS.renderDayTrendGraph = function renderDayTrendGraph(history) {
    const root = document.getElementById("conscious-page-root");
    if (!root) return;

    const svg = root.querySelector("#conscious-day-trend-svg");
    const tooltip = root.querySelector("#conscious-day-trend-tooltip");
    const empty = root.querySelector("#conscious-day-trend-empty");
    const subtext = root.querySelector("#conscious-day-trend-subtitle");
    if (!svg || !tooltip || !empty || !subtext) return;

    const dailySummary = metrics.buildDailyWatchSummary(history);
    const timelineByDay = metrics.buildTimelineByDay(history);
    const recordDayKeys = Array.from(dailySummary.keys());
    const daysOnRecord = metrics.getDaysOnRecord(recordDayKeys);
    const now = new Date();
    const todayKey = NS.getUtcDateKey(now);
    const todayBucket = metrics.getBucketIndexFromDate(now);

    const averageBaseSeries = metrics.createBucketSeries();
    if (daysOnRecord > 0) {
      const earliest = recordDayKeys.reduce((minKey, key) => (key < minKey ? key : minKey), recordDayKeys[0]);
      const earliestStartMs = metrics.getUtcDayStartMs(earliest);
      if (Number.isFinite(earliestStartMs)) {
        for (let dayOffset = 0; dayOffset < daysOnRecord; dayOffset += 1) {
          const dayMs = earliestStartMs + dayOffset * constants.dayMs;
          const dayKey = NS.getUtcDateKey(new Date(dayMs));
          const daySeries = timelineByDay.get(dayKey);
          if (!daySeries) continue;
          for (let index = 0; index < constants.graphBucketCount; index += 1) {
            averageBaseSeries[index] += Number(daySeries[index] || 0);
          }
        }
      }

      for (let index = 0; index < constants.graphBucketCount; index += 1) {
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
      subtext.textContent = "Graph will appear once watch-time history accumulates.";
      svg.onmousemove = null;
      svg.onmouseleave = null;
      return;
    }

    empty.hidden = true;
    subtext.textContent = `Today vs average day over ${daysOnRecord} day${daysOnRecord === 1 ? "" : "s"} on record.`;

    const width = 760;
    const height = 220;
    const paddingLeft = 44;
    const paddingRight = 12;
    const paddingTop = 12;
    const paddingBottom = 28;
    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;
    const pointsCount = constants.graphBucketCount - 1;

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    const xForIndex = (index) => paddingLeft + (index / pointsCount) * plotWidth;
    const yForValue = (value) => paddingTop + (1 - value / maxValue) * plotHeight;
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    const xAxis = metrics.createSvgElement("line", {
      x1: paddingLeft,
      y1: paddingTop + plotHeight,
      x2: paddingLeft + plotWidth,
      y2: paddingTop + plotHeight,
      class: "conscious-trend-axis"
    });
    const yAxis = metrics.createSvgElement("line", {
      x1: paddingLeft,
      y1: paddingTop,
      x2: paddingLeft,
      y2: paddingTop + plotHeight,
      class: "conscious-trend-axis"
    });
    svg.appendChild(xAxis);
    svg.appendChild(yAxis);

    const averagePoints = averageCumulative.map((value, index) => ({
      x: xForIndex(index),
      y: yForValue(value),
      value
    }));
    const avgLine = metrics.createSvgElement("path", {
      d: metrics.buildSmoothPath(averagePoints),
      class: "conscious-trend-line conscious-trend-line-average"
    });
    svg.appendChild(avgLine);

    const todayPoints = [];
    for (let index = 0; index < constants.graphBucketCount; index += 1) {
      if (index > todayBucket) break;
      todayPoints.push({
        x: xForIndex(index),
        y: yForValue(todayCumulative[index]),
        value: todayCumulative[index]
      });
    }

    const todayLine = metrics.createSvgElement("path", {
      d: metrics.buildSmoothPath(todayPoints),
      class: "conscious-trend-line conscious-trend-line-today"
    });
    svg.appendChild(todayLine);

    const nowMarker = metrics.createSvgElement("line", {
      x1: xForIndex(todayBucket),
      y1: paddingTop,
      x2: xForIndex(todayBucket),
      y2: paddingTop + plotHeight,
      class: "conscious-trend-now-marker"
    });
    svg.appendChild(nowMarker);

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
    yTop.textContent = NS.formatDurationCompact(maxValue);
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

    const showHover = (event) => {
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        hideHover();
        return;
      }

      const relativeX = clamp(event.clientX - rect.left, 0, rect.width);
      const hoverBucket = Math.round((relativeX / rect.width) * pointsCount);
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

      const timeLabel = metrics.getBucketLabel(hoverBucket);
      const todayLabel = todayAtBucket === null ? "Not reached yet" : NS.formatDuration(todayAtBucket);

      tooltip.hidden = false;
      tooltip.innerHTML = `
        <div class="conscious-day-trend-tooltip-title">${timeLabel}</div>
        <div class="conscious-day-trend-tooltip-line">Today: ${todayLabel}</div>
        <div class="conscious-day-trend-tooltip-line">Average: ${NS.formatDuration(averageAtBucket)}</div>
      `;

      const tooltipRect = tooltip.getBoundingClientRect();
      const maxX = Math.max(8, window.innerWidth - tooltipRect.width - 8);
      const maxY = Math.max(8, window.innerHeight - tooltipRect.height - 8);
      const tooltipX = clamp(event.clientX + 14, 8, maxX);
      const tooltipY = clamp(event.clientY + 14, 8, maxY);
      tooltip.style.left = `${tooltipX}px`;
      tooltip.style.top = `${tooltipY}px`;
    };

    svg.onmousemove = showHover;
    svg.onmouseleave = hideHover;

    svg.setAttribute(
      "aria-label",
      `Today cumulative watch time is ${NS.formatDuration(todayCumulative[todayBucket] || 0)} by ${metrics.getBucketLabel(todayBucket)}. Average full-day total is ${NS.formatDuration(averageCumulative[averageCumulative.length - 1] || 0)}.`
    );
  };
})();

