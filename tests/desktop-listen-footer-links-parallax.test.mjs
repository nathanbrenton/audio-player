import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (relativePath) => readFile(path.join(root, relativePath), "utf8");

test("Listen queue is carousel-only in active playback order", async () => {
  const queue = await source("src/components/ListenTrackQueue.tsx");
  assert.match(
    queue,
    /queueTrackKeys\.flatMap\([\s\S]*?orderedQueue\.length > 0[\s\S]*?orderedQueue/,
  );
  assert.doesNotMatch(queue, /listen-track-queue__filters|listen-track-queue__shuffle/);
  assert.doesNotMatch(queue, /artistFilter|releaseFilter|sortMode|onShuffleTracks/);
});

test("footer Artist and Release context are navigable on all display modes", async () => {
  const [app, player] = await Promise.all([
    source("src/App.tsx"),
    source("src/components/AudioPlayer.tsx"),
  ]);
  assert.match(player, /onOpenArtist\?: \(artistName: string\) => void/);
  assert.match(player, /const artistName = selectedTrack\.artist;[\s\S]*?if \(artistName\) \{[\s\S]*?onOpenArtist\(artistName\);/);
  assert.match(player, /onOpenRelease\(selectedTrack\.release\.id\)/);
  assert.match(player, /\{selectedTrack\.artist\}/);
  assert.match(player, /\{selectedTrack\.release\.title\}/);
  assert.match(app, /onOpenArtist=\{\(artistName\) => \{[\s\S]*?getArtistSlug\(artistName\)/);
});

test("landing hero keeps one RAF parallax loop with 50-percent faster travel", async () => {
  const hero = await source("src/components/LandingHeroBanner.tsx");
  assert.match(hero, /DESKTOP_STRENGTH = 0\.36/);
  assert.match(hero, /DESKTOP_TRAVEL_PX = 108/);
  assert.match(hero, /LANDSCAPE_STRENGTH = 0\.36/);
  assert.match(hero, /LANDSCAPE_TRAVEL_PX = 138/);
  assert.match(hero, /window\.requestAnimationFrame\(updateParallax\)/);
  assert.doesNotMatch(hero, /setInterval|AnalyserNode/i);
});
