# Naming Conventions Runbook

## Purpose

This document defines the official directory and asset naming conventions for the React Audio Player project.

Goals:

* Human-readable
* Naturally sortable
* Cross-platform (macOS and Debian Linux)
* Scalable to hundreds or thousands of releases and tracks
* Compatible with future metadata/database integration
* Supports singles, EPs, albums, remix releases, and compilations

---

# Release Directory Convention

Format:

```text
media-library/releases/YYYY-MM-DD_artist_release-name/
```

Examples:

```text
media-library/releases/2025-01-01_artist_midi-mockups/
media-library/releases/2009-10-06_tiesto_kaleidoscope/
media-library/releases/2010-08-31_tiesto_kaleidoscope-remixed/
media-library/releases/2026-07-10_artist_first-single/
```

Rules:

* Use ISO date format:

```text
YYYY-MM-DD
```

* Lowercase only
* Separate words with hyphens
* Separate major sections with underscores
* Artist names should be relatively stable identifiers
* Release names should remain concise

Recommended:

```text
YYYY-MM-DD_artist_release-name
```

Avoid:

```text
YYYY-MM-DD_artist-ft-guest_release-name
YYYY-MM-DD_artist_release-name-deluxe-remastered-ultimate-version
```

Complicated relationships should be stored in metadata rather than folder names.

---

# Release Directory Layout

Example:

```text
media-library/releases/
└── 2025-01-01_artist_midi-mockups/
    ├── artwork-master.jpg
    ├── artwork.webp
    ├── release.json
    └── tracks/
```

---

# Track Directory Convention

Format:

```text
primary-artist[-ft-featured-artist...]_NN_track-title[-version]
```

Where:

```text
NN = zero-padded release track number
```

Examples:

```text
artist_01_first-track-midi-mockup
artist_02_second-track-midi-mockup
artist-ft-guest_03_third-track-club-remix
tiesto-ft-jonsi_01_kaleidoscope-original-mix
```

Rules:

* Lowercase only
* Hyphen-separated words
* Use one underscore to separate major sections
* Use `ft` for featured artists
* Use two-digit track numbers:

```text
01
02
03
...
99
```

* Include mix/version information when known:

```text
-original-mix
-club-remix
-radio-edit
-extended-mix
-midi-mockup
```

---

# Track Directory Layout

Example:

```text
tracks/
├── artist_01_first-track-midi-mockup/
│   ├── audio-master.wav
│   ├── audio-playback.mp3
│   ├── waveform-peaks.json
│   └── metadata.json
│
└── artist_02_second-track-midi-mockup/
    ├── audio-master.wav
    └── audio-playback.mp3
```

---

# Artwork Naming Convention

Release-level artwork:

Source:

```text
artwork-master.jpg
artwork-master.png
```

Generated:

```text
artwork.webp
```

Examples:

```text
2025-01-01_artist_midi-mockups/
├── artwork-master.jpg
└── artwork.webp
```

---

# Audio Naming Convention

Track-level audio:

Source:

```text
audio-master.wav
```

Generated:

```text
audio-playback.mp3
```

Examples:

```text
artist_01_first-track-midi-mockup/
├── audio-master.wav
└── audio-playback.mp3
```

---

# Future Asset Naming

Planned assets:

```text
waveform-peaks.json
waveform-preview.png
metadata.json
cue-points.json
beat-grid.json
```

Per-release metadata:

```text
release.json
```

---

# Complete Example

```text
media-library/
└── releases/
    └── 2025-01-01_artist_midi-mockups/
        ├── artwork-master.jpg
        ├── artwork.webp
        ├── release.json
        └── tracks/
            ├── artist_01_first-track-midi-mockup/
            │   ├── audio-master.wav
            │   ├── audio-playback.mp3
            │   └── waveform-peaks.json
            │
            └── artist_02_second-track-midi-mockup/
                ├── audio-master.wav
                ├── audio-playback.mp3
                └── waveform-peaks.json
```

---

# Design Philosophy

Folders answer:

> "Where are the files?"

Metadata answers:

> "What are the relationships?"

Artist aliases, featured artists, remixers, BPM, playlists, compilation appearances, and future database relationships should be stored in metadata files rather than encoded into increasingly complex directory structures.


---

# Artwork Storage and Resolution

## Release artwork

The primary release cover is stored beneath the release's
`artwork/front/` directory.

~~~text
media-library/releases/<release-id>/
└── artwork/
    └── front/
        ├── artwork-master.jpeg
        └── artwork.webp
~~~

The web-ready release artwork path is:

~~~text
releases/<release-id>/artwork/front/artwork.webp
~~~

## Track artwork

Track-specific artwork is stored beneath the individual track's
`artwork/` directory.

~~~text
media-library/releases/<release-id>/tracks/<track-id>/
└── artwork/
    ├── artwork-master.jpeg
    └── artwork.webp
~~~

The web-ready track artwork path is:

~~~text
releases/<release-id>/tracks/<track-id>/artwork/artwork.webp
~~~

## Artwork fallback order

The media catalog generator resolves artwork for each track in this
order:

1. Track-specific `artwork/artwork.webp`
2. Release-level `artwork/front/artwork.webp`
3. No artwork

Track-specific artwork overrides the release artwork.

When a track does not provide individual artwork, the player uses the
release's front artwork.

A track-specific catalog entry uses:

~~~json
{
  "source": "track",
  "path": "releases/<release-id>/tracks/<track-id>/artwork/artwork.webp"
}
~~~

A release-fallback catalog entry uses:

~~~json
{
  "source": "release",
  "path": "releases/<release-id>/artwork/front/artwork.webp"
}
~~~

The release-level catalog entry uses the same object structure:

~~~json
{
  "source": "release",
  "path": "releases/<release-id>/artwork/front/artwork.webp"
}
~~~

All catalog paths are relative to the `media-library/` directory and
must use forward slashes.

Regenerate the catalog whenever artwork is added, removed, renamed, or
moved:

~~~bash
node scripts/generate-media-catalog.mjs
~~~
