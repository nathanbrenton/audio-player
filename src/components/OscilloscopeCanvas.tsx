import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import type {
  WaveformColorMode,
} from "./WaveformCanvas";

type OscilloscopeCanvasProps = {
  analyser: AnalyserNode | null;
  audioRef: RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
  colorMode: WaveformColorMode;
  trackKey: string;
  sampleRate: number;

  // Number of time-domain samples stretched across the canvas.
  sampleWindow: number;
};

type OscilloscopeSampleCache = {
  timeDomainData: Uint8Array<ArrayBuffer>;
  frequencyData: Uint8Array<ArrayBuffer>;
  sampleRate: number;
};

type OscilloscopeSeedPeak = readonly [
  number,
  number,
  number,
  number,
  number,
];

/*
 * Cache by track rather than component or analyser instance. This
 * survives leaving oscilloscope mode and prevents one track's frozen
 * frame from appearing for another track.
 */
const oscilloscopeSampleCache =
  new Map<string, OscilloscopeSampleCache>();

export function captureOscilloscopeFrame(
  trackKey: string,
  analyser: AnalyserNode | null,
): void {
  if (!trackKey || !analyser) {
    return;
  }

  const timeDomainData =
    new Uint8Array(analyser.fftSize);

  const frequencyData =
    new Uint8Array(analyser.frequencyBinCount);

  analyser.getByteTimeDomainData(timeDomainData);
  analyser.getByteFrequencyData(frequencyData);

  oscilloscopeSampleCache.set(trackKey, {
    timeDomainData,
    frequencyData,
    sampleRate: analyser.context.sampleRate,
  });
}

/*
 * A queued-but-unplayed track has no analyser samples yet. Build a
 * deterministic placeholder trace from its generated waveform peaks.
 * The first real pause replaces this seed with an analyser snapshot.
 */
export function seedOscilloscopeFrame(
  trackKey: string,
  peaks: readonly OscilloscopeSeedPeak[],
  sampleRate: number,
  fftSize = 2048,
): void {
  if (!trackKey || peaks.length === 0) {
    return;
  }

  const timeDomainData =
    new Uint8Array(fftSize);

  const frequencyData =
    new Uint8Array(fftSize / 2);

  for (
    let sampleIndex = 0;
    sampleIndex < fftSize;
    sampleIndex += 1
  ) {
    const peakIndex = Math.min(
      peaks.length - 1,
      Math.floor(
        (sampleIndex / fftSize) *
        Math.min(peaks.length, fftSize),
      ),
    );

    const peak = peaks[peakIndex];

    const amplitude =
      sampleIndex % 2 === 0
        ? peak[0]
        : peak[1];

    timeDomainData[sampleIndex] = Math.round(
      Math.max(
        0,
        Math.min(
          255,
          128 + amplitude * 127,
        ),
      ),
    );
  }

  const analyzedPeaks =
    peaks.slice(0, Math.min(peaks.length, 512));

  const energyTotals = analyzedPeaks.reduce(
    (totals, peak) => {
      totals.low += peak[2];
      totals.mid += peak[3];
      totals.high += peak[4];
      return totals;
    },
    {
      low: 0,
      mid: 0,
      high: 0,
    },
  );

  const divisor = Math.max(1, analyzedPeaks.length);

  const lowEnergy = energyTotals.low / divisor;
  const midEnergy = energyTotals.mid / divisor;
  const highEnergy = energyTotals.high / divisor;

  const nyquist = sampleRate / 2;

  for (
    let binIndex = 0;
    binIndex < frequencyData.length;
    binIndex += 1
  ) {
    const frequency =
      (binIndex / frequencyData.length) *
      nyquist;

    const energy =
      frequency < 250
        ? lowEnergy
        : frequency < 4000
          ? midEnergy
          : highEnergy;

    frequencyData[binIndex] = Math.round(
      Math.max(
        0,
        Math.min(255, energy * 255),
      ),
    );
  }

  oscilloscopeSampleCache.set(trackKey, {
    timeDomainData,
    frequencyData,
    sampleRate,
  });
}

