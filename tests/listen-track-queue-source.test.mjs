import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("places the dedicated Listen queue between the main waveform and persistent dock", async () => {
  const playerSource = await readFile(
    path.join(projectRoot, "src/components/AudioPlayer.tsx"),
    "utf8",
  );

  const waveformIndex = playerSource.indexOf(
    'className="listen-waveform-anchor"',
  );
  const queueIndex = playerSource.indexOf("<ListenTrackQueue");
  const dockIndex = playerSource.indexOf("<CompactNowPlayingBar");

  assert.notEqual(waveformIndex, -1);
  assert.notEqual(queueIndex, -1);
  assert.notEqual(dockIndex, -1);
  assert.ok(waveformIndex < queueIndex);
  assert.ok(queueIndex < dockIndex);
  assert.equal((playerSource.match(/<ListenTrackQueue\b/g) ?? []).length, 1);
  assert.doesNotMatch(playerSource, /LibraryBrowser|openLibrary|library-sheet__/);
});

test("ListenTrackQueue contains only the active title carousel", async () => {
  const queueSource = await readFile(
    path.join(projectRoot, "src/components/ListenTrackQueue.tsx"),
    "utf8",
  );

  assert.match(queueSource, /className="listen-track-queue"/);
  assert.match(queueSource, /aria-label="Track queue"/);
  assert.match(queueSource, /className="listen-track-queue__titles"/);
  assert.match(queueSource, /listen-track-queue__title--previous/);
  assert.match(queueSource, /listen-track-queue__current/);
  assert.match(queueSource, /listen-track-queue__title--next/);
  assert.doesNotMatch(queueSource, /listen-track-queue__filters/);
  assert.doesNotMatch(queueSource, /listen-track-queue__shuffle/);
  assert.doesNotMatch(queueSource, /All artists|All releases|Library order/);
});

