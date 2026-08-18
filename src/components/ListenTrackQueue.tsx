import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  getReleaseArtist,
  getReleaseDate,
  getTrackArtist,
  getTrackKey,
} from "../lib/mediaCatalog";
import type {
  CatalogRelease,
  CatalogTrack,
  MediaCatalog,
} from "../types/MediaCatalog";

type QueueTrack = {
  key: string;
  release: CatalogRelease;
  track: CatalogTrack;
};

type QueueSortMode =
  | "library"
  | "date-desc"
  | "date-asc"
  | "title"
  | "artist";

type ListenTrackQueueProps = {
  catalog: MediaCatalog | null;
  selectedTrackKey: string;
  playingTrackKey?: string | null;
  onPlayTrack?: (trackKey: string, queueTrackKeys?: string[]) => void;
  onNavigateTrack?: (trackKey: string, queueTrackKeys?: string[]) => void;
  onToggleTrackPlayback?: (trackKey: string) => void;
  onShuffleTracks?: (trackKeys: string[]) => void;
  previousTrackKey?: string | null;
  onPreviousTrack?: () => void;
  onNextTrack?: () => void;
};

const LISTEN_QUEUE_SORT_STORAGE_KEY = "hiplingo.listen-library-sort";

function shuffleTrackKeys(trackKeys: readonly string[]): string[] {
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

function readSortMode(): QueueSortMode {
  if (typeof window === "undefined") {
    return "date-desc";
  }

  try {
    const stored = window.localStorage.getItem(
      LISTEN_QUEUE_SORT_STORAGE_KEY,
    );

    return stored === "library" ||
      stored === "date-desc" ||
      stored === "date-asc" ||
      stored === "title" ||
      stored === "artist"
      ? stored
      : "date-desc";
  } catch {
    return "date-desc";
  }
}

function sortQueueTracks(
  entries: readonly QueueTrack[],
  mode: QueueSortMode,
): QueueTrack[] {
  if (mode === "library") {
    return [...entries];
  }

  const sorted = [...entries];

  sorted.sort((left, right) => {
    if (mode === "title") {
      return left.track.title.localeCompare(
        right.track.title,
        undefined,
        { sensitivity: "base" },
      );
    }

    if (mode === "artist") {
      return getTrackArtist(left.track).localeCompare(
        getTrackArtist(right.track),
        undefined,
        { sensitivity: "base" },
      ) || left.track.title.localeCompare(
        right.track.title,
        undefined,
        { sensitivity: "base" },
      );
    }

    const leftDate = getReleaseDate(left.release) ?? "";
    const rightDate = getReleaseDate(right.release) ?? "";

    if (!leftDate && rightDate) {
      return 1;
    }

    if (leftDate && !rightDate) {
      return -1;
    }

    const dateComparison = leftDate.localeCompare(rightDate);
    if (dateComparison !== 0) {
      return mode === "date-desc" ? -dateComparison : dateComparison;
    }

    return (left.track.trackNumber ?? 0) - (right.track.trackNumber ?? 0);
  });

  return sorted;
}

export default function ListenTrackQueue({
  catalog,
  selectedTrackKey,
  playingTrackKey = null,
  onPlayTrack,
  onNavigateTrack,
  onToggleTrackPlayback,
  onShuffleTracks,
  previousTrackKey = null,
  onPreviousTrack,
  onNextTrack,
}: ListenTrackQueueProps) {
  const [sortMode, setSortMode] = useState<QueueSortMode>(readSortMode);
  const [artistFilter, setArtistFilter] = useState("all");
  const [releaseFilter, setReleaseFilter] = useState("all");
  const [shuffledQueueKeys, setShuffledQueueKeys] = useState<string[]>([]);

  const titlePointerIdRef = useRef<number | null>(null);
  const titleStartXRef = useRef(0);
  const titleStartYRef = useRef(0);
  const titleGestureAxisRef = useRef<"horizontal" | "vertical" | null>(null);
  const titleDragProgressRef = useRef(0);
  const titleSwipeDirectionRef = useRef<"previous" | "next" | "none">(
    "none",
  );
  const titleCommitPendingRef = useRef(false);
  const titleCommitOriginTrackKeyRef = useRef<string | null>(null);
  const titleSuppressClickRef = useRef(false);
  const [titleDragOffset, setTitleDragOffset] = useState(0);
  const [titleDragProgress, setTitleDragProgress] = useState(0);
  const [titleSwipeDirection, setTitleSwipeDirection] = useState<
    "previous" | "next" | "none"
  >("none");
  const [titleCommitDirection, setTitleCommitDirection] = useState<
    "previous" | "next" | null
  >(null);
  const [isDraggingTitles, setIsDraggingTitles] = useState(false);

  useEffect(() => {
    if (!titleCommitDirection) {
      return;
    }

    let secondFrameId = 0;
    const firstFrameId = window.requestAnimationFrame(() => {
      secondFrameId = window.requestAnimationFrame(() => {
        titlePointerIdRef.current = null;
        titleGestureAxisRef.current = null;
        titleDragProgressRef.current = 0;
        titleSwipeDirectionRef.current = "none";
        titleCommitPendingRef.current = false;
        titleCommitOriginTrackKeyRef.current = null;
        setTitleDragOffset(0);
        setTitleDragProgress(0);
        setTitleSwipeDirection("none");
        setIsDraggingTitles(false);
        setTitleCommitDirection(null);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrameId);
      if (secondFrameId) {
        window.cancelAnimationFrame(secondFrameId);
      }
    };
  }, [selectedTrackKey, titleCommitDirection]);

  const playableTracks = useMemo<QueueTrack[]>(() => {
    if (!catalog) {
      return [];
    }

    return catalog.releases.flatMap((release) =>
      release.tracks
        .filter((track) => track.playable)
        .map((track) => ({
          key: getTrackKey(release, track),
          release,
          track,
        })),
    );
  }, [catalog]);

  const artistOptions = useMemo(() => {
    if (!catalog) {
      return [];
    }

    return Array.from(
      new Set(
        catalog.releases.flatMap((release) => [
          getReleaseArtist(release),
          ...release.tracks.map((track) => getTrackArtist(track)),
        ]),
      ),
    )
      .filter(Boolean)
      .sort((left, right) =>
        left.localeCompare(right, undefined, { sensitivity: "base" }),
      );
  }, [catalog]);

  const releaseFilterOptions = useMemo(() => {
    if (!catalog) {
      return [];
    }

    return [...catalog.releases].sort((left, right) =>
      left.title.localeCompare(right.title, undefined, {
        sensitivity: "base",
      }),
    );
  }, [catalog]);

  if (!catalog || playableTracks.length === 0) {
    return null;
  }

  const filteredQueueTracks = playableTracks.filter((entry) => {
    const artistMatches =
      artistFilter === "all" ||
      getTrackArtist(entry.track) === artistFilter ||
      getReleaseArtist(entry.release) === artistFilter;
    const releaseMatches =
      releaseFilter === "all" || entry.release.id === releaseFilter;

    return artistMatches && releaseMatches;
  });
  const sortedQueueTracks = sortQueueTracks(filteredQueueTracks, sortMode);
  const shuffledQueueTracks = shuffledQueueKeys.flatMap((trackKey) => {
    const entry = sortedQueueTracks.find(
      (candidate) => candidate.key === trackKey,
    );
    return entry ? [entry] : [];
  });
  const shuffledQueueIsCurrent =
    shuffledQueueTracks.length === sortedQueueTracks.length &&
    shuffledQueueKeys.every((trackKey) =>
      sortedQueueTracks.some((entry) => entry.key === trackKey),
    );
  const queueSourceTracks = shuffledQueueIsCurrent
    ? shuffledQueueTracks
    : sortedQueueTracks;
  const selectedQueueIndex = queueSourceTracks.findIndex(
    (entry) => entry.key === selectedTrackKey,
  );
  const currentQueueTrack =
    playableTracks.find((entry) => entry.key === selectedTrackKey) ?? null;
  const previousQueueTrack = previousTrackKey
    ? playableTracks.find((entry) => entry.key === previousTrackKey) ?? null
    : null;

  function getQueueTrackAtOffset(offset: number): QueueTrack | null {
    if (queueSourceTracks.length === 0) {
      return null;
    }

    if (selectedQueueIndex < 0) {
      return offset > 0 ? queueSourceTracks[offset - 1] ?? null : null;
    }

    if (queueSourceTracks.length < 2) {
      return null;
    }

    const index = selectedQueueIndex + offset;
    if (index < 0 || index >= queueSourceTracks.length) {
      return null;
    }

    const entry = queueSourceTracks[index] ?? null;
    return entry?.key === selectedTrackKey ? null : entry;
  }

  const previousPreviousQueueTrack =
    queueSourceTracks.length >= 5 ? getQueueTrackAtOffset(-2) : null;
  const nextQueueTrack = getQueueTrackAtOffset(1);
  const nextNextQueueTrack =
    queueSourceTracks.length >= 5 ? getQueueTrackAtOffset(2) : null;
  const queueSourceTrackKeys = queueSourceTracks.map((entry) => entry.key);
  const filtersAreActive = artistFilter !== "all" || releaseFilter !== "all";

  const normalizedTitleProgress = Math.max(
    0,
    Math.min(1, titleDragProgress),
  );
  const titleVisualProgress =
    normalizedTitleProgress *
    normalizedTitleProgress *
    (3 - 2 * normalizedTitleProgress);
  const titleIsPromoted = titleVisualProgress >= 0.5;
  const titleCommitHasAdvanced = Boolean(
    titleCommitDirection &&
      titleCommitOriginTrackKeyRef.current &&
      selectedTrackKey !== titleCommitOriginTrackKeyRef.current,
  );

  function resetTitleSwipeGesture() {
    titlePointerIdRef.current = null;
    titleGestureAxisRef.current = null;
    titleDragProgressRef.current = 0;
    titleSwipeDirectionRef.current = "none";
    setTitleDragOffset(0);
    setTitleDragProgress(0);
    setTitleSwipeDirection("none");
    setIsDraggingTitles(false);
  }

  function releaseTitleSwipeClickSuppression() {
    window.requestAnimationFrame(() => {
      titleSuppressClickRef.current = false;
    });
  }

  function navigateTitleTrack(entry: QueueTrack | null) {
    if (!entry) {
      return;
    }

    if (onNavigateTrack) {
      onNavigateTrack(entry.key, queueSourceTrackKeys);
      return;
    }

    onPlayTrack?.(entry.key, queueSourceTrackKeys);
  }

  function handleTitlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const pointerTarget = event.target as HTMLElement;

    if (!pointerTarget.closest(".listen-track-queue__current")) {
      return;
    }

    if (!previousQueueTrack && !nextQueueTrack) {
      return;
    }

    titlePointerIdRef.current = event.pointerId;
    titleStartXRef.current = event.clientX;
    titleStartYRef.current = event.clientY;
    titleGestureAxisRef.current = null;
    titleDragProgressRef.current = 0;
    titleSwipeDirectionRef.current = "none";
    titleSuppressClickRef.current = false;

    event.currentTarget.setPointerCapture(event.pointerId);
    setTitleDragOffset(0);
    setTitleDragProgress(0);
    setTitleSwipeDirection("none");
    setIsDraggingTitles(true);
  }

  function handleTitlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (titlePointerIdRef.current !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - titleStartXRef.current;
    const deltaY = event.clientY - titleStartYRef.current;

    if (!titleGestureAxisRef.current) {
      const movementThreshold = 8;

      if (
        Math.abs(deltaX) < movementThreshold &&
        Math.abs(deltaY) < movementThreshold
      ) {
        return;
      }

      titleGestureAxisRef.current =
        Math.abs(deltaY) > Math.abs(deltaX) ? "vertical" : "horizontal";

      if (titleGestureAxisRef.current === "vertical") {
        titleSuppressClickRef.current = true;
        const initialDirection = deltaY < 0 ? "next" : "previous";
        titleSwipeDirectionRef.current = initialDirection;
        setTitleSwipeDirection(initialDirection);
      }
    }

    if (titleGestureAxisRef.current !== "vertical") {
      return;
    }

    event.preventDefault();

    const maximumOffset = event.currentTarget.clientHeight * 0.48;
    const reversalThreshold = 12;
    let effectiveDirection = titleSwipeDirectionRef.current;

    if (effectiveDirection === "next" && deltaY > reversalThreshold) {
      effectiveDirection = "previous";
      titleSwipeDirectionRef.current = effectiveDirection;
      setTitleSwipeDirection(effectiveDirection);
    } else if (
      effectiveDirection === "previous" &&
      deltaY < -reversalThreshold
    ) {
      effectiveDirection = "next";
      titleSwipeDirectionRef.current = effectiveDirection;
      setTitleSwipeDirection(effectiveDirection);
    } else if (effectiveDirection === "none") {
      effectiveDirection = deltaY < 0 ? "next" : "previous";
      titleSwipeDirectionRef.current = effectiveDirection;
      setTitleSwipeDirection(effectiveDirection);
    }

    const constrainedOffset =
      effectiveDirection === "next"
        ? Math.max(
            -maximumOffset,
            Math.min(0, deltaY > -reversalThreshold ? 0 : deltaY),
          )
        : Math.min(
            maximumOffset,
            Math.max(0, deltaY < reversalThreshold ? 0 : deltaY),
          );
    const selectionThreshold = event.currentTarget.clientHeight * 0.22;
    const dragProgress = Math.min(
      Math.abs(constrainedOffset) / selectionThreshold,
      1,
    );

    titleDragProgressRef.current = dragProgress;
    setTitleDragOffset(constrainedOffset);
    setTitleDragProgress(dragProgress);
  }

  function handleTitlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (titlePointerIdRef.current !== event.pointerId) {
      return;
    }

    const latestDragProgress = titleDragProgressRef.current;
    const latestSwipeDirection = titleSwipeDirectionRef.current;
    const shouldCommit =
      titleGestureAxisRef.current === "vertical" && latestDragProgress >= 0.9;
    const committedDirection = shouldCommit
      ? latestSwipeDirection === "next" || latestSwipeDirection === "previous"
        ? latestSwipeDirection
        : null
      : null;

    titlePointerIdRef.current = null;
    titleGestureAxisRef.current = null;
    setIsDraggingTitles(false);

    if (committedDirection) {
      titleCommitPendingRef.current = true;
      titleCommitOriginTrackKeyRef.current = selectedTrackKey;
      setTitleCommitDirection(committedDirection);

      if (committedDirection === "next") {
        if (nextQueueTrack) {
          navigateTitleTrack(nextQueueTrack);
        } else {
          onNextTrack?.();
        }
      } else if (onPreviousTrack) {
        onPreviousTrack();
      }

      return;
    }

    resetTitleSwipeGesture();
    if (titleSuppressClickRef.current) {
      releaseTitleSwipeClickSuppression();
    }
  }

  function handleTitlePointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    if (titlePointerIdRef.current !== event.pointerId) {
      return;
    }

    resetTitleSwipeGesture();
    releaseTitleSwipeClickSuppression();
  }

  function handleTitleLostPointerCapture(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (titleCommitPendingRef.current) {
      return;
    }

    if (
      titlePointerIdRef.current !== null &&
      titlePointerIdRef.current !== event.pointerId
    ) {
      return;
    }

    resetTitleSwipeGesture();
  }

  function chooseSortMode(mode: QueueSortMode) {
    setSortMode(mode);
    try {
      window.localStorage.setItem(LISTEN_QUEUE_SORT_STORAGE_KEY, mode);
    } catch {
      // Sort persistence is optional UI convenience.
    }
  }

  return (
    <section className="listen-track-queue-host" aria-label="Track queue">
      <section className="listen-track-queue">
        <div
          className="listen-track-queue__titles"
          data-swipe-direction={
            titleCommitHasAdvanced ? "none" : titleSwipeDirection
          }
          data-has-previous={previousQueueTrack ? "true" : "false"}
          data-swipe-promoted={titleIsPromoted ? "true" : "false"}
          data-swipe-committing={titleCommitDirection ? "true" : "false"}
          data-commit-direction={titleCommitDirection ?? "none"}
          style={
            {
              "--listen-title-drag-y": `${titleDragOffset}px`,
              "--listen-title-visual-progress": titleVisualProgress,
            } as CSSProperties
          }
          onPointerDown={handleTitlePointerDown}
          onPointerMove={handleTitlePointerMove}
          onPointerUp={handleTitlePointerEnd}
          onPointerCancel={handleTitlePointerCancel}
          onLostPointerCapture={handleTitleLostPointerCapture}
          onClickCapture={(event) => {
            if (!titleSuppressClickRef.current) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            titleSuppressClickRef.current = false;
          }}
        >
          {previousPreviousQueueTrack ? (
            <button
              key="queue-title-far-previous"
              type="button"
              className="listen-track-queue__title listen-track-queue__title--far-previous"
              onClick={() => {
                onPlayTrack?.(
                  previousPreviousQueueTrack.key,
                  queueSourceTrackKeys,
                );
              }}
              aria-label={`Earlier track: ${previousPreviousQueueTrack.track.title}`}
              title={`Earlier: ${previousPreviousQueueTrack.track.title}`}
            >
              <strong>{previousPreviousQueueTrack.track.title}</strong>
            </button>
          ) : null}

          {previousQueueTrack && onPreviousTrack ? (
            <button
              key="queue-title-previous"
              type="button"
              className="listen-track-queue__title listen-track-queue__title--previous"
              onClick={onPreviousTrack}
              aria-label={`Previous track: ${previousQueueTrack.track.title}`}
              title={`Previous: ${previousQueueTrack.track.title}`}
            >
              <strong>{previousQueueTrack.track.title}</strong>
            </button>
          ) : null}

          {currentQueueTrack ? (
            <button
              key="queue-title-current"
              type="button"
              className={[
                "listen-track-queue__title",
                "listen-track-queue__current",
                isDraggingTitles
                  ? "listen-track-queue__current--dragging"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                if (titleSuppressClickRef.current) {
                  titleSuppressClickRef.current = false;
                  return;
                }

                onToggleTrackPlayback?.(currentQueueTrack.key);
              }}
              aria-current="true"
              aria-label={
                playingTrackKey === currentQueueTrack.key
                  ? `Pause ${currentQueueTrack.track.title}`
                  : `Play ${currentQueueTrack.track.title}`
              }
              aria-pressed={playingTrackKey === currentQueueTrack.key}
            >
              <strong>{currentQueueTrack.track.title}</strong>
            </button>
          ) : (
            <p className="listen-track-queue__empty">
              No tracks match these filters.
            </p>
          )}

          {nextQueueTrack ? (
            <button
              key="queue-title-next"
              type="button"
              className="listen-track-queue__title listen-track-queue__title--next"
              onClick={() => {
                onPlayTrack?.(nextQueueTrack.key, queueSourceTrackKeys);
              }}
              aria-label={`Next track: ${nextQueueTrack.track.title}`}
              title={`Next: ${nextQueueTrack.track.title}`}
            >
              <strong>{nextQueueTrack.track.title}</strong>
            </button>
          ) : null}

          {nextNextQueueTrack ? (
            <button
              key="queue-title-far-next"
              type="button"
              className="listen-track-queue__title listen-track-queue__title--far-next"
              onClick={() => {
                onPlayTrack?.(nextNextQueueTrack.key, queueSourceTrackKeys);
              }}
              aria-label={`Later track: ${nextNextQueueTrack.track.title}`}
              title={`Later: ${nextNextQueueTrack.track.title}`}
            >
              <strong>{nextNextQueueTrack.track.title}</strong>
            </button>
          ) : null}
        </div>

        <nav className="listen-track-queue__filters" aria-label="Track filters">
          <div className="listen-track-queue__filter-row">
            <label className="listen-track-queue__filter-control">
              <span>Artist</span>
              <select
                value={artistFilter}
                onChange={(event) => {
                  setArtistFilter(event.currentTarget.value);
                  setShuffledQueueKeys([]);
                }}
              >
                <option value="all">All artists</option>
                {artistOptions.map((artist) => (
                  <option key={artist} value={artist}>
                    {artist}
                  </option>
                ))}
              </select>
            </label>

            <label className="listen-track-queue__filter-control">
              <span>Release</span>
              <select
                value={releaseFilter}
                onChange={(event) => {
                  setReleaseFilter(event.currentTarget.value);
                  setShuffledQueueKeys([]);
                }}
              >
                <option value="all">All releases</option>
                {releaseFilterOptions.map((release) => (
                  <option key={release.id} value={release.id}>
                    {release.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="listen-track-queue__filter-control">
              <span>Sort</span>
              <select
                value={sortMode}
                onChange={(event) => {
                  setShuffledQueueKeys([]);
                  chooseSortMode(event.currentTarget.value as QueueSortMode);
                }}
              >
                <option value="library">Library order</option>
                <option value="date-desc">Newest first</option>
                <option value="date-asc">Oldest first</option>
                <option value="title">Track · A–Z</option>
                <option value="artist">Artist · A–Z</option>
              </select>
            </label>

            <button
              type="button"
              className="listen-track-queue__shuffle"
              aria-label="Shuffle matching tracks"
              title="Shuffle matching tracks"
              disabled={sortedQueueTracks.length < 2}
              onClick={() => {
                const shuffledTrackKeys = shuffleTrackKeys(
                  sortedQueueTracks.map((entry) => entry.key),
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

                setShuffledQueueKeys(shuffledTrackKeys);
                onShuffleTracks?.(shuffledTrackKeys);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h3.4c2.2 0 3.3 1.1 4.6 3.2l.4.7" />
                <path d="M16 5l4 2-4 2" />
                <path d="M4 17h3.4c2.2 0 3.3-1.1 4.6-3.2l.4-.7" />
                <path d="M15.4 17H20" />
                <path d="M16 15l4 2-4 2" />
              </svg>
              <span>Shuffle</span>
            </button>

            {filtersAreActive ? (
              <button
                type="button"
                className="listen-track-queue__clear-filters"
                onClick={() => {
                  setArtistFilter("all");
                  setReleaseFilter("all");
                  setShuffledQueueKeys([]);
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
        </nav>
      </section>
    </section>
  );
}
