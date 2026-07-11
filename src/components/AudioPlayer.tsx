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

export default function AudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Player state.
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Waveform data and visual settings.
  const [waveform, setWaveform] =
    useState<WaveformData | null>(null);
  const [colorMode, setColorMode] =
    useState<WaveformColorMode>("rgb");

  // Horizontal waveform scale in canvas pixels per second.
  const [pixelsPerSecond, setPixelsPerSecond] =
    useState(100);

  useEffect(() => {
    async function loadWaveform() {
      const response = await fetch(
        "/media/demo-track/waveform-peaks.json",
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
    <section aria-label="Audio player">
      <h2>Track Player</h2>

      <audio
        ref={audioRef}
        src="/media/demo-track/audio-playback.mp3"
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(event) => {
          setCurrentTime(event.currentTarget.currentTime);
        }}
      />

      <button type="button" onClick={togglePlayback}>
        {isPlaying ? "Pause" : "Play"}
      </button>

      <label>
        Waveform color
        <select
          value={colorMode}
          onChange={(event) => {
            setColorMode(
              event.currentTarget.value as WaveformColorMode,
            );
          }}
        >
          <option value="rgb">RGB</option>
          <option value="3band">3Band</option>
          <option value="blue">Blue</option>
          <option value="monochrome">Monochrome</option>
        </select>
      </label>

      <label>
        Waveform zoom
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

      {waveform ? (
        <>
          <WaveformCanvas
            peaks={waveform.peaks}
            audioRef={audioRef}
            isPlaying={isPlaying}
            colorMode={colorMode}
            pixelsPerSecond={pixelsPerSecond}
            peaksPerSecond={waveform.peaksPerSecond}
          />

          <dl>
            <dt>Current time</dt>
            <dd>{currentTime.toFixed(2)} seconds</dd>

            <dt>Duration</dt>
            <dd>{waveform.durationSeconds} seconds</dd>

            <dt>Sample rate</dt>
            <dd>{waveform.sampleRate} Hz</dd>

            <dt>Peak count</dt>
            <dd>{waveform.peakCount}</dd>

            <dt>Peaks per second</dt>
            <dd>{waveform.peaksPerSecond}</dd>
          </dl>
        </>
      ) : (
        <p>Loading waveform data…</p>
      )}
    </section>
  );
}
