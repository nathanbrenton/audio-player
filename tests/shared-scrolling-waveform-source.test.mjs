import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sharedSource = await readFile(
  new URL("../../packages/media-player/src/ScrollingWaveformCanvas.tsx", import.meta.url),
  "utf8",
);
const surfaceSource = await readFile(
  new URL("../../packages/media-player/src/MediaVisualizationSurface.tsx", import.meta.url),
  "utf8",
);
const indexSource = await readFile(
  new URL("../../packages/media-player/src/index.ts", import.meta.url),
  "utf8",
);
const audioPlayerSource = await readFile(
  new URL("../src/components/AudioPlayer.tsx", import.meta.url),
  "utf8",
);

test("Hiplingo consumes the shared full visualization surface directly", () => {
  assert.match(audioPlayerSource, /<MediaVisualizationSurface/);
  assert.match(
    audioPlayerSource,
    /releaseWaveformHost[\s\S]*?<MediaVisualizationSurface/,
    "desktop release heroes should reuse the shared zoomable visualization surface",
  );
  assert.match(
    surfaceSource,
    /useWaveformZoomController/,
    "the shared visualization surface should own waveform zoom behavior",
  );
  assert.match(surfaceSource, /<ScrollingWaveformCanvas/);
  assert.match(indexSource, /ScrollingWaveformCanvas/);
  assert.match(indexSource, /MediaVisualizationSurface/);
  assert.match(sharedSource, /export function ScrollingWaveformCanvas/);
});

test("shared full waveform preserves scrub behavior without host data coupling", () => {
  assert.match(sharedSource, /setPointerCapture/);
  assert.match(sharedSource, /heldTime/);
  assert.match(sharedSource, /previewScrubPosition/);
  assert.doesNotMatch(sharedSource, /scrubPreviewActiveRef/);
  assert.match(sharedSource, /}, 45\);/);
  assert.match(sharedSource, /onLostPointerCapture/);
  assert.match(sharedSource, /onScrubbingChange/);
  assert.match(sharedSource, /onActivate\?\.\(\)/);
  assert.match(sharedSource, /currentTimeOverride/);
  assert.match(sharedSource, /durationSeconds/);
  assert.match(sharedSource, /pixelsPerSecond/);
  assert.match(sharedSource, /peaksPerSecond/);
  assert.doesNotMatch(sharedSource, /scrubDebugLabel/);
  assert.doesNotMatch(sharedSource, /\[scrub-debug\]/);
  assert.doesNotMatch(sharedSource, /currentSrc/);
  assert.doesNotMatch(sharedSource, /\bHls\b|hls\.js/);
  assert.doesNotMatch(sharedSource, /\/api\//);
  assert.doesNotMatch(sharedSource, /published-media/);
});


test("shared scrub preview keeps playback active across pointer movement", () => {
  assert.match(
    sharedSource,
    /Keep an active scrub preview running across pointer movement/,
  );
  assert.match(sharedSource, /if \(!audio\.paused\)/);
  assert.match(
    sharedSource,
    /if \(!audio\.paused\) \{[\s\S]*armIdlePause\(\);[\s\S]*return;/,
  );
  assert.doesNotMatch(
    sharedSource,
    /drag\.heldTime = clampedTime;\s*audio\.currentTime = clampedTime;/,
  );
  assert.match(sharedSource, /}, 45\);/);
});


test("shared zoom oscilloscope exports preserve frozen-frame helpers", async () => {
  const sharedIndex = await readFile(new URL("../../packages/media-player/src/index.ts", import.meta.url), "utf8");
  const sharedOscilloscope = await readFile(new URL("../../packages/media-player/src/OscilloscopeCanvas.tsx", import.meta.url), "utf8");
  const sharedZoom = await readFile(new URL("../../packages/media-player/src/waveform-zoom.ts", import.meta.url), "utf8");
  const sharedAnalyser = await readFile(new URL("../../packages/media-player/src/useMediaElementAnalyser.ts", import.meta.url), "utf8");
  const player = await readFile(new URL("../src/components/AudioPlayer.tsx", import.meta.url), "utf8");
  assert.match(sharedIndex, /captureOscilloscopeFrame/);
  assert.match(sharedIndex, /seedOscilloscopeFrame/);
  assert.match(sharedIndex, /useWaveformZoomController/);
  assert.match(sharedIndex, /useMediaElementAnalyser/);
  assert.match(sharedOscilloscope, /oscilloscopeSampleCache/);
  assert.match(sharedOscilloscope, /isInspectingRef/);
  assert.match(sharedZoom, /WAVEFORM_ZOOM_STEPS[\s\S]*6400/);
  assert.match(sharedZoom, /OSCILLOSCOPE_SAMPLE_WINDOWS[\s\S]*128/);
  assert.match(sharedAnalyser, /WeakMap<HTMLMediaElement/);
  assert.match(sharedAnalyser, /createMediaElementSource/);
  assert.match(player, /<MediaVisualizationSurface/);
  assert.match(surfaceSource, /useWaveformZoomController\(/);
  assert.doesNotMatch(player, /const waveformZoomSteps = \[/);
  assert.doesNotMatch(player, /function handleWaveformWheel/);
});

test("shared visualization surface unlocks the analyser inside the oscilloscope-entry gesture", async () => {
  const sharedAnalyser = await readFile(
    new URL(
      "../../packages/media-player/src/useMediaElementAnalyser.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(surfaceSource, /onActivate=\{activateWaveform\}/);
  assert.match(
    surfaceSource,
    /const activateWaveform = \(\) => \{[\s\S]*void ensureAnalyserRef\.current\(\);[\s\S]*onActivate\?\.\(\);/,
  );
  assert.match(
    surfaceSource,
    /const handleIncreaseWaveformZoom = \(\) => \{[\s\S]*waveformViewMode === "waveform"[\s\S]*pixelsPerSecond >= maximumWaveformZoom[\s\S]*void ensureAnalyserRef\.current\(\);[\s\S]*increaseWaveformZoom\(\);/,
  );
  assert.match(
    surfaceSource,
    /onClick=\{\(event\) => \{[\s\S]*?event\.stopPropagation\(\);[\s\S]*?handleIncreaseWaveformZoom\(\);[\s\S]*?\}\}/,
  );
  assert.match(
    sharedAnalyser,
    /context\.state !== "running"[\s\S]*context\.state !== "closed"[\s\S]*context\.resume\(\)/,
  );
  assert.match(surfaceSource, /showZoomReadout = false/);
  assert.match(surfaceSource, /Current waveform zoom/);
  assert.match(surfaceSource, /zoomIncreaseButton/);
  assert.match(surfaceSource, /zoomDecreaseButton/);
});