/*
 * Convert an analyser-frequency range into normalized average energy.
 */
function getBandEnergy(
  frequencyData: Uint8Array<ArrayBuffer>,
  sampleRate: number,
  minimumHz: number,
  maximumHz: number,
): number {
  const nyquist = sampleRate / 2;
  const binCount = frequencyData.length;

  const startIndex = Math.max(
    0,
    Math.floor((minimumHz / nyquist) * binCount),
  );

  const endIndex = Math.min(
    binCount - 1,
    Math.ceil((maximumHz / nyquist) * binCount),
  );

  if (endIndex < startIndex) {
    return 0;
  }

  let total = 0;
  let sampleCount = 0;

  for (
    let index = startIndex;
    index <= endIndex;
    index += 1
  ) {
    total += frequencyData[index];
    sampleCount += 1;
  }

  return sampleCount > 0
    ? total / sampleCount / 255
    : 0;
}

/*
 * Preserve the existing waveform color vocabulary while allowing
 * live low-, mid-, and high-frequency energy to influence the trace.
 */
function getTraceColor(
  colorMode: WaveformColorMode,
  lowEnergy: number,
  midEnergy: number,
  highEnergy: number,
): string {
  if (colorMode === "monochrome") {
    const brightness = Math.round(
      190 + Math.max(lowEnergy, midEnergy, highEnergy) * 65,
    );

    return `rgb(${brightness} ${brightness} ${brightness})`;
  }

  if (colorMode === "blue") {
    const green = Math.round(145 + midEnergy * 85);
    const blue = Math.round(205 + highEnergy * 50);

    return `rgb(90 ${green} ${blue})`;
  }

  const red = Math.round(70 + lowEnergy * 185);
  const green = Math.round(70 + midEnergy * 185);
  const blue = Math.round(70 + highEnergy * 185);

  return `rgb(${red} ${green} ${blue})`;
}

