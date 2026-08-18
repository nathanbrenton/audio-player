import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const sourcePath = path.join(
  projectRoot,
  "src/components/AudioReactiveListenBackground.tsx",
);

test("keeps one background animation lifecycle while transport state changes", async () => {
  const source = await readFile(sourcePath, "utf8");

  assert.match(source, /const runtimeStateRef = useRef\(\{/);
  assert.match(source, /runtimeStateRef\.current = \{/);
  assert.match(
    source,
    /const \{ analyser, peaks, peaksPerSecond, isPlaying, mode \} =\s*runtimeStateRef\.current/,
  );
  assert.match(
    source,
    /const \{ isPlaying, isMetadataViewerOpen \} =\s*runtimeStateRef\.current/,
  );
  assert.match(source, /\}, \[audioRef\]\);/);
  assert.doesNotMatch(
    source,
    /\}, \[\s*analyser,\s*audioRef,\s*isMetadataViewerOpen,\s*isPlaying,/,
  );
});

test("avoids redundant and hidden-layer style mutations", async () => {
  const source = await readFile(sourcePath, "utf8");

  assert.match(source, /const ENABLE_AUXILIARY_LENS_RUNTIME = false;/);
  assert.match(source, /const styleValueCacheRef = useRef<Map<string, string>>\(new Map\(\)\)/);
  assert.match(source, /if \(styleValueCache\.get\(property\) === value\) return;/);
  assert.equal(
    (source.match(/background\.style\.setProperty\(/g) ?? []).length,
    1,
  );
  assert.match(
    source,
    /if \(ENABLE_AUXILIARY_LENS_RUNTIME\) \{[\s\S]*?--listen-bg-secondary-lens-x-px[\s\S]*?--listen-bg-macro-secondary-lens-rotation/,
  );
  assert.match(
    source,
    /if \(!isPlaying\) \{[\s\S]*?--listen-bg-cluster-scale-outer[\s\S]*?--listen-bg-cluster-rotation-center/,
  );
});

test("caches viewport-derived lens radii in the resize observer", async () => {
  const source = await readFile(sourcePath, "utf8");

  const syncStart = source.indexOf("const syncViewportSize = () => {");
  const observerStart = source.indexOf(
    "const resizeObserver = new ResizeObserver(syncViewportSize);",
  );
  assert.ok(syncStart >= 0 && observerStart > syncStart);

  const syncBlock = source.slice(syncStart, observerStart);
  assert.match(syncBlock, /lensRadius: getResponsiveRadius\(width, 113\.333, 0\.1, 240\)/);
  assert.match(syncBlock, /secondaryLensRadius: getResponsiveRadius\(width, 84, 0\.07, 176\)/);
  assert.match(syncBlock, /tertiaryLensRadius: getResponsiveRadius\(width, 72, 0\.06, 150\)/);
  assert.match(syncBlock, /macroLensRadius: getResponsiveRadius\(width, 453\.333, 0\.4, 960\)/);

  const paintStart = source.indexOf("const paint = (frameTime: number) => {");
  const scheduleStart = source.indexOf("const scheduleAnimationFrame = () => {");
  const paintBlock = source.slice(paintStart, scheduleStart);
  assert.doesNotMatch(paintBlock, /const lensRadius = getResponsiveRadius/);
});
