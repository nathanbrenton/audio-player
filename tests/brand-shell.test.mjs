import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");

const brandAssets = [
  "public/brand/hiplingo-logo-white.webp",
  "public/brand/hiplingo-banner-mobile.webp",
  "public/brand/hiplingo-banner-desktop.webp",
];

test("ships responsive Hiplingo brand assets with the public app", async () => {
  for (const relativePath of brandAssets) {
    await access(path.join(projectRoot, relativePath));
  }

  const css = await readFile(path.join(projectRoot, "src/index.css"), "utf8");
  assert.match(css, /hiplingo-banner-mobile\.webp/);
  assert.match(css, /hiplingo-banner-desktop\.webp/);
});

test("uses the current Hiplingo mark throughout the shell and player", async () => {
  const app = await readFile(path.join(projectRoot, "src/App.tsx"), "utf8");
  const player = await readFile(
    path.join(projectRoot, "src/components/AudioPlayer.tsx"),
    "utf8",
  );

  assert.match(app, /\/brand\/hiplingo-logo-white\.webp/);
  assert.match(player, /\/brand\/hiplingo-logo-white\.webp/);
  assert.doesNotMatch(player, /hl-logo-graphite\.svg/);
});

test("homepage latest release can start the persistent queue in place", async () => {
  const app = await readFile(path.join(projectRoot, "src/App.tsx"), "utf8");

  assert.match(app, /const latestRelease = catalog\?\.releases\[0\]/);
  assert.match(app, /function FeaturedRelease/);
  assert.match(app, /onPlayQueue\(/);
  assert.match(app, />\s*▶ Play release\s*</);
});
