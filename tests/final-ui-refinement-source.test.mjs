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
  return readFile(path.join(root, relativePath), "utf8");
}

test("Artist detail simplifies track count and About copy", async () => {
  const detail = await source(
    "src/components/ArtistDetail.tsx",
  );

  assert.match(
    detail,
    /artist\.playableTrackCount\}\{" "\}[\s\S]*?\? "track"[\s\S]*?: "tracks"/,
  );
  assert.doesNotMatch(detail, /playable\{" "\}/);
  assert.doesNotMatch(detail, /Artist bio/);
  assert.match(
    detail,
    /className="hiplingo-artist-detail__identity-card"/,
  );
  assert.match(
    detail,
    /className="hiplingo-public-summary hiplingo-artist-bio"[\s\S]*?hiplingo-kicker">About/,
  );
});

test("landing call to action says Start Listening", async () => {
  const app = await source("src/App.tsx");

  assert.match(
    app,
    /route="\/listen"[\s\S]*?>\s*Start Listening\s*<\/SiteLink>/,
  );
  assert.doesNotMatch(
    app,
    />\s*Open full player\s*<\/SiteLink>/,
  );
});

test("long Listen titles receive conditional extra runway", async () => {
  const [queue, css] = await Promise.all([
    source("src/components/ListenTrackQueue.tsx"),
    source("src/index.css"),
  ]);

  assert.match(
    queue,
    /currentQueueTrack\.track\.title\.trim\(\)\.length >= 28/,
  );
  assert.match(
    queue,
    /data-long-current-title=\{[\s\S]*?currentTitleNeedsExtraSpace/,
  );
  assert.match(
    css,
    /\.listen-track-queue__titles\[data-long-current-title="true"\][\s\S]*?height:\s*292px;/,
  );
  assert.match(
    css,
    /listen-track-queue\[data-long-current-title="true"\][\s\S]*?grid-template-rows:\s*244px 48px;/,
  );
});

test("compact footer ignores the second rapid play-pause activation", async () => {
  const player = await source(
    "src/components/AudioPlayer.tsx",
  );

  assert.match(player, /const COMPACT_TOGGLE_GUARD_MS = 360;/);
  assert.match(
    player,
    /const compactToggleGuardUntilRef = useRef\(0\);/,
  );
  assert.match(
    player,
    /function toggleCompactPlayback\(\)[\s\S]*?window\.performance\.now\(\)[\s\S]*?now < compactToggleGuardUntilRef\.current[\s\S]*?now \+ COMPACT_TOGGLE_GUARD_MS[\s\S]*?void togglePlayback\(\);/,
  );
  assert.match(
    player,
    /<CompactNowPlayingBar[\s\S]*?toggle:\s*toggleCompactPlayback,/,
  );
});

test("Artist text cards are translucent purple and hero elements keep depth", async () => {
  const css = await source("src/index.css");

  const start = css.indexOf(
    "Final UI refinement: Artist cards, long titles, waveform depth",
  );
  assert.notEqual(start, -1);

  const contract = css.slice(start);

  assert.match(
    contract,
    /\.hiplingo-artist-detail__identity-card,[\s\S]*?\.hiplingo-artist-bio[\s\S]*?rgba\(29, 24, 41, 0\.86\)/,
  );
  assert.match(
    contract,
    /\.listen-waveform-anchor[\s\S]*?\.waveform-panel[\s\S]*?0 22px 30px -18px rgba\(0, 0, 0, 0\.72\)/,
  );
  assert.match(
    contract,
    /\.hiplingo-home \.hiplingo-hero__identity\s*\{[\s\S]*?z-index:\s*4;/,
  );
  assert.match(
    contract,
    /\.hiplingo-home \.hiplingo-hero__logo\s*\{[\s\S]*?z-index:\s*5;/,
  );
});
