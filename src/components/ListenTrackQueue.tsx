import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
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

type ListenTrackQueueProps = {
  catalog: MediaCatalog | null;
  selectedTrackKey: string;
  queueTrackKeys?: readonly string[];
  playingTrackKey?: string | null;
  onPlayTrack?: (trackKey: string, queueTrackKeys?: string[]) => void;
  onNavigateTrack?: (trackKey: string, queueTrackKeys?: string[]) => void;
  onToggleTrackPlayback?: (trackKey: string) => void;
  previousTrackKey?: string | null;
  onPreviousTrack?: () => void;
  onNextTrack?: () => void;
};

export default function ListenTrackQueue({
  catalog,
  selectedTrackKey,
  queueTrackKeys = [],
  playingTrackKey = null,
  onPlayTrack,
  onNavigateTrack,
  onToggleTrackPlayback,
  previousTrackKey = null,
  onPreviousTrack,
  onNextTrack,
}: ListenTrackQueueProps) {
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

  const queueSourceTracks = useMemo<QueueTrack[]>(() => {
    if (queueTrackKeys.length === 0) {
      return playableTracks;
    }

    const playableByKey = new Map(
      playableTracks.map((entry) => [entry.key, entry]),
    );
    const orderedQueue = queueTrackKeys.flatMap((trackKey) => {
      const entry = playableByKey.get(trackKey);
      return entry ? [entry] : [];
    });

    return orderedQueue.length > 0
      ? orderedQueue
      : playableTracks;
  }, [playableTracks, queueTrackKeys]);

  if (
    !catalog ||
    playableTracks.length === 0 ||
    !selectedTrackKey
  ) {
    return null;
  }
  const selectedQueueIndex = queueSourceTracks.findIndex(
    (entry) => entry.key === selectedTrackKey,
  );
  const currentQueueTrack =
    queueSourceTracks.find((entry) => entry.key === selectedTrackKey) ??
    playableTracks.find((entry) => entry.key === selectedTrackKey) ??
    null;
  const currentTitleNeedsExtraSpace = Boolean(
    currentQueueTrack &&
      currentQueueTrack.track.title.trim().length >= 28,
  );
  const previousQueueTrack = previousTrackKey
    ? queueSourceTracks.find(
        (entry) => entry.key === previousTrackKey,
      ) ??
      playableTracks.find(
        (entry) => entry.key === previousTrackKey,
      ) ??
      null
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

  return (
    <section className="listen-track-queue-host" aria-label="Track queue">
      <section
        className="listen-track-queue"
        data-long-current-title={
          currentTitleNeedsExtraSpace ? "true" : "false"
        }
      >
        <div
          className="listen-track-queue__titles"
          data-long-current-title={
            currentTitleNeedsExtraSpace ? "true" : "false"
          }
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

      </section>
    </section>
  );
}
