import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");

async function source(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

test("Artists is backed by the published catalog instead of a placeholder", async () => {
  const appSource = await source("src/App.tsx");
  const artistCatalogSource = await source("src/components/ArtistCatalog.tsx");
  const artistModelSource = await source("src/lib/publicArtists.ts");

  assert.match(appSource, /import ArtistCatalog from "\.\/components\/ArtistCatalog";/);
  assert.match(appSource, /case "\/artists":[\s\S]*?<ArtistCatalog/);
  assert.doesNotMatch(
    appSource,
    /case "\/artists":[\s\S]*?<PlaceholderPage eyebrow="Roster" title="Artists">/,
  );

  assert.match(artistCatalogSource, /buildPublicArtists/);
  assert.match(artistModelSource, /catalog\.releases/);
  assert.match(artistModelSource, /getReleaseArtist/);
  assert.doesNotMatch(artistCatalogSource, /media-library/);
  assert.doesNotMatch(artistCatalogSource, /metadata-editor/);
});

test("artist detail routes are derived from public artist identity", async () => {
  const appSource = await source("src/App.tsx");
  const detailSource = await source("src/components/ArtistDetail.tsx");
  const artistModelSource = await source("src/lib/publicArtists.ts");

  assert.match(appSource, /route\.match\(\/\^\\\/artists/);
  assert.match(appSource, /<ArtistDetail/);
  assert.match(appSource, /getArtistSlug/);
  assert.match(detailSource, /findPublicArtist/);
  assert.match(detailSource, /artist\.releases\.map/);
  assert.match(artistModelSource, /findPublicArtist/);
});

test("release pages navigate back to their public artist page", async () => {
  const appSource = await source("src/App.tsx");
  const releaseSource = await source("src/components/ReleaseDetail.tsx");

  assert.match(releaseSource, /onOpenArtist: \(artistName: string\) => void/);
  assert.match(releaseSource, /onClick=\{\(\) => onOpenArtist\(artist\)\}/);
  assert.match(appSource, /onOpenArtist=\{\(artistName\) =>/);
  assert.match(appSource, /`\/artists\/\$\{encodeURIComponent\(getArtistSlug\(artistName\)\)\}`/);
});
