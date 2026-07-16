// React imports
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import CompactWaveformCanvas from "./CompactWaveformCanvas";
import LibraryBrowser from "./LibraryBrowser";
import MetadataViewer, {
  type MetadataVerbosity,
} from "./MetadataViewer";
import OscilloscopeCanvas, {
  captureOscilloscopeFrame,
  seedOscilloscopeFrame,
} from "./OscilloscopeCanvas";
import WaveformCanvas, {
  type WaveformColorMode,
} from "./WaveformCanvas";

import type {
  CatalogRelease,
  CatalogTrack,
  MediaCatalog,
} from "../types/MediaCatalog";

import hlLogo from "../assets/hl-logo-graphite.svg";
import packageJsonSource from "../../package.json?raw";

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
 * Convert the visible 0–100 slider into a non-linear amplitude.
 * Squaring gives quieter values more usable adjustment range.
 */
function volumePercentToGain(percent: number): number {
  const normalized = Math.max(
    0,
    Math.min(100, percent),
  ) / 100;

  return normalized * normalized;
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
          <>
            <path d="M35 9 16 24l19 15Z" />

            {/* Universal previous-track marker: |< */}
            <path d="M12 10v28" />
          </>
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
          <>
            <path d="m13 9 19 15-19 15Z" />

            {/* Universal next-track marker: >| */}
            <path d="M36 10v28" />
          </>
        ) : null}
      </svg>
    </span>
  );
}

type VolumeIconLevel =
  | "muted"
  | "low"
  | "medium"
  | "high";

/*
 * Show the current volume range without relying on text glyphs.
 */
function VolumeIcon({
  level,
}: {
  level: VolumeIconLevel;
}) {
  return (
    <svg
      className="audio-player__volume-icon"
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 20h8l10-8v24L16 28H8Z" />

      {level === "low" ||
      level === "medium" ||
      level === "high" ? (
        <path d="M31 20c2 2 2 6 0 8" />
      ) : null}

      {level === "medium" ||
      level === "high" ? (
        <path d="M35 16c5 5 5 11 0 16" />
      ) : null}

      {level === "high" ? (
        <path d="M39 12c8 7 8 17 0 24" />
      ) : null}

      {level === "muted" ? (
        <>
          <path d="m32 19 10 10" />
          <path d="m42 19-10 10" />
        </>
      ) : null}
    </svg>
  );
}

const APP_VERSION = (
  JSON.parse(packageJsonSource) as {
    version: string;
  }
).version;

