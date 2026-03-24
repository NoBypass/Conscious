(() => {
  const app = window.Conscious;

  const getHistoryBrowseRoot = () => {
    return document.querySelector("ytd-page-manager ytd-browse[page-subtype='history']") || null;
  };

  const getHistoryBrowseContentHost = () => {
    return (
      document.querySelector("ytd-page-manager ytd-browse[page-subtype='history'] #contents") ||
      document.querySelector("ytd-page-manager ytd-browse[page-subtype='history'] #primary") ||
      getHistoryBrowseRoot() ||
      null
    );
  };

  const setNativePageVisibility = (showNativePage) => {
    const browseRoot = getHistoryBrowseRoot();
    if (!browseRoot) return;

    if (showNativePage) {
      browseRoot.removeAttribute("data-conscious-native-hidden");
      return;
    }

    browseRoot.setAttribute("data-conscious-native-hidden", "1");
  };

  const isVisibleContainer = (element) => {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  };

  const findExpandedGuideContainer = () => {
    const candidates = [
      ...Array.from(document.querySelectorAll("ytd-guide-section-renderer #items")),
      ...Array.from(document.querySelectorAll("tp-yt-app-drawer #sections #items")),
      ...Array.from(document.querySelectorAll("ytd-guide-renderer #items"))
    ];

    return (
      candidates.find((node) => {
        const host =
          node.closest("ytd-guide-section-renderer") ||
          node.closest("tp-yt-app-drawer") ||
          node.closest("ytd-guide-renderer") ||
          node;
        return isVisibleContainer(host);
      }) || null
    );
  };

  const findMiniGuideContainer = () => {
    const candidates = [
      ...Array.from(document.querySelectorAll("ytd-mini-guide-renderer #items")),
      ...Array.from(document.querySelectorAll("ytd-mini-guide-renderer"))
    ];

    return (
      candidates.find((node) => {
        const host = node.closest("ytd-mini-guide-renderer") || node;
        return isVisibleContainer(host);
      }) || null
    );
  };

  app.adapters.youtubeInpage = {
    getHistoryBrowseRoot,
    getHistoryBrowseContentHost,
    setNativePageVisibility,
    findExpandedGuideContainer,
    findMiniGuideContainer
  };
})();

