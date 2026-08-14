import {
  useCallback,
  useState,
  type RefObject,
} from "react";

export type MediaElementSeekOptions = {
  upperBound?: number;
  dispatchSeekEvent?: boolean;
};

export type MediaElementTimelineController = {
  currentTime: number;
  duration: number;
  reset: () => void;
  syncCurrentTime: (media?: HTMLMediaElement | null) => void;
  syncDuration: (media?: HTMLMediaElement | null) => void;
  seek: (
    seconds: number,
    options?: MediaElementSeekOptions,
  ) => number | null;
};

/*
 * Shared timeline state for one persistent HTML media element.
 * Hosts still own source attachment and media-event policy, but both use
 * the same time normalization, duration normalization, and direct seek path.
 */
export function useMediaElementTimeline(
  mediaRef: RefObject<HTMLMediaElement | null>,
): MediaElementTimelineController {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const reset = useCallback(() => {
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const syncCurrentTime = useCallback(
    (providedMedia?: HTMLMediaElement | null) => {
      const media = providedMedia ?? mediaRef.current;
      if (!media) {
        return;
      }

      setCurrentTime(
        Number.isFinite(media.currentTime)
          ? Math.max(0, media.currentTime)
          : 0,
      );
    },
    [mediaRef],
  );

  const syncDuration = useCallback(
    (providedMedia?: HTMLMediaElement | null) => {
      const media = providedMedia ?? mediaRef.current;
      if (!media) {
        return;
      }

      setDuration(
        Number.isFinite(media.duration)
          ? Math.max(0, media.duration)
          : 0,
      );
    },
    [mediaRef],
  );

  const seek = useCallback(
    (
      seconds: number,
      options: MediaElementSeekOptions = {},
    ) => {
      const media = mediaRef.current;
      if (!media || !Number.isFinite(seconds)) {
        return null;
      }

      const requestedUpperBound =
        options.upperBound !== undefined &&
        Number.isFinite(options.upperBound)
          ? Math.max(0, options.upperBound)
          : null;
      const mediaUpperBound = Number.isFinite(media.duration)
        ? Math.max(0, media.duration)
        : null;
      const upperBound =
        requestedUpperBound ??
        mediaUpperBound ??
        Math.max(0, seconds);
      const nextTime = Math.min(
        upperBound,
        Math.max(0, seconds),
      );

      media.currentTime = nextTime;

      if (options.dispatchSeekEvent) {
        media.dispatchEvent(new Event("audioplayerseek"));
      }

      setCurrentTime(
        Number.isFinite(media.currentTime)
          ? Math.max(0, media.currentTime)
          : nextTime,
      );

      return media.currentTime;
    },
    [mediaRef],
  );

  return {
    currentTime,
    duration,
    reset,
    syncCurrentTime,
    syncDuration,
    seek,
  };
}
