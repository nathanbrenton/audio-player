import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("hamburger remains the menu toggle while the settings panel clears the sticky site header", async () => {
  const appSource = await readFile(
    path.join(projectRoot, "src/App.tsx"),
    "utf8",
  );
  const playerSource = await readFile(
    path.join(projectRoot, "src/components/AudioPlayer.tsx"),
    "utf8",
  );
  const css = await readFile(
    path.join(projectRoot, "src/index.css"),
    "utf8",
  );

  assert.match(appSource, /const headerRef = useRef<HTMLElement \| null>\(null\)/);
  assert.match(appSource, /--hiplingo-site-header-bottom/);
  assert.match(appSource, /new ResizeObserver\(syncHeaderBottom\)/);
  assert.match(appSource, /const playerMenuButtonRef = useRef<HTMLButtonElement \| null>\(null\)/);
  assert.match(appSource, /ref=\{playerMenuButtonRef\}/);
  assert.match(appSource, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(appSource, /aria-controls="app-menu-panel"/);
  assert.match(appSource, /menuToggleButtonRef=\{playerMenuButtonRef\}/);

  assert.match(playerSource, /menuToggleButtonRef\?: RefObject<HTMLButtonElement \| null>/);
  assert.match(playerSource, /const toggleButton = menuToggleButtonRef\?\.current/);
  assert.match(playerSource, /Boolean\(toggleButton\?\.contains\(target\)\)/);
  assert.match(playerSource, /setIsAppMenuOpen\(\(isOpen\) => !isOpen\)/);

  assert.match(playerSource, /const DEVELOPER_CONTROL_HOLD_MS = 4000;/);
  assert.match(
    playerSource,
    /window\.setTimeout\(\(\) => \{[\s\S]*?\}, DEVELOPER_CONTROL_HOLD_MS\);/,
  );
  assert.doesNotMatch(
    playerSource,
    /title="Press and hold 4 seconds to show or hide Developer Mode"/,
  );
  assert.match(
    playerSource,
    /onPointerDown=\{handleAboutPointerDown\}/,
  );
  assert.match(
    playerSource,
    /onPointerUp=\{finishAboutPointer\}/,
  );
  assert.match(
    playerSource,
    /isDeveloperControlVisible \? \([\s\S]*?Developer Mode[\s\S]*?isDeveloperMode \? \([\s\S]*?Listen Background[\s\S]*?listen-background-mode-select/,
  );

  assert.match(
    css,
    /\.audio-player__settings-panel\s*\{[\s\S]*?var\(--hiplingo-site-header-bottom, 64px\)[\s\S]*?max-height:/,
  );
});
