import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("landing hero restores Nathan-style scroll parallax", async () => {
  const [app, component] = await Promise.all([
    readFile(path.join(root, "src/App.tsx"), "utf8"),
    readFile(
      path.join(
        root,
        "src/components/LandingHeroBanner.tsx",
      ),
      "utf8",
    ),
  ]);

  assert.match(
    app,
    /import LandingHeroBanner from "\.\/components\/LandingHeroBanner";/,
  );
  assert.match(app, /<LandingHeroBanner\s*\/>/);

  assert.match(component, /DESKTOP_STRENGTH = 0\.24/);
  assert.match(component, /DESKTOP_TRAVEL_PX = 72/);
  assert.match(component, /PORTRAIT_STRENGTH = 0\.52/);
  assert.match(component, /PORTRAIT_TRAVEL_PX = 132/);
  assert.match(component, /LANDSCAPE_STRENGTH = 0\.24/);
  assert.match(component, /LANDSCAPE_TRAVEL_PX = 92/);
  assert.match(
    component,
    /window\.requestAnimationFrame\(updateParallax\)/,
  );
  assert.match(
    component,
    /"scroll",\s*requestParallaxUpdate,\s*\{ passive: true \}/,
  );
  assert.match(
    component,
    /\(prefers-reduced-motion: reduce\)/,
  );
});

test("landing hero is full-bleed and starts beneath the sticky header", async () => {
  const css = await readFile(
    path.join(root, "src/index.css"),
    "utf8",
  );

  const start = css.indexOf(
    "Full-bleed landing hero parallax restore",
  );
  assert.notEqual(start, -1);

  const contract = css.slice(start);

  assert.match(
    contract,
    /\.hiplingo-home\s*\{[\s\S]*?padding-top:\s*0 !important;/,
  );
  assert.match(
    contract,
    /\.hiplingo-home \.hiplingo-hero\s*\{[\s\S]*?width:\s*100vw;[\s\S]*?margin-top:\s*calc\(-1 \* var\(--hiplingo-home-header-overlap\)\);/,
  );
  assert.match(
    contract,
    /margin-left:\s*calc\(50% - 50vw\);/,
  );
  assert.match(
    contract,
    /border-radius:\s*0;/,
  );
  assert.match(
    contract,
    /\.hiplingo-hero__parallax-layer\s*\{[\s\S]*?translate3d\([\s\S]*?var\(--hiplingo-hero-parallax-y\)[\s\S]*?will-change:\s*transform;/,
  );
});

test("site ambient background and hero parallax remain separate lightweight layers", async () => {
  const [app, ambient, hero] = await Promise.all([
    readFile(path.join(root, "src/App.tsx"), "utf8"),
    readFile(
      path.join(
        root,
        "src/components/SiteAmbientBackground.tsx",
      ),
      "utf8",
    ),
    readFile(
      path.join(
        root,
        "src/components/LandingHeroBanner.tsx",
      ),
      "utf8",
    ),
  ]);

  assert.match(
    app,
    /route\.section !== "\/listen"\s*\?\s*<SiteAmbientBackground\s*\/>/,
  );
  assert.match(ambient, /AMBIENT_BACKGROUND_FPS = 12/);
  assert.doesNotMatch(
    hero,
    /setInterval|AnalyserNode|waveform|cluster|lens/i,
  );
});
