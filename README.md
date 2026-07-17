# Audio Player

A responsive React audio player built for high-resolution waveform exploration, artwork-driven navigation, and rich release and track metadata.

The player is one component of a broader record-label media workflow, but this repository is intentionally focused on the **public-facing playback experience**. Metadata authoring, private-library administration, and deployment tooling belong outside the player.

## Highlights

- Custom audio playback with reliable play, pause, resume, restart, previous, and next behavior
- Scrolling Canvas waveform with a fixed center playhead
- Frequency-aware waveform rendering with multiple color modes
- Waveform zoom from broad track overview to sample-level oscilloscope views
- Mouse, touch, drag, swipe, double-click, and double-tap interactions
- Stacked artwork navigation with previous and next release context
- Responsive music library for desktop, mobile portrait, and mobile landscape
- Release and track metadata viewer with multiple levels of detail
- Local media catalog generation with configurable media roots
- macOS development with Debian 13 compatibility as a target

## Technology

- React
- TypeScript
- Vite
- Web Audio API
- HTML5 Audio
- Canvas 2D API
- Custom waveform and oscilloscope rendering
- Dependency-light WAV parsing and FFT analysis
- TOML and JSON metadata
- Node-based media catalog and analysis scripts

## Playback

The player supports:

- Play, pause, resume, and restart
- Previous and next track navigation
- Direct track selection from the library
- Row-level play and pause controls
- Double-click or double-tap to play or restart a track
- Playback-state preservation when navigating between adjacent tracks
- Mobile-safe track loading inside user gestures to preserve autoplay permission
- Library browsing without interrupting the currently loaded track

## Artwork Navigation

Artwork is treated as a primary navigation surface rather than a passive thumbnail.

- Previous, current, next, and second-neighbor artwork can appear in a stacked layout
- Horizontal swiping changes tracks
- Previous and next buttons provide an accessible alternative to gestures
- Drag resistance, direction detection, gesture reversal, and commit thresholds reduce accidental navigation
- Stable handoff and commit overlays prevent flicker during artwork transitions
- Swipe-generated clicks are suppressed
- Artwork and controls resize for desktop, mobile portrait, and mobile landscape

Artwork resolves in this order:

1. Track-specific artwork
2. Release front artwork
3. No artwork

The player safely supports catalog entries where `artwork` is `null`.

## Waveform

The waveform is rendered with a custom Canvas pipeline.

- Fixed center playhead
- Smooth `requestAnimationFrame` scrolling
- Mouse and touch scrubbing
- Pointer capture for stable drag behavior
- Playback pauses during scrubbing and resumes only when appropriate
- Long-press context menus and mobile double-tap zoom are suppressed in the interaction area
- Enlarged current-time overlay
- Zoom range from `2 px/s` through `6400 px/s`

Available waveform color modes:

- 3-Band
- RGB
- Blue
- Monochrome

## Waveform Analysis

Waveform data is generated ahead of playback and stored as JSON.

Each peak contains:

```text
[min, max, low, mid, high]
```

Where:

- `min` is the minimum waveform amplitude
- `max` is the maximum waveform amplitude
- `low` is low-frequency energy
- `mid` is mid-frequency energy
- `high` is high-frequency energy

Current analysis settings:

- Schema version: 2
- Peaks per second: 400
- FFT size: 1024
- Window: Hann
- Low band: 20–250 Hz
- Mid band: 250–4000 Hz
- High band: 4000–20000 Hz
- Per-band normalization using the 95th percentile
- Square-root compression

Audio duration and waveform timing have been validated across the supported zoom levels.

## Oscilloscope

Zooming beyond the maximum waveform scale transitions into an oscilloscope view.

- Multiple magnification stages use progressively smaller sample windows
- Plus and minus controls move between waveform and oscilloscope modes
- Live Web Audio analyser integration
- Hold and freeze interactions for inspecting the signal
- Stable panel dimensions during mode changes
- Short visual transition between waveform and oscilloscope views

## Music Library

The library is designed to remain useful across screen sizes without replacing the player.

- Full-width desktop library beneath the player
- Dedicated mobile library sheet
- View all tracks or filter by release
- Single-tap highlights a track without interrupting playback
- Double-click or double-tap plays or restarts a track
- Separate row-level play and pause controls
- Full square artwork thumbnails beside circular transport controls
- Independently scrolling release and track regions
- Backdrop taps close the mobile library without activating controls underneath

Responsive behavior:

### Mobile portrait

- Compact controls and centered artwork
- Full-width library launcher
- Stacked release and track sections
- Independent scrolling
- Touch-friendly controls and safe-area spacing

### Mobile landscape

- Artwork in a compact left rail
- Controls and waveform on the right
- Side-by-side release and track columns
- Reduced waveform height on short displays

### Desktop

