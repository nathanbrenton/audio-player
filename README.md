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
- Metadata-editor publication-package consumption through `/media/*`
- HLS playback with hls.js plus native-HLS fallback
- Persistent site-wide playback with release-scoped queues and a compact global transport
- macOS development with Debian 13 compatibility as a target

## Technology

- React
- TypeScript
- Vite
- Web Audio API
- HTML5 Audio
- hls.js / Media Source Extensions
- Canvas 2D API
- Custom Canvas waveform and oscilloscope rendering
- Sanitized JSON release/track publication metadata

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
- Release-page playback without route changes
- Release-scoped queues with automatic advancement through the remaining tracks
- Compact site-wide now-playing controls that expand into the full `/listen` player

## Persistent playback and queue

Hiplingo mounts one `AudioPlayer` for the lifetime of the public application
shell. Routing changes presentation only; they do not unmount the underlying
HTML audio element, HLS instance, or Web Audio graph.

Release pages send playback commands directly to that persistent player:

```text
/release detail
      |
      | play track / play release
      v
persistent AudioPlayer
      |
      +-- release-scoped queue
      +-- HLS playback
      +-- compact global transport off /listen
      `-- expanded interface on /listen
```

Selecting an individual track starts it immediately and keeps the playable
tracks from that release as the active queue. Next/previous stay inside the
queue, and reaching the end of a track automatically advances when another
queued track remains. The final queued track stops normally.

`/listen` is therefore an expanded view of the same playback session rather
than a separate player lifecycle.

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

## Public brand assets

Hiplingo keeps brand artwork separate from release media. Static site identity
assets live under `public/brand/` and are copied into the Vite production build.
The responsive landing experience expects:

```text
public/brand/
├── hiplingo-logo-white.webp
├── hiplingo-banner-mobile.webp
└── hiplingo-banner-desktop.webp
```

The banner files are treated as background texture only. The Hiplingo logo is
rendered separately by the interface so its size and placement can respond
independently from banner cropping. Mobile portrait uses the dedicated mobile
texture; desktop and short landscape use the wide desktop texture.

The homepage surfaces the newest release from the hydrated published catalog.
Its Play action sends the release queue directly to the persistent player, so
playback begins without navigating away from the landing page.

## Published-media contract

Hiplingo is a **read-only consumer** of publication packages produced by
`metadata-editor`. The player does not author, transcode, sanitize, or publish
public media.

The default development media root is the public-safe sibling directory:

```text
../published-media
```

Vite maps that directory to the same URL contract used in production:

```text
/media/catalog.json
/media/releases/<release-id>/release.json
/media/releases/<release-id>/tracks/<track-id>/track.json
/media/releases/<release-id>/tracks/<track-id>/stream/index.m3u8
/media/releases/<release-id>/tracks/<track-id>/waveform-peaks.json
```

`catalog.json` is intentionally small. Hiplingo follows each catalog
`release.href`, then each release `track.href`. `track.json` supplies relative
`stream.href`, `waveform.href`, and artwork references.

The catalog adapter in `src/lib/mediaCatalog.ts` temporarily also recognizes
the older audio-player catalog shape so a previously overwritten
`published-media/catalog.json` can still be used to discover release IDs.
`release.json` and `track.json` remain authoritative in both cases.

For temporary testing only, an alternate read-only root can be selected:

```sh
MEDIA_LIBRARY_ROOT=../some-test-media npm run dev
```

### Publication ownership

`metadata-editor` owns:

- HLS/AAC derivative generation
- Browser-compatible artwork derivatives
- Waveform generation
- Sanitized public release and track JSON
- Publication manifests
- `published-media/catalog.json`
- Atomic package promotion/update

Hiplingo owns:

- Catalog/package consumption
- Release and track browsing
- Artwork and waveform presentation
- HLS playback
- Playback state and public-site UI

Producer-side media preparation scripts have been removed from this repository.
`audio-player` has no supported workflow that writes to `published-media`.
Publication changes must originate from `metadata-editor`.

## Shared media-player source

The repository also owns `packages/media-player/`, a small local package for player primitives that must behave identically in the Hiplingo public app and metadata-editor. Shared surfaces now include the compact seekable waveform renderer, the canonical 3Band/RGB/Blue/Monochrome color vocabulary, SVG previous/play/pause/next transport icons, player-facing time formatting, the global Spacebar transport shortcut contract, the compact Now Playing presentation skeleton, a queue-neutral transport-controller contract, and stable queue navigation/deduplication helpers used by both hosts.

The package deliberately does **not** own an audio element, playback queue state, HLS/catalog loading, private Library APIs, metadata editing, publication, or deployment. Hiplingo keeps its public HLS/catalog playback engine; metadata-editor keeps its private application-shell preview engine. Both hosts render the same compact Now Playing structure and call the same transport/presentation primitives and queue-neutral helpers while supplying their own playable URLs, waveform data, playback state, engine callbacks, queue state, and host-specific trailing controls. This keeps one interaction source without allowing the public app to depend on the private Library.

metadata-editor consumes the package through the sibling local dependency `file:../audio-player/packages/media-player`; this repository consumes the same package through `file:./packages/media-player`. Future player primitives should move into this package only when both hosts can use the same interface without host-specific filesystem or network assumptions.

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
src/lib/mediaCatalog.ts
docs/runbooks/start-app.md
```

