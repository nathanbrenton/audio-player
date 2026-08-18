// React imports
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import type Hls from "hls.js";

import {
  CompactNowPlayingBar,
  PersistentMediaElement,
  MediaTransportIcon,
  MediaVisualizationSurface,
  WAVEFORM_COLOR_OPTIONS,
  decodeWaveformPayload,
  dedupePlaybackQueue,
  formatPlaybackTime,
  getPlaybackQueueIndex,
  getPlaybackQueueNeighbor,
  type PlayableMediaItem,
  type MediaSourceAdapter,
  type MediaSourceAttachRequest,
  type WaveformBinaryData,
  type WaveformColorMode,
  useMediaElementAnalyser,
  useSpacebarPlaybackShortcut,
  useMediaElementVolume,
  useMediaElementTimeline,
  useMediaElementPlaybackState,
  useMediaElementPlaybackEvents,
  useMediaSourceSession,
  usePersistentMediaElement,
} from "@hiplingo/media-player";

import CompactWaveformCanvas from "./CompactWaveformCanvas";
import AudioReactiveListenBackground from "./AudioReactiveListenBackground";
import ListenTrackQueue from "./ListenTrackQueue";
import MetadataViewer, {
  type MetadataVerbosity,
} from "./MetadataViewer";

import { HIPLINGO_CONTACT_MAILTO } from "../siteConfig";

import type {
  CatalogRelease,
  CatalogTrack,
  MediaCatalog,
} from "../types/MediaCatalog";

import packageJsonSource from "../../package.json?raw";
import {
  fetchMediaCatalog,
  getMediaUrl,
  getReleaseDate,
  getTrackKey,
  getTrackPlaybackPath,
  getTrackPlaybackProtocol,
} from "../lib/mediaCatalog";

let hlsModulePromise: Promise<typeof import("hls.js")> | null = null;

function loadHlsModule() {
  if (!hlsModulePromise) {
    hlsModulePromise = import("hls.js");
  }

  return hlsModulePromise;
}

type WaveformData = WaveformBinaryData;

type ListenBackgroundMode = "watery" | "magnify";

type HiplingoPlayableMediaSource = {
  url: string | null;
  protocol: ReturnType<typeof getTrackPlaybackProtocol>;
};

type PlayableTrack = PlayableMediaItem<HiplingoPlayableMediaSource> & {
  release: CatalogRelease;
  track: CatalogTrack;
};

function ArtworkTransportIcon({
  name,
}: {
  name: "previous" | "play" | "pause" | "next";
}) {
  return (
    <MediaTransportIcon
      name={name}
      className="artwork-stack__transport-icon"
    />
  );
}

