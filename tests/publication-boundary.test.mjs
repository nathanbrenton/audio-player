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
  assert.match(releaseSource, /releaseActionLabel/);
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


test("keeps compact Hiplingo routes scrollable on mobile", async () => {
  const css = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );

  assert.match(
    css,
    /\.audio-player\[data-display-mode="compact"\][\s\S]*?min-height:\s*0;/,
  );
  assert.match(
    css,
    /body:has\(\.audio-player\[data-display-mode="compact"\]\)[\s\S]*?overflow-y:\s*auto;/,
  );
});


test("shares live playback state with release-page controls", async () => {
  const appSource = await readFile(
    path.join(projectRoot, "src/App.tsx"),
    "utf8",
  );
  const playerSource = await readFile(
    path.join(projectRoot, "src/components/AudioPlayer.tsx"),
    "utf8",
  );
  const releaseSource = await readFile(
    path.join(projectRoot, "src/components/ReleaseDetail.tsx"),
    "utf8",
  );

  assert.match(playerSource, /type PlaybackStateSnapshot/);
  assert.match(playerSource, /onPlaybackStateChange/);
  assert.match(playerSource, /togglePlayback:/);
  assert.match(appSource, /playbackState=\{playbackState\}/);
  assert.match(appSource, /requestTogglePlayback/);
  assert.match(releaseSource, /Pause release/);
  assert.match(releaseSource, /Resume release/);
  assert.match(releaseSource, /trackIsSelected/);
});


test("unifies Hiplingo navigation and player actions in one site header", async () => {
  const appSource = await readFile(
    path.join(projectRoot, "src/App.tsx"),
    "utf8",
  );
  const playerSource = await readFile(
    path.join(projectRoot, "src/components/AudioPlayer.tsx"),
    "utf8",
  );

  assert.match(appSource, /hiplingo-site-actions/);
  assert.match(appSource, /onBrowseLibrary=\{requestOpenLibrary\}/);
  assert.match(appSource, /onTogglePlayerMenu=\{requestTogglePlayerMenu\}/);
  assert.doesNotMatch(playerSource, /<header className="audio-player__header">/);
  assert.match(playerSource, /openLibrary:\s*\(\) =>/);
  assert.match(playerSource, /toggleSettings:\s*\(\) =>/);
});

test("keeps the global player dock above browsing and metadata overlays", async () => {
  const css = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );

  assert.match(css, /\.hiplingo-site-header\s*\{[\s\S]*?z-index:\s*400;/);
  assert.match(css, /\.library-sheet__backdrop\s*\{[\s\S]*?z-index:\s*950;/);
  assert.match(css, /\.metadata-viewer__backdrop\s*\{[\s\S]*?z-index:\s*1000;/);
  assert.match(css, /\.audio-player__now-playing\s*\{[\s\S]*?z-index:\s*1200\s*!important;/);
});


test("groups Edited By with Recording & Editing credits", async () => {
  const metadataViewerSource = await readFile(
    path.join(projectRoot, "src/components/MetadataViewer.tsx"),
    "utf8",
  );

  assert.match(
    metadataViewerSource,
    /role:\s*"Editor",\s*aliases:\s*\["Edited By"\]/,
  );
  assert.match(
    metadataViewerSource,
    /label="Recording & Editing"/,
  );
  assert.doesNotMatch(
    metadataViewerSource,
    /label="Recording and Editing"/,
  );
});


test("uses the unified metadata header and production credit groups", async () => {
  const metadataViewerSource = await readFile(
    path.join(projectRoot, "src/components/MetadataViewer.tsx"),
    "utf8",
  );

  assert.match(metadataViewerSource, /label="Mixing & Mastering"/);
  assert.doesNotMatch(metadataViewerSource, /label="Mixing"/);
  assert.doesNotMatch(metadataViewerSource, /label="Mastering"/);
  assert.match(metadataViewerSource, /label:\s*"Track Info"/);
  assert.doesNotMatch(metadataViewerSource, /label:\s*"Tab3"/);
  assert.match(metadataViewerSource, /metadata-viewer__header-main/);
});

test("uses overlay library browsing without duplicate overlay transports", async () => {
  const playerSource = await readFile(
    path.join(projectRoot, "src/components/AudioPlayer.tsx"),
    "utf8",
  );

  assert.equal(
    (playerSource.match(/<LibraryBrowser\b/g) ?? []).length,
    1,
    "LibraryBrowser should only render inside the browse overlay",
  );
  assert.doesNotMatch(playerSource, /library-sheet__transport/);
  assert.doesNotMatch(playerSource, /metadata-viewer__persistent-transport/);
  assert.match(playerSource, /getLibraryQueueTrackKeys/);
});

test("top-anchors metadata and reserves the persistent player dock", async () => {
  const css = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );

  assert.match(
    css,
    /\.metadata-viewer__backdrop\s*\{[\s\S]*?place-items:\s*start center;/,
  );
  assert.match(
    css,
    /body:has\(\.metadata-viewer__backdrop\)[\s\S]*?\.audio-player__now-playing-waveform[\s\S]*?display:\s*none\s*!important;/,
  );
  assert.match(
    css,
    /grid-template-areas:\s*\n\s*"artwork identity time transport metadata"\s*!important;/,
  );
});

test("desktop full player keeps artwork and waveform on one centerline", async () => {
  const styles = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );

  assert.match(
    styles,
    /\.audio-player\[data-display-mode="full"\] \.player-layout\s*\{[\s\S]*?align-items:\s*center;/,
  );
  assert.match(
    styles,
    /\.audio-player\[data-display-mode="full"\] \.artwork-panel,[\s\S]*?\.audio-player\[data-display-mode="full"\] \.player-layout__main\s*\{[\s\S]*?align-self:\s*center;/,
  );
});

test("desktop Browse Library restores the shared overlay as a visible drawer", async () => {
  const css = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );

  assert.match(
    css,
    /@media \(min-width: 900px\)[\s\S]*?\.library-sheet__backdrop\s*\{[\s\S]*?display:\s*grid;/,
    "desktop H6 library drawer must override the legacy display:none rule",
  );
});


test("uses a two-pane desktop library workspace without changing mobile browsing", async () => {
  const browserSource = await readFile(
    path.join(projectRoot, "src/components/LibraryBrowser.tsx"),
    "utf8",
  );
  const css = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );

  assert.match(browserSource, /library-browser__desktop-workspace/);
  assert.match(browserSource, /library-workspace__release-nav/);
  assert.match(browserSource, /library-workspace__release-detail/);
  assert.match(browserSource, /Search releases, artists, tracks…/);
  assert.match(browserSource, /aria-selected=\{desktopMode === "tracks"\}/);
  assert.match(browserSource, /library-browser__mobile-workspace/);
  assert.match(css, /\.library-sheet\s*\{[\s\S]*?width:\s*min\(1180px, calc\(100vw - 48px\)\);/);
  assert.match(
    css,
    /\.library-workspace__release-layout\s*\{[\s\S]*?grid-template-columns:\s*\d+px minmax\(0, 1fr\);/,
    "desktop library should keep a fixed release navigator beside a flexible detail pane",
  );
});
