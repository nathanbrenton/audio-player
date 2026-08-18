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

test("uses edge-free ambient clouds and a fixed artwork-style title carousel", async () => {
  const css = await readSource("src/index.css");

  assert.match(
    css,
    /\.listen-track-queue__titles::before\s*\{[\s\S]*?width:\s*min\(1180px, calc\(100% \+ 320px\)\);[\s\S]*?ellipse 46% 48% at center[\s\S]*?transparent 79%/,
  );
  assert.match(
    css,
    /\.hiplingo-site-shell--listen \.audio-player\[data-display-mode="full"\] \.player-layout::before\s*\{[\s\S]*?width:\s*min\(1380px, calc\(100% \+ 420px\)\);[\s\S]*?height:\s*calc\(100% \+ 220px\);[\s\S]*?transparent 78%/,
  );
  assert.match(
    css,
    /\.listen-track-queue__title--previous\s*\{[\s\S]*?opacity:\s*0\.46;[\s\S]*?translateZ\(-88px\)[\s\S]*?scale\(0\.54\)/,
  );
  assert.match(
    css,
    /\.listen-track-queue__current\s*\{[\s\S]*?opacity:\s*1;[\s\S]*?translateZ\(42px\)[\s\S]*?scale\(1\)/,
  );
  assert.match(
    css,
    /\.listen-track-queue__title--next\s*\{[\s\S]*?opacity:\s*0\.78;[\s\S]*?translateZ\(-34px\)[\s\S]*?scale\(0\.62\)/,
  );
  assert.match(
    css,
    /\.listen-track-queue__title--far-next\s*\{[\s\S]*?opacity:\s*0\.38;[\s\S]*?translateZ\(-104px\)[\s\S]*?scale\(0\.46\)/,
  );
});

test("feathers the floating filter rail before its box edges and raises the title carousel", async () => {
  const css = await readSource("src/index.css");

  assert.match(
    css,
    /\.listen-track-queue__filter-row \.listen-track-queue__filter-control\s*\{[\s\S]*?border-radius:\s*0;[\s\S]*?ellipse 72% 62% at center[\s\S]*?transparent 77%[\s\S]*?box-shadow:\s*none;/,
  );
  assert.match(
    css,
    /\.listen-track-queue__titles\s*\{[\s\S]*?height:\s*218px;[\s\S]*?margin:\s*-112px auto -8px;/,
  );
  assert.match(
    css,
    /\.listen-track-queue__titles\[data-has-previous="false"\]\s*\{[\s\S]*?margin-top:\s*-124px;/,
  );
});

test("avoids a full-screen metadata backdrop blur on desktop Listen", async () => {
  const css = await readSource("src/index.css");

  assert.match(
    css,
    /\.hiplingo-site-shell--listen \.metadata-viewer__backdrop\s*\{[\s\S]*?backdrop-filter:\s*none;[\s\S]*?-webkit-backdrop-filter:\s*none;/,
  );
});

test("skins the shared footer transport with Hiplingo host colors", async () => {
  const css = await readSource("src/index.css");

  assert.match(
    css,
    /\.hiplingo-now-playing-dock\.shared-now-playing\s*\{[\s\S]*?rgba\(29, 24, 41, 0\.985\)[\s\S]*?rgba\(14, 12, 22, 0\.985\)/,
  );
  assert.match(
    css,
    /\.hiplingo-now-playing-dock[\s\S]*?\.shared-now-playing__transport[\s\S]*?> \.shared-now-playing__play\s*\{[\s\S]*?rgba\(73, 55, 103, 0\.9\)/,
  );
});

test("normalizes desktop header navigation and menu control geometry", async () => {
  const css = await readSource("src/index.css");

  assert.match(
    css,
    /\.hiplingo-site-nav > a\s*\{[\s\S]*?min-height:\s*40px;[\s\S]*?align-items:\s*center;[\s\S]*?padding:\s*0 12px;[\s\S]*?line-height:\s*1;/,
  );
  assert.match(
    css,
    /\.hiplingo-site-menu\s*\{[\s\S]*?width:\s*40px;[\s\S]*?height:\s*40px;/,
  );
});

test("marks desktop Listen as a single viewport while preserving mobile flow", async () => {
  const appSource = await readSource("src/App.tsx");
  const css = await readSource("src/index.css");

  assert.match(
    appSource,
    /route\.section === "\/listen" \? " hiplingo-site-shell--listen" : ""/,
  );
  assert.match(
    css,
    /@media \(min-width: 900px\) \{[\s\S]*?\.hiplingo-site-shell--listen\s*\{[\s\S]*?height:\s*100dvh;[\s\S]*?overflow:\s*hidden;/,
  );
  assert.match(
    css,
    /\.hiplingo-site-shell--listen > \.hiplingo-site-footer\s*\{\s*display:\s*none;/,
  );
});
