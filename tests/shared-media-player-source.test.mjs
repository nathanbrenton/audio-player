import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");

async function source(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

test("Hiplingo and metadata-editor can consume one shared compact waveform package", async () => {
  const packageJson = await source("package.json");
  const sharedPackage = await source("packages/media-player/package.json");
  const compactWrapper = await source("src/components/CompactWaveformCanvas.tsx");
  const sharedCanvas = await source("packages/media-player/src/CompactWaveformCanvas.tsx");

  assert.match(packageJson, /"@hiplingo\/media-player": "file:\.\/packages\/media-player"/);
  assert.match(sharedPackage, /"name": "@hiplingo\/media-player"/);
  assert.match(compactWrapper, /CompactWaveformCanvas as default/);
  assert.match(compactWrapper, /@hiplingo\/media-player/);
  assert.doesNotMatch(compactWrapper, /getContext\("2d"\)/);
  assert.match(sharedCanvas, /getContext\("2d"\)/);
  assert.match(sharedCanvas, /shared-waveform/);
});

test("waveform color choices are defined once in the shared package", async () => {
  const player = await source("src/components/AudioPlayer.tsx");
  const waveformCanvas = await source("src/components/WaveformCanvas.tsx");
  const vocabulary = await source("packages/media-player/src/waveform.ts");

  assert.match(player, /WAVEFORM_COLOR_OPTIONS/);
  assert.match(player, /from "@hiplingo\/media-player"/);
  assert.match(waveformCanvas, /type \{ WaveformColorMode \} from "@hiplingo\/media-player"/);
  assert.match(vocabulary, /value: "3band"/);
  assert.match(vocabulary, /value: "rgb"/);
  assert.match(vocabulary, /value: "blue"/);
  assert.match(vocabulary, /value: "monochrome"/);
});


test("shared waveform renderer is self-contained without a host stylesheet contract", async () => {
  const sharedPackage = await source("packages/media-player/package.json");
  const sharedCanvas = await source("packages/media-player/src/CompactWaveformCanvas.tsx");
  const main = await source("src/main.tsx");

  assert.doesNotMatch(sharedPackage, /waveform\.css/);
  assert.doesNotMatch(sharedCanvas, /import .*waveform\.css/);
  assert.match(sharedCanvas, /position: "relative"/);
  assert.match(sharedCanvas, /touchAction: onSeek \? "none"/);
  assert.doesNotMatch(main, /@hiplingo\/media-player\/waveform\.css/);
});

test("transport interaction primitives are shared without moving either host audio engine", async () => {
  const player = await source("src/components/AudioPlayer.tsx");
  const sharedIndex = await source("packages/media-player/src/index.ts");
  const sharedPlayback = await source("packages/media-player/src/playback.ts");
  const sharedShortcut = await source("packages/media-player/src/useSpacebarPlaybackShortcut.ts");
  const sharedTransport = await source("packages/media-player/src/MediaTransportIcon.tsx");

  assert.match(player, /MediaTransportIcon/);
  assert.match(player, /formatPlaybackTime/);
  assert.match(player, /useSpacebarPlaybackShortcut/);
  assert.match(player, /from "@hiplingo\/media-player"/);
  assert.doesNotMatch(player, /function formatTime\(/);
  assert.doesNotMatch(player, /function isTextEntryTarget\(/);
  assert.match(sharedIndex, /\.\/MediaTransportIcon\.js/);
  assert.match(sharedIndex, /\.\/playback\.js/);
  assert.match(sharedIndex, /\.\/useSpacebarPlaybackShortcut\.js/);
  assert.match(sharedPlayback, /export function formatPlaybackTime/);
  assert.match(sharedPlayback, /export function isPlaybackTextEntryTarget/);
  assert.match(sharedPlayback, /input\[type='text'\]/);
  assert.doesNotMatch(sharedPlayback, /input\[type='number'\]/);
  assert.match(sharedShortcut, /document\.addEventListener\("keydown", handleKeyDown, true\)/);
  assert.match(sharedShortcut, /document\.addEventListener\("keyup", handleKeyUp, true\)/);
  assert.match(sharedTransport, /name === "previous"/);
  assert.match(sharedTransport, /name === "pause"/);
  assert.match(sharedTransport, /name === "next"/);
  assert.match(player, /const audioRef = useRef<HTMLAudioElement \| null>\(null\)/);
  assert.match(player, /import type Hls from "hls\.js"/);
});

test("compact Now Playing presentation is shared while host playback engines remain separate", async () => {
  const player = await source("src/components/AudioPlayer.tsx");
  const sharedIndex = await source("packages/media-player/src/index.ts");
  const sharedNowPlaying = await source("packages/media-player/src/CompactNowPlayingBar.tsx");
  const readme = await source("README.md");

  assert.match(player, /<CompactNowPlayingBar/);
  assert.match(player, /transportTrailing=/);
  assert.match(player, /endControls=/);
  assert.match(player, /classNames=\{\{/);
  assert.match(sharedIndex, /\.\/CompactNowPlayingBar\.js/);
  assert.match(sharedNowPlaying, /<CompactWaveformCanvas/);
  assert.match(sharedNowPlaying, /<MediaTransportIcon/);
  assert.match(sharedNowPlaying, /formatPlaybackTime/);
  assert.match(sharedNowPlaying, /waveformFallback/);
  assert.match(sharedNowPlaying, /transportTrailing/);
  assert.match(sharedNowPlaying, /endControls/);
  assert.doesNotMatch(sharedNowPlaying, /new Audio\(|hls\.js|fetch\(/);
  assert.match(player, /const audioRef = useRef<HTMLAudioElement \| null>\(null\)/);
  assert.match(readme, /compact Now Playing presentation skeleton/);
});

test("transport controller and queue navigation are shared without sharing host engines", async () => {
  const player = await source("src/components/AudioPlayer.tsx");
  const sharedIndex = await source("packages/media-player/src/index.ts");
  const controller = await source("packages/media-player/src/playback-controller.ts");
  const sharedNowPlaying = await source("packages/media-player/src/CompactNowPlayingBar.tsx");

  assert.match(sharedIndex, /\.\/playback-controller\.js/);
  assert.match(controller, /export type PlaybackTransportController/);
  assert.match(controller, /export function dedupePlaybackQueue/);
  assert.match(controller, /export function getPlaybackQueueNeighbor/);
  assert.match(controller, /export function getPlaybackQueueCapabilities/);
  assert.match(sharedNowPlaying, /transport: PlaybackTransportController/);
  assert.match(sharedNowPlaying, /const \{[\s\S]*toggle,[\s\S]*seek,[\s\S]*\} = transport/);
  assert.match(player, /dedupePlaybackQueue\(/);
  assert.match(player, /getPlaybackQueueNeighbor\(/);
  assert.match(player, /transport=\{\{/);
  assert.doesNotMatch(controller, /new Audio\(|hls\.js|fetch\(/);
  assert.match(player, /const audioRef = useRef<HTMLAudioElement \| null>\(null\)/);
});


test("playable media items normalize identity and host-owned resources without sharing engines", async () => {
  const player = await source("src/components/AudioPlayer.tsx");
  const sharedIndex = await source("packages/media-player/src/index.ts");
  const playableMedia = await source("packages/media-player/src/playable-media.ts");

  assert.match(sharedIndex, /\.\/playable-media\.js/);
  assert.match(playableMedia, /export type PlayableMediaItem<TSource = unknown>/);
  assert.match(playableMedia, /source: TSource/);
  assert.match(playableMedia, /artworkUrl\?: string \| null/);
  assert.match(playableMedia, /waveformUrl\?: string \| null/);
  assert.match(playableMedia, /export function getPlayableMediaContext/);
  assert.match(player, /type PlayableTrack = PlayableMediaItem<HiplingoPlayableMediaSource>/);
  assert.match(player, /source: \{[\s\S]*url: getMediaUrl/);
  assert.match(player, /waveformUrl: getMediaUrl/);
  assert.match(player, /artworkUrl: getMediaUrl/);
  assert.match(player, /const waveformUrl = selectedTrack\.waveformUrl/);
  assert.match(player, /const audioSource =[\s\S]*selectedTrack\?\.source\.url/);
  assert.match(player, /context=\{getPlayableMediaContext\(selectedTrack\)\}/);
  assert.doesNotMatch(playableMedia, /new Audio\(|hls\.js|fetch\(/);
});
