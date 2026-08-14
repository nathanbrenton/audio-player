import {
  useCallback,
  useRef,
  type AudioHTMLAttributes,
  type RefObject,
} from "react";

export type PersistentMediaElementController = {
  audioRef: RefObject<HTMLAudioElement | null>;
  bindAudioElement: (audio: HTMLAudioElement | null) => void;
};

/*
 * Shared ownership for the persistent HTMLAudioElement reference. The host
 * still decides where the element is rendered and which source adapter feeds
 * it, while every playback/analyser/timeline hook observes the same element.
 */
export function usePersistentMediaElement(): PersistentMediaElementController {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const bindAudioElement = useCallback(
    (audio: HTMLAudioElement | null) => {
      audioRef.current = audio;
    },
    [],
  );

  return {
    audioRef,
    bindAudioElement,
  };
}

export type PersistentMediaElementProps = Omit<
  AudioHTMLAttributes<HTMLAudioElement>,
  "ref"
> & {
  controller: PersistentMediaElementController;
};

export function PersistentMediaElement({
  controller,
  preload = "metadata",
  ...props
}: PersistentMediaElementProps) {
  return (
    <audio
      {...props}
      ref={controller.bindAudioElement}
      preload={preload}
    />
  );
}
