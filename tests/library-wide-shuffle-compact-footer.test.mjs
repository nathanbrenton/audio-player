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

test("Listen Shuffle preserves a playing track and reshuffles only upcoming library tracks", async () => {
  const player = await source("src/components/AudioPlayer.tsx");

  assert.match(
    player,
    /function shuffleActiveQueue\(\)[\s\S]*?const allTrackKeys = playableTracks\.map\(\(entry\) => entry\.key\);[\s\S]*?const currentTrackIsPlaying =[\s\S]*?hasPlaybackSelection[\s\S]*?displayedIsPlaying[\s\S]*?if \(currentTrackIsPlaying\)/,
  );
  assert.match(
    player,
    /activeQueue[\s\S]*?\.slice\(0, selectedIndex \+ 1\)[\s\S]*?queuePrefixSet[\s\S]*?allTrackKeys\.filter\([\s\S]*?!queuePrefixSet\.has\(trackKey\)[\s\S]*?setQueueTrackKeys\(\[[\s\S]*?queuePrefixTrackKeys[\s\S]*?shuffledUpcomingTrackKeys/,
  );
  assert.match(
    player,
    /const shuffledTrackKeys = shufflePlaybackTrackKeys\(allTrackKeys\);[\s\S]*?shuffleQueueTracks\(shuffledTrackKeys\);/,
  );

  const start = player.indexOf("if (currentTrackIsPlaying)");
  assert.notEqual(start, -1);
  const end = player.indexOf("\n      return;", start);
  assert.ok(end > start);
  const playingBranch = player.slice(start, end);

  assert.doesNotMatch(
    playingBranch,
    /loadTrack\(|playQueue\(|shuffleQueueTracks\(/,
    "reshuffling upcoming tracks must not reload or replace the playing track",
  );
});

test("shared player owns the compact Title / context / year stack", async () => {
  const [sharedCss, hostCss] = await Promise.all([
    source("../packages/media-player/src/compact-now-playing-bar.css"),
    source("src/index.css"),
  ]);

  assert.match(
    sharedCss,
    /\.shared-now-playing__identity\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;[\s\S]*?justify-content:\s*center;[\s\S]*?gap:\s*0\.08rem;/,
  );
  assert.match(
    sharedCss,
    /\.shared-now-playing__title,[\s\S]*?\.shared-now-playing__context,[\s\S]*?\.shared-now-playing__detail\s*\{[\s\S]*?width:\s*100%;[\s\S]*?margin:\s*0;[\s\S]*?padding:\s*0;/,
  );
  assert.match(
    hostCss,
    /\.hiplingo-now-playing-dock__context-links\s*\{[\s\S]*?display:\s*inline-flex;/,
  );
  assert.doesNotMatch(
    hostCss,
    /Library-wide Listen Shuffle \+ compact footer identity/,
  );
  assert.doesNotMatch(
    hostCss,
    /Footer identity stack hardening/,
  );
});
