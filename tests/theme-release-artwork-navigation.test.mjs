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

test("centralizes Hiplingo purple surface tokens across metadata and waveform shells", async () => {
  const css = await readSource("src/index.css");

  assert.match(css, /--hiplingo-surface-waveform:\s*#0d0a16;/);
  assert.match(css, /--hiplingo-surface-control:\s*rgba\(33, 27, 46, 0\.92\);/);
  assert.match(css, /--hiplingo-border-active:\s*rgba\(169, 140, 255, 0\.52\);/);
  assert.match(
    css,
    /Hiplingo host theme: waveform \+ metadata surfaces[\s\S]*?\.metadata-viewer\s*\{[\s\S]*?background:\s*var\(--hiplingo-surface-1\);/,
  );
  assert.match(
    css,
    /\.metadata-viewer__tab\[aria-selected="true"\][\s\S]*?border-color:\s*var\(--hiplingo-border-active\);[\s\S]*?var\(--hiplingo-surface-3\);/,
  );
  assert.match(
    css,
    /\.waveform-panel,[\s\S]*?\.waveform-panel--loading,[\s\S]*?\.settings-control__waveform-preview,[\s\S]*?\.shared-now-playing__waveform\s*\{[\s\S]*?var\(--hiplingo-surface-waveform\);/,
  );
});



test("keeps the rendered waveform canvas transparent so the themed shell surface remains visible", async () => {
  const waveformSource = await readFile(
    path.join(projectRoot, "..", "packages", "media-player", "src", "ScrollingWaveformCanvas.tsx"),
    "utf8",
  );

  assert.match(
    waveformSource,
    /background:\s*\n\s*"var\(--waveform-canvas-background, transparent\)"/,
  );
  assert.doesNotMatch(waveformSource, /background:\s*"#181818"/);
});

test("removes the redundant settings heading while keeping the close action", async () => {
  const playerSource = await readSource("src/components/AudioPlayer.tsx");
  const css = await readSource("src/index.css");

  assert.doesNotMatch(playerSource, /Appearance & settings/);
  assert.doesNotMatch(playerSource, /className="audio-player__settings-header"/);
  assert.match(playerSource, /className="audio-player__settings-close"/);
  assert.doesNotMatch(css, /\.audio-player__settings-header/);
  assert.match(
    css,
    /\.audio-player__settings-close\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?margin:\s*0 0 8px auto;/,
  );
});

test("routes only footer transport artwork to its release while hero artwork remains playback navigation", async () => {
  const appSource = await readSource("src/App.tsx");
  const playerSource = await readSource("src/components/AudioPlayer.tsx");

  assert.match(playerSource, /onOpenRelease\?: \(releaseId: string\) => void;/);
  assert.match(
    appSource,
    /onOpenRelease=\{\(releaseId\) => \{[\s\S]*?navigateTo\(`\/releases\/\$\{encodeURIComponent\(releaseId\)\}`\);/,
  );
  assert.match(
    playerSource,
    /onArtworkClick=\{[\s\S]*?onOpenRelease[\s\S]*?onOpenRelease\(selectedTrack\.release\.id\)/,
  );
  assert.doesNotMatch(
    playerSource,
    /if \(onOpenRelease && selectedTrack\) \{[\s\S]*?onOpenRelease\(selectedTrack\.release\.id\);[\s\S]*?return;/,
  );
  assert.doesNotMatch(playerSource, /onOpenRelease\(previousTrack\.release\.id\)/);
  assert.doesNotMatch(playerSource, /onOpenRelease\(nextTrack\.release\.id\)/);
  assert.match(playerSource, /onClick=\{selectPreviousTrack\}/);
  assert.match(playerSource, /onClick=\{selectNextTrack\}/);
  assert.match(playerSource, /void togglePlayback\(\);/);
  assert.match(
    playerSource,
    /<ArtworkTransportIcon[\s\S]*?displayedIsPlaying[\s\S]*?\? "pause"[\s\S]*?: "play"/,
  );
});
