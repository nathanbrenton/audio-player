export type PlayableMediaItem<TSource = unknown> = {
  key: string;
  source: TSource;
  title: string;
  artist?: string | null;
  releaseTitle?: string | null;
  detail?: string | null;
  artworkUrl?: string | null;
  waveformUrl?: string | null;
};

export function getPlayableMediaContext(
  item: Pick<PlayableMediaItem, "artist" | "releaseTitle">,
): string {
  return [item.artist, item.releaseTitle]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join(" · ");
}
