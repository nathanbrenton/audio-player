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

  // Number of time-domain samples stretched across the canvas.
  sampleWindow: number;
};

/*
 * Convert an analyser-frequency range into normalized average energy.
 */
function getBandEnergy(
  frequencyData: Uint8Array<ArrayBuffer>,
  analyser: AnalyserNode,
  minimumHz: number,
  maximumHz: number,
): number {
  const nyquist = analyser.context.sampleRate / 2;
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

    function draw() {
      resizeCanvas();

      const width = resolvedCanvas.clientWidth;
      const height = resolvedCanvas.clientHeight;
      const centerY = height / 2;

      /*
       * Preserve the exact canvas pixels visible at pointer-down.
       * No clearing, idle line, or replacement frame occurs while
       * the user holds or drags across the oscilloscope.
       */
      if (isInspectingRef.current) {
        return;
      }

      /*
       * A translucent clear produces a restrained phosphor trail
       * without permanently accumulating old frames.
       */
      resolvedContext.fillStyle = isPlaying
        ? "rgb(24 24 24 / 0.22)"
        : "rgb(24 24 24 / 0.72)";

      resolvedContext.fillRect(0, 0, width, height);

      if (
        !analyser ||
        !timeDomainData ||
        !frequencyData ||
        !isPlaying ||
        audioRef.current?.paused
      ) {
        resolvedContext.beginPath();
        resolvedContext.moveTo(0, centerY);
        resolvedContext.lineTo(width, centerY);
        resolvedContext.strokeStyle = "rgb(120 120 120 / 0.42)";
        resolvedContext.lineWidth = 1;
        resolvedContext.stroke();

        animationFrameId =
          window.requestAnimationFrame(draw);

        return;
      }

      analyser.getByteTimeDomainData(timeDomainData);
      analyser.getByteFrequencyData(frequencyData);

      const lowEnergy = getBandEnergy(
        frequencyData,
        analyser,
        20,
        250,
      );

      const midEnergy = getBandEnergy(
        frequencyData,
        analyser,
        250,
        4000,
      );

      const highEnergy = getBandEnergy(
        frequencyData,
        analyser,
        4000,
        20000,
      );

      const traceColor = getTraceColor(
        colorMode,
        lowEnergy,
        midEnergy,
        highEnergy,
      );

      const overallEnergy = Math.max(
        lowEnergy,
        midEnergy,
        highEnergy,
      );

      /*
       * Draw a centered subsection of the analyser buffer. Smaller
       * windows create the increasingly magnified oscilloscope views.
       */
      const visibleSampleCount = Math.max(
        2,
        Math.min(
          sampleWindow,
          timeDomainData.length,
        ),
      );

      const firstVisibleSample = Math.floor(
        (timeDomainData.length - visibleSampleCount) / 2,
      );

      resolvedContext.beginPath();

      for (
        let visibleIndex = 0;
        visibleIndex < visibleSampleCount;
        visibleIndex += 1
      ) {
        const sampleIndex =
          firstVisibleSample + visibleIndex;

        const x =
          (visibleIndex / (visibleSampleCount - 1)) *
          width;

        const normalized =
          (timeDomainData[sampleIndex] - 128) / 128;

        const y =
          centerY +
          normalized *
            height *
            0.42;

        if (visibleIndex === 0) {
          resolvedContext.moveTo(x, y);
        } else {
          resolvedContext.lineTo(x, y);
        }
      }

      resolvedContext.strokeStyle = traceColor;
      resolvedContext.lineWidth =
        1.5 + overallEnergy * 1.8;

      resolvedContext.shadowColor = traceColor;
      resolvedContext.shadowBlur =
        4 + overallEnergy * 14;

      resolvedContext.stroke();

      resolvedContext.shadowBlur = 0;

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
    sampleWindow,
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