export default function AudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const volumeControlRef = useRef<HTMLDivElement | null>(null);
  const waveformPanelRef = useRef<HTMLDivElement | null>(null);

  /*
   * Preserve the pre-scrub playback indication while the pointer is
   * moving. The real media state is reconciled after release.
   */
  const scrubDisplayPlayingRef = useRef(false);

  /*
   * React state can lag pointer events by one render. This ref closes
   * that gap so keyboard playback commands cannot race scrubbing.
   */
  const isScrubbingRef = useRef(false);

  const scrubReleaseTimeoutRef =
    useRef<number | null>(null);

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
    useRef<HTMLDivElement | null>(null);

  /*
   * Mirror the native details state so underlying waveform controls
   * can be hidden while the application menu is open.
   */
  const [isAppMenuOpen, setIsAppMenuOpen] =
    useState(false);

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
  const [hasPlaybackEnded, setHasPlaybackEnded] =
    useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  /*
   * Store the user-facing percentage separately from the actual
   * non-linear amplitude assigned to the media element.
   */
  const [volumePercent, setVolumePercent] =
    useState(100);
  const [isVolumeControlOpen, setIsVolumeControlOpen] =
    useState(false);

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
   * Mouse wheels and trackpads emit many small wheel events. Accumulate
   * those deltas so one deliberate gesture advances one zoom step.
   */
  const waveformWheelDeltaRef = useRef(0);
  const waveformWheelDirectionRef = useRef<-1 | 0 | 1>(0);

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

  /*
   * Compact previews reuse the loaded waveform data rather than
   * creating another canvas, analyser, or animation loop.
   */
  /*
   * Compact waveform playheads reuse the existing player-time state.
   * Their canvases redraw only when data, color, or dimensions change.
   */
  const compactWaveformProgress =
    waveform && waveform.durationSeconds > 0
      ? Math.max(
          0,
          Math.min(
            1,
            currentTime / waveform.durationSeconds,
          ),
        )
      : 0;

  const selectedTrackIndex = selectedTrack
    ? playableTracks.findIndex(
        (entry) => entry.key === selectedTrack.key,
      )
    : -1;

  const selectedArtist =
    selectedTrack?.track.metadata.resolved
      .primaryArtist.name ??
    selectedTrack?.track.artist ??
    "Unknown artist";

  const selectedReleaseTitle =
    selectedTrack?.release.title ??
    "Unknown release";

  const displayedTrackNumber =
    selectedTrack?.track.trackNumber ??
    (selectedTrackIndex >= 0
      ? selectedTrackIndex + 1
      : null);

  const audioChannelLabel =
    waveform?.sourceChannels === 1
      ? "Mono"
      : waveform?.sourceChannels === 2
        ? "Stereo"
        : waveform
          ? `${waveform.sourceChannels} channels`
          : "";

  const audiophileHeaderStatus = waveform
    ? `${(waveform.sampleRate / 1000).toFixed(
        waveform.sampleRate % 1000 === 0 ? 0 : 1,
      )} kHz · ${waveform.bitsPerSample}-bit · ${
        audioChannelLabel
      }`
    : "Loading audio data";

  const playbackHeaderStatus = loadError
    ? "Unavailable"
    : !catalog
      ? "Loading library"
      : !selectedTrack
        ? "No playable tracks"
        : !waveform
          ? "Loading track"
          : hasPlaybackEnded
            ? "Stopped"
            : isPlaying
              ? "Playing"
              : currentTime > 0
                ? "Paused"
                : "Ready";

  const displayedIsPlaying = isScrubbing
    ? scrubDisplayPlayingRef.current
    : isPlaying;

  const volumeIconLevel: VolumeIconLevel =
    volumePercent <= 0
      ? "muted"
      : volumePercent < 34
        ? "low"
        : volumePercent < 67
          ? "medium"
          : "high";

  const headerStatus = isAudiophileMode
    ? audiophileHeaderStatus
    : loadError
      ? "Unavailable"
      : !catalog
        ? "Loading library"
        : !selectedTrack
          ? "No playable tracks"
          : !waveform
            ? "Loading track"
            : hasPlaybackEnded
              ? "Stopped"
              : displayedIsPlaying
                ? "Playing"
                : currentTime > 0
                  ? "Paused"
                  : "Ready";

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
   * Apply the perceptual slider curve directly to the shared audio
   * element. Track changes retain the selected volume.
   */
  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    audio.volume =
      volumePercentToGain(volumePercent);
  }, [volumePercent]);

  /*
   * Close the vertical volume control when interaction moves away
   * from it or when Escape is pressed.
   */
  useEffect(() => {
    if (!isVolumeControlOpen) {
      return;
    }

    function handleVolumePointerDown(
      event: PointerEvent,
    ) {
      const control = volumeControlRef.current;
      const target = event.target;

      if (
        control &&
        target instanceof Node &&
        !control.contains(target)
      ) {
        setIsVolumeControlOpen(false);
      }
    }

    function handleVolumeKeyDown(
      event: KeyboardEvent,
    ) {
      if (event.key === "Escape") {
        setIsVolumeControlOpen(false);
      }
    }

    document.addEventListener(
      "pointerdown",
      handleVolumePointerDown,
    );

    document.addEventListener(
      "keydown",
      handleVolumeKeyDown,
    );

    return () => {
      document.removeEventListener(
        "pointerdown",
        handleVolumePointerDown,
      );

      document.removeEventListener(
        "keydown",
        handleVolumeKeyDown,
      );
    };
  }, [isVolumeControlOpen]);

  /*
   * Preserve normal desktop right-click behavior while suppressing
   * long-press context menus from touch, pen, and mobile-style input.
   */
  useEffect(() => {
    const coarseInputQuery = window.matchMedia(
      "(hover: none) and (pointer: coarse)",
    );

    function suppressMobileContextMenu(
      event: MouseEvent,
    ) {
      const pointerType =
        "pointerType" in event
          ? (event as PointerEvent).pointerType
          : "";

      const isTouchLikePointer =
        pointerType === "touch" ||
        pointerType === "pen";

      if (
        isTouchLikePointer ||
        coarseInputQuery.matches
      ) {
        event.preventDefault();
      }
    }

    document.addEventListener(
      "contextmenu",
      suppressMobileContextMenu,
    );

    return () => {
      document.removeEventListener(
        "contextmenu",
        suppressMobileContextMenu,
      );
    };
  }, []);

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
        !isAppMenuOpen ||
        !(target instanceof Node) ||
        menu.contains(target)
      ) {
        return;
      }

      setIsAppMenuOpen(false);
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
  }, [isAppMenuOpen]);

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
    setHasPlaybackEnded(false);
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

    /*
     * Preserve values narrowed above inside the nested async function.
     * React state may change before the fetch resolves.
     */
    const resolvedWaveformUrl = waveformUrl;
    const resolvedTrackKey = selectedTrack.key;

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

        /*
         * Queue a waveform-derived oscilloscope placeholder before
         * the track has produced any analyser samples.
         */
        seedOscilloscopeFrame(
          resolvedTrackKey,
          data.peaks,
          data.sampleRate,
        );

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
    setHasPlaybackEnded(false);
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

  /*
   * Compact overlay waveforms seek the existing audio element
   * directly without introducing a second playback state.
   */
  function seekCompactWaveform(progress: number) {
    const audio = audioRef.current;

    if (
      !audio ||
      !waveform ||
      waveform.durationSeconds <= 0
    ) {
      return;
    }

    const nextTime =
      Math.max(0, Math.min(1, progress)) *
      waveform.durationSeconds;

    audio.currentTime = nextTime;

    /*
     * The main waveform stops its animation loop while paused.
     * Signal it to redraw immediately after any compact seek.
     */
    audio.dispatchEvent(
      new Event("audioplayerseek"),
    );

    setHasPlaybackEnded(
      nextTime >=
        waveform.durationSeconds - 0.05,
    );

    setCurrentTime(nextTime);
  }

  function handleScrubbingChange(
    nextIsScrubbing: boolean,
  ) {
    const audio = audioRef.current;

    if (scrubReleaseTimeoutRef.current !== null) {
      window.clearTimeout(
        scrubReleaseTimeoutRef.current,
      );

      scrubReleaseTimeoutRef.current = null;
    }

    if (nextIsScrubbing) {
      /*
       * Lock synchronously before any React state update. Rapid
       * keyboard input can therefore never enter playback handling
       * during the pointer gesture.
       */
      isScrubbingRef.current = true;

      /*
       * Freeze all visible playback indicators at their pre-gesture
       * state while media events fire beneath the scrub interaction.
       */
      const audioIsActivelyPlaying =
        Boolean(
          audio &&
          !audio.paused &&
          !audio.ended,
        );

      /*
       * A rapid second scrub can begin while the previous release is
       * still reconciling media events. Preserve the existing scrub
       * intent rather than replacing it with a transient paused state.
       */
      scrubDisplayPlayingRef.current =
        (
          isScrubbing &&
          scrubDisplayPlayingRef.current
        ) ||
        audioIsActivelyPlaying ||
        isPlaying;

      setIsScrubbing(true);
      return;
    }

    /*
     * Pointer release can trigger pause, seeked, timeupdate, waiting,
     * and playing events in quick succession. Retain the visual scrub
     * lock until those transient states have settled.
     */
    scrubReleaseTimeoutRef.current =
      window.setTimeout(() => {
        const settledAudio = audioRef.current;

        if (!settledAudio) {
          setIsPlaying(false);
          setIsScrubbing(false);

          isScrubbingRef.current = false;
          scrubReleaseTimeoutRef.current = null;
          return;
        }

        const settledIsPlaying =
          !settledAudio.paused &&
          !settledAudio.ended &&
          settledAudio.readyState >=
            HTMLMediaElement.HAVE_CURRENT_DATA;

        /*
         * Update the underlying playback state before removing the
         * visual lock so only the final settled state is exposed.
         */
        setIsPlaying(settledIsPlaying);

        window.requestAnimationFrame(() => {
          /*
           * Release the synchronous lock only after transient pause,
           * seek, timeupdate, and playing events have settled.
           */
          isScrubbingRef.current = false;
          setIsScrubbing(false);
          scrubReleaseTimeoutRef.current = null;
        });
      }, 80);
  }

  async function togglePlayback() {
    const audio = audioRef.current;

    if (!audio || !audioSource) {
      return;
    }

    /*
     * The HTML audio element is the source of truth. React state can
     * briefly lag after seeking, buffering, or reaching a boundary.
     */
    if (audio.paused || audio.ended) {
      if (
        audio.ended ||
        (
          Number.isFinite(audio.duration) &&
          audio.currentTime >= audio.duration - 0.05
        )
      ) {
        audio.currentTime = 0;
        setCurrentTime(0);
      }

      try {
        await ensureAudioAnalyser();
        await audio.play();
      } catch (error) {
        setIsPlaying(false);

        console.error(
          "Unable to resume audio playback:",
          error,
        );
      }

      return;
    }

    audio.pause();
  }

  /*
   * Space always controls playback unless the user is actively typing
   * in a text-entry surface. Capture-phase handling prevents focused
   * buttons from converting Space into their own native click.
   */
  useEffect(() => {
    function isTextEntryTarget(
      target: EventTarget | null,
    ): boolean {
      if (!(target instanceof Element)) {
        return false;
      }

      return Boolean(
        target.closest(
          [
            "textarea",
            "[contenteditable='true']",
            "[role='textbox']",
            "input:not([type])",
            "input[type='text']",
            "input[type='search']",
            "input[type='email']",
            "input[type='url']",
            "input[type='tel']",
            "input[type='password']",
            "input[type='number']",
          ].join(", "),
        ),
      );
    }

    function handlePlaybackShortcut(
      event: KeyboardEvent,
    ) {
      if (
        event.code !== "Space" ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        isTextEntryTarget(event.target)
      ) {
        return;
      }

      /*
       * Always consume Space outside text entry so focused Previous,
       * Next, Play, library, or menu buttons cannot activate natively.
       */
      event.preventDefault();
      event.stopPropagation();

      /*
       * During scrubbing and its short reconciliation window, consume
       * Space without changing the underlying playback state.
       */
      if (
        isScrubbingRef.current ||
        isScrubbing ||
        scrubReleaseTimeoutRef.current !== null
      ) {
        return;
      }

      void togglePlayback();
    }

    function suppressPlaybackShortcutKeyUp(
      event: KeyboardEvent,
    ) {
      if (
        event.code !== "Space" ||
        isTextEntryTarget(event.target)
      ) {
        return;
      }

      /*
       * Native buttons commonly activate on Space keyup. Suppressing
       * keyup prevents track navigation after the shortcut handled
       * keydown.
       */
      event.preventDefault();
      event.stopPropagation();
    }

    document.addEventListener(
      "keydown",
      handlePlaybackShortcut,
      true,
    );

    document.addEventListener(
      "keyup",
      suppressPlaybackShortcutKeyUp,
      true,
    );

    return () => {
      document.removeEventListener(
        "keydown",
        handlePlaybackShortcut,
        true,
      );

      document.removeEventListener(
        "keyup",
        suppressPlaybackShortcutKeyUp,
        true,
      );
    };
  });

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

  /*
   * Mouse wheels, trackpad scrolling, and trackpad pinch all arrive
   * as wheel events in common desktop browsers. Handle them through
   * a native non-passive listener so preventDefault() reliably stops
   * page scrolling and browser zoom.
   */
  useEffect(() => {
    const waveformPanel = waveformPanelRef.current;

    if (!waveformPanel) {
      return;
    }

    function handleWaveformWheel(event: WheelEvent) {
      const horizontalMagnitude = Math.abs(event.deltaX);
      const verticalMagnitude = Math.abs(event.deltaY);

      if (
        horizontalMagnitude === 0 &&
        verticalMagnitude === 0
      ) {
        return;
      }

      /*
       * The gesture began over the waveform, so reserve it entirely
       * for waveform zoom.
       */
      event.preventDefault();
      event.stopPropagation();

      /*
       * Browser-reported trackpad pinch normally arrives as a
       * ctrlKey wheel event and uses deltaY.
       *
       * For ordinary scrolling, use whichever axis is dominant so
       * small diagonal trackpad movement does not cause two zooms.
       */
      const isPinchGesture = event.ctrlKey;

      const isHorizontalGesture =
        !isPinchGesture &&
        horizontalMagnitude > verticalMagnitude;

      let shouldZoomIn: boolean;
      let gestureMagnitude: number;

      if (isPinchGesture) {
        /*
         * Browser convention:
         * negative deltaY = spread/pinch out
         * positive deltaY = pinch in
         */
        shouldZoomIn = event.deltaY < 0;
        gestureMagnitude = verticalMagnitude;
      } else if (isHorizontalGesture) {
        /*
         * Logic-style horizontal mapping:
         * two-finger swipe left zooms in;
         * two-finger swipe right zooms out.
         */
        shouldZoomIn = event.deltaX > 0;
        gestureMagnitude = horizontalMagnitude;
      } else {
        /*
         * Logic-style reversed vertical mapping:
         * upward movement zooms out; downward movement zooms in.
         */
        shouldZoomIn = event.deltaY > 0;
        gestureMagnitude = verticalMagnitude;
      }

      const direction: -1 | 1 =
        shouldZoomIn ? 1 : -1;

      /*
       * Reset accumulated movement whenever the user reverses zoom
       * direction.
       */
      if (
        waveformWheelDirectionRef.current !== 0 &&
        waveformWheelDirectionRef.current !== direction
      ) {
        waveformWheelDeltaRef.current = 0;
      }

      waveformWheelDirectionRef.current = direction;
      waveformWheelDeltaRef.current += gestureMagnitude;

      /*
       * Pinching should feel immediate. Horizontal trackpad movement
       * uses a medium threshold, while wheel/vertical scrolling stays
       * conservative enough to avoid racing through zoom levels.
       */
      const activationThreshold =
        isPinchGesture
          ? 7
          : isHorizontalGesture
            ? 42
            : 72;

      if (
        waveformWheelDeltaRef.current <
        activationThreshold
      ) {
        return;
      }

      waveformWheelDeltaRef.current = 0;

      if (shouldZoomIn) {
        increaseWaveformZoom();
        return;
      }

      decreaseWaveformZoom();
    }

    waveformPanel.addEventListener(
      "wheel",
      handleWaveformWheel,
      {
        passive: false,
      },
    );

    return () => {
      waveformPanel.removeEventListener(
        "wheel",
        handleWaveformWheel,
      );
    };
  });

  /*
   * Outside the waveform, ordinary wheel and two-finger scrolling
   * remain available. Only browser-level pinch zoom is suppressed.
   */
  useEffect(() => {
    function suppressBrowserPinch(event: WheelEvent) {
      if (!event.ctrlKey) {
        return;
      }

      event.preventDefault();
    }

    document.addEventListener(
      "wheel",
      suppressBrowserPinch,
      {
        passive: false,
      },
    );

    return () => {
      document.removeEventListener(
        "wheel",
        suppressBrowserPinch,
      );
    };
  }, []);

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

  /*
   * Keep desktop scrolling content clear of the fixed header and
   * Now Playing bar using their actual responsive rendered heights.
   */
  useEffect(() => {
    const player = document.querySelector<HTMLElement>(
      ".audio-player",
    );

    const header = document.querySelector<HTMLElement>(
      ".audio-player__header",
    );

    const nowPlaying = document.querySelector<HTMLElement>(
      ".audio-player__now-playing",
    );

    if (!player || !header) {
      return;
    }

    /*
     * Preserve TypeScript's non-null narrowing inside the nested
     * resize callback.
     */
    const activePlayer = player;
    const activeHeader = header;

    function updateFixedRegionHeights() {
      activePlayer.style.setProperty(
        "--fixed-header-height",
        `${activeHeader.getBoundingClientRect().height}px`,
      );

      activePlayer.style.setProperty(
        "--fixed-now-playing-height",
        nowPlaying
          ? `${nowPlaying.getBoundingClientRect().height}px`
          : "0px",
      );
    }

    updateFixedRegionHeights();

    const observer = new ResizeObserver(
      updateFixedRegionHeights,
    );

    observer.observe(header);

    if (nowPlaying) {
      observer.observe(nowPlaying);
    }

    window.addEventListener(
      "resize",
      updateFixedRegionHeights,
    );

    return () => {
      observer.disconnect();

      window.removeEventListener(
        "resize",
        updateFixedRegionHeights,
      );
    };
  }, [selectedTrack]);

  return (
    <section
      className="audio-player"
      aria-label="Audio player"
      data-menu-open={
        isAppMenuOpen ? "true" : "false"
      }
    >
      <header className="audio-player__header">
        <span className="audio-player__brand">
          <img
            src={hlLogo}
            alt="HL record label"
            className="audio-player__brand-logo"
          />
        </span>

        <label className="audio-player__header-search">
          <span className="audio-player__header-search-label">
            Search library
          </span>

          <input
            type="search"
            placeholder="Search library…"
            aria-label="Search library"
            autoComplete="off"
          />
        </label>

        <div
          ref={appMenuRef}
          className="app-menu"
          data-open={
            isAppMenuOpen ? "true" : "false"
          }
        >
          <button
            type="button"
            className="app-menu__trigger"
            aria-label={
              isAppMenuOpen
                ? "Close player menu"
                : "Open player menu"
            }
            aria-expanded={isAppMenuOpen}
            aria-controls="app-menu-panel"
            onClick={() => {
              setIsAppMenuOpen(
                (isOpen) => !isOpen,
              );
            }}
          />

            

            <div
              id="app-menu-panel"
              className="app-menu__panel"
              hidden={!isAppMenuOpen}
            >
              <div className="app-menu__content">
              <div
                className="
                  settings-control
                  settings-control--waveform-color
                "
              >
                <label htmlFor="waveform-color-select">
                  Waveform Color
                </label>

                <CompactWaveformCanvas
                  peaks={waveform?.peaks ?? []}
                  colorMode={colorMode}
                  progress={compactWaveformProgress}
                  onSeek={seekCompactWaveform}
                  className="
                    settings-control__waveform-preview
                  "
                />

                <div className="settings-control__waveform-actions">
                  <select
                    id="waveform-color-select"
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

                  <button
                    type="button"
                    className="audio-player__menu-playback-button"
                    aria-label={
                      displayedIsPlaying
                        ? "Pause track"
                        : "Play track"
                    }
                    aria-pressed={displayedIsPlaying}
                    disabled={!audioSource || !waveform}
                    title={
                      displayedIsPlaying ? "Pause" : "Play"
                    }
                    onClick={() => {
                      void togglePlayback();
                    }}
                  >
                    <ArtworkTransportIcon
                      name={
                        displayedIsPlaying ? "pause" : "play"
                      }
                    />
                  </button>
                </div>
              </div>

              
              
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
        </div>

        <div
          className="audio-player__header-status"
          aria-live="polite"
        >
          <span>
            {isAudiophileMode
              ? "Audio Output"
              : "Player"}
          </span>

          <strong>{headerStatus}</strong>
        </div>


      
          <button
            ref={libraryButtonRef}
            type="button"
            className="
              player-controls__library-button
              audio-player__header-library-button
            "
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

            <span className="player-controls__library-count">
              {playableTracks.length === 1
                ? "1 track"
                : `${playableTracks.length} tracks`}
            </span>

            <span
              className="player-controls__library-chevron"
              aria-hidden="true"
            >
              ▾
            </span>
          </button>
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
                displayedIsPlaying
                  ? "Pause track"
                  : "Play track"
              }
              aria-pressed={displayedIsPlaying}
              aria-disabled={!audioSource || !waveform}
              title={
                displayedIsPlaying
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
                  displayedIsPlaying
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
        onPlay={() => {
          setHasPlaybackEnded(false);
        }}
        onPlaying={() => {
          setHasPlaybackEnded(false);
          setIsPlaying(true);
        }}
        onPause={(event) => {
          const audio = event.currentTarget;

          /*
           * Save the current analyser frame even when the regular
           * waveform view is mounted and OscilloscopeCanvas is absent.
           */
          captureOscilloscopeFrame(
            selectedTrackKey,
            analyserRef.current,
          );

          setIsPlaying(false);

          if (
            audio.ended ||
            (
              Number.isFinite(audio.duration) &&
              audio.duration > 0 &&
              audio.currentTime >=
                audio.duration - 0.05
            )
          ) {
            setHasPlaybackEnded(true);
          }
        }}
        onEnded={(event) => {
          captureOscilloscopeFrame(
            selectedTrackKey,
            analyserRef.current,
          );

          setIsPlaying(false);
          setHasPlaybackEnded(true);
          setCurrentTime(
            event.currentTarget.duration,
          );
        }}
        onSeeking={() => {
          /*
           * Seeking can emit transient pause-like media states.
           * The visible state remains frozen until pointer release.
           */
        }}
        onSeeked={(event) => {
          const audio = event.currentTarget;

          window.requestAnimationFrame(() => {
            const isAtEnd =
              audio.ended ||
              (
                Number.isFinite(audio.duration) &&
                audio.duration > 0 &&
                audio.currentTime >=
                  audio.duration - 0.05
              );

            setHasPlaybackEnded(isAtEnd);

            setIsPlaying(
              !audio.paused &&
              !audio.ended &&
              audio.readyState >=
                HTMLMediaElement.HAVE_CURRENT_DATA,
            );
          });
        }}
        onEmptied={() => {
          setIsPlaying(false);
          setHasPlaybackEnded(false);
          setCurrentTime(0);
        }}
        onAbort={() => {
          setIsPlaying(false);
        }}
        onError={() => {
          setIsPlaying(false);
        }}
        onTimeUpdate={(event) => {
          const audio = event.currentTarget;

          setCurrentTime(audio.currentTime);

          if (audio.paused || audio.ended) {
            setIsPlaying(false);
          }
        }}
      />

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

              <div className="library-sheet__header-actions">
                <div
                  className="library-sheet__transport"
                  aria-label="Playback controls"
                >
                  <button
                    type="button"
                    disabled={!previousTrack}
                    aria-label="Previous track"
                    onClick={selectPreviousTrack}
                  >
                    <ArtworkTransportIcon name="previous" />
                  </button>

                  <button
                    type="button"
                    className="library-sheet__transport-play"
                    disabled={!audioSource || !waveform}
                    aria-label={
                      isPlaying && !isScrubbing
                        ? "Pause track"
                        : "Play track"
                    }
                    aria-pressed={
                      isPlaying && !isScrubbing
                    }
                    onClick={() => {
                      void togglePlayback();
                    }}
                  >
                    <ArtworkTransportIcon
                      name={
                        isPlaying && !isScrubbing
                          ? "pause"
                          : "play"
                      }
                    />
                  </button>

                  <button
                    type="button"
                    disabled={!nextTrack}
                    aria-label="Next track"
                    onClick={selectNextTrack}
                  >
                    <ArtworkTransportIcon name="next" />
                  </button>
                </div>

                <CompactWaveformCanvas
                  peaks={waveform?.peaks ?? []}
                  colorMode={colorMode}
                  progress={compactWaveformProgress}
                  onSeek={seekCompactWaveform}
                  className="
                    library-sheet__header-waveform
                  "
                />

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
              </div>
            </header>

            <div className="library-sheet__content">
              <LibraryBrowser
                variant="mobile"
                catalog={catalog}
                selectedTrackKey={libraryTrackKey}
                playingTrackKey={
                  displayedIsPlaying
                    ? selectedTrackKey
                    : null
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

      {isMetadataViewerOpen && selectedTrack ? (
        <div
          className="metadata-viewer__persistent-transport"
          aria-label="Playback controls"
        >
          <button
            type="button"
            disabled={!previousTrack}
            aria-label="Previous track"
            onClick={selectPreviousTrack}
          >
            <ArtworkTransportIcon name="previous" />
          </button>

          <button
            type="button"
            className="
              metadata-viewer__persistent-play
            "
            disabled={!audioSource || !waveform}
            aria-label={
              isPlaying && !isScrubbing
                ? "Pause track"
                : "Play track"
            }
            aria-pressed={
              isPlaying && !isScrubbing
            }
            onClick={() => {
              void togglePlayback();
            }}
          >
            <ArtworkTransportIcon
              name={
                isPlaying && !isScrubbing
                  ? "pause"
                  : "play"
              }
            />
          </button>

          <button
            type="button"
            disabled={!nextTrack}
            aria-label="Next track"
            onClick={selectNextTrack}
          >
            <ArtworkTransportIcon name="next" />
          </button>

          <span
            className="
              metadata-viewer__persistent-track
            "
          >
            <strong>
              {selectedTrack.track.title}
            </strong>

            <span>
              {selectedTrack.track.metadata.resolved
                .primaryArtist.name ??
                selectedTrack.track.artist ??
                "Unknown artist"}
            </span>
          </span>

          <CompactWaveformCanvas
            peaks={waveform?.peaks ?? []}
            colorMode={colorMode}
            progress={compactWaveformProgress}
                  onSeek={seekCompactWaveform}
            className="
              metadata-viewer__transport-waveform
            "
          />
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
          <div
            ref={waveformPanelRef}
            className="waveform-panel"
          >
            {waveformViewMode === "oscilloscope" ? (
              <OscilloscopeCanvas
                analyser={analyserNode}
                audioRef={audioRef}
                isPlaying={isPlaying}
                colorMode={colorMode}
                trackKey={selectedTrackKey}
                sampleRate={waveform.sampleRate}
                sampleWindow={
                  oscilloscopeSampleWindow
                }
              />
            ) : (
              <WaveformCanvas
                peaks={waveform.peaks}
                audioRef={audioRef}
                isPlaying={displayedIsPlaying}
                colorMode={colorMode}
                pixelsPerSecond={pixelsPerSecond}
                peaksPerSecond={waveform.peaksPerSecond}
                onScrubbingChange={
                  handleScrubbingChange
                }
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
              {isAudiophileMode ? (
                <output
                  className="waveform-panel__zoom-value"
                  aria-label="Current waveform zoom"
                >
                  {waveformViewMode === "oscilloscope"
                    ? `${oscilloscopeSampleWindow} samples`
                    : `${pixelsPerSecond} px/s`}
                </output>
              ) : null}

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
            displayedIsPlaying
              ? selectedTrackKey
              : null
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
      {selectedTrack ? (
        <section
          className="audio-player__now-playing"
          aria-label="Current track"
        >
          <div className="audio-player__now-playing-artwork">
            {artworkSource ? (
              <img
                src={artworkSource}
                alt=""
                aria-hidden="true"
              />
            ) : (
              <span aria-hidden="true">♪</span>
            )}
          </div>

          <div className="audio-player__now-playing-copy">
            <strong className="audio-player__now-playing-title">
              {selectedTrack.track.title}
            </strong>

            <span className="audio-player__now-playing-context">
              <span>{selectedArtist}</span>

              <span aria-hidden="true">·</span>

              <span>{selectedReleaseTitle}</span>
            </span>
          </div>

          <output
            className="audio-player__now-playing-time"
            aria-label="Current and total playback time"
          >
            <span>{formatTime(currentTime)}</span>

            <span aria-hidden="true">/</span>

            <span>
              {formatTime(
                waveform?.durationSeconds ?? 0,
              )}
            </span>
          </output>

          <CompactWaveformCanvas
            peaks={waveform?.peaks ?? []}
            colorMode={colorMode}
            progress={compactWaveformProgress}
            onSeek={seekCompactWaveform}
            seekLabel="Seek within the current track"
            className="
              audio-player__now-playing-waveform
            "
          />

          <div
            className="
              audio-player__now-playing-transport
            "
            aria-label="Now Playing controls"
          >
            <button
              type="button"
              disabled={!previousTrack}
              aria-label="Previous track"
              title="Previous track"
              onClick={selectPreviousTrack}
            >
              <ArtworkTransportIcon name="previous" />
            </button>

            <button
              type="button"
              className="
                audio-player__now-playing-play
              "
              disabled={!audioSource || !waveform}
              aria-label={
                displayedIsPlaying
                  ? "Pause track"
                  : "Play track"
              }
              aria-pressed={displayedIsPlaying}
              title={
                displayedIsPlaying
                  ? "Pause"
                  : "Play"
              }
              onClick={() => {
                void togglePlayback();
              }}
            >
              <ArtworkTransportIcon
                name={
                  displayedIsPlaying
                    ? "pause"
                    : "play"
                }
              />
            </button>

            <button
              type="button"
              disabled={!nextTrack}
              aria-label="Next track"
              title="Next track"
              onClick={selectNextTrack}
            >
              <ArtworkTransportIcon name="next" />
            </button>
          <div
            ref={volumeControlRef}
            className="audio-player__volume-control"
            data-open={
              isVolumeControlOpen ? "true" : "false"
            }
          >
            <button
              type="button"
              className="audio-player__volume-button"
              aria-label={`Volume ${volumePercent}%`}
              aria-haspopup="true"
              aria-expanded={isVolumeControlOpen}
              title={`Volume ${volumePercent}%`}
              onClick={() => {
                setIsVolumeControlOpen(
                  (isOpen) => !isOpen,
                );
              }}
            >
              <VolumeIcon level={volumeIconLevel} />
            </button>

            {isVolumeControlOpen ? (
              <div
                className="audio-player__volume-popup"
                role="group"
                aria-label="Volume control"
              >
                <div className="audio-player__volume-slider">
                  <input
                    id="now-playing-volume"
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={volumePercent}
                    aria-label="Volume"
                    onChange={(event) => {
                      setVolumePercent(
                        Number(event.currentTarget.value),
                      );
                    }}
                  />
                </div>
              </div>
            ) : null}
          </div>
          </div>

          <button
            ref={metadataButtonRef}
            type="button"
            className="
            player-controls__metadata-button
            audio-player__now-playing-metadata-button
          "
            aria-label="View selected track metadata"
            title="Track information"
            disabled={!selectedTrack}
            onClick={() => {
              setIsMetadataViewerOpen(true);
            }}
          >
            <span aria-hidden="true">i</span>
          </button>
        </section>
      ) : null}

      <footer className="audio-player__footer">
        <span>
          © {new Date().getFullYear()} Nathan Brenton
        </span>

        <span aria-hidden="true">·</span>

        <span>Audio Player v{APP_VERSION}</span>

        <span aria-hidden="true">·</span>

        <a href="mailto:nbrenton@gmail.com">
          Contact
        </a>
      </footer>
    </section>
  );
}
