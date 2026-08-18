import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const wrapperSource = await readFile(
  new URL(
    "../src/components/MetadataViewer.tsx",
    import.meta.url,
  ),
  "utf8",
);

const sharedSource = await readFile(
  new URL(
    "../../packages/media-player/src/ListenerMetadataViewer.tsx",
    import.meta.url,
  ),
  "utf8",
);

const sharedStyles = await readFile(
  new URL(
    "../../packages/media-player/src/listener-metadata-viewer.css",
    import.meta.url,
  ),
  "utf8",
);
const hostStyles = await readFile(
  new URL(
    "../src/components/metadata-viewer-host.css",
    import.meta.url,
  ),
  "utf8",
);
const appStyles = await readFile(
  new URL("../src/index.css", import.meta.url),
  "utf8",
);

test("Hiplingo metadata viewer delegates to the shared listener presentation", () => {
  assert.match(
    wrapperSource,
    /ListenerMetadataViewer/,
  );

  assert.match(
    wrapperSource,
    /@hiplingo\/media-player/,
  );

  assert.match(
    wrapperSource,
    /@hiplingo\/media-player\/listener-metadata-viewer\.css/,
  );
  assert.match(
    wrapperSource,
    /\.\/metadata-viewer-host\.css/,
  );
  assert.match(
    sharedStyles,
    /\.metadata-viewer__section\s*\{/,
  );
  assert.doesNotMatch(
    hostStyles,
    /\.metadata-viewer__section\s*\{/,
  );
  assert.doesNotMatch(
    appStyles,
    /\.metadata-viewer__section\s*\{/,
  );
  assert.doesNotMatch(
    sharedSource,
    /className="metadata-viewer__eyebrow"/,
    "the shared listener viewer should not render a visible Track metadata eyebrow",
  );
  assert.match(
    sharedSource,
    /aria-label="Track metadata"/,
    "the shared dialog should retain its accessible Track metadata label",
  );
  assert.doesNotMatch(
    sharedStyles,
    /\.metadata-viewer__eyebrow\b/,
    "obsolete eyebrow presentation should not remain in canonical shared CSS",
  );
  assert.doesNotMatch(
    hostStyles,
    /\.metadata-viewer__eyebrow\b/,
    "Hiplingo host CSS should not own shared popup presentation",
  );

  assert.match(
    sharedSource,
    /label: "Overview"/,
  );

  assert.match(
    sharedSource,
    /label: "Credits"/,
  );

  assert.match(
    sharedSource,
    /label: "Track Info"/,
  );

  assert.match(
    sharedSource,
    /label="Songwriting & Composition"/,
  );

  assert.match(
    sharedSource,
    /getReleaseCreditEntries\(releaseCredits\.performers\)/,
  );
  assert.match(
    sharedSource,
    /getReleaseCreditEntries\(releaseCredits\.songwriters\)/,
  );
  assert.match(sharedSource, /role: "Written By"/);
  assert.match(sharedSource, /role: "Words By"/);
});
