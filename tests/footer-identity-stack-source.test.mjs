import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function source(relativePath) {
  return readFile(
    path.resolve(projectRoot, relativePath),
    "utf8",
  );
}

test("shared CompactNowPlayingBar owns one tight intrinsic identity stack", async () => {
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
    sharedCss,
    /\.shared-now-playing__title\s*\{[\s\S]*?line-height:\s*1\.08;/,
  );
  assert.match(
    sharedCss,
    /\.shared-now-playing__context\s*\{[\s\S]*?line-height:\s*1\.05;/,
  );
  assert.match(
    sharedCss,
    /\.shared-now-playing__detail\s*\{[\s\S]*?line-height:\s*1\.05;/,
  );

  assert.doesNotMatch(
    hostCss,
    /Library-wide Listen Shuffle \+ compact footer identity/,
  );
  assert.doesNotMatch(
    hostCss,
    /Footer identity stack hardening/,
  );

  // Hiplingo keeps only its linked-context skin/navigation styling.
  assert.match(
    hostCss,
    /\.hiplingo-now-playing-dock__context-links\s*\{[\s\S]*?display:\s*inline-flex;/,
  );
});
