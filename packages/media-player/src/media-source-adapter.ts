export type MediaSourceAttachRequest<TSource> = {
  audio: HTMLAudioElement;
  mediaKey: string;
  source: TSource;
  autoplay: boolean;
};

export type MediaSourceAttachResult =
  boolean | Promise<boolean>;

/*
 * Host-neutral source-attachment boundary.
 *
 * The shared player/session may ask an adapter to attach or dispose a
 * source, but source interpretation remains host-owned. Hiplingo can keep
 * HLS/native-HLS behavior while metadata-editor can keep guarded private
 * preview URLs without either implementation leaking into this package.
 */
export type MediaSourceAdapter<TSource> = {
  attach: (
    request: MediaSourceAttachRequest<TSource>,
  ) => MediaSourceAttachResult;
  dispose: (audio: HTMLAudioElement) => void;
};
