(() => {
  const app = window.Conscious;
  const { config, state } = app;
  const dom = app.adapters.youtubeContent;

  const guardShortsRoute = () => {
    if (!state.shortsDisabled) return;
    if (window.location.pathname.startsWith("/shorts/")) {
      window.location.replace(config.redirectTarget);
    }
  };

  const applyShortsBlocking = () => {
    if (!state.shortsDisabled) return;
    guardShortsRoute();
    dom.hideShortsContainers();
    dom.hideShortsLinksAndCards();
  };

  const startShortsObserver = () => {
    if (state.shortsObserver) return;

    let pending = false;
    state.shortsObserver = new MutationObserver(() => {
      if (!state.shortsDisabled || pending) return;
      pending = true;

      requestAnimationFrame(() => {
        applyShortsBlocking();
        pending = false;
      });
    });

    state.shortsObserver.observe(document.documentElement, { childList: true, subtree: true });
  };

  const stopShortsObserver = () => {
    if (!state.shortsObserver) return;
    state.shortsObserver.disconnect();
    state.shortsObserver = null;
  };

  const setShortsDisabled = (isDisabled) => {
    state.shortsDisabled = Boolean(isDisabled);

    if (state.shortsDisabled) {
      applyShortsBlocking();
      startShortsObserver();
    } else {
      stopShortsObserver();
      dom.restoreShorts();
    }
  };

  app.application.contentShorts = {
    guardShortsRoute,
    applyShortsBlocking,
    startShortsObserver,
    stopShortsObserver,
    setShortsDisabled
  };
})();

