#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
    echo "Usage: $0 path/to/release-directory"
    exit 1
fi

RELEASE_DIR="${1%/}"
TRACKS_DIR="$RELEASE_DIR/tracks"
GENERATOR="scripts/generate-waveform-peaks.mjs"

if [[ ! -d "$RELEASE_DIR" ]]; then
    echo "Error: release directory not found:"
    echo "  $RELEASE_DIR"
    exit 1
fi

if [[ ! -d "$TRACKS_DIR" ]]; then
    echo "Error: tracks directory not found:"
    echo "  $TRACKS_DIR"
    exit 1
fi

if [[ ! -f "$GENERATOR" ]]; then
    echo "Error: waveform generator not found:"
    echo "  $GENERATOR"
    exit 1
fi

if ! command -v node >/dev/null 2>&1; then
    echo "Error: required command not found: node"
    exit 1
fi

FOUND_TRACKS=0
GENERATED=0
SKIPPED=0
MISSING_MASTER=0

for TRACK_DIR in "$TRACKS_DIR"/*; do
    if [[ ! -d "$TRACK_DIR" ]]; then
        continue
    fi

    FOUND_TRACKS=$((FOUND_TRACKS + 1))

    INPUT="$TRACK_DIR/audio-master.wav"
    OUTPUT="$TRACK_DIR/waveform-peaks.json"
    TRACK_NAME="$(basename "$TRACK_DIR")"

    if [[ ! -f "$INPUT" ]]; then
        echo "Skipping: $TRACK_NAME"
        echo "  Missing audio-master.wav"
        MISSING_MASTER=$((MISSING_MASTER + 1))
        continue
    fi

    if [[ -f "$OUTPUT" ]]; then
        echo "Skipping: $TRACK_NAME"
        echo "  waveform-peaks.json already exists"
        SKIPPED=$((SKIPPED + 1))
        continue
    fi

    echo "Generating: $TRACK_NAME"

    node "$GENERATOR" "$TRACK_DIR"

    GENERATED=$((GENERATED + 1))
    echo
done

if [[ "$FOUND_TRACKS" -eq 0 ]]; then
    echo "No track directories found under:"
    echo "  $TRACKS_DIR"
    exit 1
fi

echo "Waveform generation complete."
echo "  Track directories: $FOUND_TRACKS"
echo "  Generated:         $GENERATED"
echo "  Already existed:   $SKIPPED"
echo "  Missing masters:   $MISSING_MASTER"