export default function OscilloscopeCanvas({
  analyser,
  audioRef,
  isPlaying,
  colorMode,
  trackKey,
  sampleRate,
  sampleWindow,
}: OscilloscopeCanvasProps) {
  const canvasRef =
    useRef<HTMLCanvasElement | null>(null);

  /*
   * Hold-to-inspect pauses playback and preserves the current live
   * trace until the mouse, touch, or stylus gesture is released.
   */
  const activePointerIdRef =
    useRef<number | null>(null);

  const wasPlayingBeforeInspectRef =
    useRef(false);

  const isInspectingRef =
    useRef(false);

  const [
    isInspecting,
    setIsInspecting,
  ] = useState(false);

  /*
   * Preserve the latest live analyser samples rather than only the
   * rendered canvas pixels. The same frozen signal can then be
   * redrawn correctly at every oscilloscope zoom level.
   */
  const cachedSamples = trackKey
    ? oscilloscopeSampleCache.get(trackKey)
    : null;

  const lastTimeDomainDataRef =
    useRef<Uint8Array<ArrayBuffer> | null>(
      cachedSamples?.timeDomainData ?? null,
    );

  const lastFrequencyDataRef =
    useRef<Uint8Array<ArrayBuffer> | null>(
      cachedSamples?.frequencyData ?? null,
    );


  /*
   * Live rendering remains full-rate. Persistent cache refreshes are
   * throttled to reduce typed-array allocation pressure on mobile.
   */
  const lastPersistentCacheTimeRef = useRef(0);

  /*
   * Rehydrate local refs whenever a remount or analyser replacement
   * supplies an existing persistent sample cache.
   */
  useEffect(() => {
    const cachedSamples = trackKey
      ? oscilloscopeSampleCache.get(trackKey)
      : null;

    lastTimeDomainDataRef.current =
      cachedSamples?.timeDomainData ?? null;

    lastFrequencyDataRef.current =
      cachedSamples?.frequencyData ?? null;
  }, [trackKey]);

  function beginInspection(
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) {
    if (activePointerIdRef.current !== null) {
      return;
    }

    const audio = audioRef.current;

    activePointerIdRef.current = event.pointerId;
    wasPlayingBeforeInspectRef.current =
      Boolean(audio && !audio.paused);

    /*
     * Update the ref synchronously so an already-scheduled animation
     * frame cannot erase or replace the visible trace.
     */
    isInspectingRef.current = true;
    setIsInspecting(true);

    event.currentTarget.setPointerCapture(
      event.pointerId,
    );

    audio?.pause();
    event.preventDefault();
  }

  function endInspection(
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) {
    if (
      activePointerIdRef.current !== event.pointerId
    ) {
      return;
    }

    const shouldResume =
      wasPlayingBeforeInspectRef.current;

    activePointerIdRef.current = null;
    wasPlayingBeforeInspectRef.current = false;
    isInspectingRef.current = false;
    setIsInspecting(false);

    /*
     * Resume only when playback was active before inspection. A track
     * that was already paused remains paused after the gesture.
     */
    if (shouldResume) {
      void audioRef.current?.play();
    }
  }

  function cancelInspection(
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) {
    endInspection(event);
  }

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    /*
     * Preserve the validated canvas and rendering context inside the
     * nested animation and resize callbacks.
     */
    const resolvedCanvas = canvas;
    const resolvedContext = context;

    let animationFrameId = 0;

    const timeDomainData = analyser
      ? new Uint8Array(analyser.fftSize)
      : null;

    const frequencyData = analyser
      ? new Uint8Array(analyser.frequencyBinCount)
      : null;

    function resizeCanvas() {
      const devicePixelRatio =
        window.devicePixelRatio || 1;

      const displayWidth = Math.max(
        1,
        Math.floor(resolvedCanvas.clientWidth),
      );

      const displayHeight = Math.max(
        1,
        Math.floor(resolvedCanvas.clientHeight),
      );

      const pixelWidth = Math.floor(
        displayWidth * devicePixelRatio,
      );

      const pixelHeight = Math.floor(
        displayHeight * devicePixelRatio,
      );

      if (
        resolvedCanvas.width !== pixelWidth ||
        resolvedCanvas.height !== pixelHeight
      ) {
        resolvedCanvas.width = pixelWidth;
        resolvedCanvas.height = pixelHeight;
      }

      resolvedContext.setTransform(
        devicePixelRatio,
        0,
        0,
        devicePixelRatio,
        0,
        0,
      );
    }

    /*
     * Render one oscilloscope trace from supplied analyser samples.
     * `usePhosphorTrail` is enabled only during live playback.
     */
    function renderTrace(
      renderedTimeDomainData:
        Uint8Array<ArrayBuffer>,
      renderedFrequencyData:
        Uint8Array<ArrayBuffer>,
      usePhosphorTrail: boolean,
    ) {
      resizeCanvas();

      const width = resolvedCanvas.clientWidth;
      const height = resolvedCanvas.clientHeight;
      const centerY = height / 2;

      /*
       * Live playback uses a translucent fill for phosphor persistence.
       * Frozen redraws use an opaque background so switching zoom levels
       * does not blend unrelated render sizes together.
       */
      resolvedContext.fillStyle =
        usePhosphorTrail
          ? "rgb(24 24 24 / 0.22)"
          : "rgb(24 24 24)";

      resolvedContext.fillRect(
        0,
        0,
        width,
        height,
      );

      const renderedSampleRate =
        oscilloscopeSampleCache.get(trackKey)
          ?.sampleRate ??
        analyser?.context.sampleRate ??
        sampleRate;

      const lowEnergy = getBandEnergy(
        renderedFrequencyData,
        renderedSampleRate,
        20,
        250,
      );

      const midEnergy = getBandEnergy(
        renderedFrequencyData,
        renderedSampleRate,
        250,
        4000,
      );

      const highEnergy = getBandEnergy(
        renderedFrequencyData,
        renderedSampleRate,
        4000,
        20000,
      );

      const overallEnergy = Math.max(
        lowEnergy,
        midEnergy,
        highEnergy,
      );

      /*
       * Draw the currently selected subsection of the cached or live
       * analyser buffer. Seeded and captured frames use this same
       * renderer, so their palettes remain consistent.
       */
      const visibleSampleCount = Math.max(
        2,
        Math.min(
          sampleWindow,
          renderedTimeDomainData.length,
        ),
      );

      const firstVisibleSample = Math.floor(
        (
          renderedTimeDomainData.length -
          visibleSampleCount
        ) / 2,
      );

      /*
       * Build and stroke one trace from the shared time-domain data.
       * Band modes vary only the baseline, amplitude, and stroke style.
       */
      function drawTrace(
        baselineY: number,
        amplitudeHeight: number,
        strokeStyle:
          | string
          | CanvasGradient,
        glowColor: string,
        energy: number,
      ) {
        resolvedContext.beginPath();

        for (
          let visibleIndex = 0;
          visibleIndex < visibleSampleCount;
          visibleIndex += 1
        ) {
          const sampleIndex =
            firstVisibleSample + visibleIndex;

          const x =
            (
              visibleIndex /
              (visibleSampleCount - 1)
            ) * width;

          const normalized =
            (
              renderedTimeDomainData[sampleIndex] -
              128
            ) / 128;

          const y =
            baselineY +
            normalized * amplitudeHeight;

          if (visibleIndex === 0) {
            resolvedContext.moveTo(x, y);
          } else {
            resolvedContext.lineTo(x, y);
          }
        }

        resolvedContext.strokeStyle = strokeStyle;
        resolvedContext.lineWidth =
          1.35 + energy * 1.65;

        resolvedContext.shadowColor = glowColor;
        /*
         * Increase perceived luminosity without widening the trace.
         * A brighter glow preserves fine waveform detail.
         */
        /*
         * Reduce the remaining ambient halo by half again.
         */
        resolvedContext.shadowBlur =
          1.5 + energy * 4.25;

        resolvedContext.stroke();

        /*
         * Add a second crisp pass with no blur. This increases the
         * trace's luminosity without increasing its configured width.
         */
        resolvedContext.shadowBlur = 0;
        resolvedContext.globalAlpha = 0.42;
        resolvedContext.stroke();
        resolvedContext.globalAlpha = 1;
      }

      if (colorMode === "3band") {
        /*
         * Draw all three frequency bands on the same centerline.
         * Small amplitude differences keep each layer perceptible
         * while preserving one combined oscilloscope shape.
         */
        const baseAmplitude = height * 0.42;

        drawTrace(
          centerY,
          baseAmplitude *
            (0.82 + lowEnergy * 0.18),
          `rgb(255 92 98 / ${
            0.72 + lowEnergy * 0.28
          })`,
          "rgb(235 78 82)",
          lowEnergy,
        );

        drawTrace(
          centerY,
          baseAmplitude *
            (0.9 + midEnergy * 0.1),
          `rgb(96 255 151 / ${
            0.72 + midEnergy * 0.28
          })`,
          "rgb(82 218 133)",
          midEnergy,
        );

        drawTrace(
          centerY,
          baseAmplitude,
          `rgb(96 174 255 / ${
            0.72 + highEnergy * 0.28
          })`,
          "rgb(82 155 245)",
          highEnergy,
        );

        return;
      }

      if (colorMode === "rgb") {
        /*
         * RGB color is determined by low-, mid-, and high-frequency
         * energy rather than horizontal canvas position. The three
         * frequency-weighted strokes overlap to produce mixed color.
         */
        const baseAmplitude = height * 0.42;

        resolvedContext.globalCompositeOperation =
          "screen";

        drawTrace(
          centerY,
          baseAmplitude,
          `rgb(255 76 88 / ${
            0.58 + lowEnergy * 0.42
          })`,
          "rgb(255 58 72)",
          lowEnergy,
        );

        drawTrace(
          centerY,
          baseAmplitude,
          `rgb(76 255 132 / ${
            0.58 + midEnergy * 0.42
          })`,
          "rgb(58 255 116)",
          midEnergy,
        );

        drawTrace(
          centerY,
          baseAmplitude,
          `rgb(88 146 255 / ${
            0.58 + highEnergy * 0.42
          })`,
          "rgb(72 126 255)",
          highEnergy,
        );

        resolvedContext.globalCompositeOperation =
          "source-over";

        return;
      }

      /*
       * Blue and Monochrome retain the original single-stroke style.
       */
      const traceColor = getTraceColor(
        colorMode,
        lowEnergy,
        midEnergy,
        highEnergy,
      );

      drawTrace(
        centerY,
        height * 0.42,
        traceColor,
        traceColor,
        overallEnergy,
      );
    }

    function draw() {
      const playbackIsFrozen =
        isInspectingRef.current ||
        !isPlaying ||
        audioRef.current?.paused;

      if (playbackIsFrozen) {
        const cachedTimeDomainData =
          lastTimeDomainDataRef.current;

        const cachedFrequencyData =
          lastFrequencyDataRef.current;

        /*
         * Redraw the latest frozen signal whenever the component
         * restarts because sampleWindow, color, or canvas size changed.
         */
        if (
          cachedTimeDomainData &&
          cachedFrequencyData
        ) {
          renderTrace(
            cachedTimeDomainData,
            cachedFrequencyData,
            false,
          );
        }

        return;
      }

      if (
        !analyser ||
        !timeDomainData ||
        !frequencyData
      ) {
        return;
      }

      analyser.getByteTimeDomainData(
        timeDomainData,
      );

      analyser.getByteFrequencyData(
        frequencyData,
      );

      /*
       * Refresh the persistent track cache at a restrained rate.
       * Rendering itself still occurs every animation frame.
       */
      const now = performance.now();

      if (
        now -
          lastPersistentCacheTimeRef.current >=
        100
      ) {
        let persistentCache =
          oscilloscopeSampleCache.get(trackKey);

        if (
          !persistentCache ||
          persistentCache.timeDomainData.length !==
            timeDomainData.length ||
          persistentCache.frequencyData.length !==
            frequencyData.length
        ) {
          persistentCache = {
            timeDomainData:
              new Uint8Array(timeDomainData.length),
            frequencyData:
              new Uint8Array(frequencyData.length),
            sampleRate:
              analyser.context.sampleRate,
          };

          oscilloscopeSampleCache.set(
            trackKey,
            persistentCache,
          );
        }

        persistentCache.timeDomainData.set(
          timeDomainData,
        );

        persistentCache.frequencyData.set(
          frequencyData,
        );

        persistentCache.sampleRate =
          analyser.context.sampleRate;

        lastTimeDomainDataRef.current =
          persistentCache.timeDomainData;

        lastFrequencyDataRef.current =
          persistentCache.frequencyData;

        lastPersistentCacheTimeRef.current = now;
      }

      renderTrace(
        timeDomainData,
        frequencyData,
        true,
      );

      animationFrameId =
        window.requestAnimationFrame(draw);
    }

    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });

    resizeObserver.observe(resolvedCanvas);
    draw();

    return () => {
      resizeObserver.disconnect();

      window.cancelAnimationFrame(
        animationFrameId,
      );
    };
  }, [
    analyser,
    audioRef,
    colorMode,
    isInspecting,
    isPlaying,
    sampleRate,
    sampleWindow,
    trackKey,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className="oscilloscope-canvas"
      data-inspecting={
        isInspecting ? "true" : "false"
      }
      aria-label={
        isInspecting
          ? "Frozen oscilloscope frame"
          : "Live audio oscilloscope; press and hold to inspect"
      }
      title={
        isInspecting
          ? "Release to resume"
          : "Press and hold to freeze and inspect"
      }
      onPointerDown={beginInspection}
      onPointerUp={endInspection}
      onPointerCancel={cancelInspection}
      onLostPointerCapture={cancelInspection}
    />
  );
}
