(() => {
  const app = (window.Conscious = window.Conscious || {});

  app.keys = {
    shorts: "shortsDisabled",
    dailyTimer: "dailyWatchTimerEnabled",
    headerDeclutter: "headerDeclutterEnabled",
    history: "watchHistory"
  };

  app.config = {
    historyDisplayLimit: 100,
    historyRetentionDays: 120,
    timelineRecentEntryCount: 80,
    heatmapWeeks: 52,
    heatmapLevels: 5,
    redirectTarget: "https://www.youtube.com/",
    hiddenAttr: "data-shorts-switch-hidden",
    headerHiddenAttr: "data-conscious-header-hidden",
    timerElementId: "conscious-daily-watch-timer",
    timerStyleId: "conscious-daily-watch-timer-style",
    shortsContainerSelectors: [
      "ytd-reel-shelf-renderer",
      "ytd-rich-shelf-renderer[is-shorts]",
      "ytm-shorts-lockup-view-model"
    ],
    shortsLinkSelector: "a[href^='/shorts/']",
    routeBasePath: "/feed/history",
    routeQueryKey: "conscious",
    routeQueryValue: "1",
    routeSessionKey: "consciousRouteActive",
    fullGuideItemId: "conscious-guide-item-full",
    miniGuideItemId: "conscious-guide-item-mini",
    heatmapTooltipOffset: 12,
    dayMs: 24 * 60 * 60 * 1000,
    graphBucketMinutes: 15,
    graphBucketCount: (24 * 60) / 15,
    svgNs: "http://www.w3.org/2000/svg"
  };

  app.state = app.state || {
    shortsDisabled: false,
    dailyTimerEnabled: false,
    headerDeclutterEnabled: false,
    shortsObserver: null,
    headerObserver: null,
    inpageObserver: null,
    bootstrapTimer: null,
    hasLoadedSettingsSnapshot: false,
    hasLoadedHistorySnapshot: false,
    activeWatchSession: null,
    wasVideoPlaying: false,
    lastKnownUrl: window.location.href,
    writeQueue: Promise.resolve(),
    cachedDailyKey: new Date().toISOString().slice(0, 10),
    cachedDailyWatchedSeconds: 0
  };

  app.domain = app.domain || {};
  app.ports = app.ports || {};
  app.adapters = app.adapters || {};
  app.application = app.application || {};
  app.ui = app.ui || {};
})();

