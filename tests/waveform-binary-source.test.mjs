import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const playerSource = await readFile(
  new URL("../src/components/AudioPlayer.tsx", import.meta.url),
  "utf8",
);
const codecSource = await readFile(
  new URL("../../packages/media-player/src/waveform-binary.ts", import.meta.url),
  "utf8",
);

test("Hiplingo loads compact waveform bytes through the shared decoder", () => {
  assert.match(playerSource, /decodeWaveformPayload/);
  assert.match(playerSource, /response\.arrayBuffer\(\)/);
  assert.doesNotMatch(playerSource, /await response\.json\(\) as WaveformData/);
});

test("shared compact waveform format preserves five 16-bit fields per peak", () => {
  assert.match(codecSource, /WAVEFORM_BINARY_PEAK_BYTES = 10/);
  assert.match(codecSource, /setInt16\(offset/);
  assert.match(codecSource, /setUint16\(offset \+ 4/);
  assert.match(codecSource, /setUint16\(offset \+ 6/);
  assert.match(codecSource, /setUint16\(offset \+ 8/);
});
