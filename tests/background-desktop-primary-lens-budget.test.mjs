import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("uses a primary-lens-only compositor stack on desktop", async () => {
  const css = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );

  const start = css.indexOf(
    "Desktop primary-lens-only performance budget",
  );
  const end = css.indexOf(
    "Desktop playback compositor budget",
  );

  assert.ok(start >= 0);
  assert.ok(end > start);

  const budget = css.slice(start, end);

  assert.match(budget, /@media \(min-width: 900px\)/);

  for (const lensClass of [
    "listen-reactive-background__secondary-lens-mask",
    "listen-reactive-background__tertiary-lens-mask",
    "listen-reactive-background__macro-lens-mask",
    "listen-reactive-background__macro-secondary-lens-mask",
  ]) {
    assert.match(budget, new RegExp(lensClass));
  }

  assert.match(budget, /display:\s*none/);

  /*
   * The primary lens must stay out of this reduction block.
   */
  assert.doesNotMatch(
    budget,
    /listen-reactive-background__lens-mask(?:\s|,|\{)/,
  );

  /*
   * This optimization is viewport-based, never playback-state-based.
   * That prevents transport actions from changing lens visibility.
   */
  assert.doesNotMatch(
    budget,
    /data-playback-active/,
  );
});
