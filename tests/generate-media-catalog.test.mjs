import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const testDirectory = path.dirname(
  fileURLToPath(import.meta.url),
);

const projectRoot = path.resolve(
  testDirectory,
  "..",
);

const generatorPath = path.join(
  projectRoot,
  "scripts",
  "generate-media-catalog.mjs",
);

/*
 * Create an empty asset file. Catalog generation only needs the
 * asset to exist; media decoding is outside this integration test.
 */
async function createAsset(filePath) {
  await mkdir(path.dirname(filePath), {
    recursive: true,
  });

  await writeFile(filePath, "");
}

/*
 * Create a minimal waveform document so the track has a complete
 * playable asset set without storing large peak arrays.
 */
async function createWaveform(trackDirectory) {
  await writeFile(
    path.join(
      trackDirectory,
      "waveform-peaks.json",
    ),
    `${JSON.stringify({
      version: 2,
      durationSeconds: 1,
      sampleRate: 44100,
      sourceChannels: 2,
      waveformChannels: 1,
      bitsPerSample: 16,
      peaksPerSecond: 100,
      analysis: {
        fftSize: 1024,
        window: "hann",
        bandsHz: {
          low: [20, 250],
          mid: [250, 4000],
          high: [4000, 20000],
        },
        normalization: "test",
      },
      peakCount: 1,
      peaks: [[-1, 1, 0.1, 0.2, 0.3]],
    })}\n`,
  );
}

async function createPlayableTrack(
  releaseDirectory,
  directoryName,
) {
  const trackDirectory = path.join(
    releaseDirectory,
    "tracks",
    directoryName,
  );

  await mkdir(trackDirectory, {
    recursive: true,
  });

  await createAsset(
    path.join(trackDirectory, "audio-master.wav"),
  );

  await createAsset(
    path.join(trackDirectory, "audio-playback.mp3"),
  );

  await createWaveform(trackDirectory);

  return trackDirectory;
}

async function runGenerator(libraryRoot) {
  await execFileAsync(
    process.execPath,
    [
      generatorPath,
      libraryRoot,
    ],
    {
      cwd: projectRoot,
    },
  );

  const catalogSource = await readFile(
    path.join(libraryRoot, "catalog.json"),
    "utf8",
  );

  return JSON.parse(catalogSource);
}

