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

test("locks mobile landscape Listen to one viewport while settings scroll internally", async () => {
  const css = await readSource("src/index.css");

  assert.match(
    css,
    /@media \(max-width: 899px\) and \(orientation: landscape\) \{[\s\S]*?html:has\(\.hiplingo-site-shell--listen\)[\s\S]*?overflow:\s*hidden;[\s\S]*?\.hiplingo-site-shell--listen\s*\{[\s\S]*?height:\s*100dvh;[\s\S]*?overflow:\s*hidden;/,
  );
  assert.match(
    css,
    /\.hiplingo-site-shell--listen \.audio-player__settings-panel\s*\{[\s\S]*?bottom:\s*calc\(96px \+ env\(safe-area-inset-bottom\)\);[\s\S]*?overflow-y:\s*auto;[\s\S]*?overscroll-behavior-y:\s*contain;/,
  );
});

test("uses one canonical landscape footer geometry across all public routes", async () => {
  const css = await readSource("src/index.css");

  assert.match(
    css,
    /Mobile landscape — canonical global footer transport[\s\S]*?\.audio-player\[data-display-mode="compact"\]\s*\{[\s\S]*?right:\s*0;[\s\S]*?left:\s*0;[\s\S]*?width:\s*100%;/,
  );
  assert.match(
    css,
    /\.hiplingo-now-playing-dock\.shared-now-playing\s*\{[\s\S]*?grid-template-areas:\s*\n\s*"waveform waveform waveform waveform actions"\s*\n\s*"artwork identity time transport actions";[\s\S]*?grid-template-rows:\s*36px auto;/,
  );
  assert.match(
    css,
    /\.hiplingo-now-playing-dock \.shared-now-playing__waveform-region\s*\{[\s\S]*?grid-area:\s*waveform;[\s\S]*?height:\s*36px;/,
  );
  assert.equal(
    (css.match(/"waveform waveform waveform waveform waveform"/g) ?? []).length,
    0,
  );
});

test("keeps the approved portrait footer geometry consistent across routes", async () => {
  const css = await readSource("src/index.css");

  assert.match(
    css,
    /Mobile portrait — canonical global footer transport[\s\S]*?\.hiplingo-now-playing-dock\.shared-now-playing\s*\{[\s\S]*?grid-template-areas:\s*\n\s*"play previous waveform waveform next shuffle"\s*\n\s*"artwork identity identity time time end";/,
  );
  assert.match(
    css,
    /Mobile portrait — canonical global footer transport[\s\S]*?\.shared-now-playing__end-controls\s*\{\s*display:\s*contents;[\s\S]*?\.hiplingo-now-playing-dock__shuffle-button\s*\{[\s\S]*?grid-area:\s*shuffle;[\s\S]*?display:\s*grid;[\s\S]*?\.hiplingo-now-playing-dock__metadata-button\s*\{[\s\S]*?grid-area:\s*end;[\s\S]*?justify-self:\s*end;/,
  );
});

test("places the route-appropriate end action beside the landscape footer waveform", async () => {
  const css = await readSource("src/index.css");
  const audioPlayerSource = await readSource("src/components/AudioPlayer.tsx");

  assert.match(
    audioPlayerSource,
    /function shuffleActiveQueue\(\)[\s\S]*?const allTrackKeys = playableTracks\.map\(\(entry\) => entry\.key\);[\s\S]*?currentTrackIsPlaying[\s\S]*?setQueueTrackKeys\([\s\S]*?shuffleQueueTracks\(shuffledTrackKeys\);/,
  );
  assert.match(
    audioPlayerSource,
    /displayMode === "full" \? \([\s\S]*?className="hiplingo-now-playing-dock__shuffle-button"[\s\S]*?aria-label="Shuffle playback queue"[\s\S]*?onClick=\{shuffleActiveQueue\}[\s\S]*?\) : \([\s\S]*?className="hiplingo-now-playing-dock__listen-button"[\s\S]*?aria-label="Open Listen"[\s\S]*?onOpenFullPlayer\?\.\(\)/,
  );
  assert.match(
    css,
    /\.hiplingo-now-playing-dock__shuffle-button\s*\{[\s\S]*?grid-row:\s*1;[\s\S]*?display:\s*grid;[\s\S]*?width:\s*34px;/,
  );
  assert.match(
    css,
    /\.hiplingo-now-playing-dock \.hiplingo-now-playing-dock__end-controls\s*\{[\s\S]*?grid-area:\s*actions;[\s\S]*?display:\s*grid;[\s\S]*?grid-template-rows:\s*36px minmax\(0, 1fr\);/,
  );
  assert.match(
    css,
    /\.hiplingo-now-playing-dock__metadata-button\s*\{[\s\S]*?grid-row:\s*2;[\s\S]*?width:\s*34px;/,
  );
});

test("defers the landscape title carousel while keeping floating discovery controls removed", async () => {
  const css = await readSource("src/index.css");
  const queueSource = await readSource("src/components/ListenTrackQueue.tsx");

  assert.match(css, /Mobile landscape Listen — playlist deferred[\s\S]*?\.listen-track-queue__titles,[\s\S]*?\{\s*display:\s*none;/);
  assert.match(queueSource, /className="listen-track-queue__titles"/);
  assert.doesNotMatch(queueSource, /listen-track-queue__filters/);
  assert.doesNotMatch(queueSource, /listen-track-queue__shuffle/);
});

test("restores the Hiplingo purple hamburger control styling", async () => {
  const css = await readSource("src/index.css");

  assert.match(
    css,
    /\.hiplingo-site-menu\s*\{[\s\S]*?border:\s*1px solid var\(--hiplingo-border-strong\);[\s\S]*?color:\s*var\(--hiplingo-text-soft\);[\s\S]*?background:\s*var\(--hiplingo-surface-control\);/,
  );
  assert.match(
    css,
    /\.hiplingo-site-menu:hover\s*\{[\s\S]*?border-color:\s*var\(--hiplingo-border-active\);[\s\S]*?background:\s*var\(--hiplingo-surface-control-hover\);/,
  );
});

test("last-loaded host CSS does not override canonical mobile action placement", async () => {
  const hostCss = await readSource("src/components/compact-now-playing-host.css");
  const mainSource = await readSource("src/main.tsx");
  const mobileHostStart = hostCss.indexOf("@media (max-width: 58rem)");
  const narrowDesktopStart = hostCss.indexOf(
    "@media (min-width: 900px) and (max-width: 58rem)",
  );
  const mobileHostBlock = hostCss.slice(
    mobileHostStart,
    narrowDesktopStart,
  );

  assert.match(
    mainSource,
    /import "\.\/index\.css";[\s\S]*?import "@hiplingo\/media-player\/compact-now-playing-bar\.css";[\s\S]*?import "\.\/components\/compact-now-playing-host\.css";/,
  );
  assert.ok(mobileHostStart >= 0);
  assert.ok(narrowDesktopStart > mobileHostStart);
  assert.doesNotMatch(
    mobileHostBlock,
    /shared-now-playing__end-controls|grid-template-areas/,
  );
  assert.match(
    hostCss,
    /@media \(min-width: 900px\) and \(max-width: 58rem\) \{[\s\S]*?\.hiplingo-now-playing-dock\.shared-now-playing\s*\{[\s\S]*?grid-template-areas:[\s\S]*?"artwork identity transport metadata"[\s\S]*?"time waveform waveform waveform";[\s\S]*?\.shared-now-playing__end-controls\s*\{[\s\S]*?grid-area:\s*metadata;[\s\S]*?display:\s*flex;/,
  );
});
