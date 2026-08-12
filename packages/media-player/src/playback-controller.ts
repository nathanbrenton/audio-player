export type PlaybackQueueDirection = -1 | 1;

export type PlaybackQueueEntry =
  | string
  | { key: string };

export type PlaybackTransportController = {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isLoading?: boolean;
  canToggle?: boolean;
  canPrevious?: boolean;
  canNext?: boolean;
  previous?: () => void;
  toggle: () => void;
  next?: () => void;
  seek?: (seconds: number) => void;
};

export function getPlaybackQueueKey(
  entry: PlaybackQueueEntry,
): string {
  return typeof entry === "string" ? entry : entry.key;
}

export function dedupePlaybackQueue<
  TEntry extends PlaybackQueueEntry,
>(entries: readonly TEntry[]): TEntry[] {
  const seen = new Set<string>();

  return entries.filter((entry) => {
    const key = getPlaybackQueueKey(entry);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function getPlaybackQueueIndex<
  TEntry extends PlaybackQueueEntry,
>(
  entries: readonly TEntry[],
  activeKey: string | null | undefined,
): number {
  if (!activeKey) {
    return -1;
  }

  return entries.findIndex(
    (entry) => getPlaybackQueueKey(entry) === activeKey,
  );
}

export function getPlaybackQueueNeighbor<
  TEntry extends PlaybackQueueEntry,
>(
  entries: readonly TEntry[],
  activeKey: string | null | undefined,
  direction: PlaybackQueueDirection,
): TEntry | null {
  const currentIndex = getPlaybackQueueIndex(
    entries,
    activeKey,
  );
  if (currentIndex < 0) {
    return null;
  }

  return entries[currentIndex + direction] ?? null;
}

export function getPlaybackQueueCapabilities<
  TEntry extends PlaybackQueueEntry,
>(
  entries: readonly TEntry[],
  activeKey: string | null | undefined,
): { canPrevious: boolean; canNext: boolean } {
  const currentIndex = getPlaybackQueueIndex(
    entries,
    activeKey,
  );

  return {
    canPrevious: currentIndex > 0,
    canNext:
      currentIndex >= 0 &&
      currentIndex < entries.length - 1,
  };
}
