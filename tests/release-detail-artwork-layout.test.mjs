import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("selected release artwork remains square inside the stretched desktop hero grid", async () => {
  const css = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );

  assert.match(
    css,
    /\.hiplingo-release-card__artwork,\s*\.hiplingo-release-detail__artwork\s*\{[\s\S]*?aspect-ratio:\s*1;/,
  );

  assert.match(
    css,
    /\.hiplingo-release-detail__artwork\s*\{[\s\S]*?width:\s*min\(100%, 520px\);[\s\S]*?align-self:\s*start;/,
  );

  assert.match(
    css,
    /@media \(min-width:\s*640px\)[\s\S]*?\.hiplingo-release-detail__hero\s*\{[\s\S]*?align-items:\s*stretch;/,
  );

  assert.match(
    css,
    /\.hiplingo-release-card__artwork img,\s*\.hiplingo-release-detail__artwork img\s*\{[\s\S]*?object-fit:\s*cover;/,
  );
});
