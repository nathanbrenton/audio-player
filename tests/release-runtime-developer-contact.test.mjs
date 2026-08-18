import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("release detail moves transport left and renders published track runtimes at right", async () => {
  const source = await readFile(
    path.join(root, "src/components/ReleaseDetail.tsx"),
    "utf8",
  );

  assert.match(
    source,
    /className="hiplingo-release-track__action"[\s\S]*?className="hiplingo-release-track__number"[\s\S]*?className="hiplingo-release-track__title"[\s\S]*?className="hiplingo-release-track__runtime"/,
  );
  assert.match(
    source,
    /formatPublicRuntime\(\s*trackDurationSecondsById\[track\.id\],?\s*\)/,
  );
  assert.match(
    source,
    /releaseRuntime[\s\S]*?release\.trackCount[\s\S]*?releaseRuntime/,
  );
});

test("release runtime is derived from published HLS manifests only", async () => {
  const source = await readFile(
    path.join(root, "src/lib/mediaCatalog.ts"),
    "utf8",
  );

  assert.match(
    source,
    /export async function fetchPublishedTrackDurationSeconds/,
  );
  assert.match(source, /#EXTINF:/);
  assert.match(
    source,
    /getTrackPlaybackProtocol\(track\) !== "hls"/,
  );
  assert.match(
    source,
    /getTrackPlaybackPath\(track\)/,
  );
  assert.match(
    source,
    /fetch\(playlistUrl,[\s\S]*?signal/,
  );
});

test("runtime formatting supports minutes and hours", async () => {
  const source = await readFile(
    path.join(root, "src/lib/mediaCatalog.ts"),
    "utf8",
  );

  assert.match(
    source,
    /export function formatPublicRuntime/,
  );
  assert.match(source, /hours > 0/);
  assert.match(
    source,
    /String\(seconds\)\.padStart\(2, "0"\)/,
  );
});

test("player settings exposes developer identity and personal site without restoring a business email row", async () => {
  const source = await readFile(
    path.join(root, "src/components/AudioPlayer.tsx"),
    "utf8",
  );

  assert.match(
    source,
    /className="app-menu__developer-contact"[\s\S]*?https:\/\/nathanbrenton\.com\/[\s\S]*?Nathan Brenton[\s\S]*?nathanbrenton\.com/,
  );
  assert.doesNotMatch(
    source,
    /className="app-menu__contact-row"/,
  );
  assert.doesNotMatch(
    source,
    /className="app-menu__contact-action"/,
  );
});

test("release runtime and developer card receive responsive layout styling", async () => {
  const css = await readFile(
    path.join(root, "src/index.css"),
    "utf8",
  );

  const start = css.indexOf(
    "Release runtime + left transport + developer contact",
  );
  assert.notEqual(start, -1);

  const contract = css.slice(start);

  assert.match(
    contract,
    /\.hiplingo-release-track\s*\{[\s\S]*?grid-template-columns:\s*36px 30px minmax\(0, 1fr\) auto;/,
  );
  assert.match(
    contract,
    /\.hiplingo-release-track__action\s*\{[\s\S]*?grid-column:\s*1;/,
  );
  assert.match(
    contract,
    /\.hiplingo-release-track__runtime\s*\{[\s\S]*?font-variant-numeric:\s*tabular-nums;/,
  );
  assert.match(
    contract,
    /\.app-menu__developer-contact\s*\{[\s\S]*?display:\s*flex;/,
  );
});
