import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL(
    "../packages/media-player/src/CompactNowPlayingBar.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("shared compact Now Playing exposes an optional host-owned artwork action", () => {
  assert.match(source, /onArtworkClick\?: \(\) => void/);
  assert.match(source, /artworkActionLabel\?: string/);
  assert.match(source, /shared-now-playing__artwork-action/);
  assert.match(source, /onClick=\{onArtworkClick\}/);
  assert.match(source, /aria-label=\{artworkActionLabel\}/);
  assert.doesNotMatch(source, /navigate\(|window\.location|\/api\//);
});
