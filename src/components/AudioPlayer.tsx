// React import
import { useEffect, useRef, useState } from "react";
import WaveformCanvas from "./WaveformCanvas";

type WaveformData = {
  version: number;
  durationSeconds: number;
  sampleRate: number;
  sourceChannels: number;
  waveformChannels: number;
  bitsPerSample: number;
  peaksPerSecond: number;
  peakCount: number;
  peaks: [number, number][];
};

export default function AudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [waveform, setWaveform] = useState<WaveformData | null>(null);

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

      {waveform ? (
        <>
          <WaveformCanvas
            peaks={waveform.peaks}
            audioRef={audioRef}
            isPlaying={isPlaying}
           />

        <dl>
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
