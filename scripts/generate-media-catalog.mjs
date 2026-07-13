#!/usr/bin/env node

import {
  access,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parse as parseToml } from "smol-toml";

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
 * Parse one optional metadata source without stopping catalog
 * generation when the file is missing or invalid.
 */
function resolveInheritedString(
  trackValue,
  releaseValue,
) {
  const explicitTrackValue =
    typeof trackValue === "string"
      ? trackValue.trim()
      : "";

  if (explicitTrackValue) {
    return {
      value: explicitTrackValue,
      source: "track",
    };
  }

  const inheritedReleaseValue =
    typeof releaseValue === "string"
      ? releaseValue.trim()
      : "";

  if (inheritedReleaseValue) {
    return {
      value: inheritedReleaseValue,
      source: "release",
    };
  }

  return {
    value: null,
    source: "missing",
  };
}

function resolveTrackReleaseDate(
  trackValue,
  releaseValue,
  directoryValue,
) {
  const trackDate =
    typeof trackValue === "string"
      ? trackValue.trim()
      : "";

  if (trackDate) {
    return {
      value: trackDate,
      source: "track",
    };
  }

  const releaseDate =
    typeof releaseValue === "string"
      ? releaseValue.trim()
      : "";

  if (releaseDate) {
    return {
      value: releaseDate,
      source: "release",
    };
  }

  const directoryDate =
    typeof directoryValue === "string"
      ? directoryValue.trim()
      : "";

  if (directoryDate) {
    return {
      value: directoryDate,
      source: "directory",
    };
  }

  return {
    value: null,
    source: "missing",
  };
}

function resolvePrimaryArtist(
  trackArtist,
  releaseArtist,
  directoryArtist,
) {
  const trackName =
    typeof trackArtist?.name === "string"
      ? trackArtist.name.trim()
      : "";

  if (trackName) {
    return {
      name: trackName,
      sortName:
        typeof trackArtist.sort_name === "string"
          ? trackArtist.sort_name.trim() || null
          : null,
      source: "track",
    };
  }

  const releaseName =
    typeof releaseArtist?.name === "string"
      ? releaseArtist.name.trim()
      : "";

  if (releaseName) {
    return {
      name: releaseName,
      sortName:
        typeof releaseArtist.sort_name === "string"
          ? releaseArtist.sort_name.trim() || null
          : null,
      source: "release",
    };
  }

  const fallbackName =
    typeof directoryArtist === "string"
      ? directoryArtist.trim()
      : "";

  if (fallbackName) {
    return {
      name: fallbackName,
      sortName: null,
      source: "directory",
    };
  }

  return {
    name: null,
    sortName: null,
    source: "missing",
  };
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .filter((entry) => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
}

function resolveInheritedStringArray(
  trackValue,
  releaseValue,
) {
  const trackValues = normalizeStringArray(trackValue);

  if (trackValues.length > 0) {
    return {
      values: trackValues,
      source: "track",
    };
  }

  const releaseValues =
    normalizeStringArray(releaseValue);

  if (releaseValues.length > 0) {
    return {
      values: releaseValues,
      source: "release",
    };
  }

  return {
    values: [],
    source: "missing",
  };
}

function resolveTrackClassification(
  trackDocument,
  releaseDocument,
) {
  const trackClassification =
    trackDocument?.track?.classification;
  const releaseIdentifiers =
    releaseDocument?.release?.identifiers;

  return {
    genres: resolveInheritedStringArray(
      trackClassification?.genres,
      releaseIdentifiers?.release_genres,
    ),
    styles: resolveInheritedStringArray(
      trackClassification?.styles,
      releaseIdentifiers?.release_styles,
    ),
    moods: resolveInheritedStringArray(
      trackClassification?.moods,
      releaseIdentifiers?.release_moods,
    ),
    tags: resolveInheritedStringArray(
      trackClassification?.tags,
      releaseIdentifiers?.release_tags,
    ),
  };
}

function deriveTrackDisplayTitle(
  trackDocument,
  fallbackTitle,
) {
  const authoredTrack = trackDocument?.track;

  if (!authoredTrack) {
    return {
      title: fallbackTitle,
      source: "directory",
    };
  }

  const explicitDisplayTitle =
    authoredTrack.display_title?.trim();

  if (explicitDisplayTitle) {
    return {
      title: explicitDisplayTitle,
      source: "authored-display-title",
    };
  }

  const title = authoredTrack.title?.trim();
  const version = authoredTrack.version?.trim();
  const subtitle = authoredTrack.subtitle?.trim();

  const assembledTitle = [
    title,
    version,
  ]
    .filter(Boolean)
    .join(" ");

  const completeTitle = subtitle
    ? `${assembledTitle || fallbackTitle} — ${subtitle}`
    : assembledTitle;

  return {
    title: completeTitle || fallbackTitle,
    source: completeTitle
      ? "authored-fields"
      : "directory",
  };
}

async function readWaveformMetadata(
  libraryRoot,
  filePath,
) {
  const result = await readMetadataFile(
    libraryRoot,
    filePath,
    "json",
  );

  if (result.status !== "loaded" || !result.data) {
    return result;
  }

  const {
    peaks: _discardedPeaks,
    ...waveformMetadata
  } = result.data;

  return {
    ...result,
    data: waveformMetadata,
  };
}

async function readMetadataFile(
  libraryRoot,
  filePath,
  format,
) {
  const mediaPath = toMediaPath(
    libraryRoot,
    filePath,
  );

  try {
    const source = await readFile(filePath, "utf8");
    const data =
      format === "toml"
        ? parseToml(source)
        : JSON.parse(source);

    return {
      path: mediaPath,
      format,
      status: "loaded",
      data,
      error: null,
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        path: mediaPath,
        format,
        status: "missing",
        data: null,
        error: null,
      };
    }

    return {
      path: mediaPath,
      format,
      status: "invalid",
      data: null,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    };
  }
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

const CREDIT_COLLECTIONS = [
  {
    sourceKey: "performers",
    outputKey: "performers",
  },
  {
    sourceKey: "contributors",
    outputKey: "contributors",
  },
  {
    sourceKey: "composers",
    outputKey: "composers",
  },
  {
    sourceKey: "lyricists",
    outputKey: "lyricists",
  },
  {
    sourceKey: "songwriters",
    outputKey: "songwriters",
  },
  {
    sourceKey: "arrangers",
    outputKey: "arrangers",
  },
  {
    sourceKey: "remixers",
    outputKey: "remixers",
  },
  {
    sourceKey: "featured_artists",
    outputKey: "featuredArtists",
  },
];

/*
 * Normalize one authored credit list while preserving the source
 * scope needed by the metadata viewer.
 */
function normalizeCreditEntries(value, scope) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry)
    ) {
      return [];
    }

    const name =
      typeof entry.name === "string"
        ? entry.name.trim()
        : "";

    if (!name) {
      return [];
    }

    const role =
      typeof entry.role === "string" &&
      entry.role.trim()
        ? entry.role.trim()
        : null;

    const sortName =
      typeof entry.sort_name === "string" &&
      entry.sort_name.trim()
        ? entry.sort_name.trim()
        : null;

    return [{
      name,
      role,
      sortName,
      provenance: [{
        method: "manual",
        scope,
      }],
    }];
  });
}

