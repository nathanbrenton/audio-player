import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("portrait mobile Listen footer spans the safe viewport width", async () => {
  const css = await readFile(
    path.join(root, "src/index.css"),
    "utf8",
  );

  assert.match(css, /Mobile Listen footer full-width/);
  assert.match(
    css,
    /@media \(max-width: 640px\) and \(orientation: portrait\)\s*\{[\s\S]*?audio-player\[data-display-mode="full"\][\s\S]*?\.hiplingo-now-playing-dock\s*\{[\s\S]*?right:\s*env\(safe-area-inset-right\);[\s\S]*?left:\s*env\(safe-area-inset-left\);[\s\S]*?width:\s*auto;[\s\S]*?max-width:\s*none;[\s\S]*?margin-inline:\s*0;/,
  );
});
