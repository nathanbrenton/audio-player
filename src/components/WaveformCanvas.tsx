import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

//type WaveformCanvasProps = {
//  peaks: [number, number][];
//  audioRef: RefObject<HTMLAudioElement | null>;
//  isPlaying: boolean;
//};
type WaveformCanvasProps = {
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

  audioRef: RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
};

// The waveform data contains 100 peak buckets per second.
// At one peak per canvas pixel, this also becomes 100 pixels per second.
const PIXELS_PER_SECOND = 100;

export default function WaveformCanvas({
  peaks,
  audioRef,
  isPlaying,
}: WaveformCanvasProps) {
  // References used for drawing and animation.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const renderFrameRef = useRef<(() => void) | null>(null);

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

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    // Canvas dimensions use the intrinsic drawing resolution.
    const width = canvas.width;
    const height = canvas.height;
    const centerY = height / 2;

    // Keep the playback position fixed at the horizontal center.
    const playheadX = width / 2;

    function renderFrame() {
      const audio = audioRef.current;
      const currentTime = audio?.currentTime ?? 0;

      // Convert playback time into the corresponding waveform peak.
      const currentPeakIndex = Math.floor(
        currentTime * PIXELS_PER_SECOND,
      );

      // Clear the previous frame.
      context.clearRect(0, 0, width, height);

      // Draw each visible waveform column.
//      context.strokeStyle = "#8fd3ff";
      context.lineWidth = 1;

      for (let x = 0; x < width; x += 1) {
        // Offset waveform data so the current time stays centered.
        const peakIndex =
          currentPeakIndex + Math.floor(x - playheadX);

        // Skip portions before the beginning or after the end.
        if (
          peakIndex < 0 ||
          peakIndex >= peaks.length
        ) {
          continue;
        }

        const [
          minimum,
          maximum,
          low,
          mid,
          high,
        ] = peaks[peakIndex];
        // Map low, mid, and high energy to red, green, and blue.
        const red = Math.round(low * 255);
        const green = Math.round(mid * 255);
        const blue = Math.round(high * 255);

        context.strokeStyle =
          `rgb(${red}, ${green}, ${blue})`;

        // Convert normalized amplitudes into canvas coordinates.
        const y1 = centerY + minimum * centerY;
        const y2 = centerY + maximum * centerY;

        context.beginPath();
        context.moveTo(x + 0.5, y1);
        context.lineTo(x + 0.5, y2);
        context.stroke();
      }

      // Draw the fixed center playhead above the waveform.
      context.strokeStyle = "#ffffff";
      context.lineWidth = 2;

      context.beginPath();
      context.moveTo(playheadX + 0.5, 0);
      context.lineTo(playheadX + 0.5, height);
      context.stroke();
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
  }, [audioRef, isPlaying, peaks]);

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
      dragDistance / PIXELS_PER_SECOND;

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
      width={1000}
      height={240}
      aria-label="Track waveform"
      role="img"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerDrag}
      onPointerCancel={finishPointerDrag}
      style={{
        display: "block",
        width: "100%",
        maxWidth: "1000px",
        height: "240px",
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
