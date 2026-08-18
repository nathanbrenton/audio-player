import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("footer Artist and Release links do not inherit global 44px control height", async () => {
  const css = await readFile(
    path.join(root, "src/index.css"),
    "utf8",
  );

  const start = css.indexOf(
    "Footer linked-context intrinsic height",
  );
  assert.notEqual(start, -1);

  const contract = css.slice(start);

  assert.match(
    contract,
    /\.hiplingo-now-playing-dock[\s\S]*?\.hiplingo-now-playing-dock__context-link\s*\{[\s\S]*?display:\s*inline-block !important;[\s\S]*?height:\s*auto !important;[\s\S]*?min-height:\s*0 !important;[\s\S]*?padding:\s*0 !important;[\s\S]*?line-height:\s*inherit !important;/,
  );
});
