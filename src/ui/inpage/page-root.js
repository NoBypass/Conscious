(() => {
  const app = window.Conscious;
  const { config } = app;
  const youtubeDom = app.adapters.youtubeInpage;

  const ensurePageRoot = (onToggleChange) => {
    let root = document.getElementById("conscious-page-root");
    if (!root) {
      root = document.createElement("section");
      root.id = "conscious-page-root";
      root.hidden = true;
      root.innerHTML = `
        <div class="conscious-page-shell">
          <header class="conscious-page-header">
            <h1 class="conscious-page-title">Conscious</h1>
            <p class="conscious-page-subtitle">Track your watch time and control Shorts in one place.</p>
          </header>

          <div class="conscious-settings-card">
            <div class="conscious-toggle-row">
              <div>
                <h2 class="conscious-card-title">Shorts</h2>
                <p id="conscious-shorts-state" class="conscious-card-subtitle"></p>
              </div>
              <label class="conscious-switch">
                <input id="conscious-shorts-toggle" type="checkbox" />
                <span>Disable all Shorts</span>
              </label>
            </div>

            <div class="conscious-toggle-row">
              <div>
                <h2 class="conscious-card-title">Daily timer</h2>
                <p id="conscious-daily-timer-state" class="conscious-card-subtitle"></p>
              </div>
              <label class="conscious-switch">
                <input id="conscious-daily-timer-toggle" type="checkbox" />
                <span>Show daily top-bar timer</span>
              </label>
            </div>

            <div class="conscious-toggle-row">
              <div>
                <h2 class="conscious-card-title">Header declutter</h2>
                <p id="conscious-header-declutter-state" class="conscious-card-subtitle"></p>
              </div>
              <label class="conscious-switch">
                <input id="conscious-header-declutter-toggle" type="checkbox" />
                <span>Hide voice search and Create</span>
              </label>
            </div>
          </div>

          <div class="conscious-history-card conscious-stats-card">
            <div class="conscious-heatmap-header">
              <h2 class="conscious-card-title">Statistics</h2>
              <p id="conscious-stats-range" class="conscious-card-subtitle"></p>
            </div>
            <div class="conscious-stats-grid" aria-label="Watch statistics">
              <article class="conscious-stat-block">
                <p class="conscious-stat-label">Videos watched</p>
                <p id="conscious-stat-total-videos" class="conscious-stat-value">0</p>
              </article>
              <article class="conscious-stat-block">
                <p class="conscious-stat-label">Time watched</p>
                <p id="conscious-stat-total-time" class="conscious-stat-value">0m</p>
              </article>
              <article class="conscious-stat-block">
                <p class="conscious-stat-label">Avg per day</p>
                <p id="conscious-stat-avg-day" class="conscious-stat-value">0m</p>
              </article>
            </div>

            <div class="conscious-day-trend">
              <div class="conscious-heatmap-header conscious-day-trend-header">
                <h3 class="conscious-card-title">Today vs average day</h3>
                <p id="conscious-day-trend-subtitle" class="conscious-card-subtitle"></p>
              </div>
              <svg
                id="conscious-day-trend-svg"
                class="conscious-day-trend-svg"
                role="img"
                aria-label="Cumulative watch-time trend"
                preserveAspectRatio="none"
              ></svg>
              <div id="conscious-day-trend-tooltip" class="conscious-day-trend-tooltip" hidden></div>
              <p id="conscious-day-trend-empty" class="conscious-empty" hidden>No watch-time curve yet.</p>
              <div class="conscious-day-trend-legend" aria-hidden="true">
                <span class="conscious-day-trend-legend-item conscious-day-trend-legend-average">Average day</span>
                <span class="conscious-day-trend-legend-item conscious-day-trend-legend-today">Today</span>
              </div>
            </div>
          </div>

          <div class="conscious-history-card">
            <div class="conscious-heatmap-header">
              <h2 class="conscious-card-title">Watch history</h2>
              <p id="conscious-heatmap-summary" class="conscious-card-subtitle"></p>
            </div>
            <div
              id="conscious-heatmap-grid"
              class="conscious-heatmap-grid"
              role="grid"
              aria-label="Daily watch activity heatmap"
            ></div>
            <p id="conscious-history-empty" class="conscious-empty" hidden>No watch history yet.</p>
            <ul id="conscious-history-list" class="conscious-history-list"></ul>
          </div>
        </div>
      `;

      const bindToggle = (selector, key) => {
        const node = root.querySelector(selector);
        if (!node) return;
        node.addEventListener("change", () => {
          onToggleChange(key, Boolean(node.checked));
        });
      };

      bindToggle("#conscious-shorts-toggle", app.keys.shorts);
      bindToggle("#conscious-daily-timer-toggle", app.keys.dailyTimer);
      bindToggle("#conscious-header-declutter-toggle", app.keys.headerDeclutter);
    }

    const targetHost =
      youtubeDom.getHistoryBrowseRoot() ||
      youtubeDom.getHistoryBrowseContentHost() ||
      document.querySelector("ytd-page-manager") ||
      document.body;

    if (root.parentElement !== targetHost) {
      targetHost.appendChild(root);
    }

    return root;
  };

  const renderSettings = ({ shortsDisabled, dailyTimerEnabled, headerDeclutterEnabled }) => {
    const root = document.getElementById("conscious-page-root");
    if (!root) return;

    const shortsCheckbox = root.querySelector("#conscious-shorts-toggle");
    const dailyTimerCheckbox = root.querySelector("#conscious-daily-timer-toggle");
    const headerDeclutterCheckbox = root.querySelector("#conscious-header-declutter-toggle");

    const shortsState = root.querySelector("#conscious-shorts-state");
    const dailyTimerState = root.querySelector("#conscious-daily-timer-state");
    const headerDeclutterState = root.querySelector("#conscious-header-declutter-state");

    if (
      !shortsCheckbox ||
      !dailyTimerCheckbox ||
      !headerDeclutterCheckbox ||
      !shortsState ||
      !dailyTimerState ||
      !headerDeclutterState
    ) {
      return;
    }

    shortsCheckbox.checked = shortsDisabled;
    shortsState.textContent = shortsDisabled ? "Shorts are blocked across YouTube." : "Shorts are currently allowed.";

    dailyTimerCheckbox.checked = dailyTimerEnabled;
    dailyTimerState.textContent = dailyTimerEnabled
      ? "Daily watch timer is shown in the top bar."
      : "Daily watch timer is hidden.";

    headerDeclutterCheckbox.checked = headerDeclutterEnabled;
    headerDeclutterState.textContent = headerDeclutterEnabled
      ? "Voice search and Create buttons are hidden."
      : "Voice search and Create buttons are visible.";
  };

  app.ui = app.ui || {};
  app.ui.inpageRoot = {
    ensurePageRoot,
    renderSettings
  };
})();

