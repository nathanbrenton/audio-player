import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const surface = await readFile(
  new URL(
    "../../packages/media-player/src/MediaVisualizationSurface.tsx",
    import.meta.url,
  ),
  "utf8",
);

const styles = await readFile(
  new URL("../src/index.css", import.meta.url),
  "utf8",
);

test("zoom buttons restore compact painted dimensions while retaining larger transparent hit targets", () => {
  assert.match(
    styles,
    /\.waveform-panel__zoom-button\s*\{[\s\S]*?--waveform-zoom-hit-inset:\s*7px;[\s\S]*?width:\s*38px;[\s\S]*?height:\s*38px;/,
  );

  assert.match(
    styles,
    /@media \(max-width: 639px\)[\s\S]*?\.waveform-panel__zoom-button\s*\{[\s\S]*?--waveform-zoom-hit-inset:\s*10px;[\s\S]*?width:\s*36px;[\s\S]*?height:\s*36px;/,
  );

  assert.match(
    styles,
    /orientation:\s*landscape[\s\S]*?max-height:\s*520px[\s\S]*?max-width:\s*950px[\s\S]*?\.waveform-panel__zoom-button\s*\{[\s\S]*?--waveform-zoom-hit-inset:\s*8px;[\s\S]*?width:\s*34px;[\s\S]*?height:\s*34px;/,
  );

  assert.match(
    styles,
    /\.waveform-panel__zoom-button::after\s*\{[\s\S]*?calc\(-1 \* var\(--waveform-zoom-hit-inset\)\)[\s\S]*?background:\s*transparent;/,
  );
});

test("zoom glyphs remain non-selectable SVG rather than plus/minus text", () => {
  assert.equal(
    (surface.match(/data-waveform-zoom-icon=/g) ?? []).length,
    2,
  );
  assert.equal(
    (surface.match(/width="14"/g) ?? []).length,
    2,
  );
  assert.equal(
    (surface.match(/height="14"/g) ?? []).length,
    2,
  );
  assert.match(
    surface,
    /pointerEvents:\s*"none"[\s\S]*?userSelect:\s*"none"/,
  );
  assert.doesNotMatch(surface, />\s*\+\s*<\/button>/);
  assert.doesNotMatch(surface, />\s*−\s*<\/button>/);
});