test(
  "resolves track metadata through track, release, directory, and missing sources",
  async (context) => {
    const libraryRoot = await mkdtemp(
      path.join(
        os.tmpdir(),
        "audio-player-catalog-",
      ),
    );

    context.after(async () => {
      await rm(libraryRoot, {
        recursive: true,
        force: true,
      });
    });

    /*
     * Release one supplies inherited metadata. Its first track
     * overrides every supported resolved field, while the second
     * track inherits release values.
     */
    const inheritedReleaseDirectory = path.join(
      libraryRoot,
      "releases",
      "2026-01-02_inheritance-test",
    );

    await mkdir(inheritedReleaseDirectory, {
      recursive: true,
    });

    await writeFile(
      path.join(
        inheritedReleaseDirectory,
        "release.toml",
      ),
      `[release]
id = "2026-01-02_inheritance-test"
title = "Inheritance Test"

[release.primary_artist]
name = "Release Artist"
sort_name = "Artist, Release"

[release.dates]
release = "2026-01-03"

[release.identifiers]
release_genres = ["Electronic", "Electronic", " Ambient "]
release_styles = ["Techno"]
release_moods = ["Focused"]
release_tags = ["Catalog"]
`,
    );

    const overrideTrackDirectory =
      await createPlayableTrack(
        inheritedReleaseDirectory,
        "directory-artist_01_directory-title",
      );

    await writeFile(
      path.join(
        overrideTrackDirectory,
        "track.toml",
      ),
      `[track]
title = "Authored Title"
version = "Extended Mix"
subtitle = ""
display_title = ""
language = "fr"

[track.dates]
release = "2026-01-04"

[track.classification]
genres = [" House ", "House", ""]
styles = ["Deep House"]
moods = ["Warm"]
tags = ["Featured"]
`,
    );

    await writeFile(
      path.join(
        overrideTrackDirectory,
        "track-credits.toml",
      ),
      `[track.primary_artist]
name = "Track Artist"
sort_name = "Artist, Track"
`,
    );

    await createPlayableTrack(
      inheritedReleaseDirectory,
      "fallback-artist_02_inherited-track",
    );

    /*
     * Release two has no authored metadata, exercising directory
     * fallbacks and missing classification values.
     */
    const fallbackReleaseDirectory = path.join(
      libraryRoot,
      "releases",
      "2026-02-03_directory-fallback",
    );

    const fallbackTrackDirectory =
      await createPlayableTrack(
        fallbackReleaseDirectory,
        "directory-artist_01_directory-title",
      );

    const catalog = await runGenerator(
      libraryRoot,
    );

    const inheritedRelease =
      catalog.releases.find(
        (release) =>
          release.id ===
          "2026-01-02_inheritance-test",
      );

    const fallbackRelease =
      catalog.releases.find(
        (release) =>
          release.id ===
          "2026-02-03_directory-fallback",
      );

    assert.ok(inheritedRelease);
    assert.ok(fallbackRelease);

    const overrideTrack =
      inheritedRelease.tracks.find(
        (track) =>
          track.id ===
          "directory-artist_01_directory-title",
      );

    const inheritedTrack =
      inheritedRelease.tracks.find(
        (track) =>
          track.id ===
          "fallback-artist_02_inherited-track",
      );

    const fallbackTrack =
      fallbackRelease.tracks.find(
        (track) =>
          track.directory.endsWith(
            path.basename(
              fallbackTrackDirectory,
            ),
          ),
      );

    assert.ok(overrideTrack);
    assert.ok(inheritedTrack);
    assert.ok(fallbackTrack);

    assert.equal(
      overrideTrack.title,
      "Authored Title Extended Mix",
    );

    assert.deepEqual(
      overrideTrack.metadata.resolved.primaryArtist,
      {
        name: "Track Artist",
        sortName: "Artist, Track",
        source: "track",
      },
    );

    assert.deepEqual(
      overrideTrack.metadata.resolved.language,
      {
        value: "fr",
        source: "track",
      },
    );

    assert.deepEqual(
      overrideTrack.metadata.resolved.releaseDate,
      {
        value: "2026-01-04",
        source: "track",
      },
    );

    assert.deepEqual(
      overrideTrack.metadata.resolved.genres,
      {
        values: ["House"],
        source: "track",
      },
    );

    assert.deepEqual(
      inheritedTrack.metadata.resolved.primaryArtist,
      {
        name: "Release Artist",
        sortName: "Artist, Release",
        source: "release",
      },
    );

    assert.deepEqual(
      inheritedTrack.metadata.resolved.releaseDate,
      {
        value: "2026-01-03",
        source: "release",
      },
    );

    assert.deepEqual(
      inheritedTrack.metadata.resolved.genres,
      {
        values: [
          "Electronic",
          "Ambient",
        ],
        source: "release",
      },
    );

    assert.deepEqual(
      inheritedTrack.metadata.resolved.styles,
      {
        values: ["Techno"],
        source: "release",
      },
    );

    assert.deepEqual(
      inheritedTrack.metadata.resolved.moods,
      {
        values: ["Focused"],
        source: "release",
      },
    );

    assert.deepEqual(
      inheritedTrack.metadata.resolved.tags,
      {
        values: ["Catalog"],
        source: "release",
      },
    );

    assert.deepEqual(
      fallbackTrack.metadata.resolved.primaryArtist,
      {
        name: "Directory Artist",
        sortName: null,
        source: "directory",
      },
    );

    assert.deepEqual(
      fallbackTrack.metadata.resolved.releaseDate,
      {
        value: "2026-02-03",
        source: "directory",
      },
    );

    for (const field of [
      "genres",
      "styles",
      "moods",
      "tags",
    ]) {
      assert.deepEqual(
        fallbackTrack.metadata.resolved[field],
        {
          values: [],
          source: "missing",
        },
      );
    }
  },
);
