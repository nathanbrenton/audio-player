import assert from "node:assert/strict";
import { stat, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cssPath = path.join(projectRoot, "src/index.css");
const assets = [
  "hiplingo-listen-background-desktop.webp",
  "hiplingo-listen-background-mobile-landscape.webp",
  "hiplingo-listen-background-mobile-portrait.webp",
];

test("selects dedicated Listen background assets for desktop and both mobile orientations", async () => {
  const css = await readFile(cssPath, "utf8");
  for (const asset of assets) {
    const info = await stat(path.join(projectRoot, "public/brand", asset));
    assert.ok(info.isFile());
    assert.ok(info.size > 0);
    assert.ok(css.includes(`/brand/${asset}`));
  }
  assert.ok(css.includes('background-image: url("/brand/hiplingo-listen-background-desktop.webp");'));
  assert.ok(css.includes('@media (max-width: 899px) and (orientation: landscape)'));
  assert.ok(css.includes('background-image: url("/brand/hiplingo-listen-background-mobile-landscape.webp");'));
  assert.ok(css.includes('@media (max-width: 899px) and (orientation: portrait)'));
  assert.ok(css.includes('background-image: url("/brand/hiplingo-listen-background-mobile-portrait.webp");'));
});

test("keeps mobile background compositor work to the moving backplate", async () => {
  const css = await readFile(cssPath, "utf8");
  const mobileStart = css.indexOf("Responsive Listen backgrounds");
  const reducedMotionStart = css.indexOf("@media (prefers-reduced-motion: reduce)", mobileStart);
  assert.ok(mobileStart >= 0);
  assert.ok(reducedMotionStart > mobileStart);
  const mobileCss = css.slice(mobileStart, reducedMotionStart);
  assert.ok(mobileCss.includes("display: block;"));
  assert.ok(mobileCss.includes("background-size: cover;"));
  assert.ok(mobileCss.includes(".listen-reactive-background__clusters,"));
  assert.ok(mobileCss.includes(".listen-reactive-background__lens-mask,"));
  assert.ok(mobileCss.includes("display: none;"));
});
