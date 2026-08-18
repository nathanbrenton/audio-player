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

test("Listen Shuffle randomizes the complete playable public library", async () => {
  const player = await source("src/components/AudioPlayer.tsx");

  assert.match(
    player,
    /function shuffleActiveQueue\(\)[\s\S]*?shufflePlaybackTrackKeys\([\s\S]*?playableTracks\.map\(\(entry\) => entry\.key\)[\s\S]*?shuffleQueueTracks\(shuffledTrackKeys\);/,
  );

  const start = player.indexOf("function shuffleActiveQueue()");
  assert.notEqual(start, -1);
  const functionSlice = player.slice(start, start + 900);

  assert.doesNotMatch(
    functionSlice,
    /activeQueue\.map\(\(entry\) => entry\.key\)/,
  );
  assert.match(
    functionSlice,
    /shuffledTrackKeys\[0\] === selectedTrackKey/,
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