test("desktop Listen makes the current title dominant without floating discovery controls", async () => {
  const [queueSource, css] = await Promise.all([
    readFile(path.join(projectRoot, "src/components/ListenTrackQueue.tsx"), "utf8"),
    readFile(path.join(projectRoot, "src/index.css"), "utf8"),
  ]);

  assert.match(css, /\.listen-track-queue__title strong\s*\{[\s\S]*?font-size:\s*clamp\(2\.25rem, 3vw, 3\.15rem\);/);
  assert.match(css, /\.listen-track-queue__current\s*\{[\s\S]*?opacity:\s*1;[\s\S]*?translateZ\(42px\)[\s\S]*?scale\(1\);/);
  assert.doesNotMatch(queueSource, /listen-track-queue__filters/);
  assert.doesNotMatch(queueSource, /listen-track-queue__shuffle/);
});

test("desktop Listen derives carousel neighbors from the active playback queue", async () => {
  const queueSource = await readFile(
    path.join(projectRoot, "src/components/ListenTrackQueue.tsx"),
    "utf8",
  );

  assert.match(
    queueSource,
    /queueTrackKeys\?: readonly string\[\]/,
  );
  assert.match(
    queueSource,
    /const queueSourceTracks = useMemo<QueueTrack\[\]>\([\s\S]*?queueTrackKeys\.flatMap\([\s\S]*?return orderedQueue\.length > 0[\s\S]*?\? orderedQueue[\s\S]*?: playableTracks;/,
  );
  assert.doesNotMatch(
    queueSource,
    /filteredQueueTracks|sortedQueueTracks|shuffledQueueTracks|sortQueueTracks/,
  );
  assert.match(queueSource, /function getQueueTrackAtOffset\(offset: number\): QueueTrack \| null/);
  assert.match(queueSource, /const nextQueueTrack = getQueueTrackAtOffset\(1\)/);
  assert.match(queueSource, /const nextNextQueueTrack\s*=\s*queueSourceTracks\.length >= 5/);
});

test("desktop Listen mirrors the artwork handoff model on a vertical title carousel", async () => {
  const queueSource = await readFile(
    path.join(projectRoot, "src/components/ListenTrackQueue.tsx"),
    "utf8",
  );
  const playerSource = await readFile(
    path.join(projectRoot, "src/components/AudioPlayer.tsx"),
    "utf8",
  );
  const css = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );

  assert.match(queueSource, /const movementThreshold = 8;/);
  assert.match(queueSource, /const reversalThreshold = 12;/);
  assert.match(queueSource, /event\.currentTarget\.clientHeight \* 0\.48/);
  assert.match(queueSource, /event\.currentTarget\.clientHeight \* 0\.22/);
  assert.match(queueSource, /Math\.max\([\s\S]*?0,[\s\S]*?Math\.min\(1, titleDragProgress\)[\s\S]*?\)/);
  assert.match(queueSource, /latestDragProgress >= 0\.9/);
  assert.match(queueSource, /normalizedTitleProgress\s*\*\s*normalizedTitleProgress\s*\*\s*\(3 - 2 \* normalizedTitleProgress\)/);
  assert.match(queueSource, /const titleIsPromoted = titleVisualProgress >= 0\.5/);
  assert.match(queueSource, /Math\.abs\(deltaY\) > Math\.abs\(deltaX\)/);
  assert.match(queueSource, /deltaY < 0 \? "next" : "previous"/);
  assert.match(queueSource, /window\.requestAnimationFrame\(\(\) => \{[\s\S]*?window\.requestAnimationFrame/);
  assert.match(queueSource, /data-has-previous=\{previousQueueTrack \? "true" : "false"\}/);
  assert.match(queueSource, /data-swipe-promoted=\{titleIsPromoted \? "true" : "false"\}/);
  assert.match(queueSource, /data-swipe-committing=\{titleCommitDirection \? "true" : "false"\}/);
  assert.match(queueSource, /titleCommitOriginTrackKeyRef\.current = selectedTrackKey/);
  assert.match(queueSource, /titleCommitHasAdvanced \? "none" : titleSwipeDirection/);
  assert.match(queueSource, /"--listen-title-visual-progress": titleVisualProgress/);
  assert.match(queueSource, /onNavigateTrack\?: \(trackKey: string, queueTrackKeys\?: string\[\]\) => void/);

  assert.match(
    playerSource,
    /function navigateQueueTrack\([\s\S]*?const shouldAutoplay =[\s\S]*?isPlaying \|\| Boolean\(audio && !audio\.paused\)[\s\S]*?loadTrack\(trackKey, shouldAutoplay\)/,
  );
  assert.match(playerSource, /onNavigateTrack=\{\(trackKey, queueTrackKeys\) => \{/);

  assert.match(
    css,
    /Listen title carousel — proportional cascading handoff[\s\S]*?data-swipe-direction="next"[\s\S]*?\.listen-track-queue__current\s*\{[\s\S]*?72px[\s\S]*?130px[\s\S]*?0\.46/,
  );
  assert.match(
    css,
    /Listen title carousel — proportional cascading handoff[\s\S]*?data-swipe-direction="next"[\s\S]*?\.listen-track-queue__title--next\s*\{[\s\S]*?\(\(1 - var\(--listen-title-visual-progress\)\) \* 72px\)[\s\S]*?0\.62 \+ \(var\(--listen-title-visual-progress\) \* 0\.38\)/,
  );
  assert.match(
    css,
    /Listen title carousel — proportional cascading handoff[\s\S]*?data-swipe-direction="previous"[\s\S]*?\.listen-track-queue__title--previous\s*\{[\s\S]*?\(\(1 - var\(--listen-title-visual-progress\)\) \* 72px\)[\s\S]*?0\.54 \+ \(var\(--listen-title-visual-progress\) \* 0\.46\)/,
  );
  assert.match(
    css,
    /\.listen-track-queue__titles\[data-has-previous="false"\]\s*\{[\s\S]*?--listen-title-center-y:\s*30%;[\s\S]*?height:\s*198px;[\s\S]*?margin-top:\s*-124px;/,
  );
  assert.match(
    css,
    /\.listen-track-queue__title\s*\{[\s\S]*?top:\s*var\(--listen-title-center-y\);/,
  );
  assert.match(
    css,
    /data-swipe-committing="true"[\s\S]*?\.listen-track-queue__title\s*\{[\s\S]*?transition:\s*none !important;/,
  );
});


test("desktop Listen removes the scrollable upcoming list in favor of fixed clickable carousel neighbors", async () => {
  const queueSource = await readFile(
    path.join(projectRoot, "src/components/ListenTrackQueue.tsx"),
    "utf8",
  );
  const playerSource = await readFile(
    path.join(projectRoot, "src/components/AudioPlayer.tsx"),
    "utf8",
  );

  assert.doesNotMatch(queueSource, /queueScrollRef/);
  assert.doesNotMatch(queueSource, /className="listen-track-queue__tracks"/);
  assert.doesNotMatch(queueSource, /aria-label="Queued tracks"/);
  assert.doesNotMatch(queueSource, /visibleQueueTracks\.map/);
  assert.match(queueSource, /listen-track-queue__title--far-previous/);
  assert.match(queueSource, /listen-track-queue__title--previous/);
  assert.match(queueSource, /listen-track-queue__title--next/);
  assert.match(queueSource, /listen-track-queue__title--far-next/);
  assert.match(
    queueSource,
    /onPlayTrack\?\.\(nextQueueTrack\.key, queueSourceTrackKeys\)/,
  );
  assert.match(
    queueSource,
    /previousPreviousQueueTrack\.key,[\s\S]*?queueSourceTrackKeys/,
  );
  assert.match(
    queueSource,
    /nextNextQueueTrack\.key,[\s\S]*?queueSourceTrackKeys/,
  );
  assert.match(
    queueSource,
    /onToggleTrackPlayback\?\.\(currentQueueTrack\.key\)/,
  );
  assert.match(
    playerSource,
    /async function playQueueTrack\([\s\S]*?requestedQueueTrackKeys\?: string\[\]/,
  );
});


test("Listen Shuffle lives in the persistent footer instead of the floating queue surface", async () => {
  const queueSource = await readFile(
    path.join(projectRoot, "src/components/ListenTrackQueue.tsx"),
    "utf8",
  );
  const playerSource = await readFile(
    path.join(projectRoot, "src/components/AudioPlayer.tsx"),
    "utf8",
  );

  assert.doesNotMatch(queueSource, /onShuffleTracks/);
  assert.doesNotMatch(queueSource, /listen-track-queue__shuffle/);
  assert.match(playerSource, /function shuffleActiveQueue\(\)/);
  assert.match(playerSource, /displayMode === "full" \? \([\s\S]*?hiplingo-now-playing-dock__shuffle-button[\s\S]*?onClick=\{shuffleActiveQueue\}/);
});

test("mobile portrait keeps Listen browser-free while preserving the fixed footer waveform", async () => {
  const [appSource, queueSource, css] = await Promise.all([
    readFile(path.join(projectRoot, "src/App.tsx"), "utf8"),
    readFile(path.join(projectRoot, "src/components/ListenTrackQueue.tsx"), "utf8"),
    readFile(path.join(projectRoot, "src/index.css"), "utf8"),
  ]);

  assert.doesNotMatch(appSource, /Browse Library|hiplingo-site-browse|onBrowseLibrary/);
  assert.doesNotMatch(queueSource, /library-browser__|library-workspace__/);
  assert.doesNotMatch(css, /\.library-|\.hiplingo-site-browse/);

  assert.match(
    css,
    /@media \(max-width: 899px\) and \(orientation: portrait\) \{[\s\S]*?html:has\(\.hiplingo-site-shell--listen\),[\s\S]*?overflow:\s*hidden;/,
  );
  assert.match(
    css,
    /\.hiplingo-site-shell--listen\s*\{[\s\S]*?height:\s*100dvh;[\s\S]*?overflow:\s*hidden;/,
  );
  assert.match(
    css,
    /\.hiplingo-site-shell--listen > \.hiplingo-site-footer\s*\{\s*display:\s*none;/,
  );
  assert.match(
    css,
    /Mobile portrait Listen — fixed title center \+ flanking footer transport[\s\S]*?grid-template-areas:[\s\S]*?"play previous waveform waveform next shuffle"[\s\S]*?"artwork identity identity time time end"/,
  );
  assert.match(
    css,
    /\.shared-now-playing__waveform-region\s*\{[\s\S]*?grid-area:\s*waveform;[\s\S]*?display:\s*block;/,
  );
});

test("mobile portrait keeps a fixed title centerline and uses the available middle space", async () => {
  const css = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );

  assert.match(
    css,
    /Mobile portrait Listen — hero scale \+ carousel placement[\s\S]*?\.hiplingo-site-shell--listen \.artwork-panel\s*\{[\s\S]*?width:\s*min\(54vw, 215px\);[\s\S]*?max-width:\s*215px;/,
  );
  assert.match(
    css,
    /Mobile portrait Listen — hero scale \+ carousel placement[\s\S]*?\.hiplingo-site-shell--listen \.waveform-panel\s*\{[\s\S]*?--waveform-canvas-height:\s*clamp\(108px, 15dvh, 134px\);/,
  );
  assert.match(
    css,
    /Mobile portrait Listen — fixed title center \+ flanking footer transport[\s\S]*?\.audio-player\[data-display-mode="full"\][\s\S]*?> \.listen-track-queue-host\s*\{[\s\S]*?margin:\s*clamp\(42px, 5\.6dvh, 52px\) auto 0;/,
  );
  assert.match(
    css,
    /\.listen-track-queue__titles,\s*[\s\S]*?\.listen-track-queue__titles\[data-has-previous="false"\]\s*\{[\s\S]*?--listen-title-center-y:\s*50%;[\s\S]*?height:\s*176px;[\s\S]*?margin:\s*0 auto;/,
  );
});

test("mobile portrait suppresses carousel reflow between committed track changes", async () => {
  const queueSource = await readFile(
    path.join(projectRoot, "src/components/ListenTrackQueue.tsx"),
    "utf8",
  );
  const css = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );

  for (const slot of [
    "far-previous",
    "previous",
    "current",
    "next",
    "far-next",
  ]) {
    assert.match(
      queueSource,
      new RegExp(`key="queue-title-${slot}"`),
    );
  }

  assert.match(
    css,
    /Mobile portrait Listen — stable title\/Shuffle handoff[\s\S]*?\.listen-track-queue\s*\{[\s\S]*?grid-template-rows:\s*176px 48px;[\s\S]*?row-gap:\s*0;/,
  );
  assert.match(
    css,
    /data-swipe-direction="none"[\s\S]*?\.listen-track-queue__title\s*\{\s*transition:\s*none;/,
  );
  assert.match(
    css,
    /\.listen-track-queue__filters\s*\{[\s\S]*?height:\s*48px;[\s\S]*?min-height:\s*48px;[\s\S]*?margin:\s*0 auto 10px;/,
  );
  assert.match(
    css,
    /Portrait Shuffle now lives in the persistent footer[\s\S]*?\.listen-track-queue__shuffle\s*\{\s*display:\s*none;/,
  );
});

test("mobile portrait flanks the footer waveform with transport controls and restores time below", async () => {
  const css = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );

  assert.match(
    css,
    /Mobile portrait Listen — fixed title center \+ flanking footer transport[\s\S]*?\.hiplingo-now-playing-dock\.shared-now-playing\s*\{[\s\S]*?grid-template-areas:[\s\S]*?"play previous waveform waveform next shuffle"[\s\S]*?"artwork identity identity time time end";[\s\S]*?grid-template-columns:[\s\S]*?clamp\(38px, 11vw, 44px\)[\s\S]*?clamp\(38px, 11vw, 44px\)[\s\S]*?minmax\(0, 1fr\)[\s\S]*?auto[\s\S]*?clamp\(38px, 11vw, 44px\)[\s\S]*?clamp\(38px, 11vw, 44px\);[\s\S]*?grid-template-rows:\s*44px 48px;/,
  );
  assert.match(
    css,
    /\.shared-now-playing__transport\s*\{\s*display:\s*contents;/,
  );
  assert.match(
    css,
    /\.shared-now-playing__transport > button:nth-child\(1\)\s*\{\s*grid-area:\s*previous;/,
  );
  assert.match(
    css,
    /\.shared-now-playing__transport > \.shared-now-playing__play\s*\{\s*grid-area:\s*play;/,
  );
  assert.match(
    css,
    /\.shared-now-playing__transport > button:nth-child\(3\)\s*\{\s*grid-area:\s*next;/,
  );
  assert.match(
    css,
    /\.shared-now-playing__waveform-region\s*\{[\s\S]*?grid-area:\s*waveform;[\s\S]*?height:\s*42px;/,
  );
  assert.match(
    css,
    /\.shared-now-playing__time\s*\{[\s\S]*?grid-area:\s*time;[\s\S]*?display:\s*flex;[\s\S]*?justify-self:\s*end;/,
  );
  assert.match(
    css,
    /\.shared-now-playing__identity\s*\{[\s\S]*?grid-area:\s*identity;[\s\S]*?padding-left:\s*4px;/,
  );
  assert.match(
    css,
    /Mobile portrait Listen — fixed title center \+ flanking footer transport[\s\S]*?\.shared-now-playing__end-controls\s*\{\s*display:\s*contents;[\s\S]*?\.hiplingo-now-playing-dock__shuffle-button\s*\{[\s\S]*?grid-area:\s*shuffle;[\s\S]*?display:\s*grid;/,
  );
  assert.match(
    css,
    /Mobile portrait Listen — fixed title center \+ flanking footer transport[\s\S]*?\.hiplingo-now-playing-dock__metadata-button\s*\{\s*grid-area:\s*end;/,
  );
});


test("mobile portrait cascades every title one slot without crossing the Now Playing center", async () => {
  const css = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );

  assert.match(
    css,
    /Mobile portrait[\s\S]*?Listen title carousel — proportional cascading handoff[\s\S]*?data-swipe-direction="next"[\s\S]*?\.listen-track-queue__current\s*\{[\s\S]*?45px[\s\S]*?110px[\s\S]*?0\.28/,
  );
  assert.match(
    css,
    /data-swipe-direction="next"[\s\S]*?\.listen-track-queue__title--next\s*\{[\s\S]*?\(\(1 - var\(--listen-title-visual-progress\)\) \* 48px\)[\s\S]*?0\.76 \+ \(var\(--listen-title-visual-progress\) \* 0\.24\)/,
  );
  assert.match(
    css,
    /data-swipe-direction="previous"[\s\S]*?\.listen-track-queue__title--previous\s*\{[\s\S]*?\(\(1 - var\(--listen-title-visual-progress\)\) \* 45px\)[\s\S]*?0\.72 \+ \(var\(--listen-title-visual-progress\) \* 0\.28\)/,
  );
  assert.match(
    css,
    /data-swipe-direction="previous"[\s\S]*?\.listen-track-queue__current\s*\{[\s\S]*?48px[\s\S]*?62px[\s\S]*?0\.24/,
  );
});


test("mobile portrait grows the incoming neighbor into the Now Playing typography", async () => {
  const css = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );

  assert.match(
    css,
    /--listen-title-neighbor-font-size:\s*clamp\(0\.9rem, 4\.6vw, 1\.2rem\);[\s\S]*?--listen-title-current-font-size:\s*clamp\(1\.45rem, 7vw, 1\.95rem\);[\s\S]*?--listen-title-center-font-progress:\s*clamp\([\s\S]*?1\.111111/,
  );
  assert.match(
    css,
    /data-swipe-direction="next"[\s\S]*?\.listen-track-queue__title--next strong,[\s\S]*?data-swipe-direction="previous"[\s\S]*?\.listen-track-queue__title--previous strong\s*\{[\s\S]*?font-size:\s*calc\([\s\S]*?var\(--listen-title-current-font-size\)[\s\S]*?var\(--listen-title-center-font-progress\)/,
  );
});