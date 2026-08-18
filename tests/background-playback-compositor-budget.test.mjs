import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("keeps the lens stack mounted while reducing desktop playback compositor work", async () => {
  const [backgroundSource, css] = await Promise.all([
    readFile(
      path.join(
        projectRoot,
        "src/components/AudioReactiveListenBackground.tsx",
      ),
      "utf8",
    ),
    readFile(path.join(projectRoot, "src/index.css"), "utf8"),
  ]);

  assert.match(
    backgroundSource,
    /data-playback-active=\{isPlaying \? "true" : "false"\}/,
  );
  assert.match(backgroundSource, /ACTIVE_BACKGROUND_FPS = 12/);

  const playbackBudget = css.slice(
    css.indexOf("Desktop playback compositor budget"),
  );

  assert.match(playbackBudget, /@media \(min-width: 900px\)/);
  assert.match(playbackBudget, /data-playback-active="true"/);
  assert.match(playbackBudget, /listen-reactive-background__clusters/);
  assert.match(playbackBudget, /display:\s*none/);

  // Playback-state changes must never remove any lens surface. The slow
  // motion/zoom followers own continuity across Play/Pause/Next/Previous.
  for (const lensClass of [
    "listen-reactive-background__lens-mask",
    "listen-reactive-background__secondary-lens-mask",
    "listen-reactive-background__tertiary-lens-mask",
    "listen-reactive-background__macro-lens-mask",
    "listen-reactive-background__macro-secondary-lens-mask",
  ]) {
    assert.doesNotMatch(playbackBudget, new RegExp(lensClass));
  }
});
