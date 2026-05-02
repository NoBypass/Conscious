(() => {
  const app = window.Conscious;
  const watchHistory = app.domain.watchHistory || (app.domain.watchHistory = {});

  const isPlaceholderTitle = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    return !normalized || normalized === "youtube" || normalized === "unknown title";
  };

  const getCurrentVideoId = () => {
    if (window.location.pathname !== "/watch") return null;
    const value = new URLSearchParams(window.location.search).get("v");
    return value || null;
  };

  const getCurrentVideoTitle = () => {
    const heading = document.querySelector("h1.ytd-watch-metadata yt-formatted-string");
    if (heading && heading.textContent) {
      const headingTitle = heading.textContent.trim();
      if (!isPlaceholderTitle(headingTitle)) return headingTitle;
    }

    const playerTitle = window.ytInitialPlayerResponse?.videoDetails?.title;
    if (!isPlaceholderTitle(playerTitle)) return String(playerTitle).trim();

    const ogTitle = document.querySelector("meta[property='og:title']")?.getAttribute("content")?.trim();
    if (!isPlaceholderTitle(ogTitle)) return ogTitle;

    const metaTitle = document.querySelector("meta[name='title']")?.getAttribute("content")?.trim();
    if (!isPlaceholderTitle(metaTitle)) return metaTitle;

    const pageTitle = (document.title || "").replace(/\s*-\s*YouTube\s*$/, "").trim();
    if (!isPlaceholderTitle(pageTitle)) return pageTitle;

    return "";
  };

  watchHistory.getCurrentVideoId = getCurrentVideoId;
  watchHistory.getCurrentVideoTitle = getCurrentVideoTitle;
})();

