(() => {
  const app = window.Conscious;
  const { config } = app;

  const hideElementWithFlag = (element, attrName, prevDisplayKey) => {
    if (!element || element.getAttribute(attrName) === "1") return;

    element.setAttribute(attrName, "1");
    element.dataset[prevDisplayKey] = element.style.display || "";
    element.style.setProperty("display", "none", "important");
  };

  const restoreElementsByFlag = (attrName, prevDisplayKey) => {
    const nodes = document.querySelectorAll(`[${attrName}='1']`);
    nodes.forEach((node) => {
      const previous = node.dataset[prevDisplayKey] || "";
      if (previous) {
        node.style.display = previous;
      } else {
        node.style.removeProperty("display");
      }
      node.removeAttribute(attrName);
      delete node.dataset[prevDisplayKey];
    });
  };

  const hideShortsContainers = () => {
    config.shortsContainerSelectors.forEach((selector) => {
      const nodes = document.querySelectorAll(selector);
      nodes.forEach((node) => hideElementWithFlag(node, config.hiddenAttr, "shortsSwitchPrevDisplay"));
    });
  };

  const hideShortsLinksAndCards = () => {
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

      hideElementWithFlag(card, config.hiddenAttr, "shortsSwitchPrevDisplay");
    });
  };

  const hideHeaderNode = (node) => {
    hideElementWithFlag(node, config.headerHiddenAttr, "consciousPrevDisplay");
  };

  const restoreHeaderNodes = () => {
    restoreElementsByFlag(config.headerHiddenAttr, "consciousPrevDisplay");
  };

  const hideVoiceSearch = () => {
    const masthead = document.querySelector("ytd-masthead") || document;
    const nodes = masthead.querySelectorAll(
      "#voice-search-button, ytd-button-renderer#voice-search-button, button[aria-label='Search with your voice']"
    );

    nodes.forEach((node) => {
      const container = node.closest("ytd-button-renderer") || node.closest("ytd-masthead #voice-search-button") || node;
      hideHeaderNode(container);
    });
  };

  const hideCreateButton = () => {
    const masthead = document.querySelector("ytd-masthead") || document;
    const nodes = masthead.querySelectorAll("#create-icon, button[aria-label='Create'], a[aria-label='Create']");

    nodes.forEach((node) => {
      const container = node.closest("ytd-topbar-menu-button-renderer") || node.closest("ytd-button-renderer") || node;
      hideHeaderNode(container);
    });
  };

  const getVideoElement = () => document.querySelector("video");

  const getTimerHost = () => {
    return (
      document.querySelector("ytd-masthead #end") ||
      document.querySelector("#end.ytd-masthead") ||
      document.querySelector("ytd-masthead #buttons") ||
      null
    );
  };

  const ensureTimerStyles = () => {
    if (document.getElementById(config.timerStyleId)) return;

    const style = document.createElement("style");
    style.id = config.timerStyleId;
    style.textContent = `
      #${config.timerElementId} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-left: 8px;
        padding: 10px 14px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.04);
        color: #0f0f0f;
        font: 500 12px/16px Arial, sans-serif;
        white-space: nowrap;
        user-select: none;
      }

      html[dark] #${config.timerElementId} {
        border-color: rgba(255, 255, 255, 0.2);
        background: rgba(255, 255, 255, 0.08);
        color: #f1f1f1;
      }
    `;

    document.documentElement.appendChild(style);
  };

  const removeTimer = () => {
    const node = document.getElementById(config.timerElementId);
    if (node) node.remove();
  };

  const upsertTimerText = (text) => {
    ensureTimerStyles();

    const host = getTimerHost();
    if (!host) return;

    let timer = document.getElementById(config.timerElementId);
    if (!timer) {
      timer = document.createElement("div");
      timer.id = config.timerElementId;
      host.appendChild(timer);
    } else if (timer.parentElement !== host) {
      host.appendChild(timer);
    }

    timer.textContent = text;
  };

  app.adapters.youtubeContent = {
    hideShortsContainers,
    hideShortsLinksAndCards,
    restoreShorts: () => restoreElementsByFlag(config.hiddenAttr, "shortsSwitchPrevDisplay"),
    hideVoiceSearch,
    hideCreateButton,
    restoreHeaderNodes,
    getVideoElement,
    upsertTimerText,
    removeTimer
  };
})();

