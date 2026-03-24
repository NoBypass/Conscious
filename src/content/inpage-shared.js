(() => {
  const NS = (window.ConsciousInpage = window.ConsciousInpage || {});

  NS.constants = {
    shortsKey: "shortsDisabled",
    dailyTimerKey: "dailyWatchTimerEnabled",
    headerDeclutterKey: "headerDeclutterEnabled",
    historyKey: "watchHistory",
    historyDisplayLimit: 100,
    heatmapWeeks: 52,
    heatmapLevels: 5,
    fullGuideItemId: "conscious-guide-item-full",
    miniGuideItemId: "conscious-guide-item-mini",
    routeBasePath: "/feed/history",
    routeQueryKey: "conscious",
    routeQueryValue: "1",
    routeSessionKey: "consciousRouteActive",
    heatmapTooltipOffset: 12,
    dayMs: 24 * 60 * 60 * 1000,
    graphBucketMinutes: 15,
    graphBucketCount: (24 * 60) / 15,
    svgNs: "http://www.w3.org/2000/svg"
  };

  NS.state = NS.state || {
    bootstrapTimer: null,
    observer: null,
    hasLoadedSettingsSnapshot: false,
    hasLoadedHistorySnapshot: false
  };

  NS.hasExtensionContext = function hasExtensionContext() {
    return typeof chrome !== "undefined" && Boolean(chrome.runtime && chrome.runtime.id);
  };

  NS.cleanupInvalidatedContext = function cleanupInvalidatedContext() {
    if (NS.state.observer) {
      NS.state.observer.disconnect();
      NS.state.observer = null;
    }

    if (NS.state.bootstrapTimer) {
      window.clearTimeout(NS.state.bootstrapTimer);
      NS.state.bootstrapTimer = null;
    }
  };

  NS.safeChromeCall = function safeChromeCall(operation) {
    if (!NS.hasExtensionContext()) return false;

    try {
      operation();
      return true;
    } catch (error) {
      if (String(error).includes("Extension context invalidated")) {
        NS.cleanupInvalidatedContext();
        return false;
      }
      throw error;
    }
  };

  NS.isConsciousRoute = function isConsciousRoute() {
    if (window.location.pathname !== NS.constants.routeBasePath) return false;
    const params = new URLSearchParams(window.location.search);
    return params.get(NS.constants.routeQueryKey) === NS.constants.routeQueryValue;
  };

  NS.setConsciousSessionRoute = function setConsciousSessionRoute(active) {
    try {
      if (active) {
        window.sessionStorage.setItem(NS.constants.routeSessionKey, "1");
      } else {
        window.sessionStorage.removeItem(NS.constants.routeSessionKey);
      }
    } catch (_error) {
      // Ignore storage access issues from restrictive browser settings.
    }
  };

  NS.shouldRestoreConsciousRoute = function shouldRestoreConsciousRoute() {
    if (window.location.pathname !== NS.constants.routeBasePath) return false;
    if (NS.isConsciousRoute()) return false;

    try {
      return window.sessionStorage.getItem(NS.constants.routeSessionKey) === "1";
    } catch (_error) {
      return false;
    }
  };

  NS.getConsciousUrl = function getConsciousUrl() {
    const url = new URL(window.location.href);
    url.pathname = NS.constants.routeBasePath;
    url.searchParams.set(NS.constants.routeQueryKey, NS.constants.routeQueryValue);
    return `${url.pathname}?${url.searchParams.toString()}`;
  };

  NS.navigateToConsciousRoute = function navigateToConsciousRoute() {
    const target = NS.getConsciousUrl();
    NS.setConsciousSessionRoute(true);

    if (`${window.location.pathname}${window.location.search}` === target) return;

    if (window.history && typeof window.history.pushState === "function") {
      window.history.pushState({}, "", target);
      window.dispatchEvent(new Event("yt-navigate-start"));
      window.dispatchEvent(new Event("yt-navigate-finish"));
      return;
    }

    window.location.assign(target);
  };

  NS.formatDuration = function formatDuration(totalSeconds) {
    const rounded = Math.max(0, Math.round(totalSeconds || 0));
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    const seconds = rounded % 60;

    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  NS.formatDurationCompact = function formatDurationCompact(totalSeconds) {
    const rounded = Math.max(0, Math.round(totalSeconds || 0));
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);

    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  NS.formatLastWatched = function formatLastWatched(isoDate) {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return "Unknown time";
    return date.toLocaleString();
  };

  NS.getUtcDateKey = function getUtcDateKey(date) {
    return date.toISOString().slice(0, 10);
  };

  NS.parseUtcDateKey = function parseUtcDateKey(key) {
    return new Date(`${key}T00:00:00Z`);
  };

  NS.formatDateKeyForTooltip = function formatDateKeyForTooltip(key) {
    const date = NS.parseUtcDateKey(key);
    if (Number.isNaN(date.getTime())) return key;

    return date.toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  };

  NS.getHistoryBrowseRoot = function getHistoryBrowseRoot() {
    return document.querySelector("ytd-page-manager ytd-browse[page-subtype='history']") || null;
  };

  NS.getHistoryBrowseContentHost = function getHistoryBrowseContentHost() {
    return (
      document.querySelector("ytd-page-manager ytd-browse[page-subtype='history'] #contents") ||
      document.querySelector("ytd-page-manager ytd-browse[page-subtype='history'] #primary") ||
      NS.getHistoryBrowseRoot() ||
      null
    );
  };

  NS.setNativePageVisibility = function setNativePageVisibility(showNativePage) {
    const browseRoot = NS.getHistoryBrowseRoot();
    if (!browseRoot) return;

    if (showNativePage) {
      browseRoot.removeAttribute("data-conscious-native-hidden");
      return;
    }

    browseRoot.setAttribute("data-conscious-native-hidden", "1");
  };
})();

