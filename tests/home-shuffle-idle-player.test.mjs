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

test("idle player stays unselected and uses Hiplingo brand artwork", async () => {
  const [player, queue] = await Promise.all([
    source("src/components/AudioPlayer.tsx"),
    source("src/components/ListenTrackQueue.tsx"),
  ]);

  assert.match(
    player,
    /import \{ hiplingoLogoUrl \} from "@hiplingo\/brand";/,
  );
  assert.match(
    player,
    /const \[selectedTrackKey, setSelectedTrackKey\][\s\S]*?useState\(""\)/,
  );
  assert.doesNotMatch(
    player,
    /const firstTrackKey = playableTracks\[0\]\.key/,
  );
  assert.match(
    player,
    /className="artwork-stack__idle-logo"[\s\S]*?src=\{hiplingoLogoUrl\}/,
  );
  assert.match(
    player,
    /title=\{selectedTrack\?\.title \?\? ""\}/,
  );
  assert.match(
    queue,
    /playableTracks\.length === 0 \|\|[\s\S]*?!selectedTrackKey[\s\S]*?return null;/,
  );
});

test("homepage Shuffle uses the player library shuffle then opens Listen", async () => {
  const [app, player] = await Promise.all([
    source("src/App.tsx"),
    source("src/components/AudioPlayer.tsx"),
  ]);

  assert.match(
    player,
    /export type AudioPlayerHandle = \{[\s\S]*?shuffleLibrary: \(\) => void;/,
  );
  assert.match(
    player,
    /useImperativeHandle\(ref,[\s\S]*?shuffleLibrary: shuffleActiveQueue/,
  );
  assert.match(
    app,
    /function requestShuffleListen\(\) \{[\s\S]*?shuffleLibrary\(\);[\s\S]*?navigateTo\("\/listen"\);/,
  );
  assert.match(
    app,
    /onClick=\{onShuffleListen\}[\s\S]*?aria-label="Shuffle the Hiplingo library and open Listen"[\s\S]*?<span>Start listening<\/span>/
  );
});
