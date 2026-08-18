import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(
  fileURLToPath(import.meta.url),
);
const projectRoot = path.resolve(
  testDirectory,
  "..",
);

async function source(
  relativePath,
) {
  return readFile(
    path.join(
      projectRoot,
      relativePath,
    ),
    "utf8",
  );
}

test(
  "Artists consumes the first-class published Artist snapshot",
  async () => {
    const appSource =
      await source("src/App.tsx");
    const catalogSource =
      await source(
        "src/components/ArtistCatalog.tsx",
      );
    const modelSource =
      await source(
        "src/lib/publicArtists.ts",
      );

    assert.match(
      appSource,
      /import ArtistCatalog from "\.\/components\/ArtistCatalog";/,
    );
    assert.match(
      appSource,
      /case "\/artists":[\s\S]*?<ArtistCatalog/,
    );

    assert.match(
      catalogSource,
      /fetchPublicArtists/,
    );
    assert.match(
      catalogSource,
      /artist\.primaryPhotoPath/,
    );
    assert.doesNotMatch(
      catalogSource,
      /getReleaseArtworkPath/,
    );

    assert.match(
      modelSource,
      /"artists\.json"/,
    );
    assert.match(
      modelSource,
      /getReleaseArtistId\(release\)\s*===\s*artistId/,
    );
    assert.doesNotMatch(
      modelSource,
      /const grouped = new Map/,
    );
    assert.doesNotMatch(
      modelSource,
      /getReleaseArtist\(release\)/,
    );
  },
);

test(
  "Artist detail loads authored Artist JSON and Artist imagery",
  async () => {
    const detailSource =
      await source(
        "src/components/ArtistDetail.tsx",
      );
    const modelSource =
      await source(
        "src/lib/publicArtists.ts",
      );

    assert.match(
      detailSource,
      /fetchPublicArtist/,
    );
    assert.match(
      detailSource,
      /artist\.primaryPhotoPath/,
    );
    assert.match(
      detailSource,
      /artist\.releases\.map/,
    );
    assert.doesNotMatch(
      detailSource,
      /Published releases/,
    );
    assert.match(
      detailSource,
      /id="artist-discography-heading"[\s\S]*?className="hiplingo-kicker"[\s\S]*?>\s*Discography\s*</,
    );

    assert.match(
      modelSource,
      /entry\.href/,
    );
    assert.match(
      modelSource,
      /raw\.primaryPhoto/,
    );
    assert.match(
      modelSource,
      /raw\.photos/,
    );
  },
);

test(
  "release pages still navigate into the public Artist route",
  async () => {
    const appSource =
      await source("src/App.tsx");
    const releaseSource =
      await source(
        "src/components/ReleaseDetail.tsx",
      );

    assert.match(
      releaseSource,
      /onOpenArtist: \(artistName: string\) => void/,
    );
    assert.match(
      releaseSource,
      /onClick=\{\(\) => onOpenArtist\(artist\)\}/,
    );
    assert.match(
      appSource,
      /getArtistSlug\(artistName\)/,
    );
  },
);
