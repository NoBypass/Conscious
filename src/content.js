(() => {
  const NS = window.ConsciousContent;
  const { keys, messages } = NS;

  chrome.storage.sync.get(
    {
      [keys.shorts]: false,
      [keys.dailyTimer]: false
    },
    (result) => {
      NS.shorts.handleSettingUpdate(result[keys.shorts]);
      NS.dailyTimer.handleSettingUpdate(result[keys.dailyTimer]);
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
    }

    if (areaName === "local" && changes[keys.history]) {
      NS.storage.refreshDailyCache();
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message) return;

    if (message.type === messages.shortsToggle) {
      NS.shorts.handleSettingUpdate(Boolean(message.value));
      sendResponse({ ok: true });
      return;
    }

    if (message.type === messages.requestHistorySync) {
      NS.watchHistory.flushActive(true);
      sendResponse({ ok: true });
    }
  });

  window.addEventListener("yt-navigate-start", () => {
    NS.watchHistory.flushActive(true);
  });

  window.addEventListener("yt-navigate-finish", NS.watchHistory.handleNavigation);
  window.addEventListener("popstate", NS.watchHistory.handleNavigation);
  window.addEventListener("hashchange", NS.watchHistory.handleNavigation);

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
})();
