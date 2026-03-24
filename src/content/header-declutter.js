(() => {
  const NS = window.ConsciousContent;
  const { config, state } = NS;

  function hideNode(node) {
    if (!node || node.getAttribute(config.headerHiddenAttr) === "1") return;

    node.setAttribute(config.headerHiddenAttr, "1");
    node.dataset.consciousPrevDisplay = node.style.display || "";
    node.style.setProperty("display", "none", "important");
  }

  function restoreNodes() {
    const nodes = document.querySelectorAll(`[${config.headerHiddenAttr}='1']`);
    nodes.forEach((node) => {
      const previous = node.dataset.consciousPrevDisplay || "";
      if (previous) {
        node.style.display = previous;
      } else {
        node.style.removeProperty("display");
      }
      node.removeAttribute(config.headerHiddenAttr);
      delete node.dataset.consciousPrevDisplay;
    });
  }

  function getMasthead() {
    return document.querySelector("ytd-masthead") || document;
  }

  function hideVoiceSearch(masthead) {
    const nodes = masthead.querySelectorAll(
      "#voice-search-button, ytd-button-renderer#voice-search-button, button[aria-label='Search with your voice']"
    );

    nodes.forEach((node) => {
      const container =
        node.closest("ytd-button-renderer") ||
        node.closest("ytd-masthead #voice-search-button") ||
        node;
      hideNode(container);
    });
  }

  function hideCreateButton(masthead) {
    const nodes = masthead.querySelectorAll(
      "#create-icon, button[aria-label='Create'], a[aria-label='Create']"
    );

    nodes.forEach((node) => {
      const container =
        node.closest("ytd-topbar-menu-button-renderer") ||
        node.closest("ytd-button-renderer") ||
        node;
      hideNode(container);
    });
  }

  function apply() {
    if (!state.headerDeclutterEnabled) return;

    const masthead = getMasthead();
    hideVoiceSearch(masthead);
    hideCreateButton(masthead);
  }

  function startObserver() {
    if (state.headerObserver) return;

    let pending = false;
    state.headerObserver = new MutationObserver(() => {
      if (!state.headerDeclutterEnabled || pending) return;
      pending = true;

      requestAnimationFrame(() => {
        apply();
        pending = false;
      });
    });

    state.headerObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function stopObserver() {
    if (!state.headerObserver) return;
    state.headerObserver.disconnect();
    state.headerObserver = null;
  }

  function handleSettingUpdate(newValue) {
    state.headerDeclutterEnabled = Boolean(newValue);
    if (state.headerDeclutterEnabled) {
      apply();
      startObserver();
      return;
    }

    stopObserver();
    restoreNodes();
  }

  NS.headerDeclutter = {
    apply,
    handleSettingUpdate
  };
})();

