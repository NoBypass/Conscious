(() => {
  const app = window.Conscious;
  const { config } = app;
  const youtubeDom = app.adapters.youtubeInpage;

  const updateGuideActiveState = (isActiveRoute) => {
    document.querySelectorAll(".conscious-guide-button").forEach((button) => {
      button.classList.toggle("is-active", isActiveRoute);
      button.setAttribute("aria-pressed", isActiveRoute ? "true" : "false");
    });
  };

  const createGuideItem = (itemId, compact, onClick) => {
    const wrapper = document.createElement("div");
    wrapper.id = itemId;
    wrapper.className = `conscious-guide-item ${compact ? "is-mini" : ""}`.trim();

    const button = document.createElement("button");
    button.type = "button";
    button.className = "conscious-guide-button";
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = `
      <span class="conscious-guide-icon" aria-hidden="true">
        <svg class="conscious-guide-icon-svg conscious-guide-icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
        </svg>
        <svg class="conscious-guide-icon-svg conscious-guide-icon-solid" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.375 2.25c-1.035 0-1.875.84-1.875 1.875v15.75c0 1.035.84 1.875 1.875 1.875h.75c1.035 0 1.875-.84 1.875-1.875V4.125c0-1.036-.84-1.875-1.875-1.875h-.75ZM9.75 8.625c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875h-.75a1.875 1.875 0 0 1-1.875-1.875V8.625ZM3 13.125c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v6.75c0 1.035-.84 1.875-1.875 1.875h-.75A1.875 1.875 0 0 1 3 19.875v-6.75Z" />
        </svg>
      </span>
      <span class="conscious-guide-label">Conscious</span>
    `;

    button.addEventListener("click", onClick);
    wrapper.appendChild(button);
    return wrapper;
  };

  const upsertGuideItem = (container, itemId, compact, onClick) => {
    if (!container) return;

    let item = document.getElementById(itemId);
    if (!item) item = createGuideItem(itemId, compact, onClick);

    if (item.parentElement !== container || container.firstElementChild !== item) {
      container.prepend(item);
    }
  };

  const ensureGuideEntries = (onClick, isActiveRoute) => {
    upsertGuideItem(youtubeDom.findExpandedGuideContainer(), config.fullGuideItemId, false, onClick);
    upsertGuideItem(youtubeDom.findMiniGuideContainer(), config.miniGuideItemId, true, onClick);
    updateGuideActiveState(isActiveRoute);
  };

  app.ui = app.ui || {};
  app.ui.inpageGuide = {
    ensureGuideEntries,
    updateGuideActiveState
  };
})();

