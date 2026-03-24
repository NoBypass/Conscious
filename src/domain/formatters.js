(() => {
  const app = window.Conscious;
  const { config } = app;

  const hasExtensionContext = () => typeof chrome !== "undefined" && Boolean(chrome.runtime && chrome.runtime.id);

  const safeChromeCall = (operation) => {
    if (!hasExtensionContext()) return false;

    try {
      operation();
      return true;
    } catch (error) {
      if (String(error).includes("Extension context invalidated")) {
        cleanupRuntimeResources();
        return false;
      }
      throw error;
    }
  };

  const cleanupRuntimeResources = () => {
    const { state } = app;

    if (state.inpageObserver) {
      state.inpageObserver.disconnect();
      state.inpageObserver = null;
    }

    if (state.bootstrapTimer) {
      window.clearTimeout(state.bootstrapTimer);
      state.bootstrapTimer = null;
    }
  };

  const getUtcDateKey = (date) => date.toISOString().slice(0, 10);

  const parseUtcDateKey = (key) => new Date(`${key}T00:00:00Z`);

  const formatDuration = (totalSeconds) => {
    const rounded = Math.max(0, Math.round(totalSeconds || 0));
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    const seconds = rounded % 60;

    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const formatDurationCompact = (totalSeconds) => {
    const rounded = Math.max(0, Math.round(totalSeconds || 0));
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);

    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatClockDuration = (totalSeconds) => {
    const rounded = Math.max(0, Math.floor(totalSeconds || 0));
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    const seconds = rounded % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  };

  const formatLastWatched = (isoDate) => {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return "Unknown time";
    return date.toLocaleString();
  };

  const formatDateKeyForTooltip = (key) => {
    const date = parseUtcDateKey(key);
    if (Number.isNaN(date.getTime())) return key;

    return date.toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  };

  const isConsciousRoute = () => {
    if (window.location.pathname !== config.routeBasePath) return false;
    const params = new URLSearchParams(window.location.search);
    return params.get(config.routeQueryKey) === config.routeQueryValue;
  };

  const setConsciousSessionRoute = (active) => {
    try {
      if (active) {
        window.sessionStorage.setItem(config.routeSessionKey, "1");
      } else {
        window.sessionStorage.removeItem(config.routeSessionKey);
      }
    } catch (_error) {
      // Ignore storage access issues from restrictive browser settings.
    }
  };

  const shouldRestoreConsciousRoute = () => {
    if (window.location.pathname !== config.routeBasePath) return false;
    if (isConsciousRoute()) return false;

    try {
      return window.sessionStorage.getItem(config.routeSessionKey) === "1";
    } catch (_error) {
      return false;
    }
  };

  const getConsciousUrl = () => {
    const url = new URL(window.location.href);
    url.pathname = config.routeBasePath;
    url.searchParams.set(config.routeQueryKey, config.routeQueryValue);
    return `${url.pathname}?${url.searchParams.toString()}`;
  };

  const navigateToConsciousRoute = () => {
    const target = getConsciousUrl();
    setConsciousSessionRoute(true);

    if (`${window.location.pathname}${window.location.search}` === target) return;

    if (window.history && typeof window.history.pushState === "function") {
      window.history.pushState({}, "", target);
      window.dispatchEvent(new Event("yt-navigate-start"));
      window.dispatchEvent(new Event("yt-navigate-finish"));
      return;
    }

    window.location.assign(target);
  };

  app.domain.shared = {
    hasExtensionContext,
    safeChromeCall,
    cleanupRuntimeResources,
    getUtcDateKey,
    parseUtcDateKey,
    formatDuration,
    formatDurationCompact,
    formatClockDuration,
    formatLastWatched,
    formatDateKeyForTooltip,
    isConsciousRoute,
    setConsciousSessionRoute,
    shouldRestoreConsciousRoute,
    getConsciousUrl,
    navigateToConsciousRoute
  };
})();

