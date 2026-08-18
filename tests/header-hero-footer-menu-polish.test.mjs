import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("mobile landscape restores the HIPLINGO wordmark", async () => {
  const css = await readFile(
    path.join(root, "src/index.css"),
    "utf8",
  );

  const start = css.indexOf(
    "Header + hero + footer + settings-menu final polish",
  );
  assert.notEqual(start, -1);
  const contract = css.slice(start);

  assert.match(
    contract,
    /@media \(max-width:\s*899px\) and \(orientation:\s*landscape\)[\s\S]*?\.hiplingo-site-brand span\s*\{[\s\S]*?display:\s*inline !important;/,
  );
});

test("wide landing headline stays on one line and short landscape gets compact sizing", async () => {
  const css = await readFile(
    path.join(root, "src/index.css"),
    "utf8",
  );

  const start = css.indexOf(
    "Header + hero + footer + settings-menu final polish",
  );
  const contract = css.slice(start);

  assert.match(
    contract,
    /@media \(min-width:\s*760px\)[\s\S]*?\.hiplingo-home \.hiplingo-hero h1\s*\{[\s\S]*?white-space:\s*nowrap;/,
  );
  assert.match(
    contract,
    /max-height:\s*520px[\s\S]*?\.hiplingo-home \.hiplingo-hero h1\s*\{[\s\S]*?4\.35vw/,
  );
});

test("hero banner grows only when viewport runway is available", async () => {
  const css = await readFile(
    path.join(root, "src/index.css"),
    "utf8",
  );

  const start = css.indexOf(
    "Header + hero + footer + settings-menu final polish",
  );
  const contract = css.slice(start);

  assert.match(
    contract,
    /@media \(min-width:\s*640px\) and \(min-height:\s*650px\)[\s\S]*?height:\s*clamp\(300px, 42vw, 450px\);/,
  );
  assert.match(
    contract,
    /max-height:\s*520px[\s\S]*?\.hiplingo-home \.hiplingo-hero__banner\s*\{[\s\S]*?height:\s*160px;/,
  );
});

test("public footer receives a subtle readable surface and text shadow", async () => {
  const css = await readFile(
    path.join(root, "src/index.css"),
    "utf8",
  );

  const start = css.indexOf(
    "Header + hero + footer + settings-menu final polish",
  );
  const contract = css.slice(start);

  assert.match(
    contract,
    /\.hiplingo-site-footer\s*\{[\s\S]*?rgba\(7, 8, 11, 0\.28\)[\s\S]*?text-shadow:/,
  );
  assert.match(
    contract,
    /\.hiplingo-site-footer a\s*\{[\s\S]*?color:\s*#bfd0d8;[\s\S]*?text-shadow:/,
  );
  assert.match(
    contract,
    /backdrop-filter:\s*none;/,
  );
});

test("settings panel itself scrolls so Developer information remains reachable", async () => {
  const css = await readFile(
    path.join(root, "src/index.css"),
    "utf8",
  );

  const start = css.indexOf(
    "Header + hero + footer + settings-menu final polish",
  );
  const contract = css.slice(start);

  assert.match(
    contract,
    /\.audio-player__settings-backdrop\s*\{[\s\S]*?overflow-y:\s*auto !important;[\s\S]*?overscroll-behavior:\s*contain;/,
  );
  assert.match(
    contract,
    /\.audio-player__settings-panel\s*\{[\s\S]*?max-height:\s*calc\([\s\S]*?100dvh[\s\S]*?overflow-y:\s*auto !important;[\s\S]*?padding-bottom:/,
  );
});
