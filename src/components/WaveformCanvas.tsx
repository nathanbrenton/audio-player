import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

/*
 * Supported waveform color modes.
 *
 * Additional modes will be added incrementally:
 * - 3Band
 * - Monochrome
 */
export type WaveformColorMode =
  | "rgb"
  | "3band"
  | "blue"
  | "monochrome";

/*
 * Version 2 waveform peak:
 * [minimum, maximum, low, mid, high]
 */
type WaveformPeak = [
  number,
  number,
  number,
  number,
  number,
];

type WaveformCanvasProps = {
  peaks: WaveformPeak[];

  audioRef: RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;

  /*
   * RGB remains the default so existing callers continue working
   * without needing to pass a new prop.
   */
  colorMode?: WaveformColorMode;

  /*
   * Controls horizontal waveform scale.
   * Higher values show fewer seconds and more waveform detail.
   */
  pixelsPerSecond?: number;

  /*
   * Resolution of the generated waveform data.
   * This is independent from the visual zoom level.
   */
  peaksPerSecond?: number;
};

/*
 * Default display scale and waveform-data resolution.
 * These values happen to match at the default zoom level,
 * but they represent different concepts.
 */
const DEFAULT_PIXELS_PER_SECOND = 100;
const DEFAULT_PEAKS_PER_SECOND = 100;

/*
 * Convert frequency-band values into a single waveform color.
 *
 * 3Band blends low, mid, and high energy into one RGB color.
 * Blue and Monochrome use fixed colors.
 */
/*
 * Return the waveform values represented by one canvas column.
 *
 * Zoomed in:
 * Interpolate between adjacent stored peaks for smooth movement.
 *
 * Zoomed out:
 * Aggregate every stored peak covered by the canvas pixel so
 * transients are preserved instead of skipped.
 */
function sampleWaveformPeak(
  peaks: WaveformPeak[],
  peakPosition: number,
  peaksPerPixel: number,
): WaveformPeak | null {
  if (
    peakPosition < 0 ||
    peakPosition >= peaks.length
  ) {
    return null;
  }

  if (peaksPerPixel <= 1) {
    const firstIndex = Math.floor(peakPosition);
    const secondIndex = Math.min(
      firstIndex + 1,
      peaks.length - 1,
    );
    const fraction = peakPosition - firstIndex;

    const first = peaks[firstIndex];
    const second = peaks[secondIndex];

    return first.map((value, index) => {
      return (
        value +
        (second[index] - value) * fraction
      );
    }) as WaveformPeak;
  }

  const halfRange = peaksPerPixel / 2;
  const firstIndex = Math.max(
    0,
    Math.floor(peakPosition - halfRange),
  );
  const lastIndex = Math.min(
    peaks.length - 1,
    Math.ceil(peakPosition + halfRange),
  );

  let minimum = 1;
  let maximum = -1;
  let lowTotal = 0;
  let midTotal = 0;
  let highTotal = 0;
  let count = 0;

  for (
    let index = firstIndex;
    index <= lastIndex;
    index += 1
  ) {
    const [peakMinimum, peakMaximum, low, mid, high] =
      peaks[index];

    minimum = Math.min(minimum, peakMinimum);
    maximum = Math.max(maximum, peakMaximum);
    lowTotal += low;
    midTotal += mid;
    highTotal += high;
    count += 1;
  }

  if (count === 0) {
    return null;
  }

  return [
    minimum,
    maximum,
    lowTotal / count,
    midTotal / count,
    highTotal / count,
  ];
}

/*
 * Draw low, mid, and high frequency energy as overlapping
 * red, green, and blue traces around one shared centerline.
 */
function drawRgbColumn(
  context: CanvasRenderingContext2D,
  x: number,
  height: number,
  minimum: number,
  maximum: number,
  low: number,
  mid: number,
  high: number,
  physicalPixel: number,
) {
  const centerY = height / 2;

  /*
   * Keep RGB inside the same amplitude envelope used by the other
   * waveform modes. Band energy controls the relative trace height,
   * but cannot make the waveform larger than the source amplitude.
   */
  const envelopeAmplitude = Math.min(
    1,
    Math.max(
      Math.abs(minimum),
      Math.abs(maximum),
    ),
  );
  const maximumHalfHeight =
    centerY * envelopeAmplitude;

  const bands = [
    {
      energy: low,
      color: "rgba(255, 90, 90, 0.55)",
    },
    {
      energy: mid,
      color: "rgba(98, 210, 111, 0.55)",
    },
    {
      energy: high,
      color: "rgba(90, 183, 255, 0.55)",
    },
  ];

  for (const band of bands) {
    // Protect the renderer from malformed out-of-range values.
    const normalizedEnergy = Math.max(
      0,
      Math.min(1, band.energy),
    );

    const halfHeight =
      normalizedEnergy * maximumHalfHeight;

    context.strokeStyle = band.color;
    context.beginPath();
    const topY =
      Math.round(centerY - halfHeight) + 0.5;
    const bottomY =
      Math.round(centerY + halfHeight) + 0.5;

    const strokeX =
      x + physicalPixel / 2;

    context.moveTo(strokeX, topY);
    context.lineTo(strokeX, bottomY);
    context.stroke();
  }
}

