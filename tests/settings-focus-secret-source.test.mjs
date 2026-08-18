import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("hidden Developer Mode gesture is not disclosed by a tooltip", async () => {
  const source = await readFile(
    path.join(root, "src/components/AudioPlayer.tsx"),
    "utf8",
  );

  assert.doesNotMatch(
    source,
    /Press and hold 4 seconds to show or hide Developer Mode/,
  );

  assert.match(source, /handleAboutPointerDown/);
  assert.match(source, /finishAboutPointer/);
  assert.match(
    source,
    /onPointerUp=\{finishAboutPointer\}/,
  );
  assert.match(source, /DEVELOPER_CONTROL_HOLD_MS/);
});

test("Waveform Color card keeps one surface while a child control has focus", async () => {
  const css = await readFile(
    path.join(root, "src/index.css"),
    "utf8",
  );

  const start = css.indexOf(
    "Settings preview focus stability + hidden developer gesture",
  );
  assert.notEqual(start, -1);

  const contract = css.slice(start);

  assert.match(
    contract,
    /\.audio-player__settings-panel \.settings-control,\s*\.audio-player__settings-panel \.settings-control:focus-within\s*\{[\s\S]*?background:\s*var\(--hiplingo-surface-control\) !important;/,
  );
});