- Artwork and waveform arranged side by side
- Library spans the layout beneath the player
- Expanded metadata columns
- Compact vertical spacing

## Metadata Viewer

The player can display release, track, credits, production, technical-analysis, waveform, and warning information.

Available views include:

- Summary
- Detailed
- Audiophile
- Developer

Metadata provenance indicators distinguish values that are:

- Manually authored
- Generated
- Inherited
- Fallback values
- Missing
- Track-level
- Release-level
- Derived from directory names

Developer Mode is hidden during normal use and can be revealed through the About interaction.

## Metadata Files

The player can consume a structured combination of authored TOML and generated JSON metadata.

Release-level files may include:

```text
release.toml
release-production-notes.toml
release-settings.toml
```

Track-level files may include:

```text
track.toml
track-credits.toml
track-production-notes.toml
track-analysis.json
waveform-peaks.json
```

Authored descriptive, musical, credit, rights, and production information belongs in TOML. Generated technical values belong in `track-analysis.json` and `waveform-peaks.json`.

Examples of generated values include duration, sample rate, bit depth, channel layout, codec, bitrate, file size, checksum, loudness measurements, waveform settings, and validation results.

Reusable metadata templates are stored under:

```text
docs/metadata/
```

### TOML conventions

TOML integers must not contain leading zeroes.

```toml
# Valid
track_number = 4

# Invalid
track_number = 04
```

String arrays require quoted, comma-separated values.

```toml
genres = ["rock", "pop"]
genres = ["rock"]
genres = []
```

Identifiers such as ISRC, ISWC, IPI, ISNI, MusicBrainz UUIDs, and platform IDs should remain strings so formatting and leading zeroes are preserved.

## Media Layout

The player reads releases from a filesystem media root rather than bundling the media into the application source.

A representative layout is:

```text
<media-root>/
└── releases/
    └── YYYY-MM-DD_release-name/
        ├── release.toml
        ├── release-production-notes.toml
        ├── release-settings.toml
        ├── artwork/
        │   └── front/
        │       ├── artwork-master.jpeg
        │       └── artwork.webp
        └── tracks/
            └── artist_01_track-name/
                ├── track.toml
                ├── track-credits.toml
                ├── track-production-notes.toml
                ├── track-analysis.json
                ├── audio-master.wav
                ├── audio-playback.mp3
                ├── waveform-peaks.json
                └── artwork/
                    ├── artwork-master.jpeg
                    └── artwork.webp
```

The Vite development server exposes the selected filesystem root through stable `/media/*` URLs, including:

```text
/media/catalog.json
/media/releases/<release-id>/...
```

The default media root may point to a demo library. A private library can be selected with:

```sh
MEDIA_LIBRARY_ROOT=../media-library
```

Media assets should remain outside Git when they are private, large, licensed, or otherwise unsuitable for source control.

## Catalog Generation

The media catalog is generated with:

```sh
node scripts/generate-media-catalog.mjs
```

The generator scans releases and tracks, resolves playable audio, applies artwork fallback rules, and produces the catalog consumed by the React application.

## Media Processing Scripts

Important scripts include:

```text
scripts/generate-media-catalog.mjs
scripts/generate-waveform-peaks.mjs
scripts/transcode-audio.sh
scripts/transcode-artwork.sh
```

Their responsibilities include:

- Scanning the media root
- Generating the player catalog
- Converting playback audio
- Converting artwork for browser delivery
- Producing frequency-aware waveform peaks

## Development

Install dependencies:

```sh
npm install
```

Start the Vite development server:

```sh
npm run dev
```

Create a production build:

```sh
npm run build
```

Run the current validation sequence:

```sh
npm test &&
npm run build &&
git diff --check
```

Review local changes with:

```sh
git --no-pager diff
```

## Primary Source Files

```text
src/components/AudioPlayer.tsx
src/components/LibraryBrowser.tsx
src/components/WaveformCanvas.tsx
src/components/OscilloscopeCanvas.tsx
src/components/MetadataViewer.tsx
src/index.css
vite.config.mjs
scripts/generate-media-catalog.mjs
scripts/generate-waveform-peaks.mjs
docs/metadata/
```

## Project Scope

This repository is the audio-player application only.

Related tools may provide metadata editing, private-library management, validation, or deployment preparation, but those responsibilities are intentionally kept separate from the public player. The audio player should consume prepared media and metadata without exposing administrative write access.

## Status

Current application version: **0.0.2**

Implemented milestones include playback, responsive artwork navigation, waveform and oscilloscope visualization, mobile and desktop library browsing, metadata views, media-root configuration, and generated catalog support.

## License

Copyright © 2026 Nathan Brenton. All rights reserved.

This repository is publicly viewable for evaluation and portfolio review.
It is not open-source software. See [LICENSE](LICENSE) for permitted use.
