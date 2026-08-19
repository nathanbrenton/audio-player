import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
    /process\.env\.PUBLISHED_MEDIA_ROOT\s*\?\?\s*"\.\.\/published-media"/,
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

test("starts release-page track playback in place instead of redirecting to /listen", async () => {
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
  assert.match(
    releaseSource,
    /onPlay=\{[\s\S]*?onPlayQueue\(playableTrackKeys\[0\], playableTrackKeys\)/,
    "release artwork must start the release queue from its first playable track",
  );
  assert.match(releaseSource, /aria-label=\{actionLabel \?\? `Play \$\{release\.title\}`\}/);
  assert.match(releaseSource, /actionLabel=\{releaseArtworkActionLabel\}/);
  assert.match(releaseSource, /trackIsSelected/);
  assert.match(releaseSource, /onTogglePlayback/);
  assert.doesNotMatch(
    releaseSource,
    /releaseActionLabel|Play release|Pause release|Resume release/,
  );
});

test("advances through the active queue and exposes a compact global player", async () => {
  const playerSource = await readFile(
    path.join(projectRoot, "src/components/AudioPlayer.tsx"),
    "utf8",
  );

  assert.match(playerSource, /setQueueTrackKeys\(nextQueue\)/);
  assert.match(playerSource, /if \(nextTrack\)[\s\S]*loadTrack\(nextTrack\.key, true\)/);
  assert.match(playerSource, /data-display-mode=\{displayMode\}/);
  assert.match(playerSource, /<CompactNowPlayingBar/);
  assert.match(
    playerSource,
    /displayMode === "compact"[\s\S]*?onOpenFullPlayer/,
  );
  assert.doesNotMatch(playerSource, /hiplingo-compact-player/);
});


test("cold public routes keep the persistent player idle until explicit selection", async () => {
  const appSource = await readFile(
    path.join(projectRoot, "src/App.tsx"),
    "utf8",
  );
  const playerSource = await readFile(
    path.join(projectRoot, "src/components/AudioPlayer.tsx"),
    "utf8",
  );

  assert.doesNotMatch(appSource, /routeReleaseInitialTrack|fallbackTrackKey=/);
  assert.doesNotMatch(playerSource, /fallbackTrackKey|selectionFallbackTrackKey/);
  assert.doesNotMatch(
    playerSource,
    /const firstTrackKey = playableTracks\[0\]\.key/,
  );
  assert.match(
    playerSource,
    /!initialTrackKey[\s\S]*?setSelectedTrackKey\(initialTrackKey\)/,
  );
  assert.match(
    playerSource,
    /artworkUrl=\{[\s\S]*?selectedTrack[\s\S]*?hiplingoLogoUrl/,
  );
});


test("docks the shared desktop transport to the viewport bottom on every route", async () => {
  const css = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );
  const hostCss = await readFile(
    path.join(
      projectRoot,
      "src/components/compact-now-playing-host.css",
    ),
    "utf8",
  );

  assert.match(
    hostCss,
    /\.hiplingo-now-playing-dock\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?bottom:\s*0;[\s\S]*?width:\s*min\(92rem, 100%\);/,
  );
  assert.match(
    css,
    /@media \(min-width: 58\.001rem\) \{[\s\S]*?\.hiplingo-site-shell:has\(\.hiplingo-now-playing-dock\)[\s\S]*?padding-bottom:/,
  );
  assert.match(
    hostCss,
    /@media \(max-width: 58rem\) \{[\s\S]*?\.hiplingo-now-playing-dock\s*\{[\s\S]*?position:\s*relative;[\s\S]*?bottom:\s*auto;/,
  );
  assert.match(
    css,
    /@media \(max-width: 58rem\) \{[\s\S]*?\.audio-player\[data-display-mode="compact"\]\s*\{[\s\S]*?bottom:\s*max\(7px, env\(safe-area-inset-bottom\)\);/,
  );
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


test("portals the shared audible-scrub waveform into desktop release heroes", async () => {
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
  const css = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );

  assert.match(appSource, /releaseWaveformHost/);
  assert.match(appSource, /onNowPlayingWaveformHostChange=\{setReleaseWaveformHost\}/);
  assert.match(appSource, /releaseWaveformHost=\{releaseWaveformHost\}/);
  assert.match(
    releaseSource,
    /ref=\{onNowPlayingWaveformHostChange\}[\s\S]*?hiplingo-release-detail__now-playing-waveform-host/,
  );
  assert.match(playerSource, /createPortal\(/);
  assert.match(
    playerSource,
    /releaseWaveformHost[\s\S]*?<MediaVisualizationSurface/,
  );
  assert.match(playerSource, /audioRef=\{audioRef\}/);
  assert.match(playerSource, /waveformIsPlaying=\{displayedIsPlaying\}/);
  assert.match(playerSource, /ensureAnalyser=\{ensureAudioAnalyser\}/);
  assert.match(playerSource, /onScrubbingChange=\{handleScrubbingChange\}/);
  assert.match(playerSource, /zoomControls:\s*"waveform-panel__zoom-controls"/);
  assert.match(playerSource, /zoomIncreaseButton:/);
  assert.match(playerSource, /zoomDecreaseButton:/);
  assert.match(playerSource, /Now playing/);
  assert.match(
    css,
    /\.hiplingo-release-detail__now-playing-waveform-host\s*\{[\s\S]*?display:\s*none;[\s\S]*?@media \(min-width: 980px\)[\s\S]*?\.hiplingo-release-detail__now-playing-waveform-host\s*\{[\s\S]*?display:\s*block;/,
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
  assert.doesNotMatch(releaseSource, /Play release|Pause release|Resume release/);
  assert.match(releaseSource, /trackIsSelected/);
  assert.match(
    releaseSource,
    /<button[\s\S]*?className="hiplingo-release-track__action"[\s\S]*?aria-label=\{trackActionLabel\}[\s\S]*?onClick=/,
  );
  assert.doesNotMatch(
    releaseSource,
    /<button[^>]*className="hiplingo-release-track"[^>]*>/,
    "the playable track row itself should not be a button",
  );
});


test("puts desktop release-track transport before the track number", async () => {
  const css = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );

  assert.match(
    css,
    /@media \(min-width: 640px\) \{[\s\S]*?\.hiplingo-release-track\s*\{[\s\S]*?grid-template-columns:\s*46px 42px minmax\(0, 1fr\) auto;[\s\S]*?\.hiplingo-release-track__action\s*\{[\s\S]*?grid-column:\s*1;[\s\S]*?\.hiplingo-release-track__number\s*\{[\s\S]*?grid-column:\s*2;/,
  );
});


test("release track rows expose purple selected and playing interaction states", async () => {
  const releaseSource = await readFile(
    path.join(projectRoot, "src/components/ReleaseDetail.tsx"),
    "utf8",
  );
  const css = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );

  assert.match(releaseSource, /useState<string \| null>\(playbackState\.trackKey\)/);
  assert.match(releaseSource, /data-selected=\{/);
  assert.match(releaseSource, /data-playing=\{/);
  assert.match(
    releaseSource,
    /className="hiplingo-release-track"[\s\S]*?onClick=\{\(\) => \{[\s\S]*?setSelectedRowTrackKey\(trackKey\)[\s\S]*?onDoubleClick=\{\(event\) => \{[\s\S]*?onPlayQueue\([\s\S]*?trackKey,[\s\S]*?playableTrackKeys/,
  );
  assert.match(
    releaseSource,
    /className="hiplingo-release-track__title"[\s\S]*?aria-current=[\s\S]*?setSelectedRowTrackKey\(trackKey\)/,
  );
  assert.match(
    releaseSource,
    /className="hiplingo-release-track__action"[\s\S]*?onClick=\{\(event\) => \{[\s\S]*?event\.stopPropagation\(\)[\s\S]*?onDoubleClick=\{\(event\) => \{[\s\S]*?event\.stopPropagation\(\)/,
  );
  assert.match(
    css,
    /\.hiplingo-release-track:not\(\.hiplingo-release-track--unavailable\):hover[\s\S]*?rgba\(169, 140, 255,/,
  );
  assert.match(
    css,
    /\.hiplingo-release-track\[data-selected="true"\][\s\S]*?rgba\(169, 140, 255,/,
  );
  assert.match(
    css,
    /\.hiplingo-release-track\[data-playing="true"\][\s\S]*?rgba\(207, 191, 255,/,
  );
  assert.match(
    css,
    /\.hiplingo-release-track:not\(\.hiplingo-release-track--unavailable\)\s*\{[\s\S]*?user-select:\s*none;/,
    "double-clicking a playable row should not select track-number/title text",
  );
  assert.match(
    css,
    /\.hiplingo-release-track\[data-selected="true"\]:hover[\s\S]*?rgba\(169, 140, 255, 0\.14\)/,
    "hover should preserve the selected-row purple background",
  );
  assert.match(
    css,
    /\.hiplingo-release-track\[data-playing="true"\]:hover[\s\S]*?rgba\(169, 140, 255, 0\.22\)/,
    "hover should preserve the stronger playing-row purple background",
  );
});


test("Hiplingo site footer keeps Contact and removes the dead About link", async () => {
  const appSource = await readFile(
    path.join(projectRoot, "src/App.tsx"),
    "utf8",
  );
  const css = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );

  const footerStart = appSource.indexOf(
    'function SiteFooter()',
  );
  const footerEnd = appSource.indexOf(
    'export default function App()',
  );

  assert.notEqual(footerStart, -1);
  assert.notEqual(footerEnd, -1);

  const footerSource = appSource.slice(
    footerStart,
    footerEnd,
  );

  assert.match(footerSource, /HIPLINGO_CONTACT_MAILTO/);
  assert.doesNotMatch(footerSource, /route="\/about"/);
  assert.doesNotMatch(footerSource, />\s*About\s*</);
  assert.match(
    css,
    /\.hiplingo-site-footer\s*\{[\s\S]*?justify-content:\s*center;[\s\S]*?text-align:\s*center;/,
  );
});


test("keeps release identity concise and emphasizes the persistent now-playing track", async () => {
  const releaseSource = await readFile(
    path.join(projectRoot, "src/components/ReleaseDetail.tsx"),
    "utf8",
  );
  const css = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );

  assert.match(
    releaseSource,
    /hiplingo-release-detail__masthead[\s\S]*?← Releases[\s\S]*?onOpenArtist\(artist\)/,
  );
  assert.match(
    releaseSource,
    /<h2 id="release-tracklist-heading">Track list<\/h2>/,
  );
  assert.doesNotMatch(
    releaseSource,
    /release-tracklist-heading">\{release\.title\}/,
  );
  assert.match(
    releaseSource,
    /\[\s*date,\s*`\$\{release\.trackCount\}[\s\S]*?releaseRuntime,\s*\]/,
  );
  assert.match(
    css,
    /\.hiplingo-release-now-playing__identity strong\s*\{[\s\S]*?color:\s*#f0edf4;[\s\S]*?font-size:\s*clamp\(0\.95rem,[\s\S]*?font-weight:\s*740;/,
  );
});


test("unifies Hiplingo navigation and player settings in one site header", async () => {
  const appSource = await readFile(
    path.join(projectRoot, "src/App.tsx"),
    "utf8",
  );
  const playerSource = await readFile(
    path.join(projectRoot, "src/components/AudioPlayer.tsx"),
    "utf8",
  );

  assert.match(appSource, /hiplingo-site-actions/);
  assert.match(appSource, /onTogglePlayerMenu=\{requestTogglePlayerMenu\}/);
  assert.doesNotMatch(appSource, /Browse Library|onBrowseLibrary|requestOpenLibrary/);
  assert.doesNotMatch(playerSource, /<header className="audio-player__header">/);
  assert.doesNotMatch(playerSource, /openLibrary|library-sheet__/);
  assert.match(playerSource, /toggleSettings:\s*\(\) =>/);
});

test("keeps the global player dock above the metadata overlay", async () => {
  const appStyles = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );
  const sharedMetadataStyles = await readFile(
    path.resolve(
      projectRoot,
      "../packages/media-player/src/listener-metadata-viewer.css",
    ),
    "utf8",
  );
  const nowPlayingHostStyles = await readFile(
    path.join(
      projectRoot,
      "src/components/compact-now-playing-host.css",
    ),
    "utf8",
  );

  assert.match(appStyles, /\.hiplingo-site-header\s*\{[\s\S]*?z-index:\s*400;/);
  assert.doesNotMatch(appStyles, /\.library-sheet__/);
  assert.match(
    sharedMetadataStyles,
    /\.metadata-viewer__backdrop\s*\{[\s\S]*?z-index:\s*1000;/,
  );
  assert.match(
    nowPlayingHostStyles,
    /\.hiplingo-now-playing-dock\s*\{[\s\S]*?z-index:\s*1200;/,
  );
});

test("groups Edited By with Recording & Editing credits", async () => {
  const metadataViewerSource = await readFile(
    path.resolve(
      projectRoot,
      "../packages/media-player/src/ListenerMetadataViewer.tsx",
    ),
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
    path.resolve(
      projectRoot,
      "../packages/media-player/src/ListenerMetadataViewer.tsx",
    ),
    "utf8",
  );

  assert.match(metadataViewerSource, /label="Mixing & Mastering"/);
  assert.doesNotMatch(metadataViewerSource, /label="Mixing"/);
  assert.doesNotMatch(metadataViewerSource, /label="Mastering"/);
  assert.match(metadataViewerSource, /label:\s*"Track Info"/);
  assert.doesNotMatch(metadataViewerSource, /label:\s*"Tab3"/);
  assert.match(metadataViewerSource, /metadata-viewer__header-main/);
});

test("uses one dedicated Listen queue without retaining a browse overlay", async () => {
  const playerSource = await readFile(
    path.join(projectRoot, "src/components/AudioPlayer.tsx"),
    "utf8",
  );
  const queueSource = await readFile(
    path.join(projectRoot, "src/components/ListenTrackQueue.tsx"),
    "utf8",
  );

  assert.equal(
    (playerSource.match(/<ListenTrackQueue\b/g) ?? []).length,
    1,
    "the full Listen view should render one dedicated title queue",
  );
  assert.doesNotMatch(playerSource, /LibraryBrowser|openLibrary|library-sheet__/);
  assert.match(playerSource, /getQueueTrackKeysForTrack/);
  assert.doesNotMatch(queueSource, /library-browser__|library-workspace__/);
});

test("top-anchors metadata and reserves the persistent player dock", async () => {
  const hostStyles = await readFile(
    path.join(
      projectRoot,
      "src/components/metadata-viewer-host.css",
    ),
    "utf8",
  );

  assert.match(
    hostStyles,
    /\.metadata-viewer__backdrop\s*\{[\s\S]*?place-items:\s*start center;/,
  );
  assert.match(
    hostStyles,
    /body:has\(\.metadata-viewer__backdrop\)[\s\S]*?\.shared-now-playing__waveform-region[\s\S]*?display:\s*none\s*!important;/,
  );
  assert.match(
    hostStyles,
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

test("removes Browse Library from every public header breakpoint", async () => {
  const appSource = await readFile(
    path.join(projectRoot, "src/App.tsx"),
    "utf8",
  );
  const css = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );

  assert.doesNotMatch(appSource, /Browse Library|hiplingo-site-browse|onBrowseLibrary/);
  assert.doesNotMatch(css, /\.hiplingo-site-browse|\.library-sheet__/);
});

test("removes the retired multi-view Library implementation", async () => {
  const [playerSource, queueSource, css] = await Promise.all([
    readFile(path.join(projectRoot, "src/components/AudioPlayer.tsx"), "utf8"),
    readFile(path.join(projectRoot, "src/components/ListenTrackQueue.tsx"), "utf8"),
    readFile(path.join(projectRoot, "src/index.css"), "utf8"),
  ]);

  assert.doesNotMatch(playerSource, /LibraryBrowser|library-sheet__/);
  assert.doesNotMatch(
    queueSource,
    /DesktopLibraryViewMode|library-browser__|library-workspace__|coverTileSizeRem|mobileReleaseId/,
  );
  assert.doesNotMatch(css, /\.library-|\.hiplingo-site-browse/);
  assert.match(queueSource, /listen-track-queue__titles/);
  assert.match(queueSource, /className="listen-track-queue__titles"/);
});

test("refuses canonical private roots as Hiplingo public media", async () => {
  const viteSource = await readFile(
    path.join(projectRoot, "vite.config.mjs"),
    "utf8",
  );

  assert.doesNotMatch(
    viteSource,
    /process\.env\.MEDIA_LIBRARY_ROOT/,
  );
  assert.match(
    viteSource,
    /process\.env\.PUBLISHED_MEDIA_ROOT/,
  );
  assert.match(
    viteSource,
    /path\.resolve\(projectRoot,\s*"\.\.\/media-library"\)/,
  );
  assert.match(
    viteSource,
    /path\.resolve\(projectRoot,\s*"\.\.\/ingest-drop"\)/,
  );

  for (const privateRoot of [
    "../media-library",
    "../ingest-drop",
  ]) {
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        'await import("./vite.config.mjs");',
      ],
      {
        cwd: projectRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          PUBLISHED_MEDIA_ROOT: privateRoot,
        },
      },
    );

    assert.notEqual(
      result.status,
      0,
      `${privateRoot} must be rejected`,
    );

    assert.match(
      result.stderr,
      /must not point at media-library or ingest-drop/,
    );
  }
});

test("keeps the browser catalog on the public /media route", async () => {
  const catalogSource = await readFile(
    path.join(projectRoot, "src/lib/mediaCatalog.ts"),
    "utf8",
  );

  assert.match(
    catalogSource,
    /MEDIA_BASE_URL\s*=\s*["']\/media["']/,
  );

  assert.match(
    catalogSource,
    /fetch\(`\$\{MEDIA_BASE_URL\}\/catalog\.json`/,
  );

  assert.doesNotMatch(
    catalogSource,
    /fetch\(["']\/catalog\.json["']/,
  );

  assert.doesNotMatch(
    catalogSource,
    /fetch\(["']\/published-media\//,
  );
});

test("keeps Hiplingo public metadata on the browser-native UTF-8 JSON path", async () => {
  const html = await readFile(
    path.join(projectRoot, "index.html"),
    "utf8",
  );
  const catalogSource = await readFile(
    path.join(projectRoot, "src/lib/mediaCatalog.ts"),
    "utf8",
  );
  const metadataViewerSource = await readFile(
    path.resolve(
      projectRoot,
      "../packages/media-player/src/ListenerMetadataViewer.tsx",
    ),
    "utf8",
  );

  assert.match(
    html.slice(0, 1024),
    /<meta\s+charset=["']UTF-8["']\s*\/>/i,
  );
  assert.match(catalogSource, /return response\.json\(\);/);
  assert.match(catalogSource, /await response\.json\(\)/);
  assert.doesNotMatch(catalogSource, /TextDecoder\s*\(/);
  assert.doesNotMatch(catalogSource, /Buffer\.from\s*\(/);
  assert.match(
    metadataViewerSource,
    /JSON\.stringify\(rawMetadata, null, 2\)/,
  );
});


test("toggles release playback from the release artwork", async () => {
  const source = await readFile(
    new URL("../src/components/ReleaseDetail.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /const releaseIsSelected = Boolean/);
  assert.match(source, /if \(releaseIsSelected\) \{[\s\S]*?onTogglePlayback\(\)/);
  assert.match(source, /onPlayQueue\(playableTrackKeys\[0\], playableTrackKeys\)/);
  assert.match(source, /aria-pressed=\{isPlaying\}/);
  assert.match(source, /\{isPlaying \? "❚❚" : "▶"\}/);
});


test("v1 licensing uses static public contact while Jam remains explicitly coming soon", async () => {
  const appSource = await readFile(
    path.join(projectRoot, "src/App.tsx"),
    "utf8",
  );

  const inquiryStart = appSource.indexOf(
    'case "/licensing/inquiry":',
  );
  const jamStart = appSource.indexOf(
    'case "/licensing/jam":',
  );
  const aboutStart = appSource.indexOf(
    'case "/about":',
  );

  assert.notEqual(inquiryStart, -1);
  assert.notEqual(jamStart, -1);
  assert.notEqual(aboutStart, -1);

  const inquirySource = appSource.slice(
    inquiryStart,
    jamStart,
  );
  const jamSource = appSource.slice(
    jamStart,
    aboutStart,
  );

  assert.match(inquirySource, /HIPLINGO_CONTACT_MAILTO/);
  assert.match(inquirySource, />\s*Contact Hiplingo\s*</);
  assert.doesNotMatch(inquirySource, /form is being prepared/);
  assert.match(jamSource, /Coming soon\./);
});
