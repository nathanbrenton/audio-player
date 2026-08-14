import {
  useCallback,
  useState,
  type RefObject,
} from "react";

export type MediaElementPlaybackStateController = {
  isPlaying: boolean;
  isLoading: boolean;
  setPlaying: (isPlaying: boolean) => void;
  setLoading: (isLoading: boolean) => void;
  reset: () => void;
  syncPlaying: (
    media?: HTMLMediaElement | null,
  ) => boolean;
};

/*
 * Shared play/pause/loading state for one persistent media element.
 * Hosts still own media-event policy in this phase: Hiplingo keeps its
 * scrub/ended/HLS reconciliation and metadata-editor keeps its queue and
 * preview-source behavior. This hook only centralizes persistent state and
 * the common "is this media element actively playing?" normalization.
 */
export function useMediaElementPlaybackState(
  mediaRef: RefObject<HTMLMediaElement | null>,
): MediaElementPlaybackStateController {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const setPlaying = useCallback((nextIsPlaying: boolean) => {
    setIsPlaying(nextIsPlaying);
  }, []);

  const setLoading = useCallback((nextIsLoading: boolean) => {
    setIsLoading(nextIsLoading);
  }, []);

  const reset = useCallback(() => {
    setIsPlaying(false);
    setIsLoading(false);
  }, []);

  const syncPlaying = useCallback(
    (providedMedia?: HTMLMediaElement | null) => {
      const media = providedMedia ?? mediaRef.current;
      const nextIsPlaying = Boolean(
        media &&
        !media.paused &&
        !media.ended &&
        media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
      );

      setIsPlaying(nextIsPlaying);
      return nextIsPlaying;
    },
    [mediaRef],
  );

  return {
    isPlaying,
    isLoading,
    setPlaying,
    setLoading,
    reset,
    syncPlaying,
  };
}
