import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");

const brandAssets = [
  "../packages/brand/src/hiplingo-logo.png",
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

test("uses one branded Hiplingo header without a duplicate player header", async () => {
  const app = await readFile(path.join(projectRoot, "src/App.tsx"), "utf8");
  const player = await readFile(
    path.join(projectRoot, "src/components/AudioPlayer.tsx"),
    "utf8",
  );

  assert.match(app, /import \{ hiplingoLogoUrl \} from "@hiplingo\/brand"/);
  assert.doesNotMatch(player, /<header className="audio-player__header">/);
  assert.doesNotMatch(player, /hl-logo-graphite\.svg/);
});

test("homepage promotes Start listening via library Shuffle instead of a latest release", async () => {
  const app = await readFile(path.join(projectRoot, "src/App.tsx"), "utf8");

  assert.match(app, /className="hiplingo-home-shuffle__button"/);
  assert.match(app, />\s*Start listening\s*<\/span>/);
  assert.match(
    app,
    /function requestShuffleListen\(\)[\s\S]*?shuffleLibrary\(\)[\s\S]*?navigateTo\("\/listen"\)/,
  );
  assert.doesNotMatch(app, /function FeaturedRelease/);
  assert.doesNotMatch(app, /Latest release|Loading the latest release/);
  assert.doesNotMatch(app, /catalog\?\.releases\[0\]/);
});

test("uses public contact aliases without exposing a personal Gmail address", async () => {
  const app = await readFile(path.join(projectRoot, "src/App.tsx"), "utf8");
  const player = await readFile(
    path.join(projectRoot, "src/components/AudioPlayer.tsx"),
    "utf8",
  );
  const siteConfig = await readFile(
    path.join(projectRoot, "src/siteConfig.ts"),
    "utf8",
  );

  assert.match(siteConfig, /info@hiplingo\.com/);
  assert.match(app, /HIPLINGO_CONTACT_MAILTO/);
  assert.match(app, />Contact</);
  assert.match(player, /HIPLINGO_CONTACT_MAILTO/);
  assert.doesNotMatch(
    `${app}\n${player}\n${siteConfig}`,
    /nbrenton@gmail\.com/,
  );
});
