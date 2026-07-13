#!/usr/bin/env node

import {
  access,
  readdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/*
 * Resolve the default media library relative to the project root,
 * rather than relative to the shell's current working directory.
 */
const scriptDirectory = path.dirname(
  fileURLToPath(import.meta.url),
);
const projectRoot = path.resolve(
  scriptDirectory,
  "..",
);
const DEFAULT_LIBRARY_ROOT = path.join(
  projectRoot,
  "media-library",
);
const CATALOG_VERSION = 1;

/*
 * Convert a filesystem identifier into a temporary display label.
 * Explicit release.json and metadata.json values can replace these
 * generated labels later.
 */
function formatIdentifier(value) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function toMediaPath(libraryRoot, filePath) {
  const relativePath = path.relative(
    libraryRoot,
    filePath,
  );

  return relativePath
    .split(path.sep)
    .join("/");
}

/*
 * Parse a release directory such as:
 * 2026-12-14_scale-matters
 */
function parseReleaseDirectory(directoryName) {
  const match = directoryName.match(
    /^(\d{4}-\d{2}-\d{2})_(.+)$/,
  );

  if (!match) {
    return {
      date: null,
      title: formatIdentifier(directoryName),
    };
  }

  return {
    date: match[1],
    title: formatIdentifier(match[2]),
  };
}

/*
 * Parse a track directory such as:
 * artist_03_track-title-original-mix
 *
 * Some current directories do not yet fully match the convention,
 * so parsing is deliberately tolerant.
 */
function parseTrackDirectory(directoryName) {
  const match = directoryName.match(
    /^(.+?)_(\d{2})_(.+)$/,
  );

  if (!match) {
    return {
      artist: null,
      trackNumber: null,
      title: formatIdentifier(directoryName),
    };
  }

  return {
    artist: formatIdentifier(match[1]),
    trackNumber: Number(match[2]),
    title: formatIdentifier(match[3]),
  };
}

async function getChildDirectories(directoryPath) {
  const entries = await readdir(
    directoryPath,
    {
      withFileTypes: true,
    },
  );

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((first, second) =>
      first.localeCompare(second),
    );
}

async function buildTrack(
  libraryRoot,
  releaseDirectory,
  trackDirectory,
  releaseArtworkPath,
) {
  const trackPath = path.join(
    releaseDirectory,
    "tracks",
    trackDirectory,
  );

  /*
   * Track-specific artwork lives beneath the track's artwork/
   * directory.
   */
  const artworkFile = path.join(
    trackPath,
    "artwork",
    "artwork.webp",
  );
  const audioMasterFile = path.join(
    trackPath,
    "audio-master.wav",
  );
  const audioPlaybackFile = path.join(
    trackPath,
    "audio-playback.mp3",
  );
  const waveformFile = path.join(
    trackPath,
    "waveform-peaks.json",
  );
  const metadataFile = path.join(
    trackPath,
    "metadata.json",
  );

  const [
    hasTrackArtwork,
    hasAudioMaster,
    hasAudioPlayback,
    hasWaveform,
    hasMetadata,
  ] = await Promise.all([
    pathExists(artworkFile),
    pathExists(audioMasterFile),
    pathExists(audioPlaybackFile),
    pathExists(waveformFile),
    pathExists(metadataFile),
  ]);

  const parsed = parseTrackDirectory(trackDirectory);

  const artworkPath = hasTrackArtwork
    ? toMediaPath(libraryRoot, artworkFile)
    : releaseArtworkPath;

  return {
    id: trackDirectory,
    directory: toMediaPath(
      libraryRoot,
      trackPath,
    ),
    artist: parsed.artist,
    trackNumber: parsed.trackNumber,
    title: parsed.title,

    artwork: {
      source:
        hasTrackArtwork
          ? "track"
          : releaseArtworkPath
            ? "release"
            : null,
      path: artworkPath,
    },

    assets: {
      audioMaster: hasAudioMaster
        ? toMediaPath(libraryRoot, audioMasterFile)
        : null,
      audioPlayback: hasAudioPlayback
        ? toMediaPath(libraryRoot, audioPlaybackFile)
        : null,
      waveform: hasWaveform
        ? toMediaPath(libraryRoot, waveformFile)
        : null,
      metadata: hasMetadata
        ? toMediaPath(libraryRoot, metadataFile)
        : null,
    },

    playable:
      hasAudioPlayback &&
      hasWaveform,
  };
}

async function buildRelease(
  libraryRoot,
  releasesRoot,
  releaseDirectoryName,
) {
  const releaseDirectory = path.join(
    releasesRoot,
    releaseDirectoryName,
  );

  /*
   * The release front cover is the fallback artwork for tracks
   * that do not provide their own artwork.
   */
  const artworkFile = path.join(
    releaseDirectory,
    "artwork",
    "front",
    "artwork.webp",
  );
  const releaseMetadataFile = path.join(
    releaseDirectory,
    "release.json",
  );
  const tracksDirectory = path.join(
    releaseDirectory,
    "tracks",
  );

  const [
    hasArtwork,
    hasReleaseMetadata,
    hasTracksDirectory,
  ] = await Promise.all([
    pathExists(artworkFile),
    pathExists(releaseMetadataFile),
    pathExists(tracksDirectory),
  ]);

  const releaseArtworkPath = hasArtwork
    ? toMediaPath(libraryRoot, artworkFile)
    : null;

  const trackDirectoryNames = hasTracksDirectory
    ? await getChildDirectories(tracksDirectory)
    : [];

  const tracks = await Promise.all(
    trackDirectoryNames.map((trackDirectoryName) =>
      buildTrack(
        libraryRoot,
        releaseDirectory,
        trackDirectoryName,
        releaseArtworkPath,
      ),
    ),
  );

  tracks.sort((first, second) => {
    const firstNumber =
      first.trackNumber ?? Number.MAX_SAFE_INTEGER;
    const secondNumber =
      second.trackNumber ?? Number.MAX_SAFE_INTEGER;

    if (firstNumber !== secondNumber) {
      return firstNumber - secondNumber;
    }

    return first.id.localeCompare(second.id);
  });

  const parsed = parseReleaseDirectory(
    releaseDirectoryName,
  );

  return {
    id: releaseDirectoryName,
    directory: toMediaPath(
      libraryRoot,
      releaseDirectory,
    ),
    date: parsed.date,
    title: parsed.title,
    artwork: releaseArtworkPath
      ? {
          source: "release",
          path: releaseArtworkPath,
        }
      : null,
    metadata: hasReleaseMetadata
      ? toMediaPath(
          libraryRoot,
          releaseMetadataFile,
        )
      : null,
    trackCount: tracks.length,
    playableTrackCount: tracks.filter(
      (track) => track.playable,
    ).length,
    tracks,
  };
}

async function main() {
  const libraryRoot = path.resolve(
    process.argv[2] ?? DEFAULT_LIBRARY_ROOT,
  );
  const releasesRoot = path.join(
    libraryRoot,
    "releases",
  );
  const outputFile = path.join(
    libraryRoot,
    "catalog.json",
  );

  if (!(await pathExists(releasesRoot))) {
    throw new Error(
      `Releases directory not found: ${releasesRoot}`,
    );
  }

  const releaseDirectoryNames =
    await getChildDirectories(releasesRoot);

  const releases = await Promise.all(
    releaseDirectoryNames.map(
      (releaseDirectoryName) =>
        buildRelease(
          libraryRoot,
          releasesRoot,
          releaseDirectoryName,
        ),
    ),
  );

  releases.sort((first, second) => {
    if (first.date && second.date) {
      return second.date.localeCompare(first.date);
    }

    return first.id.localeCompare(second.id);
  });

  const catalog = {
    version: CATALOG_VERSION,
    generatedAt: new Date().toISOString(),
    mediaBaseUrl: "/media",
    releaseCount: releases.length,
    trackCount: releases.reduce(
      (total, release) =>
        total + release.trackCount,
      0,
    ),
    playableTrackCount: releases.reduce(
      (total, release) =>
        total + release.playableTrackCount,
      0,
    ),
    releases,
  };

  await writeFile(
    outputFile,
    `${JSON.stringify(catalog, null, 2)}\n`,
    "utf8",
  );

  console.log("Media catalog generated");
  console.log(`  Library:  ${libraryRoot}`);
  console.log(`  Output:   ${outputFile}`);
  console.log(`  Releases: ${catalog.releaseCount}`);
  console.log(`  Tracks:   ${catalog.trackCount}`);
  console.log(
    `  Playable: ${catalog.playableTrackCount}`,
  );
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
