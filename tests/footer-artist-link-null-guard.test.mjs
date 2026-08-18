import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("footer Artist navigation safely narrows nullable Artist metadata", async () => {
  const player = await readFile(
    path.join(root, "src/components/AudioPlayer.tsx"),
    "utf8",
  );

  assert.match(
    player,
    /onOpenArtist && selectedTrack\.artist \? \([\s\S]*?const artistName = selectedTrack\.artist;[\s\S]*?if \(artistName\) \{[\s\S]*?onOpenArtist\(artistName\);/,
  );

  assert.doesNotMatch(
    player,
    /onOpenArtist\(selectedTrack\.artist\);/,
  );

  assert.match(
    player,
    /onOpenRelease\(selectedTrack\.release\.id\);/,
  );
});
