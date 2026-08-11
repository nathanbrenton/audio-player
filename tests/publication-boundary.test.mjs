import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(
  fileURLToPath(import.meta.url),
);
const projectRoot = path.resolve(testDirectory, "..");

const retiredProducerFiles = [
  "scripts/generate-media-catalog.mjs",
  "scripts/generate-release-waveforms.sh",
  "scripts/generate-track-analysis.sh",
  "scripts/generate-waveform-peaks.mjs",
  "scripts/prepare-media-library.sh",
  "scripts/transcode-artwork.sh",
  "scripts/transcode-audio.sh",
];

test("keeps media production out of the Hiplingo repository", async () => {
  for (const relativePath of retiredProducerFiles) {
    await assert.rejects(
      access(path.join(projectRoot, relativePath)),
      (error) => error?.code === "ENOENT",
      `${relativePath} must remain retired`,
    );
  }
});

test("serves published-media read-only by default on IPv4 loopback", async () => {
  const viteSource = await readFile(
    path.join(projectRoot, "vite.config.mjs"),
    "utf8",
  );

  assert.match(
    viteSource,
    /process\.env\.MEDIA_LIBRARY_ROOT\s*\?\?\s*"\.\.\/published-media"/,
  );
  assert.match(viteSource, /host:\s*"127\.0\.0\.1"/);
  assert.match(viteSource, /port:\s*5173/);
});

test("loads hls.js dynamically rather than in the initial bundle", async () => {
  const playerSource = await readFile(
    path.join(projectRoot, "src/components/AudioPlayer.tsx"),
    "utf8",
  );

  assert.doesNotMatch(
    playerSource,
    /import\s+Hls\s+from\s+["']hls\.js["']/,
  );
  assert.match(playerSource, /import\(["']hls\.js["']\)/);
});

test("keeps one persistent AudioPlayer mounted across Hiplingo routes", async () => {
  const appSource = await readFile(
    path.join(projectRoot, "src/App.tsx"),
    "utf8",
  );

  assert.equal(
    (appSource.match(/<AudioPlayer\b/g) ?? []).length,
    1,
    "App must mount exactly one AudioPlayer",
  );
  assert.match(appSource, /hiplingo-player-host--\$\{playerDisplayMode\}/);
  assert.match(appSource, /ref=\{audioPlayerRef\}/);
});

test("starts release playback in place instead of redirecting to /listen", async () => {
  const appSource = await readFile(
    path.join(projectRoot, "src/App.tsx"),
    "utf8",
  );
  const releaseSource = await readFile(
    path.join(projectRoot, "src/components/ReleaseDetail.tsx"),
    "utf8",
  );

  assert.doesNotMatch(appSource, /\/listen\?track=/);
  assert.match(appSource, /audioPlayerRef\.current\?\.playQueue/);
  assert.match(releaseSource, /onPlayQueue/);
  assert.match(releaseSource, />\s*Play release\s*</);
});

test("advances through the active queue and exposes a compact global player", async () => {
  const playerSource = await readFile(
    path.join(projectRoot, "src/components/AudioPlayer.tsx"),
    "utf8",
  );

  assert.match(playerSource, /setQueueTrackKeys\(nextQueue\)/);
  assert.match(playerSource, /if \(nextTrack\)[\s\S]*loadTrack\(nextTrack\.key, true\)/);
  assert.match(playerSource, /data-display-mode=\{displayMode\}/);
  assert.match(playerSource, /hiplingo-compact-player/);
});
