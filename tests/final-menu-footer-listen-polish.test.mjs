import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("settings dialog owns short landscape and exposes the Developer card", async () => {
  const css = await source("src/index.css");
  const start = css.indexOf(
    "Final menu / footer / Listen behavior polish",
  );
  assert.notEqual(start, -1);
  const contract = css.slice(start);

  assert.match(
    contract,
    /\.audio-player\[data-menu-open="true"\][\s\S]*?\.hiplingo-now-playing-dock\s*\{[\s\S]*?visibility:\s*hidden !important;[\s\S]*?pointer-events:\s*none !important;/,
  );
  assert.match(
    contract,
    /@media \(max-width:\s*899px\) and \(orientation:\s*landscape\)[\s\S]*?\.audio-player__settings-panel\s*\{[\s\S]*?top:\s*max\(6px,[\s\S]*?bottom:\s*max\(6px,[\s\S]*?max-height:\s*none !important;[\s\S]*?overflow-y:\s*auto !important;/,
  );
});

test("Waveform Color play-pause uses the same purple primary transport family", async () => {
  const css = await source("src/index.css");
  const start = css.indexOf(
    "Final menu / footer / Listen behavior polish",
  );
  const contract = css.slice(start);

  assert.match(
    contract,
    /--settings-primary-transport-surface:\s*rgba\(73, 55, 103, 0\.90\);/,
  );
  assert.match(
    contract,
    /\.settings-control__waveform-actions[\s\S]*?\.audio-player__menu-playback-button\s*\{[\s\S]*?background:\s*var\(--settings-primary-transport-surface\) !important;/,
  );
});

test("compact footer detail shows only the selected release year", async () => {
  const player = await source(
    "src/components/AudioPlayer.tsx",
  );

  assert.match(
    player,
    /getReleaseDate\(selectedTrack\.release\)[\s\S]*?\.match\(\/\^\\d\{4\}\/\)\?\.\[0\] \?\? ""/,
  );
  assert.doesNotMatch(
    player,
    /detail="Playback audio"/,
  );
});

test("public hero and route H1 surfaces use relaxed tracking", async () => {
  const css = await source("src/index.css");
  const start = css.indexOf(
    "Final menu / footer / Listen behavior polish",
  );
  const contract = css.slice(start);

  assert.match(
    contract,
    /:where\([\s\S]*?\.hiplingo-hero,[\s\S]*?\.hiplingo-catalog-heading,[\s\S]*?\.hiplingo-placeholder-card,[\s\S]*?\.hiplingo-release-detail__intro,[\s\S]*?\.hiplingo-artist-detail__heading[\s\S]*?\) h1\s*\{[\s\S]*?letter-spacing:\s*-0\.035em !important;/,
  );
});

test("initial Now Playing title click creates an autoplaying selection", async () => {
  const player = await source(
    "src/components/AudioPlayer.tsx",
  );

  assert.match(
    player,
    /async function toggleQueueTrackPlayback\([\s\S]*?trackKey !== selectedTrackKey \|\|[\s\S]*?!hasPlaybackSelection[\s\S]*?loadTrack\(trackKey, true\);[\s\S]*?await togglePlayback\(\);/,
  );
});

test("footer end action is Shuffle on Listen and waveform navigation elsewhere", async () => {
  const player = await source(
    "src/components/AudioPlayer.tsx",
  );

  assert.match(
    player,
    /displayMode === "full" \? \([\s\S]*?className="hiplingo-now-playing-dock__shuffle-button"[\s\S]*?aria-label="Shuffle playback queue"[\s\S]*?onClick=\{shuffleActiveQueue\}[\s\S]*?\) : \([\s\S]*?className="hiplingo-now-playing-dock__listen-button"[\s\S]*?aria-label="Open Listen"[\s\S]*?onOpenFullPlayer\?\.\(\)/,
  );
  assert.match(
    player,
    /className="hiplingo-now-playing-dock__metadata-button"/,
  );
});