## Project Scope

This repository is the audio-player application only.

`metadata-editor` owns metadata editing, private-library management, validation,
derivative preparation, and publication. Hiplingo consumes the resulting
`published-media` tree without exposing administrative write access or carrying
a second media-generation pipeline.

## Status

Current application version: **0.0.2**

Implemented milestones include playback, responsive artwork navigation, waveform and oscilloscope visualization, mobile and desktop library browsing, metadata views, release discovery, metadata-editor publication-package consumption, and persistent site-wide release-queue playback.

## License

Copyright © 2026 Nathan Brenton. All rights reserved.

This repository is publicly viewable for evaluation and portfolio review.
It is not open-source software. See [LICENSE](LICENSE) for permitted use.

## Hiplingo web application shell

The public player now runs inside the mobile-first Hiplingo application shell.
The first shell milestone adds lightweight client-side routes without changing
the established playback engine:

```text
/
/listen
/releases
/artists
/journal
/jam
/about
```

`/listen` hosts the existing AudioPlayer. The Releases, Artists, Journal, and
Jam Agreement routes are intentionally lightweight boundaries for later
milestones rather than duplicate implementations of metadata-editor or
jam-agreement-manager.

The private `jam-agreement-manager` remains a separate administrative
application. The eventual `/jam` participant experience should talk to a
purpose-built public API surface and must not expose the administrative UI or
its unrestricted rights-management endpoints.

### Static hosting requirement

Production hosting must serve `index.html` as the fallback for application
routes such as `/listen` and `/artists`. Media remains separately addressable
through the publication/deployment contract rather than being bundled into the
frontend source tree.

## H2 release discovery

The public `/releases` route uses the hydrated metadata-editor publication
contract and presents an artwork-first release catalog. Release detail routes
use the stable release identifier:

```text
/releases/<release-id>
```

Each release page presents public release metadata and its track list. Playable
tracks command the single persistent player in place; selecting a track does
not require navigating to `/listen`. The full `/listen` route is the expanded
presentation of that same playback session.

The Hiplingo shell owns catalog loading and passes that catalog into
`AudioPlayer`. `AudioPlayer` still retains a standalone catalog-loading fallback
for reuse outside the shell. Shared catalog hydration, relative-resource resolution, artwork, artist, and
identity handling lives in `src/lib/mediaCatalog.ts`, keeping the publication
contract isolated from the player UI.


## H6 unified listening shell

Hiplingo uses one global application header. The legacy player-specific header
was removed from `/listen`; the site header now owns primary navigation,
`Browse Library`, and the player-settings menu. Short mobile-landscape layouts
use the same single compact header row.

`Browse Library` opens without changing routes. On desktop it presents as a
right-side drawer; on mobile it remains a bottom/full-height sheet. Selecting a
track from the browser establishes a queue from that release and begins
playback while the current page remains in place.

The global Now Playing dock remains interactive above library and metadata
overlays. Metadata dialogs no longer render a second mini-player, and the
library header no longer duplicates playback controls. The player-settings
overlay intentionally retains its compact waveform preview and play/pause
control because waveform appearance is edited there.

Track Metadata places its primary `Overview`, `Credits`, and `Track Info` tabs
in the modal title bar. Credits group `Recording & Editing` together and combine
`Mixing & Mastering` into one production card.

## H6.1 desktop library workspace

Desktop `Browse Library` uses a wide two-pane listening workspace instead of
reusing the compact artwork-wall browser. A dense release navigator occupies
the left pane; the right pane presents the selected release, release-level
playback, and its playable track list. `Releases` and `Tracks` modes plus local
search provide fast catalog access without leaving the current Hiplingo route.

The routed `/releases` experience remains the artwork-forward public discovery
surface. Browse Library remains the playback utility overlay. Mobile portrait
and landscape continue using the existing compact sheet/browser presentation.
