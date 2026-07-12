#!/usr/bin/env bash
set -euo pipefail

#
# Prepare browser-ready audio and waveform assets for every track.
#
# Default behavior:
#   - Create audio-playback.mp3 only when missing.
#   - Create waveform-peaks.json when missing.
#   - Regenerate existing waveforms when their resolution is not 400 pps.
#   - Preserve existing 400 pps waveforms.
#
# Usage:
#   scripts/prepare-media-library.sh
#   scripts/prepare-media-library.sh --force-audio
#   scripts/prepare-media-library.sh --force-waveforms
#   scripts/prepare-media-library.sh --force-all
#   scripts/prepare-media-library.sh --peaks-per-second 400
#   scripts/prepare-media-library.sh path/to/releases-root
#

DEFAULT_RELEASES_ROOT="media-library/releases"
DEFAULT_PEAKS_PER_SECOND=400

RELEASES_ROOT="$DEFAULT_RELEASES_ROOT"
PEAKS_PER_SECOND="$DEFAULT_PEAKS_PER_SECOND"
FORCE_AUDIO=false
FORCE_WAVEFORMS=false

PROJECT_ROOT="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/.." &&
  pwd
)"

TRANSCODE_SCRIPT="$PROJECT_ROOT/scripts/transcode-audio.sh"
WAVEFORM_GENERATOR="$PROJECT_ROOT/scripts/generate-waveform-peaks.mjs"
CATALOG_GENERATOR="$PROJECT_ROOT/scripts/generate-media-catalog.mjs"

usage() {
  cat <<'USAGE'
Usage:
  scripts/prepare-media-library.sh [RELEASES_ROOT] [OPTIONS]

Options:
  --peaks-per-second NUMBER
      Waveform resolution. Default: 400.

  --force-audio
      Regenerate all audio-playback.mp3 files.

  --force-waveforms
      Regenerate all waveform-peaks.json files.

  --force-all
      Regenerate both MP3 and waveform files.

  -h, --help
      Show this help text.

Examples:
  scripts/prepare-media-library.sh

  scripts/prepare-media-library.sh \
    --peaks-per-second 400

  scripts/prepare-media-library.sh \
    media-library/releases \
    --force-waveforms
USAGE
}

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

get_waveform_resolution() {
  WAVEFORM_FILE="$1"

  node -e '
    const fs = require("node:fs");

    try {
      const waveform = JSON.parse(
        fs.readFileSync(process.argv[1], "utf8"),
      );

      if (Number.isInteger(waveform.peaksPerSecond)) {
        process.stdout.write(
          String(waveform.peaksPerSecond),
        );
      }
    } catch {
      process.exitCode = 1;
    }
  ' "$WAVEFORM_FILE"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --peaks-per-second)
      [[ $# -ge 2 ]] ||
        fail "--peaks-per-second requires a value"

      PEAKS_PER_SECOND="$2"
      shift 2
      ;;

    --force-audio)
      FORCE_AUDIO=true
      shift
      ;;

    --force-waveforms)
      FORCE_WAVEFORMS=true
      shift
      ;;

    --force-all)
      FORCE_AUDIO=true
      FORCE_WAVEFORMS=true
      shift
      ;;

    -h|--help)
      usage
      exit 0
      ;;

    -*)
      fail "unknown option: $1"
      ;;

    *)
      if [[ "$RELEASES_ROOT" != "$DEFAULT_RELEASES_ROOT" ]]; then
        fail "only one releases-root path may be supplied"
      fi

      RELEASES_ROOT="$1"
      shift
      ;;
  esac
done

if ! [[ "$PEAKS_PER_SECOND" =~ ^[0-9]+$ ]]; then
  fail "peaks per second must be an integer"
fi

if \
  [[ "$PEAKS_PER_SECOND" -lt 1 ]] ||
  [[ "$PEAKS_PER_SECOND" -gt 1000 ]]
then
  fail "peaks per second must be between 1 and 1000"
fi

if [[ ! -d "$RELEASES_ROOT" ]]; then
  fail "releases root not found: $RELEASES_ROOT"
fi

for REQUIRED_FILE in \
  "$TRANSCODE_SCRIPT" \
  "$WAVEFORM_GENERATOR"
do
  if [[ ! -f "$REQUIRED_FILE" ]]; then
    fail "required script not found: $REQUIRED_FILE"
  fi
done

for COMMAND in ffmpeg node find; do
  if ! command -v "$COMMAND" >/dev/null 2>&1; then
    fail "required command not found: $COMMAND"
  fi
done

FOUND_TRACKS=0
MISSING_MASTERS=0

AUDIO_CREATED=0
AUDIO_SKIPPED=0
AUDIO_FAILED=0

