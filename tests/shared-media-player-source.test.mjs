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
  const surface = await source("packages/media-player/src/MediaVisualizationSurface.tsx");
  const vocabulary = await source("packages/media-player/src/waveform.ts");

  assert.match(player, /WAVEFORM_COLOR_OPTIONS/);
  assert.match(player, /type WaveformColorMode/);
  assert.match(player, /from "@hiplingo\/media-player"/);
  assert.match(surface, /WaveformColorMode/);
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
  assert.match(player, /usePersistentMediaElement\(\)/);
  assert.match(player, /import type Hls from "hls\.js"/);
});

test("compact Now Playing presentation is shared while host playback engines remain separate", async () => {
  const player = await source("src/components/AudioPlayer.tsx");
  const sharedIndex = await source("packages/media-player/src/index.ts");
  const sharedNowPlaying = await source("packages/media-player/src/CompactNowPlayingBar.tsx");
  const readme = await source("README.md");

  assert.match(player, /<CompactNowPlayingBar/);
  assert.match(player, /controller=\{\{/);
  assert.match(player, /endControls=/);
  assert.match(player, /classNames=\{\{/);
  assert.match(sharedIndex, /\.\/CompactNowPlayingBar\.js/);
  assert.match(sharedNowPlaying, /<CompactWaveformCanvas/);
  assert.match(sharedNowPlaying, /<MediaTransportIcon/);
  assert.match(sharedNowPlaying, /formatPlaybackTime/);
  assert.match(sharedNowPlaying, /waveformFallback/);
  assert.match(sharedNowPlaying, /<MediaVolumeControl/);
  assert.match(sharedNowPlaying, /controller: PlaybackShellController/);
  assert.doesNotMatch(sharedNowPlaying, /transportTrailing/);
  assert.match(sharedNowPlaying, /endControls/);
  assert.doesNotMatch(sharedNowPlaying, /new Audio\(|hls\.js|fetch\(/);
  assert.match(player, /usePersistentMediaElement\(\)/);
  assert.match(readme, /compact Now Playing presentation shell/);
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
  assert.match(sharedNowPlaying, /controller: PlaybackShellController/);
  assert.match(sharedNowPlaying, /const \{[\s\S]*toggle,[\s\S]*seek,[\s\S]*\} = transport/);
  assert.match(player, /dedupePlaybackQueue\(/);
  assert.match(player, /getPlaybackQueueNeighbor\(/);
  assert.match(player, /controller=\{\{/);
  assert.doesNotMatch(controller, /new Audio\(|hls\.js|fetch\(/);
  assert.match(player, /usePersistentMediaElement\(\)/);
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

test("Hiplingo uses the shared media-element analyser instead of a host-local Web Audio graph", async () => {
  const player = await source("src/components/AudioPlayer.tsx");
  const analyser = await source("packages/media-player/src/useMediaElementAnalyser.ts");

  assert.match(player, /useMediaElementAnalyser/);
  assert.match(player, /ensureAnalyser: ensureAudioAnalyser/);
  assert.doesNotMatch(player, /createMediaElementSource/);
  assert.doesNotMatch(player, /audioContextRef|mediaSourceRef|analyserRef/);
  assert.match(analyser, /WeakMap<HTMLMediaElement/);
  assert.match(analyser, /createMediaElementSource/);
  assert.match(analyser, /captureOscilloscopeFrame/);
  assert.match(analyser, /releaseAttachedGraph/);
});

test("Hiplingo renders the shared waveform and oscilloscope as one visualization surface", async () => {
  const player = await source("src/components/AudioPlayer.tsx");
  const surface = await source("packages/media-player/src/MediaVisualizationSurface.tsx");
  const sharedIndex = await source("packages/media-player/src/index.ts");

  assert.match(player, /<MediaVisualizationSurface/);
  assert.match(player, /showZoomReadout=\{isAudiophileMode\}/);
  assert.match(player, /zoomReadout: "waveform-panel__zoom-value"/);
  assert.match(surface, /<ScrollingWaveformCanvas/);
  assert.match(surface, /<OscilloscopeCanvas/);
  assert.match(surface, /useWaveformZoomController/);
  assert.match(surface, /seedOscilloscopeFrame/);
  assert.match(surface, /showZoomReadout/);
  assert.match(sharedIndex, /\.\/MediaVisualizationSurface\.js/);
});

test("compact player volume interaction state and media gain are shared", async () => {
  const player = await source("src/components/AudioPlayer.tsx");
  const sharedIndex = await source("packages/media-player/src/index.ts");
  const sharedVolume = await source("packages/media-player/src/MediaVolumeControl.tsx");
  const sharedVolumeLifecycle = await source(
    "packages/media-player/src/useMediaElementVolume.ts",
  );
  const sharedNowPlaying = await source("packages/media-player/src/CompactNowPlayingBar.tsx");
  const controller = await source("packages/media-player/src/playback-controller.ts");

  assert.match(sharedIndex, /\.\/MediaVolumeControl\.js/);
  assert.match(sharedIndex, /\.\/useMediaElementVolume\.js/);
  assert.match(sharedVolume, /export function volumePercentToGain/);
  assert.match(sharedVolume, /return normalized \* normalized/);
  assert.match(sharedVolume, /aria-haspopup="true"/);
  assert.match(sharedVolume, /type="range"/);
  assert.match(sharedVolume, /max="100"/);
  assert.match(sharedVolume, /event\.key === "Escape"/);
  assert.match(controller, /export type PlaybackVolumeController/);
  assert.match(controller, /export type PlaybackShellController/);
  assert.match(sharedNowPlaying, /<MediaVolumeControl/);
  assert.match(sharedNowPlaying, /controller: PlaybackShellController/);
  assert.match(player, /useMediaElementVolume\(audioRef\)/);
  assert.match(player, /controller=\{\{[\s\S]*volume: \{/);
  assert.doesNotMatch(player, /volumePercentToGain\(volumePercent\)/);
  assert.match(
    sharedVolumeLifecycle,
    /audio\.volume =[\s\S]*volumePercentToGain\(volumePercent\)/,
  );
  assert.doesNotMatch(player, /function VolumeIcon|isVolumeControlOpen|volumeControlRef/);
});

test("persistent media timeline state and direct seeking are shared", async () => {
  const player = await source("src/components/AudioPlayer.tsx");
  const sharedIndex = await source("packages/media-player/src/index.ts");
  const timeline = await source(
    "packages/media-player/src/useMediaElementTimeline.ts",
  );

  assert.match(sharedIndex, /\.\/useMediaElementTimeline\.js/);
  assert.match(player, /useMediaElementTimeline\(audioRef\)/);
  assert.doesNotMatch(player, /const \[currentTime, setCurrentTime\]/);
  assert.match(timeline, /const \[currentTime, setCurrentTime\] = useState\(0\)/);
  assert.match(timeline, /const \[duration, setDuration\] = useState\(0\)/);
  assert.match(timeline, /media\.currentTime = nextTime/);
  assert.match(timeline, /dispatchSeekEvent/);
  assert.match(timeline, /new Event\("audioplayerseek"\)/);
  assert.match(
    player,
    /seekMediaTimeline\(nextTime, \{[\s\S]*upperBound: waveform\.durationSeconds,[\s\S]*dispatchSeekEvent: true/,
  );
});

test("persistent media playback state is shared while host event policy remains separate", async () => {
  const player = await source("src/components/AudioPlayer.tsx");
  const sharedIndex = await source("packages/media-player/src/index.ts");
  const playbackState = await source(
    "packages/media-player/src/useMediaElementPlaybackState.ts",
  );

  assert.match(sharedIndex, /\.\/useMediaElementPlaybackState\.js/);
  assert.match(player, /useMediaElementPlaybackState\(audioRef\)/);
  assert.doesNotMatch(player, /const \[isPlaying, setIsPlaying\] = useState\(false\)/);
  assert.match(playbackState, /const \[isPlaying, setIsPlaying\] = useState\(false\)/);
  assert.match(playbackState, /const \[isLoading, setIsLoading\] = useState\(false\)/);
  assert.match(playbackState, /HTMLMediaElement\.HAVE_CURRENT_DATA/);
  assert.match(player, /syncPlaying: syncMediaPlaying/);
  assert.match(player, /onPlaying=/);
  assert.match(player, /onPause=/);
  assert.match(player, /onEnded=/);
  assert.match(player, /isScrubbingRef/);
  assert.match(player, /hls\.js/);
});

test("ordinary persistent media event transitions are shared while ended and source policy remain host-owned", async () => {
  const player = await source("src/components/AudioPlayer.tsx");
  const sharedIndex = await source("packages/media-player/src/index.ts");
  const playbackEvents = await source(
    "packages/media-player/src/useMediaElementPlaybackEvents.ts",
  );

  assert.match(sharedIndex, /\.\/useMediaElementPlaybackEvents\.js/);
  assert.match(player, /useMediaElementPlaybackEvents\(playbackState\)/);
  assert.match(player, /playbackEvents\.handlePlaying\(\)/);
  assert.match(player, /playbackEvents\.handlePause\(\)/);
  assert.match(player, /onAbort=\{playbackEvents\.handleAbort\}/);
  assert.match(player, /onError=\{playbackEvents\.handleError\}/);
  assert.match(playbackEvents, /handlePlay/);
  assert.match(playbackEvents, /handlePlaying/);
  assert.match(playbackEvents, /handlePause/);
  assert.match(playbackEvents, /handleWaiting/);
  assert.match(playbackEvents, /handleCanPlay/);
  assert.match(playbackEvents, /handleEmptied/);
  assert.doesNotMatch(playbackEvents, /handleEnded/);
  assert.match(player, /onEnded=/);
  assert.match(player, /hls\.on\(HlsRuntime\.Events\.ERROR/);
  assert.match(player, /isScrubbingRef/);
});

test("source attachment crosses one shared adapter contract while Hiplingo keeps HLS implementation", async () => {
  const player = await source("src/components/AudioPlayer.tsx");
  const sharedIndex = await source("packages/media-player/src/index.ts");
  const sourceAdapter = await source(
    "packages/media-player/src/media-source-adapter.ts",
  );

  assert.match(sharedIndex, /\.\/media-source-adapter\.js/);
  assert.match(sourceAdapter, /export type MediaSourceAdapter<TSource>/);
  assert.match(sourceAdapter, /mediaKey: string/);
  assert.match(sourceAdapter, /source: TSource/);
  assert.match(sourceAdapter, /autoplay: boolean/);
  assert.match(sourceAdapter, /dispose: \(audio: HTMLAudioElement\) => void/);
  assert.doesNotMatch(sourceAdapter, /hls\.js|HlsRuntime|new Audio\(|fetch\(/);

  assert.match(
    player,
    /const mediaSourceAdapter: MediaSourceAdapter<[\s\S]*HiplingoPlayableMediaSource/,
  );
  assert.match(player, /attach: configureAudioSource/);
  assert.match(player, /useMediaSourceSession\(/);
  assert.match(player, /attachMediaSource\(\{/);
  assert.match(player, /disposeMediaSource\(\)/);
  assert.match(player, /isCurrentMediaSource\(trackKey\)/);
  assert.doesNotMatch(player, /loadedAudioTrackKeyRef/);

  assert.match(player, /import type Hls from "hls\.js"/);
  assert.match(player, /hls\.loadSource\(sourceUrl\)/);
  assert.match(player, /HlsRuntime\.isSupported\(\)/);
  assert.match(player, /audio\.canPlayType/);
});

test("shared source session owns element/key orchestration without source implementation", async () => {
  const sharedIndex = await source("packages/media-player/src/index.ts");
  const sourceSession = await source(
    "packages/media-player/src/useMediaSourceSession.ts",
  );

  assert.match(sharedIndex, /\.\/useMediaSourceSession\.js/);
  assert.match(sourceSession, /export function useMediaSourceSession<TSource>/);
  assert.match(sourceSession, /currentMediaKeyRef\.current = request\.mediaKey/);
  assert.match(sourceSession, /adapterRef\.current\.attach\(\{/);
  assert.match(sourceSession, /audio,[\s\S]*\.\.\.request/);
  assert.match(sourceSession, /adapterRef\.current\.dispose\(audio\)/);
  assert.match(sourceSession, /currentMediaKeyRef\.current = null/);
  assert.match(sourceSession, /isCurrent/);
  assert.doesNotMatch(
    sourceSession,
    /hls\.js|HlsRuntime|buildAudioPreviewUrl|published-media|audio\.src\s*=/,
  );
});

test("persistent media-element reference and renderer are shared across hosts", async () => {
  const player = await source("src/components/AudioPlayer.tsx");
  const sharedIndex = await source("packages/media-player/src/index.ts");
  const persistentElement = await source(
    "packages/media-player/src/PersistentMediaElement.tsx",
  );
  const sourceSession = await source(
    "packages/media-player/src/useMediaSourceSession.ts",
  );

  assert.match(sharedIndex, /\.\/PersistentMediaElement\.js/);
  assert.match(persistentElement, /export function usePersistentMediaElement/);
  assert.match(persistentElement, /useRef<HTMLAudioElement \| null>\(null\)/);
  assert.match(persistentElement, /bindAudioElement/);
  assert.match(persistentElement, /<audio/);
  assert.match(persistentElement, /ref=\{controller\.bindAudioElement\}/);
  assert.match(player, /const mediaElement = usePersistentMediaElement\(\)/);
  assert.match(player, /<PersistentMediaElement/);
  assert.match(player, /controller=\{mediaElement\}/);
  assert.doesNotMatch(player, /const audioRef = useRef<HTMLAudioElement/);
  assert.match(sourceSession, /attachedAudioRef/);
  assert.match(
    sourceSession,
    /audioRef\.current \?\? attachedAudioRef\.current/,
  );
});
