// React imports
import { useEffect, useRef, useState } from "react";

import WaveformCanvas, {
  type WaveformColorMode,
} from "./WaveformCanvas";

type WaveformData = {
  version: number;
  durationSeconds: number;
  sampleRate: number;
  sourceChannels: number;
  waveformChannels: number;
  bitsPerSample: number;
  peaksPerSecond: number;

  analysis: {
    fftSize: number;
    window: string;

    bandsHz: {
      low: [number, number];
      mid: [number, number];
      high: [number, number];
    };

    peakFields: string[];

    normalization: {
      method: string;
      percentile: number;
      compression: string;

      references: {
        low: number;
        mid: number;
        high: number;
      };
    };
  };

  peakCount: number;

  /*
   * Peak format:
   * [minimum, maximum, low, mid, high]
   */
  peaks: [
    number,
    number,
    number,
    number,
    number,
  ][];
};

/*
 * Format seconds as minutes and seconds for player-facing timestamps.
 */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;

  return `${minutes}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}

export default function AudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Player state.
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Waveform data and visual settings.
  const [waveform, setWaveform] =
    useState<WaveformData | null>(null);
  const [colorMode, setColorMode] =
    useState<WaveformColorMode>("3band");

  // Horizontal waveform scale in canvas pixels per second.
  const [pixelsPerSecond, setPixelsPerSecond] =
    useState(100);

  useEffect(() => {
    async function loadWaveform() {
      const response = await fetch(
        "/releases/2025-01-01_midi-mockups/tracks/artist_03_sd-midi-mockup/waveform-peaks.json",
      );

      if (!response.ok) {
        throw new Error(
          `Failed to load waveform: ${response.status}`,
        );
      }

      const data = (await response.json()) as WaveformData;
      setWaveform(data);
    }

    void loadWaveform();
  }, []);

  async function togglePlayback() {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (audio.paused) {
      await audio.play();
    } else {
      audio.pause();
    }
  }

  return (
    <section
      className="audio-player"
      aria-label="Audio player"
    >
      <header className="audio-player__header">
        <h2>Track Player</h2>
      </header>

      <audio
        ref={audioRef}
        src="/releases/2025-01-01_midi-mockups/tracks/artist_03_sd-midi-mockup/audio-playback.mp3"
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(event) => {
          setCurrentTime(event.currentTarget.currentTime);
        }}
      />

      <div className="player-controls">
        <button
          className="player-controls__play-button"
          type="button"
          onClick={togglePlayback}
        >
          {isPlaying ? "Pause" : "Play"}
        </button>

        <label className="player-controls__field">
          <span>Waveform color</span>
        <select
          value={colorMode}
          onChange={(event) => {
            setColorMode(
              event.currentTarget.value as WaveformColorMode,
            );
          }}
        >
          <option value="3band">3Band</option>
          <option value="rgb">RGB</option>
          <option value="blue">Blue</option>
          <option value="monochrome">Monochrome</option>
        </select>
        </label>

        <label className="player-controls__field">
          <span>Waveform zoom</span>
        <select
          value={pixelsPerSecond}
          onChange={(event) => {
            setPixelsPerSecond(
              Number(event.currentTarget.value),
            );
          }}
        >
          <option value={50}>50 px/s</option>
          <option value={100}>100 px/s</option>
          <option value={200}>200 px/s</option>
          <option value={400}>400 px/s</option>
        </select>
        </label>
      </div>

      {waveform ? (
        <>
          <div className="waveform-panel">
            <WaveformCanvas
              peaks={waveform.peaks}
              audioRef={audioRef}
              isPlaying={isPlaying}
              colorMode={colorMode}
              pixelsPerSecond={pixelsPerSecond}
              peaksPerSecond={waveform.peaksPerSecond}
            />
          </div>

          <div className="metadata-grid">
            <section
              className="metadata-card"
              aria-labelledby="playback-details-heading"
            >
            <h3 id="playback-details-heading">
              Playback
            </h3>

            <dl>
              <dt>Current time</dt>
              <dd>{formatTime(currentTime)}</dd>

              <dt>Duration</dt>
              <dd>{formatTime(waveform.durationSeconds)}</dd>
            </dl>
          </section>

            <section
              className="metadata-card"
              aria-labelledby="waveform-analysis-heading"
            >
            <h3 id="waveform-analysis-heading">
              Waveform analysis
            </h3>

            <dl>
              <dt>Sample rate</dt>
              <dd>
                {waveform.sampleRate.toLocaleString()} Hz
              </dd>

              <dt>FFT size</dt>
              <dd>{waveform.analysis.fftSize}</dd>

              <dt>Window</dt>
              <dd>{waveform.analysis.window}</dd>

              <dt>Peaks per second</dt>
              <dd>{waveform.peaksPerSecond}</dd>

              <dt>Peak count</dt>
              <dd>
                {waveform.peakCount.toLocaleString()}
              </dd>
            </dl>
          </section>

            <section
              className="metadata-card"
              aria-labelledby="frequency-bands-heading"
            >
            <h3 id="frequency-bands-heading">
              Frequency bands
            </h3>

            <dl>
              <dt>Low</dt>
              <dd>
                {waveform.analysis.bandsHz.low[0]}–
                {waveform.analysis.bandsHz.low[1]} Hz
              </dd>

              <dt>Mid</dt>
              <dd>
                {waveform.analysis.bandsHz.mid[0]}–
                {waveform.analysis.bandsHz.mid[1]} Hz
              </dd>

              <dt>High</dt>
              <dd>
                {waveform.analysis.bandsHz.high[0]}–
                {waveform.analysis.bandsHz.high[1]} Hz
              </dd>
            </dl>
          </section>

            <section
              className="metadata-card"
              aria-labelledby="normalization-heading"
            >
            <h3 id="normalization-heading">
              Normalization
            </h3>

            <dl>
              <dt>Method</dt>
              <dd>
                {waveform.analysis.normalization.method}
              </dd>

              <dt>Percentile</dt>
              <dd>
                {waveform.analysis.normalization.percentile}
              </dd>

              <dt>Compression</dt>
              <dd>
                {waveform.analysis.normalization.compression}
              </dd>
            </dl>
            </section>
          </div>
        </>
      ) : (
        <p>Loading waveform data…</p>
      )}
    </section>
  );
}
