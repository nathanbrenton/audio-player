import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");

async function source(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

test("Hiplingo brand logo is source-owned once by @hiplingo/brand", async () => {
  const packageSource = await source("package.json");
  const brandPackage = await source("../packages/brand/package.json");
  const brandIndex = await source("../packages/brand/src/index.ts");
  const indexHtml = await source("index.html");
  const mainSource = await source("src/main.tsx");

  assert.match(
    packageSource,
    /"@hiplingo\/brand": "file:\.\.\/packages\/brand"/,
  );
  assert.match(brandPackage, /"name": "@hiplingo\/brand"/);
  assert.match(
    brandIndex,
    /import hiplingoLogoUrl from "\.\/hiplingo-logo\.png"/,
  );
  assert.match(brandIndex, /export \{ hiplingoLogoUrl \}/);
  assert.doesNotMatch(brandIndex, /new URL\(/);
  assert.match(
    mainSource,
    /import \{ hiplingoLogoUrl \} from "@hiplingo\/brand"/,
  );
  assert.match(mainSource, /favicon\.href = hiplingoLogoUrl/);
  assert.doesNotMatch(
    indexHtml,
    /\/brand\/hiplingo-logo-white\.webp/,
  );

  await access(
    path.join(
      projectRoot,
      "../packages/brand/src/hiplingo-logo.png",
    ),
  );

  await assert.rejects(
    access(
      path.join(
        projectRoot,
        "public/brand/hiplingo-logo-white.webp",
      ),
    ),
  );
});
