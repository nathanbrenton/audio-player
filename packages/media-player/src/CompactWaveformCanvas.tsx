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
  WaveformPeak,
} from "./waveform.js";

export type CompactWaveformCanvasProps = {
  peaks: WaveformPeak[];
  colorMode: WaveformColorMode;
  progress: number;
  className?: string;
  style?: CSSProperties;
  onSeek?: (progress: number) => void;
  seekLabel?: string;
};

export function CompactWaveformCanvas({
  peaks,
  colorMode,
  progress,
  className = "",
  style,
  onSeek,
  seekLabel = "Seek within track",
}: CompactWaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const [dragProgress, setDragProgress] = useState<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const resolvedCanvas = canvas;
    let frameId = 0;

    const draw = () => {
      const context = resolvedCanvas.getContext("2d");
      if (!context) {
        return;
      }

      const bounds = resolvedCanvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(bounds.width * pixelRatio));
      const height = Math.max(1, Math.round(bounds.height * pixelRatio));

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
        const sourceStart = Math.floor((x / width) * peaks.length);
        const sourceEnd = Math.max(
          sourceStart + 1,
          Math.ceil(((x + 1) / width) * peaks.length),
        );

        let minimum = 0;
        let maximum = 0;
        let low = 0;
        let mid = 0;
        let high = 0;

        for (
          let peakIndex = sourceStart;
          peakIndex < sourceEnd && peakIndex < peaks.length;
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
          colorMode === "blue" ? "#6abfff" : "#d8d8d8",
        );
      }
    };

    const scheduleDraw = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(draw);
    };

    const resizeObserver = new ResizeObserver(scheduleDraw);
    resizeObserver.observe(resolvedCanvas);
    scheduleDraw();

    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(frameId);
    };
  }, [colorMode, peaks]);

  const normalizedProgress = Math.max(0, Math.min(1, progress));
  const displayedProgress = dragProgress ?? normalizedProgress;

  const progressFromClientX = (clientX: number): number | null => {
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
      Math.min(1, (clientX - bounds.left) / bounds.width),
    );
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!onSeek) {
      return;
    }

    const nextProgress = progressFromClientX(event.clientX);
    if (nextProgress === null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    event.currentTarget
      .closest("label")
      ?.querySelector<HTMLSelectElement>("select")
      ?.blur();

    activePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragProgress(nextProgress);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!onSeek || activePointerIdRef.current !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const nextProgress = progressFromClientX(event.clientX);
    if (nextProgress !== null) {
      setDragProgress(nextProgress);
    }
  };

  const finishPointer = (
    event: PointerEvent<HTMLDivElement>,
    commit: boolean,
  ) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const nextProgress = progressFromClientX(event.clientX);
    activePointerIdRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setDragProgress(null);
    if (commit && onSeek && nextProgress !== null) {
      onSeek(nextProgress);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
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

    const direction = event.key === "ArrowLeft" ? -1 : 1;
    onSeek(
      Math.max(
        0,
        Math.min(1, normalizedProgress + direction * 0.025),
      ),
    );
  };

  return (
    <div
      className={[
        "shared-waveform",
        onSeek ? "shared-waveform--interactive" : "",
        dragProgress !== null ? "shared-waveform--dragging" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-color-mode={colorMode}
      style={{
        position: "relative",
        minWidth: 0,
        overflow: "hidden",
        cursor:
          dragProgress !== null ? "ew-resize" : onSeek ? "pointer" : undefined,
        touchAction: onSeek ? "none" : undefined,
        ...style,
      }}
      role={onSeek ? "slider" : undefined}
      aria-label={onSeek ? seekLabel : undefined}
      aria-valuemin={onSeek ? 0 : undefined}
      aria-valuemax={onSeek ? 100 : undefined}
      aria-valuenow={
        onSeek ? Math.round(displayedProgress * 100) : undefined
      }
      tabIndex={onSeek ? 0 : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => finishPointer(event, true)}
      onPointerCancel={(event) => finishPointer(event, false)}
      onClick={(event) => {
        if (!onSeek) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={handleKeyDown}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
      <span
        className="shared-waveform__playhead"
        style={
          {
            position: "absolute",
            top: 0,
            bottom: 0,
            width: "1px",
            background: "currentColor",
            boxShadow: "0 0 0 1px rgb(0 0 0 / 0.28)",
            pointerEvents: "none",
            transform: "translateX(-0.5px)",
            left: `calc(${displayedProgress} * 100%)`,
            "--shared-waveform-progress": displayedProgress,
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
  context.fillRect(x, centerY - barHeight / 2, 1, barHeight);
}
