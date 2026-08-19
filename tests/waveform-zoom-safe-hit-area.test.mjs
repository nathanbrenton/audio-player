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

test("zoom controls stop pointer/click propagation before waveform scrubbing", () => {
  assert.match(
    surface,
    /aria-label="Waveform zoom controls"[\s\S]*?onPointerDown=\{\(event\) => \{[\s\S]*?event\.stopPropagation\(\);[\s\S]*?onClick=\{\(event\) => \{[\s\S]*?event\.stopPropagation\(\);/,
  );

  assert.match(
    surface,
    /onClick=\{\(event\) => \{[\s\S]*?event\.stopPropagation\(\);[\s\S]*?handleIncreaseWaveformZoom\(\);/,
  );

  assert.match(
    surface,
    /onClick=\{\(event\) => \{[\s\S]*?event\.stopPropagation\(\);[\s\S]*?decreaseWaveformZoom\(\);/,
  );
});

test("mobile zoom controls have large targets and a protected control rail", () => {
  assert.match(
    styles,
    /\.waveform-panel__zoom-controls\s*\{[\s\S]*?inset:\s*0 0 0 auto;[\s\S]*?width:\s*68px;[\s\S]*?pointer-events:\s*auto;[\s\S]*?touch-action:\s*manipulation;/,
  );

  assert.match(
    styles,
    /@media \(max-width: 639px\)[\s\S]*?\.waveform-panel__zoom-controls\s*\{[\s\S]*?width:\s*76px;[\s\S]*?\.waveform-panel__zoom-button\s*\{[\s\S]*?width:\s*56px;[\s\S]*?height:\s*56px;/,
  );

  assert.match(
    styles,
    /\.waveform-panel__zoom-button\s*\{[\s\S]*?-webkit-user-select:\s*none;[\s\S]*?-webkit-touch-callout:\s*none;[\s\S]*?touch-action:\s*manipulation;/,
  );
});