/*
 * Release credits establish the baseline. Track credits append to
 * them. Exact duplicates retain one row with both provenance scopes.
 */
function mergeCreditEntries(
  releaseEntries,
  trackEntries,
) {
  const merged = [];
  const entriesByKey = new Map();

  for (const entry of [
    ...releaseEntries,
    ...trackEntries,
  ]) {
    const key = [
      entry.name.trim().toLocaleLowerCase(),
      entry.role?.trim().toLocaleLowerCase() ?? "",
    ].join("::");

    const existing = entriesByKey.get(key);

    if (existing) {
      for (const provenance of entry.provenance) {
        const alreadyPresent =
          existing.provenance.some(
            (candidate) =>
              candidate.method === provenance.method &&
              candidate.scope === provenance.scope,
          );

        if (!alreadyPresent) {
          existing.provenance.push(provenance);
        }
      }

      continue;
    }

    const resolvedEntry = {
      ...entry,
      provenance: [...entry.provenance],
    };

    entriesByKey.set(key, resolvedEntry);
    merged.push(resolvedEntry);
  }

  return merged;
}

function resolveCredits(
  releaseMetadata,
  trackCredits,
) {
  const releaseCredits =
    releaseMetadata?.release?.credits ?? {};
  const trackCreditDocument =
    trackCredits?.track ?? {};

  const resolved = {};

  for (
    const {
      sourceKey,
      outputKey,
    } of CREDIT_COLLECTIONS
  ) {
    resolved[outputKey] = mergeCreditEntries(
      normalizeCreditEntries(
        releaseCredits[sourceKey],
        "release",
      ),
      normalizeCreditEntries(
        trackCreditDocument[sourceKey],
        "track",
      ),
    );
  }

  resolved.publishing =
    trackCreditDocument.publishing ?? null;

  return resolved;
}

