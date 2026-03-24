(() => {
  const NS = window.ConsciousContent;
  const { keys } = NS;

  chrome.storage.sync.get(
    {
      [keys.shorts]: false,
      [keys.dailyTimer]: false,
      [keys.headerDeclutter]: false
    },
    (result) => {
      NS.shorts.handleSettingUpdate(result[keys.shorts]);
      NS.dailyTimer.handleSettingUpdate(result[keys.dailyTimer]);
      NS.headerDeclutter.handleSettingUpdate(result[keys.headerDeclutter]);
    }
  );

  NS.storage.refreshDailyCache();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync") {
      if (changes[keys.shorts]) {
        NS.shorts.handleSettingUpdate(changes[keys.shorts].newValue);
      }

      if (changes[keys.dailyTimer]) {
        NS.dailyTimer.handleSettingUpdate(changes[keys.dailyTimer].newValue);
      }

      if (changes[keys.headerDeclutter]) {
        NS.headerDeclutter.handleSettingUpdate(changes[keys.headerDeclutter].newValue);
      }
    }

    if (areaName === "local" && changes[keys.history]) {
      NS.storage.refreshDailyCache();
    }
  });

  window.addEventListener("yt-navigate-start", () => {
    NS.watchHistory.flushActive(true);
  });

  window.addEventListener("yt-navigate-finish", NS.watchHistory.handleNavigation);
  window.addEventListener("popstate", NS.watchHistory.handleNavigation);
  window.addEventListener("hashchange", NS.watchHistory.handleNavigation);

  window.addEventListener("yt-navigate-finish", NS.headerDeclutter.apply);
  window.addEventListener("popstate", NS.headerDeclutter.apply);
  window.addEventListener("hashchange", NS.headerDeclutter.apply);

  window.addEventListener("pagehide", () => {
    NS.watchHistory.flushActive(true);
  });

  window.addEventListener("beforeunload", () => {
    NS.watchHistory.flushActive(true);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      NS.watchHistory.flushActive(true);
      NS.dailyTimer.render();
    }
  });

  setInterval(NS.watchHistory.updateTick, 1000);
  NS.watchHistory.handleNavigation();
  NS.headerDeclutter.apply();
})();
