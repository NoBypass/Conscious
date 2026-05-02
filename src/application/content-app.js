(() => {
  const app = window.Conscious;
  const { state } = app;
  const storage = app.ports.storage;
  const shorts = app.application.contentShorts;
  const header = app.application.contentHeader;
  const timer = app.application.contentTimer;
  const watchSession = app.application.contentWatchSession;

  const updateFeatureSettings = (settings) => {
    shorts.setShortsDisabled(settings[app.keys.shorts]);
    timer.setDailyTimerEnabled(settings[app.keys.dailyTimer]);
    header.setHeaderDeclutterEnabled(settings[app.keys.headerDeclutter]);
  };

  const handleNavigation = () => {
    shorts.guardShortsRoute();
    shorts.applyShortsBlocking();
    watchSession.syncToPage();
    state.lastKnownUrl = window.location.href;
    timer.renderDailyTimer();
  };

  const bootstrapContentApp = () => {
    storage.getSyncSettings((result) => {
      updateFeatureSettings(result);
    });

    timer.refreshDailyTimerCache();

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "sync") {
        const nextSettings = {
          [app.keys.shorts]: changes[app.keys.shorts] ? changes[app.keys.shorts].newValue : state.shortsDisabled,
          [app.keys.dailyTimer]: changes[app.keys.dailyTimer]
            ? changes[app.keys.dailyTimer].newValue
            : state.dailyTimerEnabled,
          [app.keys.headerDeclutter]: changes[app.keys.headerDeclutter]
            ? changes[app.keys.headerDeclutter].newValue
            : state.headerDeclutterEnabled
        };

        if (changes[app.keys.shorts] || changes[app.keys.dailyTimer] || changes[app.keys.headerDeclutter]) {
          updateFeatureSettings(nextSettings);
        }
      }

      if (areaName === "local" && changes[app.keys.history]) {
        timer.refreshDailyTimerCache();
      }
    });

    window.addEventListener("yt-navigate-start", () => watchSession.flushActive(true));
    window.addEventListener("yt-navigate-finish", handleNavigation);
    window.addEventListener("popstate", handleNavigation);
    window.addEventListener("hashchange", handleNavigation);
    window.addEventListener("yt-navigate-finish", header.applyHeaderDeclutter);
    window.addEventListener("popstate", header.applyHeaderDeclutter);
    window.addEventListener("hashchange", header.applyHeaderDeclutter);
    window.addEventListener("pagehide", () => watchSession.flushActive(true));
    window.addEventListener("beforeunload", () => watchSession.flushActive(true));

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        watchSession.flushActive(true);
        timer.renderDailyTimer();
      }
    });

    setInterval(watchSession.onTick, 1000);
    handleNavigation();
    header.applyHeaderDeclutter();
  };

  app.application.content = {
    bootstrapContentApp
  };
})();
