import {
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";

import {
  OscilloscopeCanvas,
  seedOscilloscopeFrame,
} from "./OscilloscopeCanvas.js";
import {
  ScrollingWaveformCanvas,
} from "./ScrollingWaveformCanvas.js";
import {
  useWaveformZoomController,
} from "./waveform-zoom.js";
import type {
  WaveformColorMode,
  WaveformPeak,
} from "./waveform.js";

export type MediaVisualizationSurfaceClassNames = {
  root?: string;
  zoomControls?: string;
  zoomButton?: string;
  zoomIncreaseButton?: string;
  zoomDecreaseButton?: string;
  zoomReadout?: string;
};

export type MediaVisualizationSurfaceProps = {
  peaks: WaveformPeak[];
  colorMode: WaveformColorMode;
  audioRef: RefObject<HTMLAudioElement | null>;
  analyser: AnalyserNode | null;
  ensureAnalyser: () => Promise<AnalyserNode | null>;
  trackKey: string;
  sampleRate: number;
  waveformIsPlaying: boolean;
  oscilloscopeIsPlaying?: boolean;
  peaksPerSecond?: number;
  durationSeconds?: number;
  currentTimeOverride?: number;
  onActivate?: () => void;
  onScrubbingChange?: (isScrubbing: boolean) => void;
  showZoomReadout?: boolean;
  classNames?: MediaVisualizationSurfaceClassNames;
  children?: ReactNode;
};

function joinClassNames(
  ...values: Array<string | undefined>
): string | undefined {
  const resolved = values.filter(Boolean).join(" ");
  return resolved || undefined;
}

/*
 * Host-neutral full-size player visualization shared by Hiplingo and
 * metadata-editor. Hosts retain source attachment, queue state, HLS or
 * private preview routing, application navigation, and surrounding chrome.
 */
export function MediaVisualizationSurface({
  peaks,
  colorMode,
  audioRef,
  analyser,
  ensureAnalyser,
  trackKey,
  sampleRate,
  waveformIsPlaying,
  oscilloscopeIsPlaying = waveformIsPlaying,
  peaksPerSecond,
  durationSeconds,
  currentTimeOverride,
  onActivate,
  onScrubbingChange,
  showZoomReadout = false,
  classNames,
  children,
}: MediaVisualizationSurfaceProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const ensureAnalyserRef = useRef(ensureAnalyser);
  ensureAnalyserRef.current = ensureAnalyser;

  const {
    pixelsPerSecond,
    waveformViewMode,
    oscilloscopeSampleWindow,
    waveformZoomSteps,
    oscilloscopeSampleWindows,
    increaseWaveformZoom,
    decreaseWaveformZoom,
  } = useWaveformZoomController(panelRef);

  useEffect(() => {
    seedOscilloscopeFrame(trackKey, peaks, sampleRate);
  }, [peaks, sampleRate, trackKey]);

  useEffect(() => {
    if (waveformViewMode === "oscilloscope") {
      void ensureAnalyserRef.current();
    }
  }, [waveformViewMode]);

  const activateWaveform = () => {
    /*
     * Graph construction occurs synchronously before the shared adapter's
     * first await. A scrub-first gesture therefore gets the same responsive
     * media routing as a normal Play gesture.
     */
    void ensureAnalyserRef.current();
    onActivate?.();
  };

  const maximumWaveformZoom =
    waveformZoomSteps[waveformZoomSteps.length - 1];
  const maximumOscilloscopeMagnification =
    oscilloscopeSampleWindows[
      oscilloscopeSampleWindows.length - 1
    ];

  const increaseLabel =
    waveformViewMode === "oscilloscope"
      ? oscilloscopeSampleWindow === maximumOscilloscopeMagnification
        ? "Maximum oscilloscope magnification"
        : "Magnify oscilloscope"
      : pixelsPerSecond >= maximumWaveformZoom
        ? "Enter oscilloscope"
        : "Zoom waveform in";

  const decreaseLabel =
    waveformViewMode === "oscilloscope"
      ? oscilloscopeSampleWindow === oscilloscopeSampleWindows[0]
        ? "Return to waveform"
        : "Widen oscilloscope"
      : "Zoom waveform out";

  return (
    <div
      ref={panelRef}
      className={classNames?.root}
      data-waveform-view-mode={waveformViewMode}
    >
      {waveformViewMode === "oscilloscope" ? (
        <OscilloscopeCanvas
          analyser={analyser}
          audioRef={audioRef}
          isPlaying={oscilloscopeIsPlaying}
          colorMode={colorMode}
          trackKey={trackKey}
          sampleRate={sampleRate}
          sampleWindow={oscilloscopeSampleWindow}
        />
      ) : (
        <ScrollingWaveformCanvas
          peaks={peaks}
          colorMode={colorMode}
          audioRef={audioRef}
          isPlaying={waveformIsPlaying}
          pixelsPerSecond={pixelsPerSecond}
          peaksPerSecond={peaksPerSecond}
          durationSeconds={durationSeconds}
          currentTimeOverride={currentTimeOverride}
          onActivate={activateWaveform}
          onScrubbingChange={onScrubbingChange}
        />
      )}

      {children}

      <div
        className={classNames?.zoomControls}
        aria-label="Waveform zoom controls"
      >
        {showZoomReadout ? (
          <output
            className={classNames?.zoomReadout}
            aria-label="Current waveform zoom"
          >
            {waveformViewMode === "oscilloscope"
              ? `${oscilloscopeSampleWindow} samples`
              : `${pixelsPerSecond} px/s`}
          </output>
        ) : null}

        <button
          type="button"
          className={joinClassNames(
            classNames?.zoomButton,
            classNames?.zoomIncreaseButton,
          )}
          onClick={increaseWaveformZoom}
          disabled={
            waveformViewMode === "oscilloscope" &&
            oscilloscopeSampleWindow === maximumOscilloscopeMagnification
          }
          aria-label={increaseLabel}
          title={increaseLabel}
        >
          +
        </button>

        <button
          type="button"
          className={joinClassNames(
            classNames?.zoomButton,
            classNames?.zoomDecreaseButton,
          )}
          onClick={decreaseWaveformZoom}
          disabled={
            waveformViewMode === "waveform" &&
            pixelsPerSecond <= waveformZoomSteps[0]
          }
          aria-label={decreaseLabel}
          title={decreaseLabel}
        >
          −
        </button>
      </div>
    </div>
  );
}
