(() => {
  const app = window.Conscious;
  const { state, keys } = app;
  const storage = app.ports.storage;
  const shared = app.domain.shared;
  const ui = app.ui.inpage;
  const youtubeDom = app.adapters.youtubeInpage;

  const loadSettingsState = () => {
    storage.getSyncSettings((result) => {
      ui.renderSettings({
        shortsDisabled: Boolean(result[keys.shorts]),
        dailyTimerEnabled: Boolean(result[keys.dailyTimer]),
        headerDeclutterEnabled: Boolean(result[keys.headerDeclutter])
      });
    });
  };

  const loadHistory = () => {
    storage.getHistory((history) => {
      ui.renderHistory(history);
    });
  };

  const renderRoutePage = () => {
    const root = ui.ensurePageRoot((key, value) => storage.setSyncSetting(key, value));
    const isRoute = shared.isConsciousRoute();

    root.hidden = !isRoute;
    youtubeDom.setNativePageVisibility(!isRoute);
    ui.updateGuideActiveState(isRoute);

    if (!isRoute) {
      shared.setConsciousSessionRoute(false);
      return;
    }

    shared.setConsciousSessionRoute(true);

    if (!state.hasLoadedSettingsSnapshot) {
      loadSettingsState();
      state.hasLoadedSettingsSnapshot = true;
    }

    if (!state.hasLoadedHistorySnapshot) {
      loadHistory();
      state.hasLoadedHistorySnapshot = true;
    }
  };

  const ensureGuideEntry = () => {
    ui.ensureGuideEntries(() => {
      if (!shared.isConsciousRoute()) {
        shared.navigateToConsciousRoute();
        return;
      }
      renderRoutePage();
    }, shared.isConsciousRoute());
  };

  const bootstrap = () => {
    if (!shared.hasExtensionContext()) return;

    if (shared.shouldRestoreConsciousRoute() && window.history && typeof window.history.replaceState === "function") {
      window.history.replaceState(window.history.state, "", shared.getConsciousUrl());
    }

    ensureGuideEntry();
    renderRoutePage();
  };

  const scheduleBootstrap = () => {
    if (state.bootstrapTimer) return;
    state.bootstrapTimer = window.setTimeout(() => {
      state.bootstrapTimer = null;
      bootstrap();
    }, 120);
  };

  const bootstrapInpageApp = () => {
    if (!shared.hasExtensionContext()) return;

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (
        areaName === "sync" &&
        (changes[keys.shorts] || changes[keys.dailyTimer] || changes[keys.headerDeclutter])
      ) {
        loadSettingsState();
      }

      if (areaName === "local" && changes[keys.history] && shared.isConsciousRoute()) {
        loadHistory();
      }
    });

    window.addEventListener("yt-navigate-finish", scheduleBootstrap);
    window.addEventListener("popstate", scheduleBootstrap);

    state.inpageObserver = new MutationObserver(scheduleBootstrap);
    state.inpageObserver.observe(document.documentElement, { childList: true, subtree: true });

    bootstrap();
  };

  app.application.inpage = {
    bootstrapInpageApp
  };
})();

