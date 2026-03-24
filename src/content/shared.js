(() => {
  const NS = (window.ConsciousContent = window.ConsciousContent || {});

  NS.keys = {
    shorts: "shortsDisabled",
    dailyTimer: "dailyWatchTimerEnabled",
    history: "watchHistory"
  };

  NS.config = {
    historyLimit: 200,
    redirectTarget: "https://www.youtube.com/",
    hiddenAttr: "data-shorts-switch-hidden",
    timerElementId: "conscious-daily-watch-timer",
    timerStyleId: "conscious-daily-watch-timer-style",
    shortsContainerSelectors: [
      "ytd-reel-shelf-renderer",
      "ytd-rich-shelf-renderer[is-shorts]",
      "ytm-shorts-lockup-view-model"
    ],
    shortsLinkSelector: "a[href^='/shorts/']"
  };

  NS.state = {
    shortsDisabled: false,
    dailyTimerEnabled: false,
    observer: null,
    activeWatchSession: null,
    wasVideoPlaying: false,
    lastKnownUrl: window.location.href,
    writeQueue: Promise.resolve(),
    cachedDailyKey: new Date().toISOString().slice(0, 10),
    cachedDailyWatchedSeconds: 0
  };
})();
