import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (relativePath) => readFile(path.join(root, relativePath), "utf8");

test("Listen queue is carousel-only in canonical library order", async () => {
  const queue = await source("src/components/ListenTrackQueue.tsx");
  assert.match(queue, /const queueSourceTracks = playableTracks;/);
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

test("landing hero keeps one RAF parallax loop with more visible desktop travel", async () => {
  const hero = await source("src/components/LandingHeroBanner.tsx");
  assert.match(hero, /DESKTOP_STRENGTH = 0\.24/);
  assert.match(hero, /DESKTOP_TRAVEL_PX = 72/);
  assert.match(hero, /LANDSCAPE_STRENGTH = 0\.24/);
  assert.match(hero, /window\.requestAnimationFrame\(updateParallax\)/);
  assert.doesNotMatch(hero, /setInterval|AnalyserNode/i);
});
