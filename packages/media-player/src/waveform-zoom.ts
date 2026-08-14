import {
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

export type WaveformViewMode =
  | "waveform"
  | "oscilloscope";

export const WAVEFORM_ZOOM_STEPS = [
  2, 3, 6, 12, 25, 50, 100, 200, 400, 800,
  1600, 2400, 3200, 4000, 4800, 5600, 6400,
] as const;

export const OSCILLOSCOPE_SAMPLE_WINDOWS = [
  2048, 1024, 512, 256, 128,
] as const;

export type WaveformZoomController = {
  pixelsPerSecond: number;
  waveformViewMode: WaveformViewMode;
  oscilloscopeSampleWindow: number;
  waveformZoomSteps: readonly number[];
  oscilloscopeSampleWindows: readonly number[];
  increaseWaveformZoom: () => void;
  decreaseWaveformZoom: () => void;
};

export function useWaveformZoomController(
  waveformPanelRef: RefObject<HTMLElement | null>,
  initialPixelsPerSecond = 100,
): WaveformZoomController {
  const initialZoom = WAVEFORM_ZOOM_STEPS.includes(
    initialPixelsPerSecond as (typeof WAVEFORM_ZOOM_STEPS)[number],
  ) ? initialPixelsPerSecond : 100;

  const [pixelsPerSecond, setPixelsPerSecond] = useState(initialZoom);
  const [waveformViewMode, setWaveformViewMode] =
    useState<WaveformViewMode>("waveform");
  const [oscilloscopeSampleWindow, setOscilloscopeSampleWindow] =
    useState<number>(OSCILLOSCOPE_SAMPLE_WINDOWS[0]);

  const lastWaveformZoomRef = useRef(initialZoom);
  const waveformWheelDeltaRef = useRef(0);
  const waveformWheelDirectionRef = useRef<-1 | 0 | 1>(0);

  const waveformZoomIndex = WAVEFORM_ZOOM_STEPS.indexOf(
    pixelsPerSecond as (typeof WAVEFORM_ZOOM_STEPS)[number],
  );

  function decreaseWaveformZoom() {
    if (waveformViewMode === "oscilloscope") {
      const currentIndex = OSCILLOSCOPE_SAMPLE_WINDOWS.indexOf(
        oscilloscopeSampleWindow as
          (typeof OSCILLOSCOPE_SAMPLE_WINDOWS)[number],
      );
      if (currentIndex > 0) {
        setOscilloscopeSampleWindow(
          OSCILLOSCOPE_SAMPLE_WINDOWS[currentIndex - 1],
        );
        return;
      }
      setWaveformViewMode("waveform");
      setPixelsPerSecond(lastWaveformZoomRef.current);
      return;
    }

    const currentIndex = waveformZoomIndex >= 0
      ? waveformZoomIndex
      : WAVEFORM_ZOOM_STEPS.indexOf(100);
    const nextZoom = WAVEFORM_ZOOM_STEPS[
      Math.max(0, currentIndex - 1)
    ];
    lastWaveformZoomRef.current = nextZoom;
    setPixelsPerSecond(nextZoom);
  }

  function increaseWaveformZoom() {
    if (waveformViewMode === "oscilloscope") {
      const currentIndex = OSCILLOSCOPE_SAMPLE_WINDOWS.indexOf(
        oscilloscopeSampleWindow as
          (typeof OSCILLOSCOPE_SAMPLE_WINDOWS)[number],
      );
      const maximumIndex = OSCILLOSCOPE_SAMPLE_WINDOWS.length - 1;
      if (currentIndex >= 0 && currentIndex < maximumIndex) {
        setOscilloscopeSampleWindow(
          OSCILLOSCOPE_SAMPLE_WINDOWS[currentIndex + 1],
        );
      }
      return;
    }

    const currentIndex = waveformZoomIndex >= 0
      ? waveformZoomIndex
      : WAVEFORM_ZOOM_STEPS.indexOf(100);
    const maximumIndex = WAVEFORM_ZOOM_STEPS.length - 1;
    if (currentIndex >= maximumIndex) {
      lastWaveformZoomRef.current = pixelsPerSecond;
      setOscilloscopeSampleWindow(OSCILLOSCOPE_SAMPLE_WINDOWS[0]);
      setWaveformViewMode("oscilloscope");
      return;
    }
    const nextZoom = WAVEFORM_ZOOM_STEPS[currentIndex + 1];
    lastWaveformZoomRef.current = nextZoom;
    setPixelsPerSecond(nextZoom);
  }

  useEffect(() => {
    const waveformPanel = waveformPanelRef.current;
    if (!waveformPanel) return;

    function handleWaveformWheel(event: WheelEvent) {
      const horizontalMagnitude = Math.abs(event.deltaX);
      const verticalMagnitude = Math.abs(event.deltaY);
      if (horizontalMagnitude === 0 && verticalMagnitude === 0) return;

      event.preventDefault();
      event.stopPropagation();

      const isPinchGesture = event.ctrlKey;
      const isHorizontalGesture =
        !isPinchGesture && horizontalMagnitude > verticalMagnitude;

      let shouldZoomIn: boolean;
      let gestureMagnitude: number;
      if (isPinchGesture) {
        shouldZoomIn = event.deltaY < 0;
        gestureMagnitude = verticalMagnitude;
      } else if (isHorizontalGesture) {
        shouldZoomIn = event.deltaX > 0;
        gestureMagnitude = horizontalMagnitude;
      } else {
        shouldZoomIn = event.deltaY > 0;
        gestureMagnitude = verticalMagnitude;
      }

      const direction: -1 | 1 = shouldZoomIn ? 1 : -1;
      if (
        waveformWheelDirectionRef.current !== 0 &&
        waveformWheelDirectionRef.current !== direction
      ) {
        waveformWheelDeltaRef.current = 0;
      }
      waveformWheelDirectionRef.current = direction;
      waveformWheelDeltaRef.current += gestureMagnitude;

      const activationThreshold = isPinchGesture
        ? 7
        : isHorizontalGesture
          ? 42
          : 72;
      if (waveformWheelDeltaRef.current < activationThreshold) return;
      waveformWheelDeltaRef.current = 0;

      if (shouldZoomIn) increaseWaveformZoom();
      else decreaseWaveformZoom();
    }

    waveformPanel.addEventListener("wheel", handleWaveformWheel, {
      passive: false,
    });
    return () => {
      waveformPanel.removeEventListener("wheel", handleWaveformWheel);
    };
  });

  return {
    pixelsPerSecond,
    waveformViewMode,
    oscilloscopeSampleWindow,
    waveformZoomSteps: WAVEFORM_ZOOM_STEPS,
    oscilloscopeSampleWindows: OSCILLOSCOPE_SAMPLE_WINDOWS,
    increaseWaveformZoom,
    decreaseWaveformZoom,
  };
}