async function buildTrack(
  libraryRoot,
  releaseDirectory,
  trackDirectory,
  releaseArtworkPath,
  releaseMetadata,
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
  const trackMetadataFiles = {
    track: path.join(trackPath, "track.toml"),
    credits: path.join(
      trackPath,
      "track-credits.toml",
    ),
    productionNotes: path.join(
      trackPath,
      "track-production-notes.toml",
    ),
    analysis: path.join(
      trackPath,
      "track-analysis.json",
    ),
  };

  const [
    hasTrackArtwork,
    hasAudioMaster,
    hasAudioPlayback,
    hasWaveform,
    hasTrackMetadata,
    hasTrackCredits,
    hasTrackProductionNotes,
    hasTrackAnalysis,
  ] = await Promise.all([
    pathExists(artworkFile),
    pathExists(audioMasterFile),
    pathExists(audioPlaybackFile),
    pathExists(waveformFile),
    pathExists(trackMetadataFiles.track),
    pathExists(trackMetadataFiles.credits),
    pathExists(trackMetadataFiles.productionNotes),
    pathExists(trackMetadataFiles.analysis),
  ]);

  const metadataDiagnostics = await Promise.all([
    readMetadataFile(
      libraryRoot,
      trackMetadataFiles.track,
      "toml",
    ),
    readMetadataFile(
      libraryRoot,
      trackMetadataFiles.credits,
      "toml",
    ),
    readMetadataFile(
      libraryRoot,
      trackMetadataFiles.productionNotes,
      "toml",
    ),
    readMetadataFile(
      libraryRoot,
      trackMetadataFiles.analysis,
      "json",
    ),
    readWaveformMetadata(
      libraryRoot,
      waveformFile,
    ),
  ]);

  const [
    trackMetadata,
    trackCredits,
    trackProductionNotes,
    trackAnalysis,
    waveformMetadata,
  ] = metadataDiagnostics;

  const parsed = parseTrackDirectory(trackDirectory);

  const display = deriveTrackDisplayTitle(
    trackMetadata.data,
    parsed.title,
  );

  const primaryArtist = resolvePrimaryArtist(
    trackCredits.data?.track?.primary_artist,
    releaseMetadata.data?.release?.primary_artist,
    parsed.artist,
  );

  const language = resolveInheritedString(
    trackMetadata.data?.track?.language,
    releaseMetadata.data?.release?.language,
  );

  const releaseDate = resolveTrackReleaseDate(
    trackMetadata.data?.track?.dates?.release,
    releaseMetadata.data?.release?.dates?.release,
    parseReleaseDirectory(
      path.basename(releaseDirectory),
    ).date,
  );

  const classification = resolveTrackClassification(
    trackMetadata.data,
    releaseMetadata.data,
  );

  const validation = validateAuthoredDate(
    trackMetadata.data?.track?.dates?.release,
    "track.dates.release",
  );

  const artworkPath = hasTrackArtwork
    ? toMediaPath(libraryRoot, artworkFile)
    : releaseArtworkPath;

  return {
    id: trackDirectory,
    directory: toMediaPath(
      libraryRoot,
      trackPath,
    ),
    // Prefer authored artist metadata over the directory fallback.
    artist: primaryArtist.name,
    trackNumber: parsed.trackNumber,
    // Use authored display metadata when available.
    title: display.title,

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
    },

    metadataSources: {
      track: hasTrackMetadata
        ? toMediaPath(
            libraryRoot,
            trackMetadataFiles.track,
          )
        : null,
      credits: hasTrackCredits
        ? toMediaPath(
            libraryRoot,
            trackMetadataFiles.credits,
          )
        : null,
      productionNotes: hasTrackProductionNotes
        ? toMediaPath(
            libraryRoot,
            trackMetadataFiles.productionNotes,
          )
        : null,
      analysis: hasTrackAnalysis
        ? toMediaPath(
            libraryRoot,
            trackMetadataFiles.analysis,
          )
        : null,
      waveform: hasWaveform
        ? toMediaPath(libraryRoot, waveformFile)
        : null,
    },

    metadata: {
      authored: {
        track: trackMetadata.data,
        credits: trackCredits.data,
        productionNotes:
          trackProductionNotes.data,
      },

      generated: {
        analysis: trackAnalysis.data,
        waveform: waveformMetadata.data,
      },

      /*
       * Keep source documents intact while exposing the sections
       * the UI will eventually consume as resolved metadata.
       */
      resolved: {
        display,
        primaryArtist,
        language,
        releaseDate,
        genres: classification.genres,
        styles: classification.styles,
        moods: classification.moods,
        tags: classification.tags,
        track:
          trackMetadata.data?.track ?? null,
        credits: resolveCredits(
          releaseMetadata.data,
          trackCredits.data,
        ),
        production:
          trackProductionNotes.data?.production ??
          null,
        analysis: trackAnalysis.data,
        waveform: waveformMetadata.data,
      },

      diagnostics: metadataDiagnostics,
      validation,
    },

    playable:
      hasAudioPlayback &&
      hasWaveform,
  };
}

