import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("mobile landscape hero parallax uses the faster bounded travel tuning", async () => {
  for (const candidate of [
    "src/components/LandingHeroBanner.tsx",
    "src/App.tsx",
  ]) {
    try {
      const value = await source(candidate);
      if (value.includes("LANDSCAPE_STRENGTH")) {
        assert.match(value, /LANDSCAPE_STRENGTH\s*=\s*0\.36\s*;/);
        assert.match(value, /LANDSCAPE_TRAVEL_PX\s*=\s*138\s*;/);
        assert.match(
          value,
          /window\.requestAnimationFrame\(updateParallax\)/,
        );
        return;
      }
    } catch {}
  }
  assert.fail("LANDSCAPE_STRENGTH source not found");
});

test("compact footer keeps Listen navigation while full Listen owns footer Shuffle", async () => {
  const player = await source("src/components/AudioPlayer.tsx");

  assert.match(
    player,
    /displayMode === "full" \? \([\s\S]*?hiplingo-now-playing-dock__shuffle-button[\s\S]*?\) : \([\s\S]*?hiplingo-now-playing-dock__listen-button/,
  );
  assert.match(player, /aria-label="Open Listen"/);
  assert.match(player, /onOpenFullPlayer\?\.\(\)/);
  assert.match(player, /className="hiplingo-now-playing-dock__metadata-button"/);

  assert.match(player, /shufflePlaybackTrackKeys/);
  assert.doesNotMatch(player, /onShuffleTracks=\{shuffleQueueTracks\}/);
});

test("Artist detail keeps only the Discography kicker", async () => {
  const artist = await source("src/components/ArtistDetail.tsx");
  assert.doesNotMatch(artist, /Published releases/);
  assert.match(
    artist,
    /id="artist-discography-heading"[\s\S]*?className="hiplingo-kicker"[\s\S]*?>\s*Discography\s*<\/span>/,
  );
});

test("Artist information cards are neutral and highly translucent", async () => {
  const css = await source("src/index.css");
  const start = css.indexOf("Mobile / Artist / compact-footer polish v2");
  assert.notEqual(start, -1);
  const contract = css.slice(start);

  assert.match(contract, /background:\s*rgba\(8,\s*9,\s*11,\s*0\.34\) !important;/);
  assert.match(contract, /background-image:\s*none !important;/);
});
