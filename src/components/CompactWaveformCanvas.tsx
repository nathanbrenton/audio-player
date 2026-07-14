import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import type {
  WaveformColorMode,
} from "./WaveformCanvas";

type CompactWaveformPeak = [
  number,
  number,
  number,
  number,
  number,
];

type CompactWaveformCanvasProps = {
  peaks: CompactWaveformPeak[];
  colorMode: WaveformColorMode;
  progress: number;
  className?: string;
  onSeek?: (progress: number) => void;
  seekLabel?: string;
};

/*
 * Draw a compact waveform from the same generated peak data used by
 * the primary player. Playback progress uses a lightweight HTML
 * playhead rather than continuous canvas redraws.
 */
export default function CompactWaveformCanvas({
  peaks,
  colorMode,
  progress,
  className = "",
  onSeek,
  seekLabel = "Seek within track",
}: CompactWaveformCanvasProps) {
  const canvasRef =
    useRef<HTMLCanvasElement | null>(null);

  const activePointerIdRef =
    useRef<number | null>(null);

  const [dragProgress, setDragProgress] =
    useState<number | null>(null);

  useEffect(() => {
    return () => {
      document.documentElement.classList.remove(
        "compact-waveform-drag-active",
      );
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    let frameId = 0;
    /*
     * Preserve the checked canvas reference inside nested callbacks.
     * TypeScript does not retain ref-backed null narrowing there.
     */
    const resolvedCanvas = canvas;


    function draw() {
      const context = resolvedCanvas.getContext("2d");

      if (!context) {
        return;
      }

      const bounds = resolvedCanvas.getBoundingClientRect();

      const pixelRatio = Math.min(
        window.devicePixelRatio || 1,
        2,
      );

      const width = Math.max(
        1,
        Math.round(bounds.width * pixelRatio),
      );

      const height = Math.max(
        1,
        Math.round(bounds.height * pixelRatio),
      );

      if (
        resolvedCanvas.width !== width ||
        resolvedCanvas.height !== height
      ) {
        resolvedCanvas.width = width;
        resolvedCanvas.height = height;
      }

      context.clearRect(0, 0, width, height);

      if (peaks.length === 0) {
        return;
      }

      for (let x = 0; x < width; x += 1) {
        const sourceStart = Math.floor(
          (x / width) * peaks.length,
        );

        const sourceEnd = Math.max(
          sourceStart + 1,
          Math.ceil(
            ((x + 1) / width) * peaks.length,
          ),
        );

        let minimum = 0;
        let maximum = 0;
        let low = 0;
        let mid = 0;
        let high = 0;

        for (
          let peakIndex = sourceStart;
          peakIndex < sourceEnd &&
          peakIndex < peaks.length;
          peakIndex += 1
        ) {
          const peak = peaks[peakIndex];

          minimum = Math.min(minimum, peak[0]);
          maximum = Math.max(maximum, peak[1]);
          low = Math.max(low, peak[2]);
          mid = Math.max(mid, peak[3]);
          high = Math.max(high, peak[4]);
        }

        const centerY = height / 2;

        const amplitude = Math.max(
          Math.abs(minimum),
          Math.abs(maximum),
        );

        const compositeAmplitude = Math.max(
          amplitude,
          low,
          mid,
          high,
        );

        /*
         * Compact previews intentionally use a shallower scale than
         * their container height, matching the visual density of the
         * primary waveform more closely.
         */
        if (colorMode === "3band") {
          drawCenteredBar(
            context,
            x,
            centerY,
            Math.max(compositeAmplitude, low),
            height * 0.62,
            "rgba(223, 87, 87, 0.72)",
          );

          drawCenteredBar(
            context,
            x,
            centerY,
            mid,
            height * 0.51,
            "rgba(217, 199, 90, 0.82)",
          );

          drawCenteredBar(
            context,
            x,
            centerY,
            high,
            height * 0.39,
            "rgba(95, 159, 226, 0.92)",
          );

          continue;
        }

        if (colorMode === "rgb") {
          drawCenteredBar(
            context,
            x,
            centerY,
            low,
            height * 0.57,
            "rgba(228, 79, 79, 0.55)",
          );

          drawCenteredBar(
            context,
            x,
            centerY,
            mid,
            height * 0.57,
            "rgba(86, 201, 117, 0.49)",
          );

          drawCenteredBar(
            context,
            x,
            centerY,
            high,
            height * 0.57,
            "rgba(80, 143, 224, 0.55)",
          );

          continue;
        }

        drawCenteredBar(
          context,
          x,
          centerY,
          compositeAmplitude,
          height * 0.62,
          colorMode === "blue"
            ? "#6abfff"
            : "#d8d8d8",
        );
      }
    }

    function scheduleDraw() {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(draw);
    }

    const resizeObserver =
      new ResizeObserver(scheduleDraw);

    resizeObserver.observe(resolvedCanvas);
    scheduleDraw();

    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(frameId);
    };
  }, [colorMode, peaks]);

  const normalizedProgress = Math.max(
    0,
    Math.min(1, progress),
  );

  const displayedProgress =
    dragProgress ?? normalizedProgress;

  function progressFromClientX(
    clientX: number,
  ): number | null {
    const canvas = canvasRef.current;

    if (!canvas) {
      return null;
    }

    const bounds = canvas.getBoundingClientRect();

    if (bounds.width <= 0) {
      return null;
    }

    return Math.max(
      0,
      Math.min(
        1,
        (clientX - bounds.left) / bounds.width,
      ),
    );
  }

  function handlePointerDown(
    event: PointerEvent<HTMLDivElement>,
  ) {
    if (!onSeek) {
      return;
    }

    const nextProgress =
      progressFromClientX(event.clientX);

    if (nextProgress === null) {
      return;
    }

    /*
     * This waveform can appear inside a <label>. Stop the gesture
     * before the label forwards focus or activation to its select.
     */
    event.preventDefault();
    event.stopPropagation();

    const containingLabel =
      event.currentTarget.closest("label");

    containingLabel
      ?.querySelector<HTMLSelectElement>("select")
      ?.blur();

    activePointerIdRef.current = event.pointerId;

    document.documentElement.classList.add(
      "compact-waveform-drag-active",
    );

    event.currentTarget.setPointerCapture(
      event.pointerId,
    );

    setDragProgress(nextProgress);
  }

  function handlePointerMove(
    event: PointerEvent<HTMLDivElement>,
  ) {
    if (
      !onSeek ||
      activePointerIdRef.current !== event.pointerId
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const nextProgress =
      progressFromClientX(event.clientX);

    if (nextProgress !== null) {
      setDragProgress(nextProgress);
    }
  }

  function handlePointerUp(
    event: PointerEvent<HTMLDivElement>,
  ) {
    if (
      !onSeek ||
      activePointerIdRef.current !== event.pointerId
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const nextProgress =
      progressFromClientX(event.clientX);

    event.preventDefault();
    event.stopPropagation();

    activePointerIdRef.current = null;

    document.documentElement.classList.remove(
      "compact-waveform-drag-active",
    );

    if (
      event.currentTarget.hasPointerCapture(
        event.pointerId,
      )
    ) {
      event.currentTarget.releasePointerCapture(
        event.pointerId,
      );
    }

    setDragProgress(null);

    if (nextProgress !== null) {
      onSeek(nextProgress);
    }
  }

  function handlePointerCancel(
    event: PointerEvent<HTMLDivElement>,
  ) {
    if (
      activePointerIdRef.current !== event.pointerId
    ) {
      return;
    }

    activePointerIdRef.current = null;

    document.documentElement.classList.remove(
      "compact-waveform-drag-active",
    );

    setDragProgress(null);
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
  ) {
    if (!onSeek) {
      return;
    }

    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }

    event.preventDefault();

    if (event.key === "Home") {
      onSeek(0);
      return;
    }

    if (event.key === "End") {
      onSeek(1);
      return;
    }

    const direction =
      event.key === "ArrowLeft" ? -1 : 1;

    onSeek(
      Math.max(
        0,
        Math.min(
          1,
          normalizedProgress + direction * 0.025,
        ),
      ),
    );
  }

  return (
    <div
      className={[
        "compact-waveform",
        onSeek
          ? "compact-waveform--interactive"
          : "",
        dragProgress !== null
          ? "compact-waveform--dragging"
          : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-color-mode={colorMode}
      role={onSeek ? "slider" : undefined}
      aria-label={onSeek ? seekLabel : undefined}
      aria-valuemin={onSeek ? 0 : undefined}
      aria-valuemax={onSeek ? 100 : undefined}
      aria-valuenow={
        onSeek
          ? Math.round(displayedProgress * 100)
          : undefined
      }
      tabIndex={onSeek ? 0 : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClick={(event) => {
        if (!onSeek) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={handleKeyDown}
    >
      <canvas ref={canvasRef} />

      <span
        className="compact-waveform__playhead"
        style={
          {
            "--compact-waveform-progress":
              displayedProgress,
          } as CSSProperties
        }
      />
    </div>
  );
}

function drawCenteredBar(
  context: CanvasRenderingContext2D,
  x: number,
  centerY: number,
  amplitude: number,
  maximumHeight: number,
  fillStyle: string,
) {
  const barHeight = Math.max(
    1,
    Math.min(1, amplitude) * maximumHeight,
  );

  context.fillStyle = fillStyle;

  context.fillRect(
    x,
    centerY - barHeight / 2,
    1,
    barHeight,
  );
}