function isValidIsoDate(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const [
    year,
    month,
    day,
  ] = value
    .split("-")
    .map(Number);

  const date = new Date(
    Date.UTC(year, month - 1, day),
  );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validateAuthoredDate(
  value,
  field,
) {
  if (
    typeof value !== "string" ||
    value.trim() === ""
  ) {
    return [];
  }

  const normalizedValue = value.trim();

  if (isValidIsoDate(normalizedValue)) {
    return [];
  }

  return [
    {
      code: "invalid-authored-date",
      severity: "warning",
      field,
      value: normalizedValue,
      message:
        `${field} must be a valid YYYY-MM-DD date.`,
    },
  ];
}

function validateReleaseTracks(tracks) {
  const tracksByNumber = new Map();

  for (const track of tracks) {
    if (!Number.isInteger(track.trackNumber)) {
      continue;
    }

    const matches =
      tracksByNumber.get(track.trackNumber) ?? [];

    matches.push(track.id);
    tracksByNumber.set(
      track.trackNumber,
      matches,
    );
  }

  return [
    ...tracksByNumber.entries(),
  ]
    .filter(([, trackIds]) => trackIds.length > 1)
    .map(([trackNumber, trackIds]) => ({
      code: "duplicate-track-number",
      severity: "warning",
      trackNumber,
      trackIds,
      message:
        `Track number ${trackNumber} is used by ` +
        `${trackIds.length} tracks.`,
    }));
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
  const releaseMetadataFiles = {
    release: path.join(
      releaseDirectory,
      "release.toml",
    ),
    productionNotes: path.join(
      releaseDirectory,
      "release-production-notes.toml",
    ),
    settings: path.join(
      releaseDirectory,
      "release-settings.toml",
    ),
  };
  const tracksDirectory = path.join(
    releaseDirectory,
    "tracks",
  );

  const [
    hasArtwork,
    hasReleaseMetadata,
    hasReleaseProductionNotes,
    hasReleaseSettings,
    hasTracksDirectory,
  ] = await Promise.all([
    pathExists(artworkFile),
    pathExists(releaseMetadataFiles.release),
    pathExists(
      releaseMetadataFiles.productionNotes,
    ),
    pathExists(releaseMetadataFiles.settings),
    pathExists(tracksDirectory),
  ]);

  const metadataDiagnostics = await Promise.all([
    readMetadataFile(
      libraryRoot,
      releaseMetadataFiles.release,
      "toml",
    ),
    readMetadataFile(
      libraryRoot,
      releaseMetadataFiles.productionNotes,
      "toml",
    ),
    readMetadataFile(
      libraryRoot,
      releaseMetadataFiles.settings,
      "toml",
    ),
  ]);

  const [
    releaseMetadata,
    releaseProductionNotes,
    releaseSettings,
  ] = metadataDiagnostics;

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
        releaseMetadata,
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

  const validation = [
    ...validateReleaseTracks(tracks),
    ...validateAuthoredDate(
      releaseMetadata.data?.release?.dates?.release,
      "release.dates.release",
    ),
  ];

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
    metadataSources: {
      release: hasReleaseMetadata
        ? toMediaPath(
            libraryRoot,
            releaseMetadataFiles.release,
          )
        : null,
      productionNotes:
        hasReleaseProductionNotes
          ? toMediaPath(
              libraryRoot,
              releaseMetadataFiles.productionNotes,
            )
          : null,
      settings: hasReleaseSettings
        ? toMediaPath(
            libraryRoot,
            releaseMetadataFiles.settings,
          )
        : null,
    },

    metadata: {
      authored: {
        release: releaseMetadata.data,
        productionNotes:
          releaseProductionNotes.data,
        settings: releaseSettings.data,
      },

      /*
       * Assemble stable namespaces now. Inheritance, normalization,
       * and conflict handling will be layered on afterward.
       */
      resolved: {
        release:
          releaseMetadata.data?.release ?? null,
        production:
          releaseProductionNotes.data?.production ??
          null,
        settings:
          releaseSettings.data?.settings ?? null,
      },

      diagnostics: metadataDiagnostics,
      validation,
    },

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
