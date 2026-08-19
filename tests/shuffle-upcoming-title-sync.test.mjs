import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const source = (relativePath) =>
  readFile(path.join(root, relativePath), "utf8");

test("reshuffled upcoming artwork and title carousel share one queue order", async () => {
  const [player, queue] = await Promise.all([
    source("src/components/AudioPlayer.tsx"),
    source("src/components/ListenTrackQueue.tsx"),
  ]);

  assert.match(
    player,
    /if \(currentTrackIsPlaying\)[\s\S]*?setQueueTrackKeys\(\[[\s\S]*?queuePrefixTrackKeys[\s\S]*?shuffledUpcomingTrackKeys/,
  );

  assert.match(
    player,
    /<ListenTrackQueue[\s\S]*?selectedTrackKey=\{selectedTrackKey\}[\s\S]*?queueTrackKeys=\{queueTrackKeys\}/,
  );

  assert.match(
    queue,
    /queueTrackKeys\?: readonly string\[\]/,
  );
  assert.match(
    queue,
    /queueTrackKeys\.flatMap\(\(trackKey\) => \{[\s\S]*?playableByKey\.get\(trackKey\)[\s\S]*?return orderedQueue\.length > 0[\s\S]*?orderedQueue/,
  );
  assert.match(
    queue,
    /const nextQueueTrack = getQueueTrackAtOffset\(1\)/,
  );
  assert.match(
    queue,
    /const queueSourceTrackKeys = queueSourceTracks\.map\(\(entry\) => entry\.key\)/,
  );
});
