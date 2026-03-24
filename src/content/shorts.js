(() => {
  const NS = window.ConsciousContent;
  const { config, state } = NS;

  function hideElement(element) {
    if (!element || element.getAttribute(config.hiddenAttr) === "1") return;

    element.setAttribute(config.hiddenAttr, "1");
    element.dataset.shortsSwitchPrevDisplay = element.style.display || "";
    element.style.setProperty("display", "none", "important");
  }

  function restoreHiddenElements() {
    const nodes = document.querySelectorAll(`[${config.hiddenAttr}='1']`);
    nodes.forEach((node) => {
      const previous = node.dataset.shortsSwitchPrevDisplay || "";
      if (previous) {
        node.style.display = previous;
      } else {
        node.style.removeProperty("display");
      }
      node.removeAttribute(config.hiddenAttr);
      delete node.dataset.shortsSwitchPrevDisplay;
    });
  }

  function hideBySelectors() {
    config.shortsContainerSelectors.forEach((selector) => {
      const nodes = document.querySelectorAll(selector);
      nodes.forEach((node) => hideElement(node));
    });
  }

  function hideShortsLinksAndCards() {
    const links = document.querySelectorAll(config.shortsLinkSelector);
    links.forEach((link) => {
      const card =
        link.closest("ytd-guide-entry-renderer") ||
        link.closest("ytd-mini-guide-entry-renderer") ||
        link.closest("ytd-rich-item-renderer") ||
        link.closest("ytd-grid-video-renderer") ||
        link.closest("ytd-video-renderer") ||
        link.closest("ytd-compact-video-renderer") ||
        link;
      hideElement(card);
    });
  }

  function guardRoute() {
    if (!state.shortsDisabled) return;
    if (window.location.pathname.startsWith("/shorts/")) {
      window.location.replace(config.redirectTarget);
    }
  }

  function applyBlocking() {
    if (!state.shortsDisabled) return;
    guardRoute();
    hideBySelectors();
    hideShortsLinksAndCards();
  }

  function startObserver() {
    if (state.observer) return;

    let pending = false;
    state.observer = new MutationObserver(() => {
      if (!state.shortsDisabled || pending) return;
      pending = true;

      requestAnimationFrame(() => {
        applyBlocking();
        pending = false;
      });
    });

    state.observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function stopObserver() {
    if (!state.observer) return;
    state.observer.disconnect();
    state.observer = null;
  }

  function handleSettingUpdate(newValue) {
    state.shortsDisabled = Boolean(newValue);
    if (state.shortsDisabled) {
      applyBlocking();
      startObserver();
    } else {
      stopObserver();
      restoreHiddenElements();
    }
  }

  NS.shorts = {
    applyBlocking,
    guardRoute,
    handleSettingUpdate
  };
})();

