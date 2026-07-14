// React imports
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import LibraryBrowser from "./LibraryBrowser";
import MetadataViewer, {
  type MetadataVerbosity,
} from "./MetadataViewer";
import OscilloscopeCanvas from "./OscilloscopeCanvas";
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

type WaveformViewMode =
  | "waveform"
  | "oscilloscope";

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

type ArtworkTransportIconName =
  | "previous"
  | "play"
  | "pause"
  | "next";

/*
 * Keep transport icons inline and SVG-based so they remain sharp at
 * every responsive artwork size.
 */
function ArtworkTransportIcon({
  name,
}: {
  name: ArtworkTransportIconName;
}) {
  return (
    <span
      className="artwork-stack__transport-icon"
      aria-hidden="true"
    >
      <svg viewBox="0 0 48 48" focusable="false">
        {name === "previous" ? (
          <path d="M34 9 14 24l20 15Z" />
        ) : null}

        {name === "play" ? (
          <path d="M16 9 37 24 16 39Z" />
        ) : null}

        {name === "pause" ? (
          <>
            <rect x="14" y="10" width="7" height="28" rx="2" />
            <rect x="27" y="10" width="7" height="28" rx="2" />
          </>
        ) : null}

        {name === "next" ? (
          <path d="m14 9 20 15-20 15Z" />
        ) : null}
      </svg>
    </span>
  );
}

const APP_VERSION = '1.0.0';

