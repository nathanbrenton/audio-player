#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
    echo "Usage: $0 path/to/release-directory"
    exit 1
fi

RELEASE_DIR="${1%/}"

if [[ ! -d "$RELEASE_DIR" ]]; then
    echo "Error: release directory not found:"
    echo "  $RELEASE_DIR"
    exit 1
fi

for COMMAND in ffprobe cwebp; do
    if ! command -v "$COMMAND" >/dev/null 2>&1; then
        echo "Error: required command not found: $COMMAND"
        exit 1
    fi
done

INPUT=""

for CANDIDATE in \
    "$RELEASE_DIR/artwork-master.png" \
    "$RELEASE_DIR/artwork-master.PNG" \
    "$RELEASE_DIR/artwork-master.jpg" \
    "$RELEASE_DIR/artwork-master.JPG" \
    "$RELEASE_DIR/artwork-master.jpeg" \
    "$RELEASE_DIR/artwork-master.JPEG" \
    "$RELEASE_DIR/artwork-master.tif" \
    "$RELEASE_DIR/artwork-master.TIF" \
    "$RELEASE_DIR/artwork-master.tiff" \
    "$RELEASE_DIR/artwork-master.TIFF"
do
    if [[ -f "$CANDIDATE" ]]; then
        INPUT="$CANDIDATE"
        break
    fi
done

if [[ -z "$INPUT" ]]; then
    echo "Error: artwork master not found."
    echo "Expected a file named artwork-master with one of these extensions:"
    echo "  .png, .jpg, .jpeg, .tif, or .tiff"
    exit 1
fi

DIMENSIONS="$(
    ffprobe \
        -v error \
        -select_streams v:0 \
        -show_entries stream=width,height \
        -of csv=s=x:p=0 \
        "$INPUT"
)"

WIDTH="${DIMENSIONS%x*}"
HEIGHT="${DIMENSIONS#*x}"

if [[ -z "$WIDTH" || -z "$HEIGHT" ]]; then
    echo "Error: unable to determine artwork dimensions"
    exit 1
fi

if [[ "$WIDTH" -ne "$HEIGHT" ]]; then
    echo "Error: master artwork must be square"
    echo "Detected dimensions: ${WIDTH}x${HEIGHT}"
    exit 1
fi

TARGET_SIZE="$WIDTH"

if [[ "$TARGET_SIZE" -gt 1200 ]]; then
    TARGET_SIZE=1200
fi

OUTPUT="$RELEASE_DIR/artwork.webp"

echo "Input:      $INPUT"
echo "Dimensions: ${WIDTH}x${HEIGHT}"
echo "Target:     ${TARGET_SIZE}x${TARGET_SIZE}"
echo "Output:     $OUTPUT"

cwebp \
    -quiet \
    -q 85 \
    -m 6 \
    -metadata icc \
    -resize "$TARGET_SIZE" "$TARGET_SIZE" \
    "$INPUT" \
    -o "$OUTPUT"

echo
echo "Created:"
echo "  $OUTPUT"
