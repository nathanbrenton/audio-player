import {
  useCallback,
  useRef,
  type RefObject,
} from "react";

import type {
  MediaSourceAdapter,
  MediaSourceAttachRequest,
  MediaSourceAttachResult,
} from "./media-source-adapter.js";

export type MediaSourceSessionAttachRequest<TSource> = Omit<
  MediaSourceAttachRequest<TSource>,
  "audio"
>;

export type MediaSourceSessionController<TSource> = {
  attach: (
    request: MediaSourceSessionAttachRequest<TSource>,
  ) => MediaSourceAttachResult;
  dispose: () => void;
  isCurrent: (mediaKey: string) => boolean;
  getCurrentMediaKey: () => string | null;
};

/*
 * Shared orchestration for one persistent media element and one host source
 * adapter. The session owns which media key is currently attached and supplies
 * the persistent element to the adapter. Source interpretation remains local
 * to each host.
 */
export function useMediaSourceSession<TSource>(
  audioRef: RefObject<HTMLAudioElement | null>,
  adapter: MediaSourceAdapter<TSource>,
): MediaSourceSessionController<TSource> {
  const adapterRef = useRef(adapter);
  const currentMediaKeyRef = useRef<string | null>(null);
  const attachedAudioRef = useRef<HTMLAudioElement | null>(null);

  adapterRef.current = adapter;

  const attach = useCallback(
    (request: MediaSourceSessionAttachRequest<TSource>) => {
      const audio = audioRef.current;
      if (!audio) {
        return false;
      }

      currentMediaKeyRef.current = request.mediaKey;
      attachedAudioRef.current = audio;

      return adapterRef.current.attach({
        audio,
        ...request,
      });
    },
    [audioRef],
  );

  const dispose = useCallback(() => {
    const audio = audioRef.current ?? attachedAudioRef.current;
    currentMediaKeyRef.current = null;
    attachedAudioRef.current = null;

    if (audio) {
      adapterRef.current.dispose(audio);
    }
  }, [audioRef]);

  const isCurrent = useCallback((mediaKey: string) => {
    return currentMediaKeyRef.current === mediaKey;
  }, []);

  const getCurrentMediaKey = useCallback(() => {
    return currentMediaKeyRef.current;
  }, []);

  return {
    attach,
    dispose,
    isCurrent,
    getCurrentMediaKey,
  };
}