WAVEFORMS_CREATED=0
WAVEFORMS_REGENERATED=0
WAVEFORMS_SKIPPED=0
WAVEFORMS_FAILED=0

while IFS= read -r -d '' TRACK_DIR; do
  FOUND_TRACKS=$((FOUND_TRACKS + 1))

  TRACK_NAME="$(basename "$TRACK_DIR")"
  AUDIO_MASTER="$TRACK_DIR/audio-master.wav"
  AUDIO_PLAYBACK="$TRACK_DIR/audio-playback.mp3"
  WAVEFORM="$TRACK_DIR/waveform-peaks.json"

  printf '\n=== %s ===\n' "$TRACK_NAME"

  if [[ ! -f "$AUDIO_MASTER" ]]; then
    printf 'Missing: audio-master.wav\n'
    MISSING_MASTERS=$((MISSING_MASTERS + 1))
    continue
  fi

  #
  # Generate the browser playback MP3.
  #
  if \
    [[ "$FORCE_AUDIO" == true ]] ||
    [[ ! -f "$AUDIO_PLAYBACK" ]]
  then
    if "$TRANSCODE_SCRIPT" "$TRACK_DIR"; then
      AUDIO_CREATED=$((AUDIO_CREATED + 1))
    else
      AUDIO_FAILED=$((AUDIO_FAILED + 1))
    fi
  else
    printf 'Skipped: audio-playback.mp3 already exists\n'
    AUDIO_SKIPPED=$((AUDIO_SKIPPED + 1))
  fi

  #
  # Generate or validate the waveform resolution.
  #
  GENERATE_WAVEFORM=false
  REGENERATING=false

  if [[ "$FORCE_WAVEFORMS" == true ]]; then
    GENERATE_WAVEFORM=true
    REGENERATING=true
  elif [[ ! -f "$WAVEFORM" ]]; then
    GENERATE_WAVEFORM=true
  else
    EXISTING_RESOLUTION="$(
      get_waveform_resolution "$WAVEFORM" || true
    )"

    if [[ "$EXISTING_RESOLUTION" != "$PEAKS_PER_SECOND" ]]; then
      printf \
        'Waveform resolution: %s -> %s peaks/s\n' \
        "${EXISTING_RESOLUTION:-unknown}" \
        "$PEAKS_PER_SECOND"

      GENERATE_WAVEFORM=true
      REGENERATING=true
    fi
  fi

  if [[ "$GENERATE_WAVEFORM" == true ]]; then
    if node \
      "$WAVEFORM_GENERATOR" \
      "$TRACK_DIR" \
      "$PEAKS_PER_SECOND"
    then
      if [[ "$REGENERATING" == true ]]; then
        WAVEFORMS_REGENERATED=$((WAVEFORMS_REGENERATED + 1))
      else
        WAVEFORMS_CREATED=$((WAVEFORMS_CREATED + 1))
      fi
    else
      WAVEFORMS_FAILED=$((WAVEFORMS_FAILED + 1))
    fi
  else
    printf \
      'Skipped: waveform already uses %s peaks/s\n' \
      "$PEAKS_PER_SECOND"

    WAVEFORMS_SKIPPED=$((WAVEFORMS_SKIPPED + 1))
  fi
done < <(
  find "$RELEASES_ROOT" \
    -type d \
    -path '*/tracks/*' \
    -print0 \
    | sort -z
)

if [[ "$FOUND_TRACKS" -eq 0 ]]; then
  fail "no track directories found under: $RELEASES_ROOT"
fi

printf '\nMedia preparation summary\n'
printf '  Track directories:      %s\n' "$FOUND_TRACKS"
printf '  Missing masters:        %s\n' "$MISSING_MASTERS"
printf '\n'
printf '  MP3 created:            %s\n' "$AUDIO_CREATED"
printf '  MP3 skipped:            %s\n' "$AUDIO_SKIPPED"
printf '  MP3 failed:             %s\n' "$AUDIO_FAILED"
printf '\n'
printf '  Waveforms created:      %s\n' "$WAVEFORMS_CREATED"
printf '  Waveforms regenerated:  %s\n' "$WAVEFORMS_REGENERATED"
printf '  Waveforms skipped:      %s\n' "$WAVEFORMS_SKIPPED"
printf '  Waveforms failed:       %s\n' "$WAVEFORMS_FAILED"

if [[ -f "$CATALOG_GENERATOR" ]]; then
  printf '\nRegenerating media catalog...\n'
  node "$CATALOG_GENERATOR"
fi

if \
  [[ "$AUDIO_FAILED" -gt 0 ]] ||
  [[ "$WAVEFORMS_FAILED" -gt 0 ]]
then
  exit 1
fi
