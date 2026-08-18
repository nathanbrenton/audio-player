import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function readBackgroundSource() {
  return readFile(
    path.join(
      projectRoot,
      "src/components/AudioReactiveListenBackground.tsx",
    ),
    "utf8",
  );
}

test("drives the desktop Listen background from published waveform band energy and exposes a watery/magnify mode switch", async () => {
  const backgroundSource = await readBackgroundSource();
  const playerSource = await readFile(
    path.join(projectRoot, "src/components/AudioPlayer.tsx"),
    "utf8",
  );

  assert.match(backgroundSource, /type WaveformPeak = \[/);
  assert.match(backgroundSource, /type BackgroundMode = "watery" \| "magnify"/);
  assert.match(backgroundSource, /currentTime \* peaksPerSecond/);
  assert.match(backgroundSource, /interpolate\(2\)/);
  assert.match(backgroundSource, /interpolate\(3\)/);
  assert.match(backgroundSource, /interpolate\(4\)/);
  assert.match(backgroundSource, /ORBIT_SECONDS = 36/);
  assert.match(backgroundSource, /ACTIVE_BACKGROUND_FPS = 20/);
  assert.match(backgroundSource, /RESTING_BACKGROUND_FPS = 12/);
  assert.match(backgroundSource, /ACTIVE_FRAME_INTERVAL_MS = 1000 \/ ACTIVE_BACKGROUND_FPS/);
  assert.match(backgroundSource, /RESTING_FRAME_INTERVAL_MS = 1000 \/ RESTING_BACKGROUND_FPS/);
  assert.match(backgroundSource, /requestAnimationFrame/);
  assert.match(backgroundSource, /prefers-reduced-motion: reduce/);
  assert.match(playerSource, /type ListenBackgroundMode = "watery" \| "magnify"/);
  assert.match(playerSource, /useState<ListenBackgroundMode>\("watery"\)/);
  assert.match(playerSource, /htmlFor="listen-background-mode-select"/);
  assert.match(playerSource, /<option value="watery">Watery<\/option>/);
  assert.match(playerSource, /<option value="magnify">Magnify<\/option>/);
  assert.match(
    playerSource,
    /displayMode === "full"[\s\S]*?<AudioReactiveListenBackground[\s\S]*?analyser=\{analyserNode\}[\s\S]*?peaks=\{waveform\?\.peaks \?\? \[\]\}[\s\S]*?peaksPerSecond=\{waveform\?\.peaksPerSecond \?\? 0\}[\s\S]*?isPlaying=\{displayedIsPlaying\}[\s\S]*?isMetadataViewerOpen=\{isMetadataViewerOpen\}[\s\S]*?mode=\{listenBackgroundMode\}/,
  );

  assert.match(backgroundSource, /isMetadataViewerOpen: boolean/);
  assert.match(
    playerSource,
    /waveformIsPlaying=\{[\s\S]*?displayedIsPlaying && !isMetadataViewerOpen[\s\S]*?\}/,
  );
});

test("reuses the shared analyser for a calmer low-bass global envelope and keeps paused/play differences intentionally small", async () => {
  const backgroundSource = await readBackgroundSource();

  assert.match(backgroundSource, /GLOBAL_BASS_MIN_HZ = 20/);
  assert.match(backgroundSource, /GLOBAL_BASS_MAX_HZ = 110/);
  assert.match(backgroundSource, /const RESTING_BAND_ENERGY: BandEnergy = \{/);
  assert.match(backgroundSource, /low: 0\.08/);
  assert.match(backgroundSource, /mid: 0\.045/);
  assert.match(backgroundSource, /high: 0\.03/);
  assert.match(backgroundSource, /sampleAnalyserBandEnergy\(/);
  assert.match(backgroundSource, /analyser\.getByteFrequencyData\(frequencyData\)/);
  assert.match(backgroundSource, /function followGlobalBass\(/);
  assert.match(backgroundSource, /target > current \? 0\.22 : 0\.7/);
  assert.match(backgroundSource, /RESTING_BAND_ENERGY\.low \+ sampledEnergy\.low \* 0\.88/);
  assert.match(backgroundSource, /RESTING_BAND_ENERGY\.mid \+ sampledEnergy\.mid \* 0\.84/);
  assert.match(backgroundSource, /RESTING_BAND_ENERGY\.high \+ sampledEnergy\.high \* 0\.8/);
  assert.match(backgroundSource, /globalBassTarget = clampUnit\(0\.08 \+ rawEnergy\.low \* 0\.72\)/);
  assert.match(backgroundSource, /horizontalTravel = 2\.1 \+ globalBass \* 0\.92/);
  assert.match(backgroundSource, /verticalTravel = 1\.45 \+ globalBass \* 0\.64/);
  assert.match(backgroundSource, /scale = 1\.07 \+ globalBass \* 0\.03/);
});

test("keeps one globally aligned image plane while local clusters remain tint-only motion zones", async () => {
  const backgroundSource = await readBackgroundSource();
  const css = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );

  assert.match(backgroundSource, /LOCAL_CLUSTER_COUNT = 18/);
  assert.match(backgroundSource, /LOCAL_CLUSTER_COLUMNS = 6/);
  assert.match(backgroundSource, /LOCAL_CLUSTER_ROWS = 3/);
  assert.match(backgroundSource, /function getLocalClusterZone\(index: number\)/);
  assert.match(backgroundSource, /distanceFromCenter <= 0\.35/);
  assert.match(backgroundSource, /distanceFromCenter <= 0\.82/);
  assert.match(backgroundSource, /listen-reactive-background__backplate/);
  assert.match(backgroundSource, /listen-reactive-background__clusters/);
  assert.match(backgroundSource, /renderClusters\(\)/);
  assert.match(backgroundSource, /listen-reactive-background__macro-secondary-lens-mask/);

  assert.match(css, /--listen-bg-source-width: max\(100vw, 177\.777778vh\)/);
  assert.match(css, /--listen-bg-source-height: max\(100vh, 56\.25vw\)/);
  assert.match(css, /\.listen-reactive-background__backplate,[\s\S]*?\.listen-reactive-background__macro-secondary-lens-surface[\s\S]*?url\(\"\/brand\/hiplingo-listen-background-desktop\.webp\"\)/);
  const clusterRule = css.match(/\.listen-reactive-background__cluster\s*\{[\s\S]*?\n  \}/);
  assert.ok(clusterRule);
  assert.doesNotMatch(clusterRule[0], /url\(/);
  assert.match(clusterRule[0], /radial-gradient\(/);
});

test("keeps two macro lenses and adds a third small lens with randomized starts and slight speed offsets", async () => {
  const backgroundSource = await readBackgroundSource();
  const css = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );

  assert.match(backgroundSource, /function createLensMotionSeed\(\): LensMotionSeed/);
  assert.match(backgroundSource, /const primaryLensSeedRef = useRef<LensMotionSeed>\(/);
  assert.match(backgroundSource, /const secondaryLensSeedRef = useRef<LensMotionSeed>\(/);
  assert.match(backgroundSource, /const tertiaryLensSeedRef = useRef<LensMotionSeed>\(/);
  assert.match(backgroundSource, /const macroLensSeedRef = useRef<LensMotionSeed>\(/);
  assert.match(backgroundSource, /const macroSecondaryLensSeedRef = useRef<LensMotionSeed>\(/);
  assert.match(backgroundSource, /SECONDARY_LENS_X_EDGE_TO_EDGE_SECONDS = 27\.5/);
  assert.match(backgroundSource, /SECONDARY_LENS_Y_EDGE_TO_EDGE_SECONDS = 19\.75/);
  assert.match(backgroundSource, /TERTIARY_LENS_X_EDGE_TO_EDGE_SECONDS = 34\.25/);
  assert.match(backgroundSource, /TERTIARY_LENS_Y_EDGE_TO_EDGE_SECONDS = 24\.5/);
  assert.match(backgroundSource, /MACRO_LENS_SPEED_DIVISOR = 8/);
  assert.match(backgroundSource, /MACRO_SECONDARY_LENS_SPEED_DIVISOR = 7\.25/);
  assert.match(backgroundSource, /const tertiaryLensX =/);
  assert.match(backgroundSource, /const tertiaryLensY =/);
  assert.match(backgroundSource, /const macroSecondaryLensX =/);
  assert.match(backgroundSource, /const macroSecondaryLensY =/);
  assert.match(backgroundSource, /--listen-bg-macro-secondary-lens-x-px/);
  assert.match(backgroundSource, /--listen-bg-macro-secondary-lens-y-px/);
  assert.match(backgroundSource, /--listen-bg-tertiary-lens-x-px/);
  assert.match(backgroundSource, /--listen-bg-tertiary-lens-y-px/);
  assert.match(backgroundSource, /listen-reactive-background__macro-secondary-lens-surface/);
  assert.match(backgroundSource, /listen-reactive-background__tertiary-lens-surface/);

  assert.match(css, /--listen-bg-secondary-lens-radius: clamp\(84px, 7vw, 176px\)/);
  assert.match(css, /--listen-bg-tertiary-lens-radius: clamp\(72px, 6vw, 150px\)/);
  assert.match(css, /--listen-bg-macro-secondary-lens-radius: clamp\(312px, 27vw, 680px\)/);
  assert.match(css, /\.listen-reactive-background__macro-lens-mask\s*\{[\s\S]*?z-index:\s*2/);
  assert.match(css, /\.listen-reactive-background__macro-secondary-lens-mask\s*\{[\s\S]*?z-index:\s*3/);
  assert.match(css, /\.listen-reactive-background__lens-mask\s*\{[\s\S]*?z-index:\s*4/);
  assert.match(css, /\.listen-reactive-background__secondary-lens-mask\s*\{[\s\S]*?z-index:\s*5/);
  assert.match(css, /\.listen-reactive-background__tertiary-lens-mask\s*\{[\s\S]*?z-index:\s*6/);
});

test("supports softer watery edges and slightly reduced macro magnification without reintroducing a second image source", async () => {
  const backgroundSource = await readBackgroundSource();
  const css = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );

  assert.match(backgroundSource, /const macroLensScale = wateryMode\s*\? 1\.03 \+ globalBass \* 0\.018\s*:\s*1\.09 \+ globalBass \* 0\.042/);
  assert.match(backgroundSource, /const macroSecondaryLensScale = wateryMode\s*\? 1\.025 \+ globalBass \* 0\.016\s*:\s*1\.075 \+ globalBass \* 0\.036/);
  assert.match(css, /data-background-mode="watery"/);
  assert.match(css, /#000 0 38%/);
  assert.match(css, /rgba\(0, 0, 0, 0\.46\) 84%/);
  assert.match(css, /#000 0 48%/);
  assert.match(css, /#000 0 86%/);
  assert.match(css, /rgba\(0, 0, 0, 0\.24\) 99%/);
  assert.equal(
    (css.match(/ellipse 50% 50% at center,/g) ?? []).length,
    20,
  );
  assert.match(
    css,
    /\.listen-reactive-background__macro-lens-mask,[\s\S]*?border-radius:\s*50%;/,
  );
  assert.doesNotMatch(
    css.slice(
      css.indexOf('.listen-reactive-background[data-background-mode="watery"]'),
      css.indexOf('.listen-reactive-background::after'),
    ),
    /circle at center,/,
  );
  assert.doesNotMatch(css, /filter: blur\(0\.65px\)/);
  assert.match(css, /opacity: 0\.94/);
  assert.match(css, /opacity: 0\.93/);
});

test("bounds lens compositor surfaces and suspends hidden-tab work without dropping below 12 fps while running", async () => {
  const backgroundSource = await readBackgroundSource();
  const css = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );

  assert.match(backgroundSource, /ACTIVE_BACKGROUND_FPS = 20/);
  assert.match(backgroundSource, /RESTING_BACKGROUND_FPS = 12/);
  assert.match(backgroundSource, /const frameInterval = isPlaying && !isMetadataViewerOpen[\s\S]*?ACTIVE_FRAME_INTERVAL_MS[\s\S]*?RESTING_FRAME_INTERVAL_MS/);
  assert.match(backgroundSource, /document\.visibilityState !== "hidden"/);
  assert.match(backgroundSource, /document\.addEventListener\("visibilitychange", handleVisibilityChange\)/);
  assert.match(backgroundSource, /window\.cancelAnimationFrame\(animationFrame\)/);
  assert.match(backgroundSource, /new ResizeObserver\(syncViewportSize\)/);
  assert.match(backgroundSource, /getResponsiveRadius\(/);
  assert.match(backgroundSource, /--listen-bg-lens-bg-x/);
  assert.match(backgroundSource, /--listen-bg-secondary-lens-bg-x/);
  assert.match(backgroundSource, /--listen-bg-tertiary-lens-bg-x/);
  assert.match(backgroundSource, /--listen-bg-macro-lens-bg-x/);
  assert.match(backgroundSource, /--listen-bg-macro-secondary-lens-bg-x/);

  assert.match(css, /contain:\s*layout paint style/);
  assert.match(css, /width:\s*calc\(var\(--listen-bg-lens-radius\) \* 2\)/);
  assert.match(css, /width:\s*calc\(var\(--listen-bg-secondary-lens-radius\) \* 2\)/);
  assert.match(css, /width:\s*calc\(var\(--listen-bg-tertiary-lens-radius\) \* 2\)/);
  assert.match(css, /width:\s*calc\(var\(--listen-bg-macro-lens-radius\) \* 2\)/);
  assert.match(css, /width:\s*calc\(var\(--listen-bg-macro-secondary-lens-radius\) \* 2\)/);
  assert.match(css, /background-position:[\s\S]*?var\(--listen-bg-lens-bg-x\)/);
  assert.match(css, /background-position:[\s\S]*?var\(--listen-bg-tertiary-lens-bg-x\)/);
  assert.match(css, /background-position:[\s\S]*?var\(--listen-bg-macro-secondary-lens-bg-x\)/);
  const boundedLensMaskRule = css.match(
    /\.listen-reactive-background__macro-lens-mask,\s*\n\s*\.listen-reactive-background__macro-secondary-lens-mask,\s*\n\s*\.listen-reactive-background__lens-mask,\s*\n\s*\.listen-reactive-background__secondary-lens-mask,\s*\n\s*\.listen-reactive-background__tertiary-lens-mask\s*\{[\s\S]*?\n  \}/,
  );
  assert.ok(boundedLensMaskRule);
  assert.match(boundedLensMaskRule[0], /top:\s*0;/);
  assert.match(boundedLensMaskRule[0], /left:\s*0;/);
  assert.match(boundedLensMaskRule[0], /pointer-events:\s*none;/);
  assert.doesNotMatch(boundedLensMaskRule[0], /inset:\s*0;/);
});

test("uses transform-only motion and disables reactive travel for reduced motion", async () => {
  const css = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );

  assert.match(css, /translate3d\([\s\S]*?var\(--listen-bg-x\)[\s\S]*?var\(--listen-bg-y\)/);
  assert.match(css, /scale\(var\(--listen-bg-scale\)\)/);
  assert.match(css, /will-change:\s*transform/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.listen-reactive-background__lens-mask,[\s\S]*?\.listen-reactive-background__secondary-lens-mask,[\s\S]*?\.listen-reactive-background__tertiary-lens-mask,[\s\S]*?\.listen-reactive-background__macro-lens-mask,[\s\S]*?\.listen-reactive-background__macro-secondary-lens-mask[\s\S]*?display:\s*none/,
  );
});
