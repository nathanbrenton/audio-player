import {
  useEffect,
  useRef,
  type RefObject,
} from "react";

type WaveformPeak = [
  number,
  number,
  number,
  number,
  number,
];

type BackgroundMode = "watery" | "magnify";

type AudioReactiveListenBackgroundProps = {
  audioRef: RefObject<HTMLAudioElement | null>;
  analyser: AnalyserNode | null;
  peaks: WaveformPeak[];
  peaksPerSecond: number;
  isPlaying: boolean;
  isMetadataViewerOpen: boolean;
  mode: BackgroundMode;
};

type BandEnergy = {
  low: number;
  mid: number;
  high: number;
};

type LensMotionSeed = {
  xDirection: 1 | -1;
  yDirection: 1 | -1;
  xPhase: number;
  yPhase: number;
};

function createLensMotionSeed(): LensMotionSeed {
  return {
    xDirection: Math.random() < 0.5 ? -1 : 1,
    yDirection: Math.random() < 0.5 ? -1 : 1,
    xPhase: Math.random(),
    yPhase: Math.random(),
  };
}

function clampNumber(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function getResponsiveRadius(
  viewportWidth: number,
  minimum: number,
  viewportWidthFraction: number,
  maximum: number,
) {
  return clampNumber(
    viewportWidth * viewportWidthFraction,
    minimum,
    maximum,
  );
}

const ACTIVE_BACKGROUND_FPS = 12;
const RESTING_BACKGROUND_FPS = 12;
const ACTIVE_FRAME_INTERVAL_MS = 1000 / ACTIVE_BACKGROUND_FPS;
const RESTING_FRAME_INTERVAL_MS = 1000 / RESTING_BACKGROUND_FPS;
const ORBIT_SECONDS = 36;
const LOCAL_CLUSTER_COUNT = 18;
const LOCAL_CLUSTER_COLUMNS = 6;
const LOCAL_CLUSTER_ROWS = 3;
const LENS_X_EDGE_TO_EDGE_SECONDS = 31.5;
const LENS_Y_EDGE_TO_EDGE_SECONDS = 21.75;
const SECONDARY_LENS_X_EDGE_TO_EDGE_SECONDS = 27.5;
const SECONDARY_LENS_Y_EDGE_TO_EDGE_SECONDS = 19.75;
const TERTIARY_LENS_X_EDGE_TO_EDGE_SECONDS = 34.25;
const TERTIARY_LENS_Y_EDGE_TO_EDGE_SECONDS = 24.5;
const MACRO_LENS_SPEED_DIVISOR = 8;
const MACRO_SECONDARY_LENS_SPEED_DIVISOR = 7.25;
const GLOBAL_BASS_MIN_HZ = 20;
const GLOBAL_BASS_MAX_HZ = 110;

/*
 * The current production composition intentionally paints only the primary
 * desktop lens. Keep the auxiliary implementation available in source, but
 * do not mutate its hidden compositor surfaces every animation frame.
 */
const ENABLE_AUXILIARY_LENS_RUNTIME = false;

/*
 * Playback changes are intentionally filtered through a long visual
 * envelope. Brief pause/play state changes during source handoff should
 * barely affect the background, while deliberate pause/resume gestures
 * ease gently between resting drift and full motion.
 */
const PLAYBACK_MOTION_ATTACK_SECONDS = 14;
const PLAYBACK_MOTION_RELEASE_SECONDS = 24;
const RESTING_MOTION_RATE = 0.35;
const LENS_ZOOM_ATTACK_SECONDS = 2.2;
const LENS_ZOOM_RELEASE_SECONDS = 7;
const RESTING_BAND_ENERGY: BandEnergy = {
  low: 0.08,
  mid: 0.045,
  high: 0.03,
};

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

function pingPong(value: number) {
  const wrapped = ((value % 2) + 2) % 2;
  return wrapped <= 1 ? wrapped : 2 - wrapped;
}

function sampleBandEnergy(
  peaks: WaveformPeak[],
  peaksPerSecond: number,
  currentTime: number,
): BandEnergy {
  if (peaks.length === 0 || peaksPerSecond <= 0) {
    return { low: 0, mid: 0, high: 0 };
  }

  const position = Math.max(
    0,
    Math.min(
      peaks.length - 1,
      currentTime * peaksPerSecond,
    ),
  );
  const firstIndex = Math.floor(position);
  const secondIndex = Math.min(
    peaks.length - 1,
    firstIndex + 1,
  );
  const fraction = position - firstIndex;
  const first = peaks[firstIndex];
  const second = peaks[secondIndex];

  const interpolate = (index: 2 | 3 | 4) => {
    return clampUnit(
      first[index] +
        (second[index] - first[index]) * fraction,
    );
  };

  return {
    low: interpolate(2),
    mid: interpolate(3),
    high: interpolate(4),
  };
}

function sampleAnalyserBandEnergy(
  analyser: AnalyserNode,
  frequencyData: Uint8Array<ArrayBuffer>,
  minimumHz: number,
  maximumHz: number,
) {
  analyser.getByteFrequencyData(frequencyData);

  const binHz = analyser.context.sampleRate / analyser.fftSize;
  const firstBin = Math.max(
    1,
    Math.ceil(minimumHz / binHz),
  );
  const lastBin = Math.min(
    frequencyData.length - 1,
    Math.floor(maximumHz / binHz),
  );

  if (lastBin < firstBin) return 0;

  let sumSquares = 0;
  let binCount = 0;

  for (let index = firstBin; index <= lastBin; index += 1) {
    const normalized = frequencyData[index] / 255;
    sumSquares += normalized * normalized;
    binCount += 1;
  }

  return binCount > 0
    ? clampUnit(Math.sqrt(sumSquares / binCount))
    : 0;
}

function followEnergy(
  current: number,
  target: number,
  deltaSeconds: number,
) {
  const timeConstant = target > current ? 0.07 : 0.3;
  const amount = 1 - Math.exp(-deltaSeconds / timeConstant);

  return current + (target - current) * amount;
}

function followGlobalBass(
  current: number,
  target: number,
  deltaSeconds: number,
) {
  const timeConstant = target > current ? 0.22 : 0.7;
  const amount = 1 - Math.exp(-deltaSeconds / timeConstant);

  return current + (target - current) * amount;
}

function followPlaybackMotion(
  current: number,
  target: number,
  deltaSeconds: number,
) {
  const timeConstant =
    target > current
      ? PLAYBACK_MOTION_ATTACK_SECONDS
      : PLAYBACK_MOTION_RELEASE_SECONDS;
  const amount = 1 - Math.exp(-deltaSeconds / timeConstant);

  return current + (target - current) * amount;
}

function followLensZoom(
  current: number,
  target: number,
  deltaSeconds: number,
) {
  const timeConstant =
    target > current
      ? LENS_ZOOM_ATTACK_SECONDS
      : LENS_ZOOM_RELEASE_SECONDS;
  const amount = 1 - Math.exp(-deltaSeconds / timeConstant);

  return current + (target - current) * amount;
}

type LocalClusterZone = "outer" | "near" | "center";

function getLocalClusterZone(index: number): LocalClusterZone {
  const column = index % LOCAL_CLUSTER_COLUMNS;
  const row = Math.floor(index / LOCAL_CLUSTER_COLUMNS);
  const normalizedX =
    ((column + 0.5) / LOCAL_CLUSTER_COLUMNS - 0.5) * 2;
  const normalizedY =
    ((row + 0.5) / LOCAL_CLUSTER_ROWS - 0.5) * 2;
  const distanceFromCenter = Math.hypot(normalizedX, normalizedY);

  if (distanceFromCenter <= 0.35) return "center";
  if (distanceFromCenter <= 0.82) return "near";
  return "outer";
}

function renderClusters() {
  return Array.from({ length: LOCAL_CLUSTER_COUNT }, (_, index) => {
    const zone = getLocalClusterZone(index);

    return (
      <span
        className={`listen-reactive-background__cluster listen-reactive-background__cluster--${zone}`}
        key={index}
      />
    );
  });
}

export default function AudioReactiveListenBackground({
  audioRef,
  analyser,
  peaks,
  peaksPerSecond,
  isPlaying,
  isMetadataViewerOpen,
  mode,
}: AudioReactiveListenBackgroundProps) {
  const backgroundRef = useRef<HTMLDivElement | null>(null);
  const runtimeStateRef = useRef({
    analyser,
    peaks,
    peaksPerSecond,
    isPlaying,
    isMetadataViewerOpen,
    mode,
  });
  runtimeStateRef.current = {
    analyser,
    peaks,
    peaksPerSecond,
    isPlaying,
    isMetadataViewerOpen,
    mode,
  };
  const styleValueCacheRef = useRef<Map<string, string>>(new Map());
  const smoothedEnergyRef = useRef<BandEnergy>({
    low: RESTING_BAND_ENERGY.low,
    mid: RESTING_BAND_ENERGY.mid,
    high: RESTING_BAND_ENERGY.high,
  });
  const smoothedGlobalBassRef = useRef(RESTING_BAND_ENERGY.low);
  const smoothedLensZoomBassRef = useRef(RESTING_BAND_ENERGY.low);
  const playbackMotionEnvelopeRef = useRef(isPlaying ? 1 : 0);
  const frequencyDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const visualClockRef = useRef(0);
  const viewportSizeRef = useRef({
    width: 1,
    height: 1,
    lensRadius: 113.333,
    secondaryLensRadius: 84,
    tertiaryLensRadius: 72,
    macroLensRadius: 453.333,
    macroSecondaryLensRadius: 312,
  });
  const primaryLensSeedRef = useRef<LensMotionSeed>(
    createLensMotionSeed(),
  );
  const secondaryLensSeedRef = useRef<LensMotionSeed>(
    createLensMotionSeed(),
  );
  const tertiaryLensSeedRef = useRef<LensMotionSeed>(
    createLensMotionSeed(),
  );
  const macroLensSeedRef = useRef<LensMotionSeed>(
    createLensMotionSeed(),
  );
  const macroSecondaryLensSeedRef = useRef<LensMotionSeed>(
    createLensMotionSeed(),
  );

  useEffect(() => {
    const background = backgroundRef.current;
    if (!background) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    const syncViewportSize = () => {
      const width = Math.max(1, background.clientWidth);
      const height = Math.max(1, background.clientHeight);

      viewportSizeRef.current = {
        width,
        height,
        lensRadius: getResponsiveRadius(width, 113.333, 0.1, 240),
        secondaryLensRadius: getResponsiveRadius(width, 84, 0.07, 176),
        tertiaryLensRadius: getResponsiveRadius(width, 72, 0.06, 150),
        macroLensRadius: getResponsiveRadius(width, 453.333, 0.4, 960),
        macroSecondaryLensRadius: getResponsiveRadius(
          width,
          312,
          0.27,
          680,
        ),
      };
    };
    const resizeObserver = new ResizeObserver(syncViewportSize);
    resizeObserver.observe(background);
    syncViewportSize();

    let animationFrame = 0;
    let isDocumentVisible = document.visibilityState !== "hidden";
    let previousFrameTime = performance.now();
    let previousPaintTime = -Infinity;
    const styleValueCache = styleValueCacheRef.current;
    const setBackgroundStyle = (property: string, value: string) => {
      if (styleValueCache.get(property) === value) return;

      background.style.setProperty(property, value);
      styleValueCache.set(property, value);
    };

    const paint = (frameTime: number) => {
      const { analyser, peaks, peaksPerSecond, isPlaying, mode } =
        runtimeStateRef.current;
      const audio = audioRef.current;
      const currentTime = audio?.currentTime ?? 0;
      const sampledEnergy = sampleBandEnergy(
        peaks,
        peaksPerSecond,
        currentTime,
      );
      const deltaSeconds = Math.max(
        1 / 120,
        Math.min(0.1, (frameTime - previousFrameTime) / 1000),
      );
      previousFrameTime = frameTime;

      const playbackMotion = followPlaybackMotion(
        playbackMotionEnvelopeRef.current,
        isPlaying ? 1 : 0,
        deltaSeconds,
      );
      playbackMotionEnvelopeRef.current = playbackMotion;

      /*
       * Slow transport easing governs only background travel.
       * Music energy remains immediately responsive while playing.
       */
      const rawEnergy = isPlaying
        ? {
            low: clampUnit(
              RESTING_BAND_ENERGY.low + sampledEnergy.low * 0.88,
            ),
            mid: clampUnit(
              RESTING_BAND_ENERGY.mid + sampledEnergy.mid * 0.84,
            ),
            high: clampUnit(
              RESTING_BAND_ENERGY.high + sampledEnergy.high * 0.8,
            ),
          }
        : RESTING_BAND_ENERGY;

      /*
       * Never snap the lens/orbit clock between playing and paused.
       * Paused playback retains a slow ambient drift; resuming gradually
       * accelerates the exact same continuous clock.
       */
      const motionRate =
        RESTING_MOTION_RATE +
        playbackMotion * (1 - RESTING_MOTION_RATE);
      visualClockRef.current += deltaSeconds * motionRate;
      const motionTime = visualClockRef.current;

      const previousEnergy = smoothedEnergyRef.current;
      const nextEnergy = {
        low: followEnergy(
          previousEnergy.low,
          Math.pow(rawEnergy.low, 1.25),
          deltaSeconds,
        ),
        mid: followEnergy(
          previousEnergy.mid,
          Math.pow(rawEnergy.mid, 1.2),
          deltaSeconds,
        ),
        high: followEnergy(
          previousEnergy.high,
          Math.pow(rawEnergy.high, 1.16),
          deltaSeconds,
        ),
      };
      smoothedEnergyRef.current = nextEnergy;

      let globalBassTarget = clampUnit(0.08 + rawEnergy.low * 0.72);

      if (isPlaying && analyser) {
        let frequencyData = frequencyDataRef.current;
        if (
          !frequencyData ||
          frequencyData.length !== analyser.frequencyBinCount
        ) {
          frequencyData = new Uint8Array(analyser.frequencyBinCount);
          frequencyDataRef.current = frequencyData;
        }

        globalBassTarget = clampUnit(
          0.08 +
            Math.pow(
              sampleAnalyserBandEnergy(
                analyser,
                frequencyData,
                GLOBAL_BASS_MIN_HZ,
                GLOBAL_BASS_MAX_HZ,
              ),
              1.25,
            ) *
              0.72,
        );
      }

      const globalBass = followGlobalBass(
        smoothedGlobalBassRef.current,
        globalBassTarget,
        deltaSeconds,
      );
      smoothedGlobalBassRef.current = globalBass;

      const lensZoomBass = followLensZoom(
        smoothedLensZoomBassRef.current,
        globalBass,
        deltaSeconds,
      );
      smoothedLensZoomBassRef.current = lensZoomBass;

      const orbitRadians =
        (motionTime / ORBIT_SECONDS) * Math.PI * 2;
      const horizontalTravel = 2.1 + globalBass * 0.92;
      const verticalTravel = 1.45 + globalBass * 0.64;
      const x = Math.cos(orbitRadians) * horizontalTravel;
      const y = Math.sin(orbitRadians) * verticalTravel;
      const scale = 1.07 + globalBass * 0.03;

      const localCycle = Math.sin(
        (motionTime / 6.5) * Math.PI * 2,
      );
      const clusterOuterScale =
        1.008 + nextEnergy.low * 0.005 + nextEnergy.mid * 0.016;
      const clusterNearScale =
        1.01 + nextEnergy.low * 0.007 + nextEnergy.mid * 0.022;
      const clusterCenterScale =
        1.014 + nextEnergy.low * 0.01 + nextEnergy.mid * 0.034;
      const clusterOuterRotation =
        localCycle * (0.07 + nextEnergy.high * 0.34);
      const clusterNearRotation =
        localCycle * (0.1 + nextEnergy.high * 0.48);
      const clusterCenterRotation =
        localCycle * (0.14 + nextEnergy.high * 0.7);

      const primaryLensSeed = primaryLensSeedRef.current;
      const lensX =
        10 +
        pingPong(
          motionTime * primaryLensSeed.xDirection /
            LENS_X_EDGE_TO_EDGE_SECONDS +
            primaryLensSeed.xPhase,
        ) *
          80;
      const lensY =
        14 +
        pingPong(
          motionTime * primaryLensSeed.yDirection /
            LENS_Y_EDGE_TO_EDGE_SECONDS +
            primaryLensSeed.yPhase,
        ) *
          72;
      const secondaryLensSeed = secondaryLensSeedRef.current;
      const secondaryLensX =
        10 +
        pingPong(
          motionTime * secondaryLensSeed.xDirection /
            SECONDARY_LENS_X_EDGE_TO_EDGE_SECONDS +
            secondaryLensSeed.xPhase,
        ) *
          80;
      const secondaryLensY =
        14 +
        pingPong(
          motionTime * secondaryLensSeed.yDirection /
            SECONDARY_LENS_Y_EDGE_TO_EDGE_SECONDS +
            secondaryLensSeed.yPhase,
        ) *
          72;
      const tertiaryLensSeed = tertiaryLensSeedRef.current;
      const tertiaryLensX =
        10 +
        pingPong(
          motionTime * tertiaryLensSeed.xDirection /
            TERTIARY_LENS_X_EDGE_TO_EDGE_SECONDS +
            tertiaryLensSeed.xPhase,
        ) *
          80;
      const tertiaryLensY =
        14 +
        pingPong(
          motionTime * tertiaryLensSeed.yDirection /
            TERTIARY_LENS_Y_EDGE_TO_EDGE_SECONDS +
            tertiaryLensSeed.yPhase,
        ) *
          72;
      const macroLensSeed = macroLensSeedRef.current;
      const macroLensX =
        10 +
        pingPong(
          motionTime * macroLensSeed.xDirection /
            (LENS_X_EDGE_TO_EDGE_SECONDS *
              MACRO_LENS_SPEED_DIVISOR) +
            macroLensSeed.xPhase,
        ) *
          80;
      const macroLensY =
        14 +
        pingPong(
          motionTime * macroLensSeed.yDirection /
            (LENS_Y_EDGE_TO_EDGE_SECONDS *
              MACRO_LENS_SPEED_DIVISOR) +
            macroLensSeed.yPhase,
        ) *
          72;
      const macroSecondaryLensSeed =
        macroSecondaryLensSeedRef.current;
      const macroSecondaryLensX =
        10 +
        pingPong(
          motionTime * macroSecondaryLensSeed.xDirection /
            (LENS_X_EDGE_TO_EDGE_SECONDS *
              MACRO_SECONDARY_LENS_SPEED_DIVISOR) +
            macroSecondaryLensSeed.xPhase,
        ) *
          80;
      const macroSecondaryLensY =
        14 +
        pingPong(
          motionTime * macroSecondaryLensSeed.yDirection /
            (LENS_Y_EDGE_TO_EDGE_SECONDS *
              MACRO_SECONDARY_LENS_SPEED_DIVISOR) +
            macroSecondaryLensSeed.yPhase,
        ) *
          72;

      const {
        width: viewportWidth,
        height: viewportHeight,
        lensRadius,
        secondaryLensRadius,
        tertiaryLensRadius,
        macroLensRadius,
        macroSecondaryLensRadius,
      } = viewportSizeRef.current;
      const lensCenterX = (lensX / 100) * viewportWidth;
      const lensCenterY = (lensY / 100) * viewportHeight;
      const secondaryLensCenterX =
        (secondaryLensX / 100) * viewportWidth;
      const secondaryLensCenterY =
        (secondaryLensY / 100) * viewportHeight;
      const tertiaryLensCenterX =
        (tertiaryLensX / 100) * viewportWidth;
      const tertiaryLensCenterY =
        (tertiaryLensY / 100) * viewportHeight;
      const macroLensCenterX = (macroLensX / 100) * viewportWidth;
      const macroLensCenterY = (macroLensY / 100) * viewportHeight;
      const macroSecondaryLensCenterX =
        (macroSecondaryLensX / 100) * viewportWidth;
      const macroSecondaryLensCenterY =
        (macroSecondaryLensY / 100) * viewportHeight;

      const wateryMode = mode === "watery";
      const lensScale = wateryMode
        ? 1.08 + lensZoomBass * 0.035
        : 1.2 + lensZoomBass * 0.08;
      const secondaryLensScale = wateryMode
        ? 1.06 + lensZoomBass * 0.03
        : 1.16 + lensZoomBass * 0.06;
      const tertiaryLensScale = wateryMode
        ? 1.055 + lensZoomBass * 0.028
        : 1.145 + lensZoomBass * 0.055;
      const macroLensScale = wateryMode
        ? 1.03 + lensZoomBass * 0.018
        : 1.09 + lensZoomBass * 0.042;
      const macroSecondaryLensScale = wateryMode
        ? 1.025 + lensZoomBass * 0.016
        : 1.075 + lensZoomBass * 0.036;
      const lensDriftAmplitude = wateryMode
        ? 2 + nextEnergy.mid * 5
        : 0.7 + nextEnergy.mid * 1.5;
      const lensVerticalDriftAmplitude = wateryMode
        ? 1.8 + nextEnergy.high * 4.2
        : 0.55 + nextEnergy.high * 1.25;
      const macroDriftAmplitude = wateryMode
        ? 1.3 + nextEnergy.mid * 2.4
        : 0.35 + nextEnergy.mid * 0.7;
      const lensRotation = wateryMode
        ? Math.sin(motionTime * 1.12) * (0.16 + nextEnergy.high * 0.9)
        : Math.sin(motionTime * 0.9) * (0.04 + nextEnergy.high * 0.24);
      const secondaryLensRotation = wateryMode
        ? Math.cos(motionTime * 1.36) * (0.14 + nextEnergy.high * 0.78)
        : Math.cos(motionTime * 1.04) * (0.035 + nextEnergy.high * 0.2);
      const tertiaryLensRotation = wateryMode
        ? Math.sin(motionTime * 1.18 + tertiaryLensSeed.xPhase) *
          (0.12 + nextEnergy.high * 0.7)
        : Math.sin(motionTime * 0.92 + tertiaryLensSeed.xPhase) *
          (0.03 + nextEnergy.high * 0.18);
      const macroLensRotation = wateryMode
        ? Math.sin(motionTime * 0.54) * (0.08 + nextEnergy.high * 0.35)
        : Math.sin(motionTime * 0.42) * (0.02 + nextEnergy.high * 0.12);
      const macroSecondaryLensRotation = wateryMode
        ? Math.cos(motionTime * 0.49) * (0.065 + nextEnergy.high * 0.28)
        : Math.cos(motionTime * 0.38) * (0.016 + nextEnergy.high * 0.1);

      setBackgroundStyle(
        "--listen-bg-x",
        `${x.toFixed(3)}%`,
      );
      setBackgroundStyle(
        "--listen-bg-y",
        `${y.toFixed(3)}%`,
      );
      setBackgroundStyle(
        "--listen-bg-scale",
        scale.toFixed(4),
      );
      setBackgroundStyle(
        "--listen-bg-global-bass",
        globalBass.toFixed(4),
      );
      if (!isPlaying) {
        setBackgroundStyle(
          "--listen-bg-cluster-scale-outer",
          clusterOuterScale.toFixed(4),
        );
      setBackgroundStyle(
        "--listen-bg-cluster-scale-near",
        clusterNearScale.toFixed(4),
      );
      setBackgroundStyle(
        "--listen-bg-cluster-scale-center",
        clusterCenterScale.toFixed(4),
      );
      setBackgroundStyle(
        "--listen-bg-cluster-rotation-outer",
        `${clusterOuterRotation.toFixed(3)}deg`,
      );
      setBackgroundStyle(
        "--listen-bg-cluster-rotation-near",
        `${clusterNearRotation.toFixed(3)}deg`,
      );
        setBackgroundStyle(
          "--listen-bg-cluster-rotation-center",
          `${clusterCenterRotation.toFixed(3)}deg`,
        );
      }
      setBackgroundStyle(
        "--listen-bg-lens-x-px",
        `${lensCenterX.toFixed(2)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-lens-y-px",
        `${lensCenterY.toFixed(2)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-lens-bg-x",
        `${(lensRadius - lensCenterX).toFixed(2)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-lens-bg-y",
        `${(lensRadius - lensCenterY).toFixed(2)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-lens-scale",
        lensScale.toFixed(4),
      );
      setBackgroundStyle(
        "--listen-bg-lens-drift-x",
        `${(Math.sin(motionTime * 1.72) * lensDriftAmplitude).toFixed(3)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-lens-drift-y",
        `${(Math.cos(motionTime * 1.28) * lensVerticalDriftAmplitude).toFixed(3)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-lens-rotation",
        `${lensRotation.toFixed(3)}deg`,
      );
      if (ENABLE_AUXILIARY_LENS_RUNTIME) {
        setBackgroundStyle(
          "--listen-bg-secondary-lens-x-px",
        `${secondaryLensCenterX.toFixed(2)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-secondary-lens-y-px",
        `${secondaryLensCenterY.toFixed(2)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-secondary-lens-bg-x",
        `${(secondaryLensRadius - secondaryLensCenterX).toFixed(2)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-secondary-lens-bg-y",
        `${(secondaryLensRadius - secondaryLensCenterY).toFixed(2)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-secondary-lens-scale",
        secondaryLensScale.toFixed(4),
      );
      setBackgroundStyle(
        "--listen-bg-secondary-lens-drift-x",
        `${(Math.sin(motionTime * 1.84 + secondaryLensSeed.xPhase) * lensDriftAmplitude * 0.82).toFixed(3)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-secondary-lens-drift-y",
        `${(Math.cos(motionTime * 1.46 + secondaryLensSeed.yPhase) * lensVerticalDriftAmplitude * 0.82).toFixed(3)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-secondary-lens-rotation",
        `${secondaryLensRotation.toFixed(3)}deg`,
      );
      setBackgroundStyle(
        "--listen-bg-tertiary-lens-x-px",
        `${tertiaryLensCenterX.toFixed(2)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-tertiary-lens-y-px",
        `${tertiaryLensCenterY.toFixed(2)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-tertiary-lens-bg-x",
        `${(tertiaryLensRadius - tertiaryLensCenterX).toFixed(2)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-tertiary-lens-bg-y",
        `${(tertiaryLensRadius - tertiaryLensCenterY).toFixed(2)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-tertiary-lens-scale",
        tertiaryLensScale.toFixed(4),
      );
      setBackgroundStyle(
        "--listen-bg-tertiary-lens-drift-x",
        `${(Math.sin(motionTime * 1.57 + tertiaryLensSeed.xPhase) * lensDriftAmplitude * 0.72).toFixed(3)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-tertiary-lens-drift-y",
        `${(Math.cos(motionTime * 1.31 + tertiaryLensSeed.yPhase) * lensVerticalDriftAmplitude * 0.72).toFixed(3)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-tertiary-lens-rotation",
        `${tertiaryLensRotation.toFixed(3)}deg`,
      );
      setBackgroundStyle(
        "--listen-bg-macro-lens-x-px",
        `${macroLensCenterX.toFixed(2)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-macro-lens-y-px",
        `${macroLensCenterY.toFixed(2)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-macro-lens-bg-x",
        `${(macroLensRadius - macroLensCenterX).toFixed(2)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-macro-lens-bg-y",
        `${(macroLensRadius - macroLensCenterY).toFixed(2)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-macro-lens-scale",
        macroLensScale.toFixed(4),
      );
      setBackgroundStyle(
        "--listen-bg-macro-secondary-lens-x-px",
        `${macroSecondaryLensCenterX.toFixed(2)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-macro-secondary-lens-y-px",
        `${macroSecondaryLensCenterY.toFixed(2)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-macro-secondary-lens-bg-x",
        `${(macroSecondaryLensRadius - macroSecondaryLensCenterX).toFixed(2)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-macro-secondary-lens-bg-y",
        `${(macroSecondaryLensRadius - macroSecondaryLensCenterY).toFixed(2)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-macro-secondary-lens-scale",
        macroSecondaryLensScale.toFixed(4),
      );
      setBackgroundStyle(
        "--listen-bg-macro-lens-drift-x",
        `${(Math.sin(motionTime * 0.66) * macroDriftAmplitude).toFixed(3)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-macro-lens-drift-y",
        `${(Math.cos(motionTime * 0.58) * macroDriftAmplitude).toFixed(3)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-macro-lens-rotation",
        `${macroLensRotation.toFixed(3)}deg`,
      );
      setBackgroundStyle(
        "--listen-bg-macro-secondary-lens-drift-x",
        `${(Math.cos(motionTime * 0.61 + macroSecondaryLensSeed.xPhase) * macroDriftAmplitude * 0.82).toFixed(3)}px`,
      );
      setBackgroundStyle(
        "--listen-bg-macro-secondary-lens-drift-y",
        `${(Math.sin(motionTime * 0.53 + macroSecondaryLensSeed.yPhase) * macroDriftAmplitude * 0.82).toFixed(3)}px`,
      );
        setBackgroundStyle(
          "--listen-bg-macro-secondary-lens-rotation",
          `${macroSecondaryLensRotation.toFixed(3)}deg`,
        );
      }
      setBackgroundStyle(
        "--listen-bg-low",
        nextEnergy.low.toFixed(4),
      );
      setBackgroundStyle(
        "--listen-bg-mid",
        nextEnergy.mid.toFixed(4),
      );
      setBackgroundStyle(
        "--listen-bg-high",
        nextEnergy.high.toFixed(4),
      );
    };

    const scheduleAnimationFrame = () => {
      if (
        animationFrame ||
        !isDocumentVisible ||
        reducedMotion.matches
      ) {
        return;
      }

      animationFrame = window.requestAnimationFrame(animate);
    };

    const animate = (frameTime: number) => {
      animationFrame = 0;

      if (!isDocumentVisible || reducedMotion.matches) {
        return;
      }

      const { isPlaying, isMetadataViewerOpen } =
        runtimeStateRef.current;
      const frameInterval = isPlaying && !isMetadataViewerOpen
        ? ACTIVE_FRAME_INTERVAL_MS
        : RESTING_FRAME_INTERVAL_MS;

      if (frameTime - previousPaintTime >= frameInterval) {
        previousPaintTime = frameTime;
        paint(frameTime);
      }

      scheduleAnimationFrame();
    };

    const handleVisibilityChange = () => {
      isDocumentVisible = document.visibilityState !== "hidden";

      if (!isDocumentVisible) {
        if (animationFrame) {
          window.cancelAnimationFrame(animationFrame);
          animationFrame = 0;
        }
        return;
      }

      previousFrameTime = performance.now();
      previousPaintTime = -Infinity;
      scheduleAnimationFrame();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    if (isDocumentVisible) {
      paint(previousFrameTime);
      scheduleAnimationFrame();
    }

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
      resizeObserver.disconnect();

      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [audioRef]);

  return (
    <div
      ref={backgroundRef}
      className="listen-reactive-background"
      data-background-mode={mode}
      data-playback-active={isPlaying ? "true" : "false"}
      aria-hidden="true"
    >
      <div className="listen-reactive-background__field">
        <div className="listen-reactive-background__backplate" />

        <div className="listen-reactive-background__clusters">
          {renderClusters()}
        </div>

        <div className="listen-reactive-background__macro-lens-mask">
          <div className="listen-reactive-background__macro-lens-surface" />
        </div>

        <div className="listen-reactive-background__macro-secondary-lens-mask">
          <div className="listen-reactive-background__macro-secondary-lens-surface" />
        </div>

        <div className="listen-reactive-background__lens-mask">
          <div className="listen-reactive-background__lens-surface" />
        </div>

        <div className="listen-reactive-background__secondary-lens-mask">
          <div className="listen-reactive-background__secondary-lens-surface" />
        </div>

        <div className="listen-reactive-background__tertiary-lens-mask">
          <div className="listen-reactive-background__tertiary-lens-surface" />
        </div>
      </div>
    </div>
  );
}
