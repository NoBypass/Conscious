(() => {
  const app = window.Conscious;
  const { state } = app;
  const dom = app.adapters.youtubeContent;

  const applyHeaderDeclutter = () => {
    if (!state.headerDeclutterEnabled) return;
    dom.hideVoiceSearch();
    dom.hideCreateButton();
  };

  const startHeaderObserver = () => {
    if (state.headerObserver) return;

    let pending = false;
    state.headerObserver = new MutationObserver(() => {
      if (!state.headerDeclutterEnabled || pending) return;
      pending = true;

      requestAnimationFrame(() => {
        applyHeaderDeclutter();
        pending = false;
      });
    });

    state.headerObserver.observe(document.documentElement, { childList: true, subtree: true });
  };

  const stopHeaderObserver = () => {
    if (!state.headerObserver) return;
    state.headerObserver.disconnect();
    state.headerObserver = null;
  };

  const setHeaderDeclutterEnabled = (isEnabled) => {
    state.headerDeclutterEnabled = Boolean(isEnabled);

    if (state.headerDeclutterEnabled) {
      applyHeaderDeclutter();
      startHeaderObserver();
    } else {
      stopHeaderObserver();
      dom.restoreHeaderNodes();
    }
  };

  app.application.contentHeader = {
    applyHeaderDeclutter,
    startHeaderObserver,
    stopHeaderObserver,
    setHeaderDeclutterEnabled
  };
})();