function getWaveformStrokeStyle(
  colorMode: WaveformColorMode,
  low: number,
  mid: number,
  high: number,
): string {
  if (colorMode === "blue") {
    return "#5ab7ff";
  }

  if (colorMode === "monochrome") {
    return "#c8c8c8";
  }

  /*
   * 3Band combines all three normalized frequency bands into
   * one blended color for the full amplitude envelope.
   */
  const red = Math.round(low * 255);
  const green = Math.round(mid * 255);
  const blue = Math.round(high * 255);

  return `rgb(${red}, ${green}, ${blue})`;
}

export default function WaveformCanvas({
  peaks,
  audioRef,
  isPlaying,
  colorMode = "3band",
  pixelsPerSecond = DEFAULT_PIXELS_PER_SECOND,
  peaksPerSecond = DEFAULT_PEAKS_PER_SECOND,
}: WaveformCanvasProps) {
  // References used for drawing and animation.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const renderFrameRef = useRef<(() => void) | null>(null);

  /*
   * Store CSS dimensions separately from the intrinsic drawing
   * buffer so rendering can remain device-pixel accurate.
   */
  const canvasSizeRef = useRef({
    cssWidth: 1000,
    cssHeight: 240,
    devicePixelRatio: 1,
  });

  // Stores the starting position and playback time for the active drag.
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startTime: number;
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    // Preserve the non-null canvas reference inside nested callbacks.
    const measuredCanvas = canvas;

    function resizeCanvas() {
      const bounds =
        measuredCanvas.getBoundingClientRect();
      const cssWidth = Math.max(
        1,
        Math.round(bounds.width),
      );
      const cssHeight = Math.max(
        1,
        Math.round(bounds.height),
      );

      /*
       * Cap DPR to 2. Higher values increase drawing cost heavily
       * without providing a meaningful waveform improvement.
       */
      const devicePixelRatio = Math.min(
        window.devicePixelRatio || 1,
        2,
      );

      const intrinsicWidth = Math.round(
        cssWidth * devicePixelRatio,
      );
      const intrinsicHeight = Math.round(
        cssHeight * devicePixelRatio,
      );

      canvasSizeRef.current = {
        cssWidth,
        cssHeight,
        devicePixelRatio,
      };

      if (
        measuredCanvas.width !== intrinsicWidth ||
        measuredCanvas.height !== intrinsicHeight
      ) {
        measuredCanvas.width = intrinsicWidth;
        measuredCanvas.height = intrinsicHeight;
      }

      renderFrameRef.current?.();
    }

    resizeCanvas();

    const resizeObserver = new ResizeObserver(
      resizeCanvas,
    );

    resizeObserver.observe(measuredCanvas);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    // Preserve the non-null canvas context inside nested render functions.
    const drawingContext = context;

    function renderFrame() {
      const audio = audioRef.current;

      /*
       * Read the latest measured dimensions on every redraw.
       * Orientation changes can resize the canvas without recreating
       * this effect, so captured width and height values become stale.
       */
      const {
        cssWidth: width,
        cssHeight: height,
        devicePixelRatio,
      } = canvasSizeRef.current;

      const centerY = height / 2;

      // Keep the playback position fixed at the horizontal center.
      const playheadX = width / 2;

      drawingContext.setTransform(
        devicePixelRatio,
        0,
        0,
        devicePixelRatio,
        0,
        0,
      );
      const currentTime = audio?.currentTime ?? 0;

      /*
       * Lock waveform movement to intrinsic canvas pixels.
       *
       * Without this, fractional playback positions cause every
       * waveform column to be re-interpolated on every frame. At high
       * zoom levels, that makes the entire waveform appear to shimmer.
       *
       * Audio playback remains continuous; only the visual viewport
       * origin is quantized to the nearest canvas pixel.
       */
      const pixelLockedTime =
        Math.round(currentTime * pixelsPerSecond) /
        pixelsPerSecond;

      // Clear using CSS-pixel coordinates after applying DPR.
      drawingContext.clearRect(0, 0, width, height);

      /*
       * Draw one column per physical display pixel. The canvas uses
       * CSS coordinates under a DPR transform, so the step and stroke
       * width must be divided by DPR to preserve fine detail.
       */
      const physicalPixel = 1 / devicePixelRatio;

      drawingContext.lineWidth = physicalPixel;

      for (
        let x = 0;
        x < width;
        x += physicalPixel
      ) {
        // Offset waveform data so the current time stays centered.
        /*
         * Convert this canvas column directly into absolute audio time.
         * The resulting peak position remains fractional so movement
         * can be interpolated instead of snapping between buckets.
         */
        const timeAtX =
          pixelLockedTime +
          (x - playheadX) / pixelsPerSecond;

        const peakPosition =
          timeAtX * peaksPerSecond;

        const peaksPerPixel =
          peaksPerSecond / pixelsPerSecond;

        const sampledPeak = sampleWaveformPeak(
          peaks,
          peakPosition,
          peaksPerPixel,
        );

        // Skip portions before the beginning or after the end.
        if (!sampledPeak) {
          continue;
        }

        const [
          minimum,
          maximum,
          low,
          mid,
          high,
        ] = sampledPeak;

        /*
         * RGB draws three frequency-band traces overlaid around
         * one shared waveform centerline.
         */
        if (colorMode === "rgb") {
          drawRgbColumn(
            drawingContext,
            x,
            height,
            minimum,
            maximum,
            low,
            mid,
            high,
            physicalPixel,
          );

          continue;
        }

        // Choose the column color using the active waveform mode.
        drawingContext.strokeStyle = getWaveformStrokeStyle(
          colorMode,
          low,
          mid,
          high,
        );

        // Convert normalized amplitudes into canvas coordinates.
        /*
         * Align endpoints to half-pixels so one-pixel strokes remain
         * crisp instead of changing antialiasing coverage per frame.
         */
        const y1 =
          Math.round(
            (centerY + minimum * centerY) /
              physicalPixel,
          ) *
            physicalPixel +
          physicalPixel / 2;

        const y2 =
          Math.round(
            (centerY + maximum * centerY) /
              physicalPixel,
          ) *
            physicalPixel +
          physicalPixel / 2;

        const strokeX =
          x + physicalPixel / 2;

        drawingContext.beginPath();
        drawingContext.moveTo(strokeX, y1);
        drawingContext.lineTo(strokeX, y2);
        drawingContext.stroke();
      }

      // Draw the fixed center playhead above the waveform.
      drawingContext.strokeStyle = "#ffffff";
      drawingContext.lineWidth = 2;

      drawingContext.beginPath();
      drawingContext.moveTo(playheadX + 0.5, 0);
      drawingContext.lineTo(playheadX + 0.5, height);
      drawingContext.stroke();
    }

    function animate() {
      renderFrame();

      animationFrameRef.current =
        requestAnimationFrame(animate);
    }

    // Allow pointer handlers to redraw while playback is paused.
    renderFrameRef.current = renderFrame;

    // Always draw at least one frame.
    renderFrame();

    // Run the animation loop only while audio is playing.
    if (isPlaying) {
      animationFrameRef.current =
        requestAnimationFrame(animate);
    }

    // Cancel animation when dependencies change or the component unmounts.
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      renderFrameRef.current = null;
    };
  }, [
    audioRef,
    colorMode,
    isPlaying,
    peaks,
    peaksPerSecond,
    pixelsPerSecond,
  ]);

  function handlePointerDown(
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) {
    const canvas = canvasRef.current;
    const audio = audioRef.current;

    if (!canvas || !audio) {
      return;
    }

    // Keep receiving pointer events even if the pointer leaves the canvas.
    canvas.setPointerCapture(event.pointerId);

    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startTime: audio.currentTime,
    };

    canvas.style.cursor = "grabbing";
  }

  function handlePointerMove(
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    const drag = dragRef.current;

    if (
      !canvas ||
      !audio ||
      !drag ||
      drag.pointerId !== event.pointerId
    ) {
      return;
    }

    event.preventDefault();

    const bounds = canvas.getBoundingClientRect();

    // Convert displayed CSS pixels into intrinsic canvas pixels.
    const canvasScaleX = canvas.width / bounds.width;
    const dragDistance =
      (event.clientX - drag.startClientX) * canvasScaleX;

    /*
     * Dragging the waveform left advances playback.
     * Dragging the waveform right moves playback backward.
     */
    const requestedTime =
      drag.startTime -
      dragDistance / pixelsPerSecond;

    const maximumTime = Number.isFinite(audio.duration)
      ? audio.duration
      : requestedTime;

    audio.currentTime = Math.max(
      0,
      Math.min(requestedTime, maximumTime),
    );

    // Redraw immediately when scrubbing while paused.
    renderFrameRef.current?.();
  }

  function finishPointerDrag(
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) {
    const canvas = canvasRef.current;
    const drag = dragRef.current;

    if (
      !canvas ||
      !drag ||
      drag.pointerId !== event.pointerId
    ) {
      return;
    }

    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    dragRef.current = null;
    canvas.style.cursor = "grab";
  }

  return (
    <canvas
      ref={canvasRef}
      aria-label="Track waveform"
      role="img"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerDrag}
      onPointerCancel={finishPointerDrag}
      style={{
        display: "block",
        width: "100%",
        height:
          "var(--waveform-canvas-height, 240px)",
        background: "#181818",
        cursor: "grab",

        // Prevent touch scrolling while dragging the waveform.
        touchAction: "none",

        // Prevent accidental text selection during mouse drags.
        userSelect: "none",
      }}
    />
  );
}
