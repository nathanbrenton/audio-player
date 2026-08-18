import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("keeps retired Search and Browse Library UI out of the public app", async () => {
  const [appSource, playerSource, queueSource, css] = await Promise.all([
    readFile(path.join(projectRoot, "src/App.tsx"), "utf8"),
    readFile(path.join(projectRoot, "src/components/AudioPlayer.tsx"), "utf8"),
    readFile(path.join(projectRoot, "src/components/ListenTrackQueue.tsx"), "utf8"),
    readFile(path.join(projectRoot, "src/index.css"), "utf8"),
  ]);

  assert.doesNotMatch(appSource, />Search</);
  assert.doesNotMatch(appSource, /Browse Library|hiplingo-site-browse/);
  assert.doesNotMatch(appSource, /onSearchLibrary|onBrowseLibrary|requestOpenLibrary/);

  assert.doesNotMatch(playerSource, /openSearch|openLibrary|libraryOpenMode/);
  assert.doesNotMatch(playerSource, /library-sheet__|LibraryBrowser/);

  assert.doesNotMatch(queueSource, /focusSearch|searchValue|type="search"/);
  assert.doesNotMatch(queueSource, /library-browser__|library-workspace__/);

  assert.doesNotMatch(css, /hiplingo-site-nav__search|hiplingo-site-browse/);
  assert.doesNotMatch(css, /\.library-/);
});
