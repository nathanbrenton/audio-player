#!/usr/bin/env bash
set -euo pipefail

#
# Convert release-level or track-level artwork-master files into
# browser-friendly artwork.webp files for the React audio player.
#
# Usage:
#   ./scripts/transcode-artwork.sh path/to/release-or-track-directory
#   ./scripts/transcode-artwork.sh path/to/directory --force
#   ./scripts/transcode-artwork.sh --all
#   ./scripts/transcode-artwork.sh --all --force
#   ./scripts/transcode-artwork.sh --all path/to/releases-root
#

DEFAULT_RELEASES_ROOT="media-library/releases"
MAXIMUM_SIZE=1200
WEBP_QUALITY=85
WEBP_METHOD=6

PROCESS_ALL=false
FORCE=false
TARGET_PATH=""

usage() {
  cat <<'USAGE'
Usage:
  scripts/transcode-artwork.sh DIRECTORY [--force]
  scripts/transcode-artwork.sh --all [RELEASES_ROOT] [--force]

Examples:
  scripts/transcode-artwork.sh \
    media-library/releases/2025-01-01_midi-mockups

  scripts/transcode-artwork.sh \
    media-library/releases/2026-12-14_scale-matters/tracks/example_01_track \
    --force

  scripts/transcode-artwork.sh --all

  scripts/transcode-artwork.sh \
    --all \
    media-library/releases \
    --force

Behavior:
  - Finds artwork-master.png, .jpg, .jpeg, .tif, or .tiff.
  - Requires square source artwork.
  - Creates artwork.webp beside the master.
  - Limits output to 1200x1200 without enlarging smaller sources.
  - Skips existing artwork.webp unless --force is supplied.
USAGE
}

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "required command not found: $1"
  fi
}

find_artwork_master() {
  DIRECTORY="$1"

  for CANDIDATE in \
    "$DIRECTORY/artwork-master.png" \
    "$DIRECTORY/artwork-master.PNG" \
    "$DIRECTORY/artwork-master.jpg" \
    "$DIRECTORY/artwork-master.JPG" \
    "$DIRECTORY/artwork-master.jpeg" \
    "$DIRECTORY/artwork-master.JPEG" \
    "$DIRECTORY/artwork-master.tif" \
    "$DIRECTORY/artwork-master.TIF" \
    "$DIRECTORY/artwork-master.tiff" \
    "$DIRECTORY/artwork-master.TIFF"
  do
    if [[ -f "$CANDIDATE" ]]; then
      printf '%s\n' "$CANDIDATE"
      return 0
    fi
  done

  return 1
}

transcode_directory() {
  DIRECTORY="${1%/}"
  OUTPUT="$DIRECTORY/artwork.webp"

  if ! INPUT="$(find_artwork_master "$DIRECTORY")"; then
    printf 'Missing: %s/artwork-master.*\n' "$DIRECTORY"
    return 2
  fi

  if [[ -f "$OUTPUT" && "$FORCE" != true ]]; then
    printf 'Skipped: %s\n' "$OUTPUT"
    return 3
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

  if \
    [[ -z "$WIDTH" ]] ||
    [[ -z "$HEIGHT" ]] ||
    [[ "$WIDTH" == "$DIMENSIONS" ]]
  then
    printf 'Failed: unable to determine dimensions: %s\n' "$INPUT" >&2
    return 1
  fi

  if [[ "$WIDTH" -ne "$HEIGHT" ]]; then
    printf \
      'Failed: artwork must be square: %s (%sx%s)\n' \
      "$INPUT" \
      "$WIDTH" \
      "$HEIGHT" \
      >&2

    return 1
  fi

  TARGET_SIZE="$WIDTH"

  if [[ "$TARGET_SIZE" -gt "$MAXIMUM_SIZE" ]]; then
    TARGET_SIZE="$MAXIMUM_SIZE"
  fi

  printf '\nInput:      %s\n' "$INPUT"
  printf 'Dimensions: %sx%s\n' "$WIDTH" "$HEIGHT"
  printf 'Target:     %sx%s\n' "$TARGET_SIZE" "$TARGET_SIZE"
  printf 'Output:     %s\n' "$OUTPUT"

  cwebp \
    -quiet \
    -q "$WEBP_QUALITY" \
    -m "$WEBP_METHOD" \
    -metadata icc \
    -resize "$TARGET_SIZE" "$TARGET_SIZE" \
    "$INPUT" \
    -o "$OUTPUT"

  printf 'Created:    %s\n' "$OUTPUT"
  return 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)
      PROCESS_ALL=true
      shift
      ;;

    --force)
      FORCE=true
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
      if [[ -n "$TARGET_PATH" ]]; then
        fail "only one directory path may be supplied"
      fi

      TARGET_PATH="$1"
      shift
      ;;
  esac
done

require_command ffprobe
require_command cwebp
require_command find
require_command mktemp

if [[ "$PROCESS_ALL" == true ]]; then
  RELEASES_ROOT="${TARGET_PATH:-$DEFAULT_RELEASES_ROOT}"

  if [[ ! -d "$RELEASES_ROOT" ]]; then
    fail "releases root not found: $RELEASES_ROOT"
  fi

  DIRECTORY_LIST="$(mktemp)"
  trap 'rm -f "$DIRECTORY_LIST"' EXIT

  find "$RELEASES_ROOT" \
    -type f \
    \( \
      -iname 'artwork-master.png' \
      -o -iname 'artwork-master.jpg' \
      -o -iname 'artwork-master.jpeg' \
      -o -iname 'artwork-master.tif' \
      -o -iname 'artwork-master.tiff' \
    \) \
    -exec dirname {} \; \
    | sort -u \
    > "$DIRECTORY_LIST"

  CREATED=0
  SKIPPED=0
  FAILED=0

  while IFS= read -r DIRECTORY; do
    [[ -n "$DIRECTORY" ]] || continue

    set +e
    transcode_directory "$DIRECTORY"
    RESULT=$?
    set -e

    case "$RESULT" in
      0)
        CREATED=$((CREATED + 1))
        ;;

      3)
        SKIPPED=$((SKIPPED + 1))
        ;;

      *)
        FAILED=$((FAILED + 1))
        ;;
    esac
  done < "$DIRECTORY_LIST"

  printf '\nArtwork transcode summary\n'
  printf '  Created: %s\n' "$CREATED"
  printf '  Skipped: %s\n' "$SKIPPED"
  printf '  Failed:  %s\n' "$FAILED"

  if [[ "$FAILED" -gt 0 ]]; then
    exit 1
  fi

  exit 0
fi

if [[ -z "$TARGET_PATH" ]]; then
  usage
  exit 1
fi

if [[ ! -d "$TARGET_PATH" ]]; then
  fail "directory not found: $TARGET_PATH"
fi

transcode_directory "$TARGET_PATH"
