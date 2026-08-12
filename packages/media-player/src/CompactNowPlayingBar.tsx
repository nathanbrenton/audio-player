import type { ReactNode } from "react";

import { CompactWaveformCanvas } from "./CompactWaveformCanvas.js";
import { MediaTransportIcon } from "./MediaTransportIcon.js";
import { formatPlaybackTime } from "./playback.js";
import type { PlaybackTransportController } from "./playback-controller.js";
import type {
  WaveformColorMode,
  WaveformPeak,
} from "./waveform.js";

export type CompactNowPlayingBarClassNames = {
  root?: string;
  artwork?: string;
  identity?: string;
  title?: string;
  context?: string;
  detail?: string;
  time?: string;
  waveformRegion?: string;
  waveform?: string;
  transport?: string;
  playButton?: string;
  transportIcon?: string;
  endControls?: string;
  error?: string;
};

export type CompactNowPlayingBarProps = {
  artworkUrl?: string | null;
  artworkFallback?: ReactNode;
  title: string;
  context?: ReactNode;
  detail?: ReactNode;
  transport: PlaybackTransportController;
  waveformPeaks?: WaveformPeak[] | null;
  waveformColorMode: WaveformColorMode;
  waveformFallback?: ReactNode;
  seekLabel?: string;
  transportTrailing?: ReactNode;
  endControls?: ReactNode;
  error?: ReactNode;
  ariaLabel?: string;
  classNames?: CompactNowPlayingBarClassNames;
};

export function CompactNowPlayingBar({
  artworkUrl,
  artworkFallback = "♪",
  title,
  context,
  detail,
  transport,
  waveformPeaks,
  waveformColorMode,
  waveformFallback,
  seekLabel = "Seek within current track",
  transportTrailing,
  endControls,
  error,
  ariaLabel = "Now playing",
  classNames = {},
}: CompactNowPlayingBarProps) {
  const {
    currentTime,
    duration,
    isPlaying,
    isLoading = false,
    canToggle = true,
    canPrevious = false,
    canNext = false,
    previous,
    toggle,
    next,
    seek,
  } = transport;
  const safeDuration = Math.max(0, duration);
  const safeCurrentTime = Math.min(
    safeDuration || Math.max(0, currentTime),
    Math.max(0, currentTime),
  );
  const progress =
    safeDuration > 0 ? safeCurrentTime / safeDuration : 0;
  const canSeek = Boolean(seek && safeDuration > 0);

  return (
    <section
      className={joinClassNames("shared-now-playing", classNames.root)}
      aria-label={ariaLabel}
      data-shared-now-playing="true"
    >
      <div
        className={joinClassNames(
          "shared-now-playing__artwork",
          classNames.artwork,
        )}
        aria-hidden="true"
      >
        {artworkUrl ? <img src={artworkUrl} alt="" /> : artworkFallback}
      </div>

      <div
        className={joinClassNames(
          "shared-now-playing__identity",
          classNames.identity,
        )}
      >
        <strong
          className={joinClassNames(
            "shared-now-playing__title",
            classNames.title,
          )}
        >
          {title}
        </strong>
        {context ? (
          <div
            className={joinClassNames(
              "shared-now-playing__context",
              classNames.context,
            )}
          >
            {context}
          </div>
        ) : null}
        {detail ? (
          <div
            className={joinClassNames(
              "shared-now-playing__detail",
              classNames.detail,
            )}
          >
            {detail}
          </div>
        ) : null}
      </div>

      <output
        className={joinClassNames(
          "shared-now-playing__time",
          classNames.time,
        )}
        aria-label="Current and total playback time"
      >
        <span>{formatPlaybackTime(safeCurrentTime)}</span>
        <span aria-hidden="true">/</span>
        <span>{formatPlaybackTime(safeDuration)}</span>
      </output>

      <div
        className={joinClassNames(
          "shared-now-playing__waveform-region",
          classNames.waveformRegion,
        )}
      >
        {waveformPeaks && waveformPeaks.length > 0 ? (
          <CompactWaveformCanvas
            peaks={waveformPeaks}
            colorMode={waveformColorMode}
            progress={progress}
            className={joinClassNames(
              "shared-now-playing__waveform",
              classNames.waveform,
            )}
            style={{ width: "100%", height: "100%" }}
            onSeek={
              canSeek && seek
                ? (nextProgress) => seek(nextProgress * safeDuration)
                : undefined
            }
            seekLabel={seekLabel}
          />
        ) : (
          waveformFallback ?? null
        )}
      </div>

      <div
        className={joinClassNames(
          "shared-now-playing__transport",
          classNames.transport,
        )}
        role="group"
        aria-label="Playback controls"
      >
        <button
          type="button"
          onClick={previous}
          disabled={!canPrevious || !previous}
          aria-label="Previous track"
          title="Previous track"
        >
          <MediaTransportIcon
            name="previous"
            className={joinClassNames(
              "shared-now-playing__transport-icon",
              classNames.transportIcon,
            )}
          />
        </button>
        <button
          type="button"
          className={joinClassNames(
            "shared-now-playing__play",
            classNames.playButton,
          )}
          onClick={toggle}
          disabled={!canToggle}
          aria-label={isPlaying ? "Pause" : "Play"}
          aria-pressed={isPlaying}
          aria-keyshortcuts="Space"
          title={isPlaying ? "Pause (Space)" : "Play (Space)"}
        >
          {isLoading ? (
            "…"
          ) : (
            <MediaTransportIcon
              name={isPlaying ? "pause" : "play"}
              className={joinClassNames(
                "shared-now-playing__transport-icon",
                classNames.transportIcon,
              )}
            />
          )}
        </button>
        <button
          type="button"
          onClick={next}
          disabled={!canNext || !next}
          aria-label="Next track"
          title="Next track"
        >
          <MediaTransportIcon
            name="next"
            className={joinClassNames(
              "shared-now-playing__transport-icon",
              classNames.transportIcon,
            )}
          />
        </button>
        {transportTrailing}
      </div>

      {endControls ? (
        classNames.endControls ? (
          <div
            className={joinClassNames(
              "shared-now-playing__end-controls",
              classNames.endControls,
            )}
          >
            {endControls}
          </div>
        ) : (
          endControls
        )
      ) : null}

      {error ? (
        <div
          className={joinClassNames(
            "shared-now-playing__error",
            classNames.error,
          )}
          role="alert"
        >
          {error}
        </div>
      ) : null}
    </section>
  );
}

function joinClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(" ");
}
