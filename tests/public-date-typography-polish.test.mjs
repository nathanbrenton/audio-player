import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("public date formatter expands strict ISO calendar dates without touching year ranges", async () => {
  const source = await readFile(
    path.join(root, "src/lib/mediaCatalog.ts"),
    "utf8",
  );

  assert.match(
    source,
    /export function formatPublicDate\([\s\S]*?\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$/,
  );
  assert.match(
    source,
    /month:\s*"long"[\s\S]*?day:\s*"numeric"[\s\S]*?year:\s*"numeric"/,
  );
  assert.match(source, /timeZone:\s*"UTC"/);
  assert.match(source, /return value;/);
});

test("all release-date display surfaces use the public formatter", async () => {
  const files = [
    "src/components/ReleaseCatalog.tsx",
    "src/components/ReleaseDetail.tsx",
    "src/components/ArtistDetail.tsx",
  ];

  for (const relativePath of files) {
    const source = await readFile(
      path.join(root, relativePath),
      "utf8",
    );

    assert.match(
      source,
      /formatPublicDate\(\s*getReleaseDate\(release\),?\s*\)/,
      `${relativePath} should format release dates for display`,
    );
  }
});

test("catalog and artist roster kicker labels are removed while Artist year ranges remain", async () => {
  const [releases, artists] = await Promise.all([
    readFile(
      path.join(root, "src/components/ReleaseCatalog.tsx"),
      "utf8",
    ),
    readFile(
      path.join(root, "src/components/ArtistCatalog.tsx"),
      "utf8",
    ),
  ]);

  assert.doesNotMatch(
    releases,
    /<span className="hiplingo-kicker">Catalog<\/span>/i,
  );
  assert.doesNotMatch(
    artists,
    /<span className="hiplingo-kicker">\s*Roster\s*<\/span>/i,
  );
  assert.match(artists, /getArtistYearRange/);
  assert.match(artists, /`\s*· \$\{yearRange\}`/);
});

test("small public metadata uses the baby-blue accent consistently", async () => {
  const css = await readFile(
    path.join(root, "src/index.css"),
    "utf8",
  );

  const start = css.indexOf(
    "Public small-text + date + hero-gradient polish",
  );
  assert.notEqual(start, -1);

  const contract = css.slice(start);

  assert.match(
    contract,
    /--hiplingo-small-accent:\s*#a9d8ed;/,
  );
  assert.match(
    contract,
    /\.hiplingo-release-card__copy > span,/,
  );
  assert.match(
    contract,
    /\.hiplingo-release-detail__meta,/,
  );
  assert.match(
    contract,
    /\.hiplingo-artist-card__copy span,/,
  );
  assert.match(
    contract,
    /color:\s*var\(--hiplingo-small-accent\) !important;/,
  );
});

test("full-bleed landing hero has a visible bottom gradient fade", async () => {
  const css = await readFile(
    path.join(root, "src/index.css"),
    "utf8",
  );

  const start = css.indexOf(
    "Public small-text + date + hero-gradient polish",
  );
  const contract = css.slice(start);

  assert.match(
    contract,
    /\.hiplingo-home \.hiplingo-hero__banner::after\s*\{[\s\S]*?height:\s*48%;[\s\S]*?linear-gradient\([\s\S]*?transparent[\s\S]*?var\(--hiplingo-surface-1\)/,
  );
});
