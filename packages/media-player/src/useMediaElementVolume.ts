import {
  useCallback,
  useEffect,
  useState,
  type RefObject,
} from "react";

import {
  clampVolumePercent,
  volumePercentToGain,
} from "./MediaVolumeControl.js";
import type {
  PlaybackVolumeController,
} from "./playback-controller.js";

export type MediaElementVolumeController =
  PlaybackVolumeController;

/*
 * Host-neutral persistent media-element volume state. Both Hiplingo and
 * metadata-editor keep ownership of source attachment, while the shared
 * player package owns the user-facing percentage and the perceptual gain
 * applied to the persistent HTMLAudioElement.
 */
export function useMediaElementVolume(
  audioRef: RefObject<HTMLAudioElement | null>,
  initialVolumePercent = 100,
): MediaElementVolumeController {
  const [volumePercent, setVolumePercentState] =
    useState(() =>
      clampVolumePercent(initialVolumePercent),
    );

  const setVolumePercent = useCallback(
    (nextVolumePercent: number) => {
      setVolumePercentState(
        clampVolumePercent(nextVolumePercent),
      );
    },
    [],
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.volume =
      volumePercentToGain(volumePercent);
  }, [audioRef, volumePercent]);

  return {
    volumePercent,
    setVolumePercent,
  };
}
