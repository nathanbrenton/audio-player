import {
  useCallback,
} from "react";

import type {
  MediaElementPlaybackStateController,
} from "./useMediaElementPlaybackState.js";

export type MediaElementPlaybackEventController = {
  handlePlay: () => void;
  handlePlaying: () => void;
  handlePause: () => void;
  handleWaiting: () => void;
  handleCanPlay: () => void;
  handleAbort: () => void;
  handleError: () => void;
  handleEmptied: () => void;
};

type PlaybackEventState = Pick<
  MediaElementPlaybackStateController,
  "setPlaying" | "setLoading" | "reset"
>;

/*
 * Shared ordinary HTML-media event transitions.
 *
 * Hosts still own source attachment and policy-heavy events. In particular,
 * "ended" stays host-owned because queue advancement differs, and Hiplingo
 * keeps its scrub/seek reconciliation and HLS lifecycle around these common
 * transitions.
 */
export function useMediaElementPlaybackEvents(
  state: PlaybackEventState,
): MediaElementPlaybackEventController {
  const {
    setPlaying,
    setLoading,
    reset,
  } = state;

  const handlePlay = useCallback(() => {
    setPlaying(true);
    setLoading(false);
  }, [setLoading, setPlaying]);

  const handlePlaying = useCallback(() => {
    setPlaying(true);
    setLoading(false);
  }, [setLoading, setPlaying]);

  const handlePause = useCallback(() => {
    setPlaying(false);
    setLoading(false);
  }, [setLoading, setPlaying]);

  const handleWaiting = useCallback(() => {
    setLoading(true);
  }, [setLoading]);

  const handleCanPlay = useCallback(() => {
    setLoading(false);
  }, [setLoading]);

  const handleAbort = useCallback(() => {
    setPlaying(false);
    setLoading(false);
  }, [setLoading, setPlaying]);

  const handleError = useCallback(() => {
    setPlaying(false);
    setLoading(false);
  }, [setLoading, setPlaying]);

  const handleEmptied = useCallback(() => {
    reset();
  }, [reset]);

  return {
    handlePlay,
    handlePlaying,
    handlePause,
    handleWaiting,
    handleCanPlay,
    handleAbort,
    handleError,
    handleEmptied,
  };
}
