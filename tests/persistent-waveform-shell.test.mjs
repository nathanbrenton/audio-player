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

test("keeps the main waveform shell mounted while track waveform data loads", async () => {
  const audioPlayer = await readSource("src/components/AudioPlayer.tsx");
  const css = await readSource("src/index.css");

  assert.match(
    audioPlayer,
    /<div\s+className="listen-waveform-anchor"\s+data-waveform-state=\{/,
  );
  assert.match(
    audioPlayer,
    /waveform \? \([\s\S]*?<MediaVisualizationSurface[\s\S]*?\) : \([\s\S]*?className="waveform-panel waveform-panel--loading"/,
  );
  assert.match(
    audioPlayer,
    /waveform-panel__zoom-button waveform-panel__zoom-button--increase[\s\S]*?\+[\s\S]*?waveform-panel__zoom-button waveform-panel__zoom-button--decrease[\s\S]*?−/,
  );
  assert.doesNotMatch(audioPlayer, /<p>Loading track data…<\/p>/);

  assert.match(
    css,
    /\.waveform-panel--loading\s*\{[\s\S]*?height:\s*var\(--waveform-canvas-height, 240px\);[\s\S]*?min-height:\s*var\(--waveform-canvas-height, 240px\);/,
  );
  assert.match(
    css,
    /\.waveform-panel--loading \.waveform-panel__zoom-button:disabled\s*\{[\s\S]*?opacity:\s*1;/,
  );
});
