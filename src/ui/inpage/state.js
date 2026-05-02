(() => {
  const app = window.Conscious;
  app.ui = app.ui || {};

  app.ui.inpageState = app.ui.inpageState || {
    latestHistory: [],
    selectedHeatmapDayKey: null
  };
})();

