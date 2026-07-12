// React imports
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import WaveformCanvas, {
  type WaveformColorMode,
} from "./WaveformCanvas";

import type {
  CatalogRelease,
  CatalogTrack,
  MediaCatalog,
} from "../types/MediaCatalog";

type WaveformData = {
  version: number;
  durationSeconds: number;
  sampleRate: number;
  sourceChannels: number;
  waveformChannels: number;
  bitsPerSample: number;
  peaksPerSecond: number;

  analysis: {
    fftSize: number;
    window: string;

    bandsHz: {
      low: [number, number];
      mid: [number, number];
      high: [number, number];
    };

    peakFields: string[];

    normalization: {
      method: string;
      percentile: number;
      compression: string;

      references: {
        low: number;
        mid: number;
        high: number;
      };
    };
  };

  peakCount: number;

  /*
   * Peak format:
   * [minimum, maximum, low, mid, high]
   */
  peaks: [
    number,
    number,
    number,
    number,
    number,
  ][];
};

type PlayableTrack = {
  key: string;
  release: CatalogRelease;
  track: CatalogTrack;
};

/*
 * Format seconds as minutes and seconds for player-facing timestamps.
 */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;

  return `${minutes}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}

/*
 * Track directory names may repeat across releases, so combine the
 * release and track identifiers into one selector value.
 */
function getTrackKey(
  release: CatalogRelease,
  track: CatalogTrack,
): string {
  return `${release.id}::${track.id}`;
}

/*
 * Convert a catalog-relative path into a browser media URL.
 */
function getMediaUrl(
  mediaBaseUrl: string,
  assetPath: string | null,
): string | null {
  if (!assetPath) {
    return null;
  }

  return `${mediaBaseUrl.replace(/\/$/, "")}/${assetPath}`;
}

export default function AudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Resume only when adjacent-track navigation started during playback.
  const resumePlaybackAfterTrackChangeRef =
    useRef(false);

  // Track horizontal artwork drag gestures independently of playback.
  const artworkPointerIdRef = useRef<number | null>(null);
  const artworkStartXRef = useRef(0);
  const artworkStartYRef = useRef(0);
  const artworkGestureAxisRef =
    useRef<"horizontal" | "vertical" | null>(null);
  const artworkCommitPendingRef = useRef(false);

  const [artworkDragOffset, setArtworkDragOffset] =
    useState(0);
  const [artworkDragProgress, setArtworkDragProgress] =
    useState(0);
  const [artworkSwipeDirection, setArtworkSwipeDirection] =
    useState<"previous" | "next" | "none">("none");
  const [isDraggingArtwork, setIsDraggingArtwork] =
    useState(false);
  const [
    artworkCommitDirection,
    setArtworkCommitDirection,
  ] = useState<"previous" | "next" | null>(null);
  const [
    committedArtworkSource,
    setCommittedArtworkSource,
  ] = useState<string | null>(null);

  // Media catalog and selected-track state.
  const [catalog, setCatalog] =
    useState<MediaCatalog | null>(null);
  const [selectedTrackKey, setSelectedTrackKey] =
    useState("");

  // Player state.
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Waveform data and loading state.
  const [waveform, setWaveform] =
    useState<WaveformData | null>(null);
  const [loadError, setLoadError] =
    useState<string | null>(null);

  // Waveform visual settings.
  const [colorMode, setColorMode] =
    useState<WaveformColorMode>("3band");

  // Horizontal waveform scale in canvas pixels per second.
  const [pixelsPerSecond, setPixelsPerSecond] =
    useState(100);

  /*
   * Flatten playable tracks for lookup while retaining their
   * parent-release information.
   */
  const playableTracks = useMemo<PlayableTrack[]>(() => {
    if (!catalog) {
      return [];
    }

    return catalog.releases.flatMap((release) => {
      return release.tracks
        .filter((track) => track.playable)
        .map((track) => ({
          key: getTrackKey(release, track),
          release,
          track,
        }));
    });
  }, [catalog]);

  const selectedTrack = useMemo(() => {
    return (
      playableTracks.find(
        (entry) => entry.key === selectedTrackKey,
      ) ?? null
    );
  }, [playableTracks, selectedTrackKey]);

  const selectedTrackIndex = selectedTrack
    ? playableTracks.findIndex(
        (entry) => entry.key === selectedTrack.key,
      )
    : -1;

  const previousTrack =
    selectedTrackIndex >= 0 && playableTracks.length > 1
      ? playableTracks[
          (selectedTrackIndex -
            1 +
            playableTracks.length) %
            playableTracks.length
        ]
      : null;

  const nextTrack =
    selectedTrackIndex >= 0 && playableTracks.length > 1
      ? playableTracks[
          (selectedTrackIndex + 1) %
            playableTracks.length
        ]
      : null;

  const previousPreviousTrack =
    selectedTrackIndex >= 0 && playableTracks.length > 2
      ? playableTracks[
          (selectedTrackIndex -
            2 +
            playableTracks.length) %
            playableTracks.length
        ]
      : null;

  const nextNextTrack =
    selectedTrackIndex >= 0 && playableTracks.length > 2
      ? playableTracks[
          (selectedTrackIndex + 2) %
            playableTracks.length
        ]
      : null;

  // Load the generated release and track catalog.
  useEffect(() => {
    const controller = new AbortController();

    async function loadCatalog() {
      try {
        const response = await fetch(
          "/media/catalog.json",
          {
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(
            `Failed to load catalog: ${response.status}`,
          );
        }

        const data =
          (await response.json()) as MediaCatalog;

        setCatalog(data);
        setLoadError(null);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setLoadError(
          error instanceof Error
            ? error.message
            : "Failed to load media catalog.",
        );
      }
    }

    void loadCatalog();

    return () => {
      controller.abort();
    };
  }, []);

  // Select the first playable track after loading the catalog.
  useEffect(() => {
    if (
      playableTracks.length > 0 &&
      !playableTracks.some(
        (entry) => entry.key === selectedTrackKey,
      )
    ) {
      setSelectedTrackKey(playableTracks[0].key);
    }
  }, [playableTracks, selectedTrackKey]);

  /*
   * Reset playback and load the selected track's waveform whenever
   * the user changes tracks.
   */
  useEffect(() => {
    const audio = audioRef.current;
    const controller = new AbortController();

    audio?.pause();

    if (audio) {
      audio.currentTime = 0;
      audio.load();
    }

    setIsPlaying(false);
    setCurrentTime(0);
    setWaveform(null);
    setLoadError(null);

    if (!catalog || !selectedTrack) {
      return () => {
        controller.abort();
      };
    }

    const waveformUrl = getMediaUrl(
      catalog.mediaBaseUrl,
      selectedTrack.track.assets.waveform,
    );

    if (!waveformUrl) {
      setLoadError(
        "The selected track does not have waveform data.",
      );

      return () => {
        controller.abort();
      };
    }

    // Preserve the non-null URL inside the nested async function.
    const resolvedWaveformUrl = waveformUrl;

    async function loadWaveform() {
      try {
        const response = await fetch(
          resolvedWaveformUrl,
          {
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(
            `Failed to load waveform: ${response.status}`,
          );
        }

        const data =
          (await response.json()) as WaveformData;

        setWaveform(data);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setLoadError(
          error instanceof Error
            ? error.message
            : "Failed to load waveform.",
        );
      }
    }

    void loadWaveform();

    return () => {
      controller.abort();
    };
  }, [catalog, selectedTrack]);

  const audioSource =
    catalog && selectedTrack
      ? getMediaUrl(
          catalog.mediaBaseUrl,
          selectedTrack.track.assets.audioPlayback,
        )
      : null;

  const artworkSource =
    catalog && selectedTrack
      ? getMediaUrl(
          catalog.mediaBaseUrl,
          selectedTrack.track.artwork.path,
        )
      : null;

  const previousArtworkSource =
    catalog && previousTrack
      ? getMediaUrl(
          catalog.mediaBaseUrl,
          previousTrack.track.artwork.path,
        )
      : null;

  const nextArtworkSource =
    catalog && nextTrack
      ? getMediaUrl(
          catalog.mediaBaseUrl,
          nextTrack.track.artwork.path,
        )
      : null;

  const previousPreviousArtworkSource =
    catalog && previousPreviousTrack
      ? getMediaUrl(
          catalog.mediaBaseUrl,
          previousPreviousTrack.track.artwork.path,
        )
      : null;

  const nextNextArtworkSource =
    catalog && nextNextTrack
      ? getMediaUrl(
          catalog.mediaBaseUrl,
          nextNextTrack.track.artwork.path,
        )
      : null;


  function selectAdjacentTrack(direction: -1 | 1) {
    if (!selectedTrack || playableTracks.length < 2) {
      return;
    }

    const audio = audioRef.current;

    resumePlaybackAfterTrackChangeRef.current =
      Boolean(audio && !audio.paused);

    const currentIndex = playableTracks.findIndex(
      (entry) => entry.key === selectedTrack.key,
    );

    if (currentIndex === -1) {
      return;
    }

    // Wrap navigation across the complete playable catalog.
    const nextIndex =
      (currentIndex + direction + playableTracks.length) %
      playableTracks.length;

    setSelectedTrackKey(playableTracks[nextIndex].key);
  }

  function selectPreviousTrack() {
    selectAdjacentTrack(-1);
  }

  function selectNextTrack() {
    selectAdjacentTrack(1);
  }

  /*
   * Keep the committed artwork centered long enough for the newly
   * selected track to render and paint in the current slot.
   */
  useEffect(() => {
    if (!artworkCommitDirection) {
      return;
    }

    let secondFrameId = 0;

    const firstFrameId = window.requestAnimationFrame(() => {
      secondFrameId = window.requestAnimationFrame(() => {
        artworkPointerIdRef.current = null;
        artworkGestureAxisRef.current = null;
        artworkCommitPendingRef.current = false;

        setArtworkDragOffset(0);
        setArtworkDragProgress(0);
        setArtworkSwipeDirection("none");
        setIsDraggingArtwork(false);
        setArtworkCommitDirection(null);
        setCommittedArtworkSource(null);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrameId);

      if (secondFrameId) {
        window.cancelAnimationFrame(secondFrameId);
      }
    };
  }, [selectedTrackKey, artworkCommitDirection]);

  function resetArtworkGesture() {
    artworkPointerIdRef.current = null;
    artworkGestureAxisRef.current = null;
    setArtworkDragOffset(0);
    setArtworkDragProgress(0);
    setArtworkSwipeDirection("none");
    setIsDraggingArtwork(false);
    setCommittedArtworkSource(null);
  }

  function handleArtworkPointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (playableTracks.length < 2) {
      return;
    }

    artworkPointerIdRef.current = event.pointerId;
    artworkStartXRef.current = event.clientX;
    artworkStartYRef.current = event.clientY;
    artworkGestureAxisRef.current = null;

    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDraggingArtwork(true);
  }

  function handleArtworkPointerMove(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (
      artworkPointerIdRef.current !== event.pointerId
    ) {
      return;
    }

    const deltaX =
      event.clientX - artworkStartXRef.current;
    const deltaY =
      event.clientY - artworkStartYRef.current;

    if (!artworkGestureAxisRef.current) {
      const movementThreshold = 8;

      if (
        Math.abs(deltaX) < movementThreshold &&
        Math.abs(deltaY) < movementThreshold
      ) {
        return;
      }

      artworkGestureAxisRef.current =
        Math.abs(deltaX) > Math.abs(deltaY)
          ? "horizontal"
          : "vertical";

      if (
        artworkGestureAxisRef.current === "horizontal"
      ) {
        setArtworkSwipeDirection(
          deltaX < 0 ? "next" : "previous",
        );
      }
    }

    if (
      artworkGestureAxisRef.current !== "horizontal"
    ) {
      return;
    }

    event.preventDefault();

    // Add resistance so the artwork cannot be dragged indefinitely.
    const maximumOffset =
      event.currentTarget.clientWidth * 0.48;

    /*
     * Allow a gesture to reverse direction, but require the pointer
     * to cross a small center dead zone before activating the
     * opposite artwork stack.
     */
    const reversalThreshold = 12;
    let effectiveDirection = artworkSwipeDirection;

    if (
      effectiveDirection === "next" &&
      deltaX > reversalThreshold
    ) {
      effectiveDirection = "previous";
      setArtworkSwipeDirection("previous");
    } else if (
      effectiveDirection === "previous" &&
      deltaX < -reversalThreshold
    ) {
      effectiveDirection = "next";
      setArtworkSwipeDirection("next");
    } else if (effectiveDirection === "none") {
      effectiveDirection =
        deltaX < 0 ? "next" : "previous";

      setArtworkSwipeDirection(effectiveDirection);
    }

    /*
     * Hold the visual position at center while the pointer remains
     * inside the reversal dead zone.
     */
    const constrainedOffset =
      effectiveDirection === "next"
        ? Math.max(
            -maximumOffset,
            Math.min(
              0,
              deltaX > -reversalThreshold
                ? 0
                : deltaX,
            ),
          )
        : Math.min(
            maximumOffset,
            Math.max(
              0,
              deltaX < reversalThreshold
                ? 0
                : deltaX,
            ),
          );

    const selectionThreshold =
      event.currentTarget.clientWidth * 0.22;

    const dragProgress = Math.min(
      Math.abs(constrainedOffset) / selectionThreshold,
      1,
    );

    setArtworkDragOffset(constrainedOffset);
    setArtworkDragProgress(dragProgress);
  }

  function handleArtworkPointerEnd(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (
      artworkPointerIdRef.current !== event.pointerId
    ) {
      return;
    }

    /*
     * Use normalized progress rather than a second raw-pixel
     * calculation. This behaves consistently in narrow landscape
     * artwork columns.
     */
    const shouldCommit =
      artworkGestureAxisRef.current === "horizontal" &&
      artworkDragProgress >= 0.9;

    const committedDirection = shouldCommit
      ? artworkSwipeDirection === "next" ||
        artworkSwipeDirection === "previous"
        ? artworkSwipeDirection
        : null
      : null;

    artworkPointerIdRef.current = null;
    artworkGestureAxisRef.current = null;
    setIsDraggingArtwork(false);

    if (committedDirection) {
      /*
       * Set commit state before changing tracks. Do not manually
       * release pointer capture; pointerup releases it automatically.
       */
      artworkCommitPendingRef.current = true;

      const destinationArtworkSource =
        committedDirection === "next"
          ? nextArtworkSource
          : previousArtworkSource;

      setCommittedArtworkSource(
        destinationArtworkSource,
      );
      setArtworkCommitDirection(committedDirection);

      if (committedDirection === "next") {
        selectNextTrack();
      } else {
        selectPreviousTrack();
      }

      return;
    }

    resetArtworkGesture();
  }

  function handleArtworkPointerCancel(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (
      artworkPointerIdRef.current !== event.pointerId
    ) {
      return;
    }

    resetArtworkGesture();
  }

  function handleArtworkLostPointerCapture(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (artworkCommitPendingRef.current) {
      return;
    }

    if (
      artworkPointerIdRef.current !== null &&
      artworkPointerIdRef.current !== event.pointerId
    ) {
      return;
    }

    // Reset interrupted gestures that were not committed.
    resetArtworkGesture();
  }

  async function togglePlayback() {
    const audio = audioRef.current;

    if (!audio || !audioSource) {
      return;
    }

    if (audio.paused) {
      await audio.play();
    } else {
      audio.pause();
    }
  }

  /*
   * Give the artwork handoff a forgiving visual dead zone.
   * The destination cover starts moving only after the initial drag,
   * then eases smoothly into the selected position.
   */
  const artworkVisualProgress = (() => {
    const deadZone = 0.22;
    const normalized = Math.max(
      0,
      Math.min(
        1,
        (artworkDragProgress - deadZone) /
          (1 - deadZone),
      ),
    );

    // Smoothstep easing prevents the incoming cover from rushing forward.
    return normalized * normalized * (3 - 2 * normalized);
  })();

  const artworkIsPromoted =
    artworkVisualProgress >= 0.62;

  /*
   * Track each carousel side independently. When a gesture reverses,
   * one side returns fully to rest before the other side advances.
   */
  const previousArtworkProgress =
    artworkDragOffset > 0
      ? artworkVisualProgress
      : 0;

  const nextArtworkProgress =
    artworkDragOffset < 0
      ? artworkVisualProgress
      : 0;

  const activeArtworkProgress = Math.max(
    previousArtworkProgress,
    nextArtworkProgress,
  );

  // Keep dropdown and button zoom controls on the same fixed steps.
  const waveformZoomSteps = [3, 6, 12, 25, 50, 100, 200, 400, 800, 1600];
  const waveformZoomIndex =
    waveformZoomSteps.indexOf(pixelsPerSecond);

  function decreaseWaveformZoom() {
    const currentIndex =
      waveformZoomIndex >= 0 ? waveformZoomIndex : 1;

    setPixelsPerSecond(
      waveformZoomSteps[
        Math.max(0, currentIndex - 1)
      ],
    );
  }

  function increaseWaveformZoom() {
    const currentIndex =
      waveformZoomIndex >= 0 ? waveformZoomIndex : 1;

    setPixelsPerSecond(
      waveformZoomSteps[
        Math.min(
          waveformZoomSteps.length - 1,
          currentIndex + 1,
        )
      ],
    );
  }

  return (
    <section
      className="audio-player"
      aria-label="Audio player"
    >
      <header className="audio-player__header">
        <div className="audio-player__brand-row">
          <span className="audio-player__brand">
            Audio Player
          </span>

          <details className="app-menu">
            <summary aria-label="Open player menu">
              <span aria-hidden="true">☰</span>
            </summary>

            <div className="app-menu__panel">
              <details className="settings-menu">
                <summary>Settings</summary>

                <div className="settings-menu__content">
                  <label className="settings-control">
                    <span>Waveform color</span>

                    <select
                      value={colorMode}
                      onChange={(event) => {
                        setColorMode(
                          event.currentTarget
                            .value as WaveformColorMode,
                        );
                      }}
                    >
                      <option value="3band">
                        3Band
                      </option>
                      <option value="rgb">
                        RGB
                      </option>
                      <option value="blue">
                        Blue
                      </option>
                      <option value="monochrome">
                        Monochrome
                      </option>
                    </select>
                  </label>

                  <label className="settings-control">
                    <span>Waveform zoom</span>

                    <select
                      value={pixelsPerSecond}
                      onChange={(event) => {
                        setPixelsPerSecond(
                          Number(
                            event.currentTarget.value,
                          ),
                        );
                      }}
                    >
                      <option value={3}>3 px/s</option>
                      <option value={6}>6 px/s</option>
                      <option value={12}>12 px/s</option>
                      <option value={25}>25 px/s</option>
                      <option value={50}>50 px/s</option>
                      <option value={100}>100 px/s</option>
                      <option value={200}>200 px/s</option>
                      <option value={400}>400 px/s</option>
                      <option value={800}>800 px/s</option>
                      <option value={1600}>1600 px/s</option>
                    </select>
                  </label>

                  <details className="settings-diagnostics">
                    <summary>Diagnostics</summary>

                    {waveform ? (
                      <div
                        className="
                          settings-diagnostics__content
                        "
                      >
                        <section
                          className="metadata-card"
                          aria-labelledby="
                            waveform-analysis-heading
                          "
                        >
                          <h3 id="waveform-analysis-heading">
                            Waveform analysis
                          </h3>

                          <dl>
                            <dt>Sample rate</dt>
                            <dd>
                              {waveform.sampleRate
                                .toLocaleString()} Hz
                            </dd>

                            <dt>FFT size</dt>
                            <dd>
                              {waveform.analysis.fftSize}
                            </dd>

                            <dt>Window</dt>
                            <dd>
                              {waveform.analysis.window}
                            </dd>

                            <dt>Peaks per second</dt>
                            <dd>
                              {waveform.peaksPerSecond}
                            </dd>

                            <dt>Peak count</dt>
                            <dd>
                              {waveform.peakCount
                                .toLocaleString()}
                            </dd>
                          </dl>
                        </section>

                        <section
                          className="metadata-card"
                          aria-labelledby="
                            frequency-bands-heading
                          "
                        >
                          <h3 id="frequency-bands-heading">
                            Frequency bands
                          </h3>

                          <dl>
                            <dt>Low</dt>
                            <dd>
                              {
                                waveform.analysis
                                  .bandsHz.low[0]
                              }–
                              {
                                waveform.analysis
                                  .bandsHz.low[1]
                              } Hz
                            </dd>

                            <dt>Mid</dt>
                            <dd>
                              {
                                waveform.analysis
                                  .bandsHz.mid[0]
                              }–
                              {
                                waveform.analysis
                                  .bandsHz.mid[1]
                              } Hz
                            </dd>

                            <dt>High</dt>
                            <dd>
                              {
                                waveform.analysis
                                  .bandsHz.high[0]
                              }–
                              {
                                waveform.analysis
                                  .bandsHz.high[1]
                              } Hz
                            </dd>
                          </dl>
                        </section>

                        <section
                          className="metadata-card"
                          aria-labelledby="
                            normalization-heading
                          "
                        >
                          <h3 id="normalization-heading">
                            Normalization
                          </h3>

                          <dl>
                            <dt>Method</dt>
                            <dd>
                              {
                                waveform.analysis
                                  .normalization.method
                              }
                            </dd>

                            <dt>Percentile</dt>
                            <dd>
                              {
                                waveform.analysis
                                  .normalization
                                  .percentile
                              }
                            </dd>

                            <dt>Compression</dt>
                            <dd>
                              {
                                waveform.analysis
                                  .normalization
                                  .compression
                              }
                            </dd>
                          </dl>
                        </section>
                      </div>
                    ) : (
                      <p className="settings-menu__status">
                        Track analysis is loading.
                      </p>
                    )}
                  </details>
                </div>
              </details>
            </div>
          </details>
        </div>

        {selectedTrack ? (
          <div className="audio-player__track-summary">
            <div className="audio-player__track-line">
              <strong>
                {selectedTrack.track.title}
              </strong>

              {waveform ? (
                <span className="audio-player__duration">
                  {formatTime(waveform.durationSeconds)}
                </span>
              ) : null}
            </div>

            <span className="audio-player__release">
              {selectedTrack.release.title}
            </span>
          </div>
        ) : null}
      </header>

      <div className="player-layout">
        <aside
          className="artwork-panel"
          aria-label="Track artwork navigation"
        >
          <div
            className="artwork-stack"
            data-swipe-direction={
              artworkSwipeDirection
            }
            data-swipe-promoted={
              artworkIsPromoted ? "true" : "false"
            }
            data-swipe-committing={
              artworkCommitDirection ? "true" : "false"
            }
            data-commit-direction={
              artworkCommitDirection ?? "none"
            }
            style={
              {
                "--artwork-drag-x":
                  `${artworkDragOffset}px`,
                "--artwork-drag-rotation":
                  `${artworkDragOffset * 0.015}deg`,
                "--artwork-drag-progress":
                  artworkDragProgress,
                "--artwork-visual-progress":
                  artworkVisualProgress,
                "--artwork-previous-progress":
                  previousArtworkProgress,
                "--artwork-next-progress":
                  nextArtworkProgress,
                "--artwork-active-progress":
                  activeArtworkProgress,
              } as CSSProperties
            }
          >
            {previousPreviousTrack &&
            previousPreviousArtworkSource ? (
              <button
                type="button"
                className="
                  artwork-stack__item
                  artwork-stack__item--far-previous
                "
                onClick={() => {
                  setSelectedTrackKey(
                    previousPreviousTrack.key,
                  );
                }}
                aria-label={`Earlier track: ${
                  previousPreviousTrack.track.title
                }`}
                title={`Earlier: ${
                  previousPreviousTrack.track.title
                }`}
              >
                <img
                  src={previousPreviousArtworkSource}
                  alt=""
                  aria-hidden="true"
                />
              </button>
            ) : null}

            {previousTrack && previousArtworkSource ? (
              <button
                type="button"
                className="
                  artwork-stack__item
                  artwork-stack__item--previous
                "
                onClick={selectPreviousTrack}
                aria-label={`Previous track: ${
                  previousTrack.track.title
                }`}
                title={`Previous: ${
                  previousTrack.track.title
                }`}
              >
                <img
                  src={previousArtworkSource}
                  alt=""
                  aria-hidden="true"
                />
              </button>
            ) : null}

            <div
              className={[
                "artwork-stack__item",
                "artwork-stack__item--current",
                isDraggingArtwork
                  ? "artwork-stack__item--dragging"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onPointerDown={handleArtworkPointerDown}
              onPointerMove={handleArtworkPointerMove}
              onPointerUp={handleArtworkPointerEnd}
              onPointerCancel={handleArtworkPointerCancel}
              onLostPointerCapture={
                handleArtworkLostPointerCapture
              }
            >
              {artworkSource ? (
                <img
                  src={artworkSource}
                  alt={`${
                    selectedTrack?.track.title ?? "Track"
                  } artwork`}
                />
              ) : (
                <div className="artwork-placeholder">
                  No artwork
                </div>
              )}
            </div>

            {nextTrack && nextArtworkSource ? (
              <button
                type="button"
                className="
                  artwork-stack__item
                  artwork-stack__item--next
                "
                onClick={selectNextTrack}
                aria-label={`Next track: ${
                  nextTrack.track.title
                }`}
                title={`Next: ${nextTrack.track.title}`}
              >
                <img
                  src={nextArtworkSource}
                  alt=""
                  aria-hidden="true"
                />
              </button>
            ) : null}

            {nextNextTrack && nextNextArtworkSource ? (
              <button
                type="button"
                className="
                  artwork-stack__item
                  artwork-stack__item--far-next
                "
                onClick={() => {
                  setSelectedTrackKey(nextNextTrack.key);
                }}
                aria-label={`Later track: ${
                  nextNextTrack.track.title
                }`}
                title={`Later: ${
                  nextNextTrack.track.title
                }`}
              >
                <img
                  src={nextNextArtworkSource}
                  alt=""
                  aria-hidden="true"
                />
              </button>
            ) : null}

            {committedArtworkSource ? (
              <div
                className="artwork-stack__commit-overlay"
                aria-hidden="true"
              >
                <img
                  src={committedArtworkSource}
                  alt=""
                />
              </div>
            ) : null}
          </div>
        </aside>

        <div className="player-layout__main">
      <audio
        ref={audioRef}
        src={audioSource ?? undefined}
        preload="metadata"
        onCanPlay={(event) => {
          if (
            !resumePlaybackAfterTrackChangeRef.current
          ) {
            return;
          }

          resumePlaybackAfterTrackChangeRef.current =
            false;

          void event.currentTarget.play();
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(event) => {
          setCurrentTime(event.currentTarget.currentTime);
        }}
      />

      <div className="player-controls">
        <div
          className="player-controls__transport"
          aria-label="Playback controls"
        >
          <button
            type="button"
            className="player-controls__track-button"
            onClick={selectPreviousTrack}
            disabled={playableTracks.length < 2}
            aria-label="Previous track"
            title="Previous track"
          >
            Previous
          </button>

          <button
            className="player-controls__play-button"
            type="button"
            onClick={togglePlayback}
            disabled={!audioSource || !waveform}
          >
            {isPlaying ? "Pause" : "Play"}
          </button>

          <button
            type="button"
            className="player-controls__track-button"
            onClick={selectNextTrack}
            disabled={playableTracks.length < 2}
            aria-label="Next track"
            title="Next track"
          >
            Next
          </button>
        </div>

        <label className="player-controls__field">
          <span>Track</span>

          <select
            value={selectedTrackKey}
            disabled={!catalog || playableTracks.length === 0}
            onChange={(event) => {
              setSelectedTrackKey(
                event.currentTarget.value,
              );
            }}
          >
            {catalog?.releases.map((release) => {
              const playableReleaseTracks =
                release.tracks.filter(
                  (track) => track.playable,
                );

              if (playableReleaseTracks.length === 0) {
                return null;
              }

              return (
                <optgroup
                  key={release.id}
                  label={release.title}
                >
                  {playableReleaseTracks.map((track) => {
                    const trackNumber =
                      track.trackNumber !== null
                        ? `${track.trackNumber
                            .toString()
                            .padStart(2, "0")}. `
                        : "";

                    return (
                      <option
                        key={getTrackKey(release, track)}
                        value={getTrackKey(release, track)}
                      >
                        {trackNumber}
                        {track.title}
                      </option>
                    );
                  })}
                </optgroup>
              );
            })}
          </select>
        </label>

      </div>

      {loadError ? (
        <p role="alert">{loadError}</p>
      ) : null}

      {waveform ? (
        <>
          <div className="waveform-panel">
            <WaveformCanvas
              peaks={waveform.peaks}
              audioRef={audioRef}
              isPlaying={isPlaying}
              colorMode={colorMode}
              pixelsPerSecond={pixelsPerSecond}
              peaksPerSecond={waveform.peaksPerSecond}
            />

            <output
              className="waveform-panel__current-time"
              aria-label="Current playback time"
            >
              {formatTime(currentTime)}
            </output>

            <div
              className="waveform-panel__zoom-controls"
              aria-label="Waveform zoom controls"
            >
              <button
                type="button"
                className="
                  waveform-panel__zoom-button
                  waveform-panel__zoom-button--increase
                "
                onClick={increaseWaveformZoom}
                disabled={
                  pixelsPerSecond >=
                  waveformZoomSteps[
                    waveformZoomSteps.length - 1
                  ]
                }
                aria-label="Zoom waveform in"
                title="Zoom waveform in"
              >
                +
              </button>

              <button
                type="button"
                className="
                  waveform-panel__zoom-button
                  waveform-panel__zoom-button--decrease
                "
                onClick={decreaseWaveformZoom}
                disabled={
                  pixelsPerSecond <=
                  waveformZoomSteps[0]
                }
                aria-label="Zoom waveform out"
                title="Zoom waveform out"
              >
                −
              </button>
            </div>
          </div>

        </>
      ) : !loadError ? (
        <p>Loading track data…</p>
      ) : null}
        </div>
      </div>
    </section>
  );
}
