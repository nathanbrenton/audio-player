import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("normal site routes use one low-budget resting ambient background", async () => {
  const [app, source] = await Promise.all([
    readFile(
      path.join(projectRoot, "src/App.tsx"),
      "utf8",
    ),
    readFile(
      path.join(
        projectRoot,
        "src/components/SiteAmbientBackground.tsx",
      ),
      "utf8",
    ),
  ]);

  assert.match(
    app,
    /import SiteAmbientBackground from "\.\/components\/SiteAmbientBackground";/,
  );
  assert.match(
    app,
    /route\.section !== "\/listen"\s*\?\s*<SiteAmbientBackground\s*\/>/,
  );

  assert.match(source, /AMBIENT_BACKGROUND_FPS = 12/);
  assert.match(source, /AMBIENT_ORBIT_SECONDS = 36/);
  assert.match(source, /RESTING_MOTION_RATE = 0\.35/);
  assert.match(source, /Math\.cos\(orbitRadians\) \* 2\.1/);
  assert.match(source, /Math\.sin\(orbitRadians\) \* 1\.45/);
  assert.match(
    source,
    /frameTime - previousPaintTime >=\s*AMBIENT_FRAME_INTERVAL_MS/,
  );
  assert.match(
    source,
    /document\.visibilityState !== "hidden"/,
  );
  assert.match(
    source,
    /\(prefers-reduced-motion: reduce\)/,
  );

  assert.doesNotMatch(source, /AnalyserNode/);
  assert.doesNotMatch(source, /waveform|peaks|cluster|lens/i);
});

test("responsive ambient background reuses all three Listen background assets", async () => {
  const css = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );

  assert.match(
    css,
    /\.hiplingo-site-ambient-background__field\s*\{[\s\S]*?hiplingo-listen-background-desktop\.webp/,
  );
  assert.match(
    css,
    /@media \(max-width: 899px\) and \(orientation: landscape\)[\s\S]*?\.hiplingo-site-ambient-background__field\s*\{[\s\S]*?hiplingo-listen-background-mobile-landscape\.webp/,
  );
  assert.match(
    css,
    /@media \(max-width: 899px\) and \(orientation: portrait\)[\s\S]*?\.hiplingo-site-ambient-background__field\s*\{[\s\S]*?hiplingo-listen-background-mobile-portrait\.webp/,
  );
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.hiplingo-site-ambient-background__field\s*\{[\s\S]*?transform:\s*none !important;[\s\S]*?will-change:\s*auto;/,
  );
});

test("public header is semi-transparent without continuous backdrop blur", async () => {
  const css = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );

  const contractStart = css.indexOf(
    "Site-wide ambient background + translucent header",
  );
  assert.notEqual(contractStart, -1);

  const contract = css.slice(contractStart);

  assert.match(
    contract,
    /\.hiplingo-site-header\s*\{[\s\S]*?rgba\(9, 8, 16, 0\.68\)[\s\S]*?backdrop-filter:\s*none;/,
  );
  assert.match(
    contract,
    /-webkit-backdrop-filter:\s*none;/,
  );
});

test("site-wide ambient background coexists with landing hero parallax", async () => {
  const app = await readFile(
    path.join(projectRoot, "src/App.tsx"),
    "utf8",
  );

  assert.match(
    app,
    /route\.section !== "\/listen"\s*\?\s*<SiteAmbientBackground\s*\/>/,
  );
  assert.match(app, /<LandingHeroBanner\s*\/>/);
});
