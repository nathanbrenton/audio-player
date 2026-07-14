#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 path/to/track-directory"
  exit 1
fi

TRACK_DIR="${1%/}"
TRACK_TOML="$TRACK_DIR/track.toml"
MASTER="$TRACK_DIR/audio-master.wav"
PLAYBACK="$TRACK_DIR/audio-playback.mp3"
WAVEFORM="$TRACK_DIR/waveform-peaks.json"
OUTPUT="$TRACK_DIR/track-analysis.json"

for command in ffmpeg ffprobe node shasum stat; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Error: required command not found: $command"
    exit 1
  fi
done

if [[ ! -d "$TRACK_DIR" ]]; then
  echo "Error: track directory not found:"
  echo "  $TRACK_DIR"
  exit 1
fi

if [[ ! -f "$TRACK_TOML" ]]; then
  echo "Error: track.toml not found:"
  echo "  $TRACK_TOML"
  exit 1
fi

TRACK_ID="$(
  sed -n \
    's/^[[:space:]]*id[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' \
    "$TRACK_TOML" \
    | head -1
)"

if [[ -z "$TRACK_ID" ]]; then
  echo "Error: unable to read track.id from:"
  echo "  $TRACK_TOML"
  exit 1
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

MASTER_JSON="$tmp_dir/master.json"
PLAYBACK_JSON="$tmp_dir/playback.json"
LOUDNESS_LOG="$tmp_dir/loudness.log"

if [[ -f "$MASTER" ]]; then
  ffprobe \
    -v error \
    -show_format \
    -show_streams \
    -of json \
    "$MASTER" \
    > "$MASTER_JSON"

  ffmpeg \
    -hide_banner \
    -nostats \
    -i "$MASTER" \
    -filter_complex ebur128=peak=true \
    -f null - \
    2> "$LOUDNESS_LOG" || true
else
  printf '{}\n' > "$MASTER_JSON"
  : > "$LOUDNESS_LOG"
fi

if [[ -f "$PLAYBACK" ]]; then
  ffprobe \
    -v error \
    -show_format \
    -show_streams \
    -of json \
    "$PLAYBACK" \
    > "$PLAYBACK_JSON"
else
  printf '{}\n' > "$PLAYBACK_JSON"
fi

node - \
  "$TRACK_ID" \
  "$MASTER" \
  "$PLAYBACK" \
  "$WAVEFORM" \
  "$MASTER_JSON" \
  "$PLAYBACK_JSON" \
  "$LOUDNESS_LOG" \
  "$OUTPUT" <<'NODE'
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");

const [
  trackId,
  masterPath,
  playbackPath,
  waveformPath,
  masterProbePath,
  playbackProbePath,
  loudnessLogPath,
  outputPath,
] = process.argv.slice(2);

function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function sha256(filePath) {
  if (!fileExists(filePath)) {
    return null;
  }

  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function fileSize(filePath) {
  return fileExists(filePath)
    ? fs.statSync(filePath).size
    : null;
}

function firstAudioStream(probe) {
  return Array.isArray(probe.streams)
    ? probe.streams.find(
        (stream) => stream.codec_type === "audio",
      ) ?? null
    : null;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function parseLoudness(log) {
  function lastMatch(pattern) {
    const matches = [...log.matchAll(pattern)];
    if (matches.length === 0) {
      return null;
    }

    return numberOrNull(
      matches[matches.length - 1][1],
    );
  }

  return {
    integratedLoudnessLufs:
      lastMatch(/\bI:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g),
    loudnessRangeLu:
      lastMatch(/\bLRA:\s*(-?\d+(?:\.\d+)?)\s*LU/g),
    truePeakDbtp:
      lastMatch(/\bPeak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/g),
    maximumMomentaryLoudnessLufs: null,
    maximumShortTermLoudnessLufs: null,
    replayGainTrackGainDb: null,
    replayGainTrackPeak: null,
  };
}

function summarizeAudio(filePath, probe, includeBitDepth) {
  const stream = firstAudioStream(probe);
  const format = probe.format ?? {};

  return {
    path: path.basename(filePath),
    exists: fileExists(filePath),
    durationSeconds:
      numberOrNull(format.duration) ??
      numberOrNull(stream?.duration),
    sampleRateHz:
      integerOrNull(stream?.sample_rate),
    ...(includeBitDepth
      ? {
          bitDepth:
            integerOrNull(stream?.bits_per_raw_sample) ??
            integerOrNull(stream?.bits_per_sample),
        }
      : {}),
    channels:
      integerOrNull(stream?.channels),
    channelLayout:
      stream?.channel_layout ?? null,
    container:
      format.format_name ?? null,
    codec:
      stream?.codec_name ?? null,
    bitrateBps:
      integerOrNull(format.bit_rate) ??
      integerOrNull(stream?.bit_rate),
    ...(includeBitDepth
      ? {}
      : {
          bitrateMode: null,
        }),
    fileSizeBytes:
      fileSize(filePath),
    sha256:
      sha256(filePath),
  };
}

const masterProbe = readJson(masterProbePath);
const playbackProbe = readJson(playbackProbePath);
const waveform = readJson(waveformPath, null);
const loudnessLog = fs.readFileSync(
  loudnessLogPath,
  "utf8",
);

const master = summarizeAudio(
  masterPath,
  masterProbe,
  true,
);

const playback = summarizeAudio(
  playbackPath,
  playbackProbe,
  false,
);

const waveformSummary = {
  path: path.basename(waveformPath),
  exists: fileExists(waveformPath),
  version: waveform?.version ?? null,
  durationSeconds:
    waveform?.duration ?? null,
  peaksPerSecond:
    waveform?.peaksPerSecond ?? null,
  peakCount:
    waveform?.peakCount ?? null,
  fftSize:
    waveform?.analysis?.fftSize ??
    waveform?.fftSize ??
    null,
  windowFunction:
    waveform?.analysis?.windowFunction ??
    waveform?.windowFunction ??
    null,
  frequencyBands:
    waveform?.analysis?.frequencyBands ??
    waveform?.frequencyBands ??
    [],
  normalization:
    waveform?.analysis?.normalization ??
    waveform?.normalization ??
    null,
  compression:
    waveform?.analysis?.compression ??
    waveform?.compression ??
    null,
};

const tolerance = 0.1;

function durationsMatch(first, second) {
  if (
    first === null ||
    second === null
  ) {
    return null;
  }

  return Math.abs(first - second) <= tolerance;
}

const analysis = {
  schema: {
    name: "audio-track-analysis",
    version: 1,
  },
  trackReference: {
    trackId,
  },
  generation: {
    generatedAt: new Date().toISOString(),
    generator: "scripts/generate-track-analysis.sh",
    generatorVersion: 1,
  },
  sources: {
    audioMaster: "audio-master.wav",
    audioPlayback: "audio-playback.mp3",
    waveformPeaks: "waveform-peaks.json",
  },
  master,
  playback,
  loudness: {
    source: "audio-master.wav",
    ...parseLoudness(loudnessLog),
  },
  waveform: waveformSummary,
  validation: {
    masterPlaybackDurationMatch:
      durationsMatch(
        master.durationSeconds,
        playback.durationSeconds,
      ),
    waveformDurationMatch:
      durationsMatch(
        master.durationSeconds,
        waveformSummary.durationSeconds,
      ),
    notices: [],
    errors: [],
  },
};

fs.writeFileSync(
  outputPath,
  `${JSON.stringify(analysis, null, 2)}\n`,
);
NODE

echo "Created:"
echo "  $OUTPUT"
