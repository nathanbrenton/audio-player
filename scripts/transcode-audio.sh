#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
    echo "Usage: $0 path/to/track-directory"
    exit 1
fi

TRACK_DIR="${1%/}"

if [[ ! -d "$TRACK_DIR" ]]; then
    echo "Error: track directory not found:"
    echo "  $TRACK_DIR"
    exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "Error: required command not found: ffmpeg"
    exit 1
fi

INPUT="$TRACK_DIR/audio-master.wav"

if [[ ! -f "$INPUT" ]]; then
    WAV_FILES=()

    for FILE in "$TRACK_DIR"/*.wav "$TRACK_DIR"/*.WAV; do
        if [[ -f "$FILE" ]]; then
            WAV_FILES+=("$FILE")
        fi
    done

    if [[ ${#WAV_FILES[@]} -eq 1 ]]; then
        INPUT="${WAV_FILES[0]}"
        echo "Notice: using legacy WAV filename:"
        echo "  $INPUT"
    elif [[ ${#WAV_FILES[@]} -eq 0 ]]; then
        echo "Error: no WAV master found in:"
        echo "  $TRACK_DIR"
        exit 1
    else
        echo "Error: multiple WAV files found."
        echo "Rename the intended master to:"
        echo "  $TRACK_DIR/audio-master.wav"
        exit 1
    fi
fi

OUTPUT="$TRACK_DIR/audio-playback.mp3"

echo "Input:  $INPUT"
echo "Output: $OUTPUT"

ffmpeg \
    -hide_banner \
    -y \
    -i "$INPUT" \
    -map_metadata 0 \
    -codec:a libmp3lame \
    -b:a 320k \
    -id3v2_version 3 \
    "$OUTPUT"

echo
echo "Created:"
echo "  $OUTPUT"
