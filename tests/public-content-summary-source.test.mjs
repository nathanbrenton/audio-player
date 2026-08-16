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
  return readFile(
    path.join(root, relativePath),
    "utf8",
  );
}

test("public Artist detail reads authored bio from artist.json", async () => {
  const model = await source("src/lib/publicArtists.ts");
  const detail = await source("src/components/ArtistDetail.tsx");

  assert.match(model, /bio:\s*stringValue\(raw\.bio\)/);
  assert.match(detail, /artist\.bio/);
  assert.match(detail, /Artist bio/);
});

test("public Release detail reads authored release.description", async () => {
  const catalog = await source("src/lib/mediaCatalog.ts");
  const detail = await source("src/components/ReleaseDetail.tsx");

  assert.match(catalog, /getReleaseDescription/);
  assert.match(catalog, /resolved\.release\?\.description/);
  assert.match(detail, /getReleaseDescription\(release\)/);
  assert.match(detail, /Release notes/);
});

test("Journal is removed and Licensing is the public rights entry point", async () => {
  const app = await source("src/App.tsx");
  const readme = await source("README.md");

  assert.doesNotMatch(app, /["']\/journal["']/);
  assert.doesNotMatch(readme, /\/journal/);
  assert.doesNotMatch(app, />\s*Journal\s*</);
  assert.doesNotMatch(app, /route="\/jam"/);
  assert.match(app, /route="\/licensing"/);
  assert.match(app, /route="\/licensing\/inquiry"/);
  assert.match(app, /route="\/licensing\/jam"/);
  assert.match(app, /title="General licensing inquiry"/);
  assert.match(app, /title="Jam participant agreement"/);
});

test("compact site player has one canonical visual layout", async () => {
  const css = await source("src/index.css");

  assert.match(css, /Hiplingo compact player canonical layout/);
  assert.doesNotMatch(css, /Hiplingo PT5 compact dock v2/);
  assert.doesNotMatch(css, /compact dock polish/);
  assert.match(css, /width:\s*min\(960px, calc\(100vw - 32px\)\)/);
  assert.match(css, /hiplingo-compact-player__transport[\s\S]*?display:\s*grid !important/);
  assert.match(css, /grid-template-columns:\s*40px 46px 40px/);
  assert.match(css, /width:\s*max-content !important/);
  assert.match(css, /justify-self:\s*end !important/);
  assert.match(css, /hiplingo-compact-player__transport button \{[\s\S]*?position:\s*relative !important/);
  assert.match(css, /hiplingo-compact-player__transport[\s\S]*?artwork-stack__transport-icon \{[\s\S]*?position:\s*static !important/);
  assert.match(css, /artwork-stack__transport-icon::before \{[\s\S]*?content:\s*none !important/);
  assert.match(css, /transform:\s*none !important/);
  assert.match(css, /> button:nth-child\(3\)/);
  assert.match(css, /padding-bottom:[\s\S]*?122px/);
});
