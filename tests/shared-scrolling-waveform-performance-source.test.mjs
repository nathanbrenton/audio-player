import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sharedSource = await readFile(
  new URL(
    "../../packages/media-player/src/ScrollingWaveformCanvas.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("shared scrolling waveform rolls cached bitmap pixels instead of repainting the full viewport each animation frame", () => {
  assert.match(
    sharedSource,
    /Two private canvases form a rolling waveform buffer instead/,
  );
  assert.match(sharedSource, /waveformBufferCanvasA/);
  assert.match(sharedSource, /waveformBufferCanvasB/);
  assert.match(sharedSource, /function rollWaveformBuffer\(/);
  assert.match(
    sharedSource,
    /stagingWaveformBufferContext\.drawImage\(/,
  );
  assert.match(
    sharedSource,
    /drawWaveformRange\([\s\S]*width - shiftCssPixels,[\s\S]*presentedPixelLockedTime/,
  );
});

test("shared scrolling waveform avoids redundant per-column canvas color state changes", () => {
  assert.match(
    sharedSource,
    /Avoid paying the canvas-state setter cost unless the color[\s\S]*actually changes/,
  );
  assert.match(
    sharedSource,
    /if \(strokeStyle !== lastStrokeStyle\) \{[\s\S]*targetContext\.strokeStyle = strokeStyle/,
  );
  assert.match(
    sharedSource,
    /colorMode === "blue"[\s\S]*targetContext\.strokeStyle = lastStrokeStyle/,
  );
});

test("shared waveform performance optimization preserves the audible scrub timing guard", () => {
  assert.equal(
    sharedSource.split("        }, 45);").length - 1,
    1,
  );
});
