(() => {
  const NS = window.ConsciousContent;
  const { config, state } = NS;

  function formatDuration(totalSeconds) {
    const rounded = Math.max(0, Math.floor(totalSeconds || 0));
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    const seconds = rounded % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function ensureStyles() {
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
  }

  function getTimerHost() {
    return (
      document.querySelector("ytd-masthead #end") ||
      document.querySelector("#end.ytd-masthead") ||
      document.querySelector("ytd-masthead #buttons") ||
      null
    );
  }

  function getPendingSeconds() {
    if (!state.activeWatchSession) return 0;
    return Math.max(0, Number(state.activeWatchSession.pendingMilliseconds || 0) / 1000);
  }

  function remove() {
    const node = document.getElementById(config.timerElementId);
    if (node) node.remove();
  }

  function render() {
    if (!state.dailyTimerEnabled) {
      remove();
      return;
    }

    ensureStyles();

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

    const totalSeconds = state.cachedDailyWatchedSeconds + getPendingSeconds();
    timer.textContent = `Today ${formatDuration(totalSeconds)}`;
  }

  function handleSettingUpdate(newValue) {
    state.dailyTimerEnabled = Boolean(newValue);
    if (!state.dailyTimerEnabled) {
      remove();
      return;
    }

    NS.storage.refreshDailyCache();
    render();
  }

  NS.dailyTimer = {
    render,
    handleSettingUpdate
  };
})();

