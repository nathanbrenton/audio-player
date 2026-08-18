import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function readSource(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

test("presents the public settings panel in Hiplingo purple without a direct contact action", async () => {
  const playerSource = await readSource("src/components/AudioPlayer.tsx");
  const css = await readSource("src/index.css");

  assert.match(
    playerSource,
    /className="app-menu__about-contact-card"[\s\S]*?<strong>About this player<\/strong>[\s\S]*?Audio Player version \{APP_VERSION\}/,
  );
  assert.doesNotMatch(playerSource, /className="app-menu__contact-row"/);
  assert.doesNotMatch(playerSource, /className="app-menu__contact-action"/);
  assert.match(
    css,
    /--hiplingo-surface-control:\s*rgba\(33, 27, 46, 0\.92\);[\s\S]*?--hiplingo-border-active:\s*rgba\(169, 140, 255, 0\.52\);/,
  );
  assert.match(
    css,
    /Hiplingo 1\.0 public settings theme[\s\S]*?\.audio-player__settings-panel\s*\{[\s\S]*?var\(--hiplingo-surface-3\)[\s\S]*?var\(--hiplingo-canvas\)/,
  );
  assert.match(
    css,
    /\.app-menu__about-contact-card\s*\{[\s\S]*?rgba\(219, 200, 255, 0\.2\)[\s\S]*?border-radius:\s*8px;/,
  );
  assert.doesNotMatch(css, /\.app-menu__contact-row\s*\{/);
  assert.doesNotMatch(css, /\.app-menu__contact-action\s*\{/);
});

test("gates Audiophile Mode behind active Developer Mode and clears it when developer mode turns off", async () => {
  const playerSource = await readSource("src/components/AudioPlayer.tsx");

  const developerGate = playerSource.match(
    /\{isDeveloperControlVisible \? \([\s\S]*?\{isDeveloperMode \? \([\s\S]*?<strong>Audiophile Mode<\/strong>[\s\S]*?Listen Background[\s\S]*?\) : null\}[\s\S]*?\) : null\}/,
  );

  assert.ok(developerGate, "Audiophile Mode and Listen Background should be inside the active Developer Mode gate");
  assert.match(
    playerSource,
    /const isEnabled = event\.currentTarget\.checked;[\s\S]*?setIsDeveloperMode\(isEnabled\);[\s\S]*?if \(!isEnabled\) \{[\s\S]*?setIsAudiophileMode\(false\);/,
  );
  assert.match(
    playerSource,
    /if \(!nextVisible\) \{[\s\S]*?setIsDeveloperMode\(false\);[\s\S]*?setIsAudiophileMode\(false\);/,
  );
});

test("keeps the hidden developer hold at four seconds and derives displayed release version from package.json", async () => {
  const playerSource = await readSource("src/components/AudioPlayer.tsx");
  const packageJson = JSON.parse(await readSource("package.json"));

  assert.match(playerSource, /const DEVELOPER_CONTROL_HOLD_MS = 4000;/);
  assert.match(playerSource, /import packageJsonSource from "\.\.\/\.\.\/package\.json\?raw";/);
  assert.match(playerSource, /Audio Player version \{APP_VERSION\}/);
  assert.equal(packageJson.version, "1.0.0");
});
