import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function readSource(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

test("compact footer keeps its waveform canvas mounted during empty peak handoffs", async () => {
  const sharedNowPlaying = await readSource(
    "../packages/media-player/src/CompactNowPlayingBar.tsx",
  );

  assert.match(
    sharedNowPlaying,
    /<CompactWaveformCanvas\s+[\s\S]*?peaks=\{waveformPeaks \?\? \[\]\}/,
  );
  assert.match(
    sharedNowPlaying,
    /waveformPeaks && waveformPeaks\.length > 0 && canSeek && seek/,
  );
  assert.doesNotMatch(
    sharedNowPlaying,
    /waveformPeaks && waveformPeaks\.length > 0 \? \([\s\S]*?<CompactWaveformCanvas/,
  );
});
