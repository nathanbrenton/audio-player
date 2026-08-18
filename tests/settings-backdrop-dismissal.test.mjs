import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("settings backdrop consumes dismissal gestures before the player underneath can receive them", async () => {
  const source = await readFile(
    path.join(projectRoot, "src/components/AudioPlayer.tsx"),
    "utf8",
  );

  assert.match(
    source,
    /className="app-menu__backdrop audio-player__settings-backdrop"[\s\S]*?onPointerDown=\{\(event\) => \{[\s\S]*?event\.target !== event\.currentTarget[\s\S]*?event\.stopPropagation\(\);[\s\S]*?onClick=\{\(event\) => \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?event\.stopPropagation\(\);[\s\S]*?setIsAppMenuOpen\(false\);/,
  );
});