export default function AudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /*
   * A MediaElementAudioSourceNode can only be created once for an
   * audio element, so retain the complete Web Audio graph in refs.
   */
  const audioContextRef =
    useRef<AudioContext | null>(null);
  const mediaSourceRef =
    useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef =
    useRef<AnalyserNode | null>(null);

  // Restore focus to these triggers after closing overlays.
  const metadataButtonRef =
    useRef<HTMLButtonElement | null>(null);
  const libraryButtonRef =
    useRef<HTMLButtonElement | null>(null);
  const librarySheetRef =
    useRef<HTMLDivElement | null>(null);

  // Close the hamburger menu when interaction moves elsewhere.
  const appMenuRef =
    useRef<HTMLDetailsElement | null>(null);

  /*
   * Developer Mode remains hidden until the About card is held.
   * The timer and pointer origin distinguish a hold from scrolling.
   */
  const aboutHoldTimerRef =
    useRef<number | null>(null);

  const aboutHoldPointerRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);

  const [
    isDeveloperControlVisible,
    setIsDeveloperControlVisible,
  ] = useState(false);

  // Open the metadata viewer in its friendly listener-facing mode.
  const [isMetadataViewerOpen, setIsMetadataViewerOpen] =
    useState(false);
  const [isLibraryOpen, setIsLibraryOpen] =
    useState(false);
  const [
    metadataVerbosity,
    setMetadataVerbosity,
  ] = useState<MetadataVerbosity>("summary");

  // Optional metadata views controlled from the settings menu.
  const [isAudiophileMode, setIsAudiophileMode] =
    useState(false);
  const [isDeveloperMode, setIsDeveloperMode] =
    useState(false);

  /*
   * Track-loading actions update the audio element directly inside
   * the originating click, double-click, or pointer gesture.
   *
   * This ref identifies the source already assigned imperatively so
   * React effects do not reload it and abort a pending play request.
   */
  const loadedAudioTrackKeyRef = useRef("");

  // Track horizontal artwork drag gestures independently of playback.
  const artworkPointerIdRef = useRef<number | null>(null);
  const artworkStartXRef = useRef(0);
  const artworkStartYRef = useRef(0);
  const artworkGestureAxisRef =
    useRef<"horizontal" | "vertical" | null>(null);
  const artworkCommitPendingRef = useRef(false);

  // Prevent pointer-generated clicks after horizontal artwork swipes.
  const artworkSuppressClickRef = useRef(false);

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

  /*
   * Library highlighting is independent from the loaded player
   * track. A single click can inspect another row without stopping
   * or replacing the track currently playing.
   */
  const [libraryTrackKey, setLibraryTrackKey] =
    useState("");

  // Player state.
  const [isPlaying, setIsPlaying] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
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

  // Oscilloscope is the visualization stage beyond maximum zoom.
  const [
    waveformViewMode,
    setWaveformViewMode,
  ] = useState<WaveformViewMode>("waveform");

  const [
    analyserNode,
    setAnalyserNode,
  ] = useState<AnalyserNode | null>(null);

  const lastWaveformZoomRef = useRef(100);

  /*
   * Smaller sample windows magnify progressively shorter slices of
   * the live signal while leaving audio speed and pitch unchanged.
   */
  const oscilloscopeSampleWindows = [
    2048,
    1024,
    512,
    256,
    128,
  ] as const;

  const [
    oscilloscopeSampleWindow,
    setOscilloscopeSampleWindow,
  ] = useState<number>(
    oscilloscopeSampleWindows[0],
  );

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

  /*
   * Native details elements do not close when users click elsewhere.
   * Close the application menu whenever a pointer press occurs
   * outside the complete hamburger menu and its panel.
   */
  useEffect(() => {
    function handleOutsidePointerDown(
      event: PointerEvent,
    ) {
      const menu = appMenuRef.current;
      const target = event.target;

      if (
        !menu ||
        !menu.open ||
        !(target instanceof Node) ||
        menu.contains(target)
      ) {
        return;
      }

      menu.open = false;
    }

    document.addEventListener(
      "pointerdown",
      handleOutsidePointerDown,
    );

    return () => {
      document.removeEventListener(
        "pointerdown",
        handleOutsidePointerDown,
      );
    };
  }, []);

  /*
   * Focus the mobile library sheet when opened, close it with Escape,
   * and restore focus to its launcher afterward.
   */
  useEffect(() => {
    if (!isLibraryOpen) {
      return;
    }

    librarySheetRef.current?.focus();

    function handleLibraryKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      setIsLibraryOpen(false);

      window.requestAnimationFrame(() => {
        libraryButtonRef.current?.focus();
      });
    }

    document.addEventListener(
      "keydown",
      handleLibraryKeyDown,
    );

    return () => {
      document.removeEventListener(
        "keydown",
        handleLibraryKeyDown,
      );
    };
  }, [isLibraryOpen]);

  /*
   * Cancel an unfinished About-card hold when the player unmounts.
   */
  useEffect(() => {
    return () => {
      clearAboutHoldTimer();
    };
  }, []);

  /*
   * Release Web Audio resources only when the complete player
   * component is removed, not when individual tracks change.
   */
  useEffect(() => {
    return () => {
      const audioContext = audioContextRef.current;

      if (
        audioContext &&
        audioContext.state !== "closed"
      ) {
        void audioContext.close();
      }
    };
  }, []);

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
    if (playableTracks.length === 0) {
      return;
    }

    const firstTrackKey = playableTracks[0].key;

    if (
      !playableTracks.some(
        (entry) => entry.key === selectedTrackKey,
      )
    ) {
      setSelectedTrackKey(firstTrackKey);
    }

    if (
      !playableTracks.some(
        (entry) => entry.key === libraryTrackKey,
      )
    ) {
      setLibraryTrackKey(firstTrackKey);
    }
  }, [
    libraryTrackKey,
    playableTracks,
    selectedTrackKey,
  ]);

  /*
   * Whenever playback navigation genuinely loads another track,
   * move the library highlight to that track as well. Library-only
   * highlighting does not modify selectedTrackKey, so it remains
   * independent until playback or navigation is requested.
   */
  useEffect(() => {
    if (selectedTrackKey) {
      setLibraryTrackKey(selectedTrackKey);
    }
  }, [selectedTrackKey]);

  /*
   * Load the selected track's waveform whenever the player changes
   * tracks. Audio transport is handled separately by loadTrack().
   */
  useEffect(() => {
    const controller = new AbortController();

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

  /*
   * Initialize the first catalog track and cover any future
   * state-only track changes. Tracks already loaded by loadTrack()
   * are deliberately left untouched.
   */
  useEffect(() => {
    const audio = audioRef.current;

    if (
      !audio ||
      !audioSource ||
      !selectedTrackKey ||
      loadedAudioTrackKeyRef.current === selectedTrackKey
    ) {
      return;
    }

    loadedAudioTrackKeyRef.current = selectedTrackKey;

    audio.pause();
    audio.src = audioSource;
    audio.currentTime = 0;
    audio.load();

    setIsPlaying(false);
    setCurrentTime(0);
  }, [audioSource, selectedTrackKey]);

  const artworkSource =
    catalog && selectedTrack
      ? getMediaUrl(
          catalog.mediaBaseUrl,
          selectedTrack.track.artwork?.path ?? null,
        )
      : null;

  const previousArtworkSource =
    catalog && previousTrack
      ? getMediaUrl(
          catalog.mediaBaseUrl,
          previousTrack.track.artwork?.path ?? null,
        )
      : null;

  const nextArtworkSource =
    catalog && nextTrack
      ? getMediaUrl(
          catalog.mediaBaseUrl,
          nextTrack.track.artwork?.path ?? null,
        )
      : null;

  const previousPreviousArtworkSource =
    catalog && previousPreviousTrack
      ? getMediaUrl(
          catalog.mediaBaseUrl,
          previousPreviousTrack.track.artwork?.path ?? null,
        )
      : null;

  const nextNextArtworkSource =
    catalog && nextNextTrack
      ? getMediaUrl(
          catalog.mediaBaseUrl,
          nextNextTrack.track.artwork?.path ?? null,
        )
      : null;


  /*
   * Change the media source synchronously inside the initiating user
   * gesture. This preserves autoplay permission on mobile browsers
   * and avoids a later React effect pausing the destination track.
   */
  function loadTrack(
    trackKey: string,
    autoplay: boolean,
  ) {
    if (!catalog) {
      return;
    }

    const destination = playableTracks.find(
      (entry) => entry.key === trackKey,
    );

    const audio = audioRef.current;

    if (!destination || !audio) {
      return;
    }

    const destinationAudioUrl = getMediaUrl(
      catalog.mediaBaseUrl,
      destination.track.assets.audioPlayback,
    );

    if (!destinationAudioUrl) {
      return;
    }

    setLibraryTrackKey(trackKey);

    /*
     * Loading a different source always begins at zero. A deliberate
     * non-autoplay selection remains paused.
     */
    audio.pause();

    loadedAudioTrackKeyRef.current = trackKey;
    audio.src = destinationAudioUrl;
    audio.currentTime = 0;
    audio.load();

    setIsPlaying(false);
    setCurrentTime(0);
    setSelectedTrackKey(trackKey);

    if (autoplay) {
      /*
       * Begin both operations directly from the original gesture.
       * Neither waits for React rendering or a later media event.
       */
      void ensureAudioAnalyser();

      void audio.play().catch((error: unknown) => {
        console.error(
          "Unable to begin destination-track playback:",
          error,
        );
      });
    }
  }

  function selectAdjacentTrack(direction: -1 | 1) {
    if (!selectedTrack || playableTracks.length < 2) {
      return;
    }

    const audio = audioRef.current;

    const shouldAutoplay =
      isPlaying || Boolean(audio && !audio.paused);

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

    loadTrack(
      playableTracks[nextIndex].key,
      shouldAutoplay,
    );
  }

  function selectPreviousTrack() {
    selectAdjacentTrack(-1);
  }

  function selectNextTrack() {
    selectAdjacentTrack(1);
  }

  function selectArtworkTrack(trackKey: string) {
    const audio = audioRef.current;

    const shouldAutoplay =
      isPlaying || Boolean(audio && !audio.paused);

    loadTrack(trackKey, shouldAutoplay);
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
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (playableTracks.length < 2) {
      return;
    }

    artworkPointerIdRef.current = event.pointerId;
    artworkStartXRef.current = event.clientX;
    artworkStartYRef.current = event.clientY;
    artworkGestureAxisRef.current = null;
    artworkSuppressClickRef.current = false;

    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDraggingArtwork(true);
  }

  function handleArtworkPointerMove(
    event: ReactPointerEvent<HTMLButtonElement>,
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
        artworkSuppressClickRef.current = true;

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
    event: ReactPointerEvent<HTMLButtonElement>,
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
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (
      artworkPointerIdRef.current !== event.pointerId
    ) {
      return;
    }

    resetArtworkGesture();
  }

  function handleArtworkLostPointerCapture(
    event: ReactPointerEvent<HTMLButtonElement>,
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

  /*
   * Lazily create the Web Audio graph after a user gesture. Browsers
   * commonly prevent AudioContext startup before user interaction.
   */
  async function ensureAudioAnalyser(): Promise<
    AnalyserNode | null
  > {
    const audio = audioRef.current;

    if (!audio) {
      return null;
    }

    const existingAnalyser = analyserRef.current;
    const existingContext = audioContextRef.current;

    if (existingAnalyser && existingContext) {
      if (existingContext.state === "suspended") {
        await existingContext.resume();
      }

      return existingAnalyser;
    }

    const AudioContextConstructor =
      window.AudioContext ??
      (
        window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;

    if (!AudioContextConstructor) {
      return null;
    }

    const audioContext =
      new AudioContextConstructor();

    const mediaSource =
      audioContext.createMediaElementSource(audio);

    const analyser =
      audioContext.createAnalyser();

    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.72;

    mediaSource.connect(analyser);
    analyser.connect(audioContext.destination);

    audioContextRef.current = audioContext;
    mediaSourceRef.current = mediaSource;
    analyserRef.current = analyser;

    setAnalyserNode(analyser);

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    return analyser;
  }

  async function togglePlayback() {
    const audio = audioRef.current;

    if (!audio || !audioSource) {
      return;
    }

    if (audio.paused) {
      await ensureAudioAnalyser();
      await audio.play();
    } else {
      audio.pause();
    }
  }

  /*
   * Double-clicking or double-tapping a row always requests playback.
   */
  async function playLibraryTrack(
    trackKey: string,
  ) {
    setLibraryTrackKey(trackKey);

    if (trackKey !== selectedTrackKey) {
      loadTrack(trackKey, true);
      return;
    }

    const audio = audioRef.current;

    if (!audio || !audioSource) {
      return;
    }

    /*
     * A repeated play request from the library means restart, not
     * merely resume. This applies to desktop double-click and mobile
     * double-tap because both use playLibraryTrack().
     */
    audio.currentTime = 0;
    setCurrentTime(0);

    await audio.play();
    await ensureAudioAnalyser();
  }

  /*
   * Row transport buttons toggle the loaded track or immediately
   * load and play a different row.
   */
  async function toggleLibraryTrackPlayback(
    trackKey: string,
  ) {
    setLibraryTrackKey(trackKey);

    if (trackKey !== selectedTrackKey) {
      loadTrack(trackKey, true);
      return;
    }

    await togglePlayback();
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
  const waveformZoomSteps = [2, 3, 6, 12, 25, 50, 100, 200, 400, 800, 1600, 2400, 3200, 4000, 4800, 5600, 6400];
  const waveformZoomIndex =
    waveformZoomSteps.indexOf(pixelsPerSecond);

  function decreaseWaveformZoom() {
    if (waveformViewMode === "oscilloscope") {
      const currentIndex =
        oscilloscopeSampleWindows.indexOf(
          oscilloscopeSampleWindow as
            (typeof oscilloscopeSampleWindows)[number],
        );

      /*
       * Widen the oscilloscope first. One more minus press from the
       * widest stage returns to the saved scrolling waveform zoom.
       */
      if (currentIndex > 0) {
        setOscilloscopeSampleWindow(
          oscilloscopeSampleWindows[
            currentIndex - 1
          ],
        );
        return;
      }

      setWaveformViewMode("waveform");
      setPixelsPerSecond(
        lastWaveformZoomRef.current,
      );
      return;
    }

    const currentIndex =
      waveformZoomIndex >= 0 ? waveformZoomIndex : 1;

    const nextZoom =
      waveformZoomSteps[
        Math.max(0, currentIndex - 1)
      ];

    lastWaveformZoomRef.current = nextZoom;
    setPixelsPerSecond(nextZoom);
  }

  function increaseWaveformZoom() {
    if (waveformViewMode === "oscilloscope") {
      const currentIndex =
        oscilloscopeSampleWindows.indexOf(
          oscilloscopeSampleWindow as
            (typeof oscilloscopeSampleWindows)[number],
        );

      const maximumIndex =
        oscilloscopeSampleWindows.length - 1;

      if (
        currentIndex >= 0 &&
        currentIndex < maximumIndex
      ) {
        setOscilloscopeSampleWindow(
          oscilloscopeSampleWindows[
            currentIndex + 1
          ],
        );
      }

      return;
    }

    const currentIndex =
      waveformZoomIndex >= 0 ? waveformZoomIndex : 1;

    const maximumIndex =
      waveformZoomSteps.length - 1;

    /*
     * Continue beyond maximum waveform zoom into the widest
     * oscilloscope stage.
     */
    if (currentIndex >= maximumIndex) {
      lastWaveformZoomRef.current =
        pixelsPerSecond;

      setOscilloscopeSampleWindow(
        oscilloscopeSampleWindows[0],
      );
      setWaveformViewMode("oscilloscope");
      return;
    }

    const nextZoom =
      waveformZoomSteps[currentIndex + 1];

    lastWaveformZoomRef.current = nextZoom;
    setPixelsPerSecond(nextZoom);
  }

  function clearAboutHoldTimer() {
    if (aboutHoldTimerRef.current !== null) {
      window.clearTimeout(aboutHoldTimerRef.current);
      aboutHoldTimerRef.current = null;
    }
  }

  function handleAboutPointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    clearAboutHoldTimer();

    aboutHoldPointerRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };

    aboutHoldTimerRef.current =
      window.setTimeout(() => {
        const heldPointer =
          aboutHoldPointerRef.current;

        if (
          !heldPointer ||
          heldPointer.pointerId !== event.pointerId
        ) {
          return;
        }

        setIsDeveloperControlVisible(
          (isVisible) => !isVisible,
        );

        aboutHoldPointerRef.current = null;
        clearAboutHoldTimer();
      }, 650);
  }

  function handleAboutPointerMove(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    const heldPointer =
      aboutHoldPointerRef.current;

    if (
      !heldPointer ||
      heldPointer.pointerId !== event.pointerId
    ) {
      return;
    }

    const movedX =
      Math.abs(event.clientX - heldPointer.startX);

    const movedY =
      Math.abs(event.clientY - heldPointer.startY);

    if (movedX > 10 || movedY > 10) {
      aboutHoldPointerRef.current = null;
      clearAboutHoldTimer();
    }
  }

  function finishAboutPointer(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (
      aboutHoldPointerRef.current?.pointerId ===
      event.pointerId
    ) {
      aboutHoldPointerRef.current = null;
    }

    clearAboutHoldTimer();
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

          <details
            ref={appMenuRef}
            className="app-menu"
          >
            <summary aria-label="Open player menu">
              <span aria-hidden="true">☰</span>
            </summary>

            <div className="app-menu__panel">
              <div className="app-menu__content">
              <label className="settings-control">
                <span>Waveform Color</span>

                <select
                  value={colorMode}
                  onChange={(event) => {
                    setColorMode(
                      event.currentTarget
                        .value as WaveformColorMode,
                    );
                  }}
                >
                  <option value="3band">3Band</option>
                  <option value="rgb">RGB</option>
                  <option value="blue">Blue</option>
                  <option value="monochrome">
                    Monochrome
                  </option>
                </select>
              </label>

              <label className="settings-control">
                <span>Waveform Zoom</span>

                <select
                  value={pixelsPerSecond}
                  onChange={(event) => {
                    const nextZoom = Number(
                      event.currentTarget.value,
                    );

                    lastWaveformZoomRef.current =
                      nextZoom;

                    setPixelsPerSecond(nextZoom);
                    setWaveformViewMode("waveform");
                  }}
                >
                  <option value={2}>2 px/s</option>
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
                  <option value={2400}>2400 px/s</option>
                  <option value={3200}>3200 px/s</option>
                  <option value={4000}>4000 px/s</option>
                  <option value={4800}>4800 px/s</option>
                  <option value={5600}>5600 px/s</option>
                  <option value={6400}>6400 px/s</option>
                </select>
              </label>

              <label className="settings-control">
                <span>Waveform View</span>

                <select
                  value={waveformViewMode}
                  onChange={(event) => {
                    const nextMode =
                      event.currentTarget
                        .value as WaveformViewMode;

                    if (nextMode === "oscilloscope") {
                      lastWaveformZoomRef.current =
                        pixelsPerSecond;

                      setOscilloscopeSampleWindow(
                        oscilloscopeSampleWindows[0],
                      );
                    } else {
                      setPixelsPerSecond(
                        lastWaveformZoomRef.current,
                      );
                    }

                    setWaveformViewMode(nextMode);
                  }}
                >
                  <option value="waveform">
                    Scrolling waveform
                  </option>

                  <option value="oscilloscope">
                    Oscilloscope
                  </option>
                </select>
              </label>

              <label
                className="
                  settings-toggle
                  settings-toggle--audiophile
                "
              >
                <span>
                  <strong>Audiophile Mode</strong>

                  <small>
                    Show technical audio and waveform metadata.
                  </small>
                </span>

                <input
                  type="checkbox"
                  checked={isAudiophileMode}
                  onChange={(event) => {
                    setIsAudiophileMode(
                      event.currentTarget.checked,
                    );
                  }}
                />
              </label>

              <button
                type="button"
                className="app-menu__about-button"
                aria-label="About this audio player"
                title="Press and hold to show or hide Developer Mode"
                onPointerDown={handleAboutPointerDown}
                onPointerMove={handleAboutPointerMove}
                onPointerUp={finishAboutPointer}
                onPointerCancel={finishAboutPointer}
                onPointerLeave={(event) => {
                  if (event.pointerType === "mouse") {
                    finishAboutPointer(event);
                  }
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                }}
              >
                <span>
                  <strong>About</strong>

                  <small>
                    Audio Player version {APP_VERSION}
                  </small>

                  <small>
                    Developer: nbrenton@gmail.com
                  </small>
                </span>
              </button>

              {isDeveloperControlVisible ? (
                <label
                  className="
                    settings-toggle
                    settings-toggle--developer
                  "
                >
                  <span>
                    <strong>Developer Mode</strong>

                    <small>
                      Show source indicators and raw metadata.
                    </small>
                  </span>

                  <input
                    type="checkbox"
                    checked={isDeveloperMode}
                    onChange={(event) => {
                      setIsDeveloperMode(
                        event.currentTarget.checked,
                      );
                    }}
                  />
                </label>
              ) : null}
            </div>
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
                  selectArtworkTrack(
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

            <button
              type="button"
              className={[
                "artwork-stack__item",
                "artwork-stack__item--current",
                isDraggingArtwork
                  ? "artwork-stack__item--dragging"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                if (artworkSuppressClickRef.current) {
                  artworkSuppressClickRef.current = false;
                  return;
                }

                void togglePlayback();
              }}
              onPointerDown={handleArtworkPointerDown}
              onPointerMove={handleArtworkPointerMove}
              onPointerUp={handleArtworkPointerEnd}
              onPointerCancel={handleArtworkPointerCancel}
              onLostPointerCapture={
                handleArtworkLostPointerCapture
              }
              aria-label={
                isPlaying && !isScrubbing
                  ? "Pause track"
                  : "Play track"
              }
              aria-pressed={isPlaying && !isScrubbing}
              aria-disabled={!audioSource || !waveform}
              title={
                isPlaying && !isScrubbing
                  ? "Pause"
                  : "Play"
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

              <ArtworkTransportIcon
                name={
                  isPlaying && !isScrubbing
                    ? "pause"
                    : "play"
                }
              />
            </button>

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
                  selectArtworkTrack(nextNextTrack.key);
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

            {previousTrack ? (
              <button
                type="button"
                className="
                  artwork-stack__edge-control
                  artwork-stack__edge-control--previous
                "
                onClick={selectPreviousTrack}
                aria-label={`Previous track: ${
                  previousTrack.track.title
                }`}
                title={`Previous: ${
                  previousTrack.track.title
                }`}
              >
                <ArtworkTransportIcon name="previous" />
              </button>
            ) : null}

            {nextTrack ? (
              <button
                type="button"
                className="
                  artwork-stack__edge-control
                  artwork-stack__edge-control--next
                "
                onClick={selectNextTrack}
                aria-label={`Next track: ${
                  nextTrack.track.title
                }`}
                title={`Next: ${nextTrack.track.title}`}
              >
                <ArtworkTransportIcon name="next" />
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
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(event) => {
          setCurrentTime(event.currentTarget.currentTime);
        }}
      />

      <div className="player-controls">
        <div className="player-controls__track-selector">
          <button
            ref={libraryButtonRef}
            type="button"
            className="player-controls__library-button"
            disabled={!catalog || playableTracks.length === 0}
            aria-haspopup="dialog"
            aria-expanded={isLibraryOpen}
            onClick={() => {
              setLibraryTrackKey(selectedTrackKey);
              setIsLibraryOpen(true);
            }}
          >
            <span className="player-controls__library-label">
              Browse Library
            </span>

            <span className="player-controls__library-summary">
              {selectedTrack
                ? `${selectedTrack.track.title} · ${
                    selectedTrack.release.title
                  }`
                : "Choose a track"}
            </span>

            <span
              className="player-controls__library-chevron"
              aria-hidden="true"
            >
              ▾
            </span>
          </button>

          <label className="
            player-controls__field
            player-controls__field--desktop-track
          ">
            <span>Track</span>

            <select
              value={selectedTrackKey}
              disabled={!catalog || playableTracks.length === 0}
              onChange={(event) => {
                const trackKey =
                  event.currentTarget.value;

                loadTrack(trackKey, false);
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

          <button
            ref={metadataButtonRef}
            type="button"
            className="player-controls__metadata-button"
            aria-label="View selected track metadata"
            title="Track information"
            disabled={!selectedTrack}
            onClick={() => {
              setIsMetadataViewerOpen(true);
            }}
          >
            <span aria-hidden="true">i</span>
          </button>
        </div>
      </div>

      {isLibraryOpen ? (
        <div
          className="library-sheet__backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target !== event.currentTarget) {
              return;
            }

            /*
             * Consume the complete backdrop click before removing the
             * overlay so it cannot activate the artwork underneath.
             */
            event.preventDefault();
            event.stopPropagation();

            setIsLibraryOpen(false);

            window.requestAnimationFrame(() => {
              libraryButtonRef.current?.focus();
            });
          }}
        >
          <div
            ref={librarySheetRef}
            className="library-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="library-sheet-title"
            tabIndex={-1}
          >
            <header className="library-sheet__header">
              <div>
                <span className="library-sheet__eyebrow">
                  Music Library
                </span>

                <h2 id="library-sheet-title">
                  Browse releases and tracks
                </h2>
              </div>

              <button
                type="button"
                className="library-sheet__close-button"
                aria-label="Close music library"
                onClick={() => {
                  setIsLibraryOpen(false);

                  window.requestAnimationFrame(() => {
                    libraryButtonRef.current?.focus();
                  });
                }}
              >
                ×
              </button>
            </header>

            <div className="library-sheet__content">
              <LibraryBrowser
                variant="mobile"
                catalog={catalog}
                selectedTrackKey={libraryTrackKey}
                playingTrackKey={
                  isPlaying ? selectedTrackKey : null
                }
                onSelectTrack={(trackKey) => {
                  setLibraryTrackKey(trackKey);
                }}
                onPlayTrack={(trackKey) => {
                  /*
                   * Keep browsing available while the requested track
                   * loads and begins playback.
                   */
                  void playLibraryTrack(trackKey);
                }}
                onToggleTrackPlayback={(trackKey) => {
                  /*
                   * Pause, resume, or begin another track without
                   * dismissing the mobile library.
                   */
                  void toggleLibraryTrackPlayback(trackKey);
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      <MetadataViewer
        isOpen={isMetadataViewerOpen}
        verbosity={metadataVerbosity}
        onVerbosityChange={setMetadataVerbosity}
        audiophileMode={isAudiophileMode}
        developerMode={isDeveloperMode}
        release={selectedTrack?.release ?? null}
        track={selectedTrack?.track ?? null}
        triggerRef={metadataButtonRef}
        onClose={() => {
          setIsMetadataViewerOpen(false);
        }}
      />

      {loadError ? (
        <p role="alert">{loadError}</p>
      ) : null}

      {waveform ? (
        <>
          <div className="waveform-panel">
            {waveformViewMode === "oscilloscope" ? (
              <OscilloscopeCanvas
                analyser={analyserNode}
                audioRef={audioRef}
                isPlaying={isPlaying}
                colorMode={colorMode}
                sampleWindow={
                  oscilloscopeSampleWindow
                }
              />
            ) : (
              <WaveformCanvas
                peaks={waveform.peaks}
                audioRef={audioRef}
                isPlaying={isPlaying}
                colorMode={colorMode}
                pixelsPerSecond={pixelsPerSecond}
                peaksPerSecond={waveform.peaksPerSecond}
                onScrubbingChange={setIsScrubbing}
              />
            )}

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
                  waveformViewMode === "oscilloscope" &&
                  oscilloscopeSampleWindow ===
                    oscilloscopeSampleWindows[
                      oscilloscopeSampleWindows.length - 1
                    ]
                }
                aria-label={
                  waveformViewMode === "oscilloscope"
                    ? oscilloscopeSampleWindow ===
                        oscilloscopeSampleWindows[
                          oscilloscopeSampleWindows.length - 1
                        ]
                      ? "Maximum oscilloscope magnification"
                      : "Magnify oscilloscope"
                    : pixelsPerSecond >=
                        waveformZoomSteps[
                          waveformZoomSteps.length - 1
                        ]
                      ? "Enter oscilloscope"
                      : "Zoom waveform in"
                }
                title={
                  waveformViewMode === "oscilloscope"
                    ? oscilloscopeSampleWindow ===
                        oscilloscopeSampleWindows[
                          oscilloscopeSampleWindows.length - 1
                        ]
                      ? "Maximum oscilloscope magnification"
                      : "Magnify oscilloscope"
                    : pixelsPerSecond >=
                        waveformZoomSteps[
                          waveformZoomSteps.length - 1
                        ]
                      ? "Enter oscilloscope"
                      : "Zoom waveform in"
                }
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
                  waveformViewMode === "waveform" &&
                  pixelsPerSecond <= waveformZoomSteps[0]
                }
                aria-label={
                  waveformViewMode === "oscilloscope"
                    ? oscilloscopeSampleWindow ===
                        oscilloscopeSampleWindows[0]
                      ? "Return to waveform"
                      : "Widen oscilloscope"
                    : "Zoom waveform out"
                }
                title={
                  waveformViewMode === "oscilloscope"
                    ? oscilloscopeSampleWindow ===
                        oscilloscopeSampleWindows[0]
                      ? "Return to waveform"
                      : "Widen oscilloscope"
                    : "Zoom waveform out"
                }
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

        <LibraryBrowser
          catalog={catalog}
          selectedTrackKey={libraryTrackKey}
          playingTrackKey={
            isPlaying ? selectedTrackKey : null
          }
          onSelectTrack={(trackKey) => {
            setLibraryTrackKey(trackKey);
          }}
          onPlayTrack={(trackKey) => {
            void playLibraryTrack(trackKey);
          }}
          onToggleTrackPlayback={(trackKey) => {
            void toggleLibraryTrackPlayback(trackKey);
          }}
        />
      </div>
    </section>
  );
}