function shufflePlaybackTrackKeys(
  trackKeys: readonly string[],
): string[] {
  const shuffled = [...trackKeys];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

const APP_VERSION = (
  JSON.parse(packageJsonSource) as {
    version: string;
  }
).version;

const DEVELOPER_CONTROL_HOLD_MS = 4000;

const COMPACT_TOGGLE_GUARD_MS = 360;

export type PlaybackQueueRequest = {
  trackKey: string;
  queueTrackKeys: string[];
  autoplay: boolean;
};

export type PlaybackStateSnapshot = {
  trackKey: string | null;
  isPlaying: boolean;
  hasSelection: boolean;
};

export type AudioPlayerHandle = {
  playQueue: (request: PlaybackQueueRequest) => void;
  togglePlayback: () => void;
  toggleSettings: () => void;
};

type AudioPlayerDisplayMode = "full" | "compact";

type AudioPlayerProps = {
  catalog?: MediaCatalog | null;
  catalogError?: string | null;
  initialTrackKey?: string | null;
  fallbackTrackKey?: string | null;
  displayMode?: AudioPlayerDisplayMode;
  onOpenFullPlayer?: () => void;
  onOpenRelease?: (releaseId: string) => void;
  onOpenArtist?: (artistName: string) => void;
  onPlaybackStateChange?: (state: PlaybackStateSnapshot) => void;
  releaseWaveformHost?: HTMLDivElement | null;
  menuToggleButtonRef?: RefObject<HTMLButtonElement | null>;
};

const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(
  function AudioPlayer(
    {
      catalog: suppliedCatalog,
      catalogError = null,
      initialTrackKey = null,
      fallbackTrackKey = null,
      displayMode = "full",
      onOpenFullPlayer,
      onOpenRelease,
      onOpenArtist,
      onPlaybackStateChange,
      releaseWaveformHost = null,
      menuToggleButtonRef,
    },
    ref,
  ) {
  const mediaElement = usePersistentMediaElement();
  const { audioRef } = mediaElement;
  const hlsRef = useRef<Hls | null>(null);
  const hlsAutoplayTrackKeyRef = useRef<string | null>(null);

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

  const compactToggleGuardUntilRef = useRef(0);

  const scrubReleaseTimeoutRef =
    useRef<number | null>(null);

  // Restore focus to the metadata trigger after closing its overlay.
  const metadataButtonRef =
    useRef<HTMLButtonElement | null>(null);

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
  const [
    metadataVerbosity,
    setMetadataVerbosity,
  ] = useState<MetadataVerbosity>("summary");

  // Optional metadata views controlled from the settings menu.
  const [isAudiophileMode, setIsAudiophileMode] =
    useState(false);
  const [isDeveloperMode, setIsDeveloperMode] =
    useState(false);

  // Track horizontal artwork drag gestures independently of playback.
  const artworkPointerIdRef = useRef<number | null>(null);
  const artworkStartXRef = useRef(0);
  const artworkStartYRef = useRef(0);
  const artworkGestureAxisRef =
    useRef<"horizontal" | "vertical" | null>(null);

  /*
   * Pointer-move state updates may be batched on mobile. Keep the
   * latest commit values in refs so pointer-up can queue the track
   * immediately without waiting for a React render.
   */
  const artworkDragProgressRef = useRef(0);
  const artworkSwipeDirectionRef =
    useRef<"previous" | "next" | "none">("none");

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
  const [localCatalog, setLocalCatalog] =
    useState<MediaCatalog | null>(null);
  const catalog =
    suppliedCatalog === undefined
      ? localCatalog
      : suppliedCatalog;
  const appliedInitialTrackKeyRef =
    useRef<string | null>(null);
  const [selectedTrackKey, setSelectedTrackKey] =
    useState("");
  const [queueTrackKeys, setQueueTrackKeys] =
    useState<string[]>([]);
  const [hasPlaybackSelection, setHasPlaybackSelection] =
    useState(false);


  // Player state.
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [hasPlaybackEnded, setHasPlaybackEnded] =
    useState(false);

  // Waveform data and loading state.
  const [waveform, setWaveform] =
    useState<WaveformData | null>(null);
  const [loadError, setLoadError] =
    useState<string | null>(null);
  const displayLoadError = catalogError ?? loadError;

  // Waveform visual settings.
  const [colorMode, setColorMode] =
    useState<WaveformColorMode>("3band");
  const [listenBackgroundMode, setListenBackgroundMode] =
    useState<ListenBackgroundMode>("watery");

  const {
    analyser: analyserNode,
    ensureAnalyser: ensureAudioAnalyser,
  } = useMediaElementAnalyser(
    audioRef,
    selectedTrackKey,
  );
  const {
    volumePercent,
    setVolumePercent,
  } = useMediaElementVolume(audioRef);
  const {
    currentTime,
    reset: resetTimeline,
    syncCurrentTime,
    seek: seekMediaTimeline,
  } = useMediaElementTimeline(audioRef);
  const playbackState =
    useMediaElementPlaybackState(audioRef);
  const {
    isPlaying,
    setPlaying: setIsPlaying,
    syncPlaying: syncMediaPlaying,
  } = playbackState;
  const playbackEvents =
    useMediaElementPlaybackEvents(playbackState);

  /*
   * Preserve the pre-scrub playback indication while the pointer is
   * moving. The media element itself is reconciled after release.
   */
  const displayedIsPlaying = isScrubbing
    ? scrubDisplayPlayingRef.current
    : isPlaying;
  const mediaSourceAdapter: MediaSourceAdapter<
    HiplingoPlayableMediaSource
  > = {
    attach: configureAudioSource,
    dispose: () => {
      destroyHlsPlayback();
    },
  };
  const {
    attach: attachMediaSource,
    dispose: disposeMediaSource,
    isCurrent: isCurrentMediaSource,
  } = useMediaSourceSession(
    audioRef,
    mediaSourceAdapter,
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
        .map((track) => {
          const playbackPath = getTrackPlaybackPath(track);

          return {
            key: getTrackKey(release, track),
            release,
            track,
            source: {
              url: getMediaUrl(catalog.mediaBaseUrl, playbackPath),
              protocol: getTrackPlaybackProtocol(track),
            },
            title: track.title,
            artist:
              track.metadata.resolved.primaryArtist.name ??
              track.artist ??
              "Unknown artist",
            releaseTitle: release.title,
            artworkUrl: getMediaUrl(
              catalog.mediaBaseUrl,
              track.artwork?.path ?? null,
            ),
            waveformUrl: getMediaUrl(
              catalog.mediaBaseUrl,
              track.assets.waveform,
            ),
          };
        });
    });
  }, [catalog]);

  const activeQueue = useMemo<PlayableTrack[]>(() => {
    if (queueTrackKeys.length === 0) {
      return playableTracks;
    }

    const queue = queueTrackKeys.flatMap((trackKey) => {
      const entry = playableTracks.find(
        (candidate) => candidate.key === trackKey,
      );

      return entry ? [entry] : [];
    });

    return queue.length > 0 ? queue : playableTracks;
  }, [playableTracks, queueTrackKeys]);

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

  const selectedTrackIndex = getPlaybackQueueIndex(
    activeQueue,
    selectedTrack?.key,
  );

  const previousTrack = getPlaybackQueueNeighbor(
    activeQueue,
    selectedTrack?.key,
    -1,
  );

  const nextTrack = getPlaybackQueueNeighbor(
    activeQueue,
    selectedTrack?.key,
    1,
  );

  const previousPreviousTrack =
    selectedTrackIndex > 1
      ? activeQueue[selectedTrackIndex - 2]
      : null;

  const nextNextTrack =
    selectedTrackIndex >= 0 &&
    selectedTrackIndex < activeQueue.length - 2
      ? activeQueue[selectedTrackIndex + 2]
      : null;

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
      const toggleButton = menuToggleButtonRef?.current;
      const target = event.target;

      if (
        !menu ||
        !isAppMenuOpen ||
        !(target instanceof Node) ||
        menu.contains(target) ||
        Boolean(toggleButton?.contains(target))
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
  }, [isAppMenuOpen, menuToggleButtonRef]);


  /*
   * Route changes collapse the full player without unmounting it. Close
   * full-player-only overlays so returning to /listen starts from the
   * playback surface rather than a stale modal or menu.
   */
  useEffect(() => {
    if (displayMode !== "compact") {
      return;
    }

    setIsAppMenuOpen(false);
    setIsMetadataViewerOpen(false);
  }, [displayMode]);

  /*
   * Cancel an unfinished About-card hold when the player unmounts.
   */
  useEffect(() => {
    return () => {
      clearAboutHoldTimer();
    };
  }, []);

  /*
   * The shared source session owns element-to-adapter orchestration while
   * Hiplingo's HLS/native implementation remains host-local.
   */
  useEffect(() => {
    return () => {
      disposeMediaSource();
    };
  }, [disposeMediaSource]);

  // Load the generated release and track catalog when one was not supplied.
  useEffect(() => {
    if (suppliedCatalog !== undefined) {
      return;
    }

    const controller = new AbortController();

    async function loadCatalog() {
      try {
        const data = await fetchMediaCatalog(
          controller.signal,
        );

        setLocalCatalog(data);
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
  }, [suppliedCatalog]);

  // Apply a release-page track request once, then preserve in-player navigation.
  useEffect(() => {
    if (playableTracks.length === 0) {
      return;
    }

    const firstTrackKey = playableTracks[0].key;
    const fallbackTrack =
      fallbackTrackKey
        ? playableTracks.find((entry) => entry.key === fallbackTrackKey) ?? null
        : null;
    const selectionFallbackTrackKey = fallbackTrack?.key ?? firstTrackKey;
    const requestedTrackKey =
      initialTrackKey &&
      playableTracks.some(
        (entry) => entry.key === initialTrackKey,
      )
        ? initialTrackKey
        : null;

    if (
      requestedTrackKey &&
      appliedInitialTrackKeyRef.current !== initialTrackKey
    ) {
      appliedInitialTrackKeyRef.current = initialTrackKey;
      setQueueTrackKeys(
        playableTracks.map((entry) => entry.key),
      );
      setSelectedTrackKey(requestedTrackKey);
      return;
    }

    if (
      !playableTracks.some(
        (entry) => entry.key === selectedTrackKey,
      )
    ) {
      if (fallbackTrack) {
        setQueueTrackKeys(
          playableTracks
            .filter((entry) => entry.release.id === fallbackTrack.release.id)
            .map((entry) => entry.key),
        );
      }

      setSelectedTrackKey(selectionFallbackTrackKey);
    }

  }, [
    fallbackTrackKey,
    initialTrackKey,
    playableTracks,
    selectedTrackKey,
  ]);


  /*
   * Load the selected track's waveform whenever the player changes
   * tracks. Audio transport is handled separately by loadTrack().
   */
  useEffect(() => {
    const controller = new AbortController();

    resetTimeline();
    setHasPlaybackEnded(false);
    setWaveform(null);
    setLoadError(null);

    if (!catalog || !selectedTrack) {
      return () => {
        controller.abort();
      };
    }

    const waveformUrl = selectedTrack.waveformUrl;

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

        const data = decodeWaveformPayload(
          await response.arrayBuffer(),
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
  }, [catalog, resetTimeline, selectedTrack]);

  const selectedPlaybackProtocol =
    selectedTrack?.source.protocol ?? null;

  const audioSource =
    selectedTrack?.source.url ?? null;

  function destroyHlsPlayback() {
    hlsAutoplayTrackKeyRef.current = null;

    const hls = hlsRef.current;

    if (!hls) {
      return;
    }

    hlsRef.current = null;
    hls.destroy();
  }

  async function configureAudioSource({
    audio,
    mediaKey: trackKey,
    source,
    autoplay,
  }: MediaSourceAttachRequest<
    HiplingoPlayableMediaSource
  >): Promise<boolean> {
    const sourceUrl = source.url;
    const protocol = source.protocol;

    if (!sourceUrl) {
      return false;
    }

    destroyHlsPlayback();

    audio.pause();
    audio.removeAttribute("src");
    audio.load();

    setLoadError(null);
    setIsPlaying(false);
    setHasPlaybackEnded(false);
    resetTimeline();

    const isHls =
      protocol?.toLowerCase() === "hls" ||
      sourceUrl.toLowerCase().includes(".m3u8");

    if (isHls) {
      /*
       * Prefer native HLS when the browser provides it (Safari/iOS).
       * Other browsers load hls.js only when an HLS stream is actually
       * needed, keeping it out of Hiplingo's initial application bundle.
       */
      if (
        audio.canPlayType(
          "application/vnd.apple.mpegurl",
        )
      ) {
        audio.src = sourceUrl;
        audio.load();

        if (autoplay) {
          void ensureAudioAnalyser();
          void audio.play().catch((error: unknown) => {
            console.error(
              "Unable to begin native HLS playback:",
              error,
            );
          });
        }

        return true;
      }

      try {
        const { default: HlsRuntime } = await loadHlsModule();

        if (!isCurrentMediaSource(trackKey)) {
          return false;
        }

        if (HlsRuntime.isSupported()) {
          const hls = new HlsRuntime();
          hlsRef.current = hls;
          hlsAutoplayTrackKeyRef.current =
            autoplay ? trackKey : null;

          hls.on(HlsRuntime.Events.ERROR, (_event, data) => {
            if (!data.fatal || hlsRef.current !== hls) {
              return;
            }

            hlsAutoplayTrackKeyRef.current = null;
            setIsPlaying(false);
            setLoadError(
              `Stream playback failed: ${data.details}`,
            );
          });

          hls.on(HlsRuntime.Events.MEDIA_ATTACHED, () => {
            if (hlsRef.current === hls) {
              hls.loadSource(sourceUrl);
            }
          });

          hls.on(HlsRuntime.Events.MANIFEST_PARSED, () => {
            if (
              hlsRef.current !== hls ||
              hlsAutoplayTrackKeyRef.current !== trackKey
            ) {
              return;
            }

            hlsAutoplayTrackKeyRef.current = null;

            void ensureAudioAnalyser();
            void audio.play().catch((error: unknown) => {
              console.error(
                "Unable to begin HLS playback:",
                error,
              );
            });
          });

          hls.attachMedia(audio);
          return true;
        }
      } catch (error) {
        console.error("Unable to load hls.js:", error);
      }

      setLoadError(
        "This browser does not support HLS playback.",
      );
      return false;
    }

    audio.src = sourceUrl;
    audio.load();

    if (autoplay) {
      void ensureAudioAnalyser();
      void audio.play().catch((error: unknown) => {
        console.error(
          "Unable to begin destination-track playback:",
          error,
        );
      });
    }

    return true;
  }

  /*
   * Initialize the first catalog track and cover any future
   * state-only track changes. Tracks already loaded by loadTrack()
   * are deliberately left untouched.
   */
  useEffect(() => {
    if (
      !audioSource ||
      !selectedTrackKey ||
      isCurrentMediaSource(selectedTrackKey)
    ) {
      return;
    }

    void attachMediaSource({
      mediaKey: selectedTrackKey,
      source: {
        url: audioSource,
        protocol: selectedPlaybackProtocol,
      },
      autoplay: false,
    });
  }, [
    attachMediaSource,
    audioSource,
    isCurrentMediaSource,
    selectedPlaybackProtocol,
    selectedTrackKey,
  ]);

  const artworkSource =
    selectedTrack?.artworkUrl ?? null;

  const previousArtworkSource =
    previousTrack?.artworkUrl ?? null;

  const nextArtworkSource =
    nextTrack?.artworkUrl ?? null;

  const previousPreviousArtworkSource =
    previousPreviousTrack?.artworkUrl ?? null;

  const nextNextArtworkSource =
    nextNextTrack?.artworkUrl ?? null;


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

    const destinationAudioUrl = destination.source.url;

    if (!destinationAudioUrl) {
      return;
    }

    setHasPlaybackSelection(true);

    setSelectedTrackKey(trackKey);

    void attachMediaSource({
      mediaKey: trackKey,
      source: destination.source,
      autoplay,
    });
  }

  function playQueue(request: PlaybackQueueRequest) {
    if (!catalog || playableTracks.length === 0) {
      return;
    }

    const validQueue = dedupePlaybackQueue(
      request.queueTrackKeys,
    ).filter((trackKey) =>
      playableTracks.some((entry) => entry.key === trackKey),
    );
    const nextQueue =
      validQueue.length > 0
        ? validQueue
        : playableTracks.map((entry) => entry.key);
    const requestedTrackKey = nextQueue.includes(request.trackKey)
      ? request.trackKey
      : nextQueue[0];

    if (!requestedTrackKey) {
      return;
    }

    setQueueTrackKeys(nextQueue);
    setHasPlaybackSelection(true);
    loadTrack(requestedTrackKey, request.autoplay);
  }

  useImperativeHandle(ref, () => ({
    playQueue,
    togglePlayback: () => {
      void togglePlayback();
    },
    toggleSettings: () => {
        setIsAppMenuOpen((isOpen) => !isOpen);
    },
  }));

  useEffect(() => {
    onPlaybackStateChange?.({
      trackKey: selectedTrack?.key ?? null,
      isPlaying,
      hasSelection: hasPlaybackSelection,
    });
  }, [
    hasPlaybackSelection,
    isPlaying,
    onPlaybackStateChange,
    selectedTrack?.key,
  ]);

  function selectAdjacentTrack(direction: -1 | 1) {
    if (!selectedTrack || activeQueue.length < 2) {
      return;
    }

    const audio = audioRef.current;

    const shouldAutoplay =
      isPlaying || Boolean(audio && !audio.paused);

    const destination = getPlaybackQueueNeighbor(
      activeQueue,
      selectedTrack.key,
      direction,
    );

    if (!destination) {
      return;
    }

    loadTrack(destination.key, shouldAutoplay);
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
        artworkDragProgressRef.current = 0;
        artworkSwipeDirectionRef.current = "none";
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
    artworkDragProgressRef.current = 0;
    artworkSwipeDirectionRef.current = "none";
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
    artworkDragProgressRef.current = 0;
    artworkSwipeDirectionRef.current = "none";
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

        const initialDirection =
          deltaX < 0 ? "next" : "previous";

        artworkSwipeDirectionRef.current =
          initialDirection;

        setArtworkSwipeDirection(
          initialDirection,
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
    let effectiveDirection =
      artworkSwipeDirectionRef.current;

    if (
      effectiveDirection === "next" &&
      deltaX > reversalThreshold
    ) {
      effectiveDirection = "previous";
      artworkSwipeDirectionRef.current =
        effectiveDirection;
      setArtworkSwipeDirection(effectiveDirection);
    } else if (
      effectiveDirection === "previous" &&
      deltaX < -reversalThreshold
    ) {
      effectiveDirection = "next";
      artworkSwipeDirectionRef.current =
        effectiveDirection;
      setArtworkSwipeDirection(effectiveDirection);
    } else if (effectiveDirection === "none") {
      effectiveDirection =
        deltaX < 0 ? "next" : "previous";

      artworkSwipeDirectionRef.current =
        effectiveDirection;
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

    artworkDragProgressRef.current =
      dragProgress;

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
    const latestDragProgress =
      artworkDragProgressRef.current;

    const latestSwipeDirection =
      artworkSwipeDirectionRef.current;

    const shouldCommit =
      artworkGestureAxisRef.current === "horizontal" &&
      latestDragProgress >= 0.9;

    const committedDirection = shouldCommit
      ? latestSwipeDirection === "next" ||
        latestSwipeDirection === "previous"
        ? latestSwipeDirection
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

    seekMediaTimeline(nextTime, {
      upperBound: waveform.durationSeconds,
      dispatchSeekEvent: true,
    });

    setHasPlaybackEnded(
      nextTime >=
        waveform.durationSeconds - 0.05,
    );
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

        /*
         * Update the underlying playback state before removing the
         * visual lock so only the final settled state is exposed.
         */
        syncMediaPlaying(settledAudio);

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
      setHasPlaybackSelection(true);

      if (
        audio.ended ||
        (
          Number.isFinite(audio.duration) &&
          audio.currentTime >= audio.duration - 0.05
        )
      ) {
        seekMediaTimeline(0);
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

  function toggleCompactPlayback() {
    const now = window.performance.now();

    if (now < compactToggleGuardUntilRef.current) {
      return;
    }

    compactToggleGuardUntilRef.current =
      now + COMPACT_TOGGLE_GUARD_MS;

    void togglePlayback();
  }

  useSpacebarPlaybackShortcut({
    onToggle: togglePlayback,
    canToggle: () =>
      !isScrubbingRef.current &&
      !isScrubbing &&
      scrubReleaseTimeoutRef.current === null,
  });

  function getQueueTrackKeysForTrack(trackKey: string) {
    const requested = playableTracks.find(
      (entry) => entry.key === trackKey,
    );

    if (!requested) {
      return playableTracks.map((entry) => entry.key);
    }

    return playableTracks
      .filter(
        (entry) => entry.release.id === requested.release.id,
      )
      .map((entry) => entry.key);
  }

  /*
   * Direct title activation starts playback in the requested queue.
   */
  async function playQueueTrack(
    trackKey: string,
    requestedQueueTrackKeys?: string[],
  ) {
    const requestedQueue = requestedQueueTrackKeys
      ? dedupePlaybackQueue(requestedQueueTrackKeys).filter(
          (queueTrackKey) =>
            playableTracks.some((entry) => entry.key === queueTrackKey),
        )
      : [];
    const nextQueueTrackKeys = requestedQueue.includes(trackKey)
      ? requestedQueue
      : getQueueTrackKeysForTrack(trackKey);

    setQueueTrackKeys(nextQueueTrackKeys);
    setHasPlaybackSelection(true);

    if (trackKey !== selectedTrackKey) {
      loadTrack(trackKey, true);
      return;
    }

    const audio = audioRef.current;

    if (!audio || !audioSource) {
      return;
    }

    /*
     * A repeated explicit play request restarts the selected track.
     */
    seekMediaTimeline(0);

    await ensureAudioAnalyser();
    await audio.play();
  }

  /*
   * Carousel navigation changes the selected track while preserving the
   * current play/pause state, matching the artwork swiper handoff.
   */
  function navigateQueueTrack(
    trackKey: string,
    requestedQueueTrackKeys?: string[],
  ) {
    const requestedQueue = requestedQueueTrackKeys
      ? dedupePlaybackQueue(requestedQueueTrackKeys).filter(
          (queueTrackKey) =>
            playableTracks.some((entry) => entry.key === queueTrackKey),
        )
      : [];
    const nextQueueTrackKeys = requestedQueue.includes(trackKey)
      ? requestedQueue
      : getQueueTrackKeysForTrack(trackKey);
    const audio = audioRef.current;
    const shouldAutoplay =
      isPlaying || Boolean(audio && !audio.paused);

    setQueueTrackKeys(nextQueueTrackKeys);
    setHasPlaybackSelection(true);

    if (trackKey !== selectedTrackKey) {
      loadTrack(trackKey, shouldAutoplay);
    }
  }

  /*
   * The current queue title toggles playback; another title loads and plays.
   */
  function shuffleQueueTracks(trackKeys: string[]) {
    const queueTrackKeys = dedupePlaybackQueue(trackKeys).filter(
      (trackKey) =>
        playableTracks.some((entry) => entry.key === trackKey),
    );
    const firstTrackKey = queueTrackKeys[0];

    if (!firstTrackKey) {
      return;
    }

    playQueue({
      trackKey: firstTrackKey,
      queueTrackKeys,
      autoplay: true,
    });
  }

  function shuffleActiveQueue() {
    /*
     * Listen Shuffle is library-wide, regardless of which release/queue
     * supplied the current track. Install the complete randomized public
     * library as the active queue so Next continues through that shuffle.
     */
    const shuffledTrackKeys = shufflePlaybackTrackKeys(
      playableTracks.map((entry) => entry.key),
    );

    if (
      shuffledTrackKeys.length > 1 &&
      shuffledTrackKeys[0] === selectedTrackKey
    ) {
      [shuffledTrackKeys[0], shuffledTrackKeys[1]] = [
        shuffledTrackKeys[1],
        shuffledTrackKeys[0],
      ];
    }

    shuffleQueueTracks(shuffledTrackKeys);
  }

  async function toggleQueueTrackPlayback(
    trackKey: string,
  ) {
    setQueueTrackKeys(getQueueTrackKeysForTrack(trackKey));

    /*
     * A fallback/current queue title can exist before the listener has made a
     * playback selection. In that state, load the title as an explicit
     * autoplaying selection rather than asking an unattached media element to
     * toggle.
     */
    if (
      trackKey !== selectedTrackKey ||
      !hasPlaybackSelection
    ) {
      loadTrack(trackKey, true);
      return;
    }

    setHasPlaybackSelection(true);
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

        setIsDeveloperControlVisible((isVisible) => {
          const nextVisible = !isVisible;

          if (!nextVisible) {
            setIsDeveloperMode(false);
            setIsAudiophileMode(false);
          }

          return nextVisible;
        });

        aboutHoldPointerRef.current = null;
        clearAboutHoldTimer();
      }, DEVELOPER_CONTROL_HOLD_MS);
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
      data-display-mode={displayMode}
      data-menu-open={
        isAppMenuOpen ? "true" : "false"
      }
    >
      {displayMode === "full" ? (
        <AudioReactiveListenBackground
          audioRef={audioRef}
          analyser={analyserNode}
          peaks={waveform?.peaks ?? []}
          peaksPerSecond={waveform?.peaksPerSecond ?? 0}
          isPlaying={displayedIsPlaying}
          isMetadataViewerOpen={isMetadataViewerOpen}
          mode={listenBackgroundMode}
        />
      ) : null}

      {isAppMenuOpen ? (
        <div
          className="app-menu__backdrop audio-player__settings-backdrop"
          role="presentation"
          onPointerDown={(event) => {
            if (event.target !== event.currentTarget) {
              return;
            }

            /*
             * Keep the backdrop mounted through pointer-up/click. The
             * document-level outside-pointer handler would otherwise close
             * it on pointer-down, allowing the synthesized click to land on
             * the playback surface underneath on touch-like input.
             */
            event.stopPropagation();
          }}
          onClick={(event) => {
            if (event.target !== event.currentTarget) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            setIsAppMenuOpen(false);
          }}
        >
          <div
            ref={appMenuRef}
            id="app-menu-panel"
            className="app-menu__panel audio-player__settings-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Player settings"
          >
            <button
              type="button"
              className="audio-player__settings-close"
              aria-label="Close player settings"
              onClick={() => setIsAppMenuOpen(false)}
            >
              ×
            </button>

            <div className="app-menu__content">
              <div
                className="settings-control settings-control--waveform-color"
              >
                <label htmlFor="waveform-color-select">
                  Waveform Color
                </label>

                <CompactWaveformCanvas
                  peaks={waveform?.peaks ?? []}
                  colorMode={colorMode}
                  progress={compactWaveformProgress}
                  onSeek={seekCompactWaveform}
                  className="settings-control__waveform-preview"
                />

                <div className="settings-control__waveform-actions">
                  <select
                    id="waveform-color-select"
                    value={colorMode}
                    onChange={(event) => {
                      setColorMode(
                        event.currentTarget.value as WaveformColorMode,
                      );
                    }}
                  >
                    {WAVEFORM_COLOR_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    className="audio-player__menu-playback-button"
                    aria-label={
                      displayedIsPlaying ? "Pause track" : "Play track"
                    }
                    aria-pressed={displayedIsPlaying}
                    disabled={!audioSource || !waveform}
                    title={displayedIsPlaying ? "Pause" : "Play"}
                    onClick={() => {
                      void togglePlayback();
                    }}
                  >
                    <ArtworkTransportIcon
                      name={displayedIsPlaying ? "pause" : "play"}
                    />
                  </button>
                </div>
              </div>

              <div className="app-menu__about-contact-card">
                <button
                  type="button"
                  className="app-menu__about-button app-menu__about-button--combined"
                  aria-label="About this audio player"
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
                    <strong>About this player</strong>
                    <small>Audio Player version {APP_VERSION}</small>
                  </span>
                </button>

                <a
                  className="app-menu__developer-contact"
                  href="https://nathanbrenton.com/"
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label="Developer Nathan Brenton — open nathanbrenton.com"
                >
                  <span>
                    <small>Developer</small>
                    <strong>Nathan Brenton</strong>
                    <small>nathanbrenton.com</small>
                  </span>
                  <span
                    className="app-menu__developer-contact-arrow"
                    aria-hidden="true"
                  >
                    ↗
                  </span>
                </a>
              </div>

              {isDeveloperControlVisible ? (
                <>
                  <label className="settings-toggle settings-toggle--developer">
                    <span>
                      <strong>Developer Mode</strong>
                      <small>Show source indicators and raw metadata.</small>
                    </span>

                    <input
                      type="checkbox"
                      checked={isDeveloperMode}
                      onChange={(event) => {
                        const isEnabled = event.currentTarget.checked;
                        setIsDeveloperMode(isEnabled);

                        if (!isEnabled) {
                          setIsAudiophileMode(false);
                        }
                      }}
                    />
                  </label>

                  {isDeveloperMode ? (
                    <>
                      <label className="settings-toggle settings-toggle--audiophile">
                        <span>
                          <strong>Audiophile Mode</strong>
                          <small>Show technical audio and waveform metadata.</small>
                        </span>

                        <input
                          type="checkbox"
                          checked={isAudiophileMode}
                          onChange={(event) => {
                            setIsAudiophileMode(event.currentTarget.checked);
                          }}
                        />
                      </label>

                      <div
                        className="settings-control settings-control--listen-background-mode"
                      >
                        <label htmlFor="listen-background-mode-select">
                          Listen Background
                        </label>

                        <select
                          id="listen-background-mode-select"
                          value={listenBackgroundMode}
                          onChange={(event) => {
                            setListenBackgroundMode(
                              event.currentTarget.value as ListenBackgroundMode,
                            );
                          }}
                        >
                          <option value="watery">Watery</option>
                          <option value="magnify">Magnify</option>
                        </select>
                      </div>
                    </>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}


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
                aria-label={`Earlier track: ${previousPreviousTrack.track.title}`}
                title={`Earlier: ${previousPreviousTrack.track.title}`}
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
                aria-label={`Previous track: ${previousTrack.track.title}`}
                title={`Previous: ${previousTrack.track.title}`}
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
              aria-label={displayedIsPlaying ? "Pause track" : "Play track"}
              aria-pressed={displayedIsPlaying}
              aria-disabled={!selectedTrack}
              title={displayedIsPlaying ? "Pause" : "Play"}
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
                aria-label={`Next track: ${nextTrack.track.title}`}
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
                aria-label={`Later track: ${nextNextTrack.track.title}`}
                title={`Later: ${nextNextTrack.track.title}`}
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
      <PersistentMediaElement
        controller={mediaElement}
        preload="metadata"
        onPlay={() => {
          setHasPlaybackEnded(false);
        }}
        onPlaying={() => {
          setHasPlaybackEnded(false);
          playbackEvents.handlePlaying();
        }}
        onPause={(event) => {
          const audio = event.currentTarget;

          playbackEvents.handlePause();

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
          if (nextTrack) {
            setIsPlaying(false);
            setHasPlaybackEnded(false);
            resetTimeline();
            loadTrack(nextTrack.key, true);
            return;
          }

          setIsPlaying(false);
          setHasPlaybackEnded(true);
          syncCurrentTime(event.currentTarget);
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

            syncMediaPlaying(audio);
          });
        }}
        onEmptied={() => {
          playbackEvents.handleEmptied();
          setHasPlaybackEnded(false);
          resetTimeline();
        }}
        onAbort={playbackEvents.handleAbort}
        onError={playbackEvents.handleError}
        onTimeUpdate={(event) => {
          const audio = event.currentTarget;

          syncCurrentTime(audio);

          if (audio.paused || audio.ended) {
            setIsPlaying(false);
          }
        }}
      />


      {releaseWaveformHost &&
      displayMode === "compact" &&
      selectedTrack
        ? createPortal(
            <section
              className="hiplingo-release-now-playing"
              aria-label={`Now playing ${selectedTrack.title}`}
            >
              <div className="hiplingo-release-now-playing__identity">
                <span>Now playing</span>
                <strong>{selectedTrack.title}</strong>
              </div>

              {waveform ? (
                <MediaVisualizationSurface
                  peaks={waveform.peaks}
                  colorMode={colorMode}
                  audioRef={audioRef}
                  analyser={analyserNode}
                  ensureAnalyser={ensureAudioAnalyser}
                  trackKey={selectedTrackKey}
                  sampleRate={waveform.sampleRate}
                  waveformIsPlaying={displayedIsPlaying}
                  oscilloscopeIsPlaying={isPlaying}
                  peaksPerSecond={waveform.peaksPerSecond}
                  durationSeconds={waveform.durationSeconds}
                  onScrubbingChange={handleScrubbingChange}
                  showZoomReadout={isAudiophileMode}
                  classNames={{
                    root: "waveform-panel hiplingo-release-now-playing__waveform",
                    zoomControls: "waveform-panel__zoom-controls",
                    zoomButton: "waveform-panel__zoom-button",
                    zoomIncreaseButton:
                      "waveform-panel__zoom-button--increase",
                    zoomDecreaseButton:
                      "waveform-panel__zoom-button--decrease",
                    zoomReadout: "waveform-panel__zoom-value",
                  }}
                >
                  <output
                    className="waveform-panel__current-time"
                    aria-label="Current playback time"
                  >
                    {formatPlaybackTime(currentTime)}
                  </output>
                </MediaVisualizationSurface>
              ) : (
                <div
                  className="hiplingo-release-now-playing__waveform-placeholder"
                  aria-live="polite"
                >
                  {displayLoadError
                    ? "Waveform unavailable"
                    : "Loading waveform…"}
                </div>
              )}
            </section>,
            releaseWaveformHost,
          )
        : null}

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

      {displayLoadError ? (
        <p role="alert">{displayLoadError}</p>
      ) : null}

      <div
        className="listen-waveform-anchor"
        data-waveform-state={
          waveform ? "ready" : displayLoadError ? "error" : "loading"
        }
      >
        {waveform ? (
          <MediaVisualizationSurface
            peaks={waveform.peaks}
            colorMode={colorMode}
            audioRef={audioRef}
            analyser={analyserNode}
            ensureAnalyser={ensureAudioAnalyser}
            trackKey={selectedTrackKey}
            sampleRate={waveform.sampleRate}
            waveformIsPlaying={
              displayedIsPlaying && !isMetadataViewerOpen
            }
            oscilloscopeIsPlaying={isPlaying}
            peaksPerSecond={waveform.peaksPerSecond}
            onScrubbingChange={handleScrubbingChange}
            showZoomReadout={isAudiophileMode}
            classNames={{
              root: "waveform-panel",
              zoomControls: "waveform-panel__zoom-controls",
              zoomButton: "waveform-panel__zoom-button",
              zoomIncreaseButton:
                "waveform-panel__zoom-button--increase",
              zoomDecreaseButton:
                "waveform-panel__zoom-button--decrease",
              zoomReadout: "waveform-panel__zoom-value",
            }}
          >
            <output
              className="waveform-panel__current-time"
              aria-label="Current playback time"
            >
              {formatPlaybackTime(currentTime)}
            </output>
          </MediaVisualizationSurface>
        ) : (
          <div
            className="waveform-panel waveform-panel--loading"
            aria-busy={displayLoadError ? undefined : true}
          >
            <span className="sr-only" aria-live="polite">
              {displayLoadError
                ? "Waveform unavailable"
                : "Loading waveform…"}
            </span>

            <div
              className="waveform-panel__zoom-controls"
              aria-hidden="true"
            >
              <button
                type="button"
                className="waveform-panel__zoom-button waveform-panel__zoom-button--increase"
                disabled
                tabIndex={-1}
              >
                +
              </button>
              <button
                type="button"
                className="waveform-panel__zoom-button waveform-panel__zoom-button--decrease"
                disabled
                tabIndex={-1}
              >
                −
              </button>
            </div>

            <output
              className="waveform-panel__current-time"
              aria-label="Current playback time"
            >
              {formatPlaybackTime(currentTime)}
            </output>
          </div>
        )}
      </div>

        </div>

      </div>

      {displayMode === "full" ? (
        <ListenTrackQueue
          catalog={catalog}
          selectedTrackKey={selectedTrackKey}
          playingTrackKey={
            displayedIsPlaying ? selectedTrackKey : null
          }
          onPlayTrack={(trackKey, queueTrackKeys) => {
            void playQueueTrack(trackKey, queueTrackKeys);
          }}
          onNavigateTrack={(trackKey, queueTrackKeys) => {
            navigateQueueTrack(trackKey, queueTrackKeys);
          }}
          onToggleTrackPlayback={(trackKey) => {
            void toggleQueueTrackPlayback(trackKey);
          }}
          previousTrackKey={previousTrack?.key ?? null}
          onPreviousTrack={
            previousTrack ? selectPreviousTrack : undefined
          }
          onNextTrack={nextTrack ? selectNextTrack : undefined}
        />
      ) : null}

      {selectedTrack ? (
        <CompactNowPlayingBar
          artworkUrl={artworkSource}
          onArtworkClick={
            onOpenRelease
              ? () => onOpenRelease(selectedTrack.release.id)
              : displayMode === "compact"
                ? onOpenFullPlayer
                : undefined
          }
          artworkActionLabel={
            onOpenRelease
              ? `Open ${selectedTrack.release.title} release`
              : `Open full player for ${selectedTrack.title}`
          }
          artworkFallback={<span aria-hidden="true">♪</span>}
          title={selectedTrack.title}
          context={
            <span className="hiplingo-now-playing-dock__context-links">
              {onOpenArtist && selectedTrack.artist ? (
                <button
                  type="button"
                  className="hiplingo-now-playing-dock__context-link"
                  onClick={() => {
                    const artistName = selectedTrack.artist;

                    if (artistName) {
                      onOpenArtist(artistName);
                    }
                  }}
                >
                  {selectedTrack.artist}
                </button>
              ) : (
                <span>{selectedTrack.artist}</span>
              )}

              <span aria-hidden="true">·</span>

              {onOpenRelease ? (
                <button
                  type="button"
                  className="hiplingo-now-playing-dock__context-link"
                  onClick={() => {
                    onOpenRelease(selectedTrack.release.id);
                  }}
                >
                  {selectedTrack.release.title}
                </button>
              ) : (
                <span>{selectedTrack.release.title}</span>
              )}
            </span>
          }
          detail={
            getReleaseDate(selectedTrack.release)
              ?.match(/^\d{4}/)?.[0] ?? ""
          }
          controller={{
            transport: {
              currentTime,
              duration: waveform?.durationSeconds ?? 0,
              isPlaying: displayedIsPlaying,
              canToggle: Boolean(audioSource && waveform),
              canPrevious: Boolean(previousTrack),
              canNext: Boolean(nextTrack),
              previous: selectPreviousTrack,
              toggle: toggleCompactPlayback,
              next: selectNextTrack,
              seek:
                waveform && waveform.durationSeconds > 0
                  ? (seconds) =>
                      seekCompactWaveform(
                        seconds / waveform.durationSeconds,
                      )
                  : undefined,
            },
            volume: {
              volumePercent,
              setVolumePercent,
            },
          }}
          waveformPeaks={waveform?.peaks ?? []}
          waveformColorMode={colorMode}
          endControls={
            <>
              {displayMode === "full" ? (
                <button
                  type="button"
                  className="hiplingo-now-playing-dock__shuffle-button"
                  aria-label="Shuffle playback queue"
                  title="Shuffle"
                  disabled={activeQueue.length < 2}
                  onClick={shuffleActiveQueue}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 7h3.4c2.2 0 3.3 1.1 4.6 3.2l.4.7" />
                    <path d="M16 5l4 2-4 2" />
                    <path d="M4 17h3.4c2.2 0 3.3-1.1 4.6-3.2l.4-.7" />
                    <path d="M15.4 17H20" />
                    <path d="M16 15l4 2-4 2" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  className="hiplingo-now-playing-dock__listen-button"
                  aria-label="Open Listen"
                  title="Listen"
                  disabled={!onOpenFullPlayer}
                  onClick={() => {
                    onOpenFullPlayer?.();
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M2.5 12h2l1.25-4 2.1 8 2.1-11 2.1 14 2.1-10 2.1 7 1.25-4h3.5" />
                  </svg>
                </button>
              )}

              <button
                ref={metadataButtonRef}
                type="button"
                className="hiplingo-now-playing-dock__metadata-button"
                aria-label="View selected track metadata"
                title="Track information"
                disabled={!selectedTrack}
                onClick={() => {
                  setIsMetadataViewerOpen(true);
                }}
              >
                <span aria-hidden="true">i</span>
              </button>
            </>
          }
          ariaLabel="Current track"
          classNames={{
            root: "hiplingo-now-playing-dock",
            endControls: "hiplingo-now-playing-dock__end-controls",
          }}
        />
      ) : null}

      <footer className="audio-player__footer">
        <span>
          © {new Date().getFullYear()} Hiplingo
        </span>

        <span aria-hidden="true">·</span>

        <span>Audio Player v{APP_VERSION}</span>

        <span aria-hidden="true">·</span>

        <a href={HIPLINGO_CONTACT_MAILTO}>
          Contact
        </a>
      </footer>
    </section>
  );
  },
);

export default AudioPlayer;
