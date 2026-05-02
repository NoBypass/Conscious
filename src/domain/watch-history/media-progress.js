(() => {
  const app = window.Conscious;
  const watchHistory = app.domain.watchHistory || (app.domain.watchHistory = {});

  const getMediaProgressDelta = (videoElement, session, elapsedSeconds) => {
    if (!videoElement || !session || !Number.isFinite(videoElement.currentTime)) return 0;

    const rawDelta = videoElement.currentTime - Number(session.lastMediaTime || 0);
    session.lastMediaTime = videoElement.currentTime;

    if (rawDelta <= 0) return 0;

    const elapsed = Number(elapsedSeconds || 0);
    if (elapsed > 0) {
      const playbackRate = Math.max(0.25, Number(videoElement.playbackRate || 1));
      // Allow normal drift around expected progress (including faster playback rates),
      // while still rejecting large seek jumps.
      const expectedProgress = elapsed * playbackRate;
      const maxExpectedDelta = Math.max(2.5, expectedProgress * 2.2 + 0.8);
      if (rawDelta > maxExpectedDelta) return -1;
    }

    if (rawDelta > 30) return -1;
    return rawDelta;
  };

  watchHistory.getMediaProgressDelta = getMediaProgressDelta;
})();

