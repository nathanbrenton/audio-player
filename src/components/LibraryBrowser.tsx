import { useMemo, useState } from "react";

import type {
  CatalogRelease,
  CatalogTrack,
  MediaCatalog,
} from "../types/MediaCatalog";

type LibraryTrack = {
  key: string;
  release: CatalogRelease;
  track: CatalogTrack;
};

type LibraryBrowserProps = {
  catalog: MediaCatalog | null;
  selectedTrackKey: string;
  playingTrackKey?: string | null;
  onSelectTrack: (trackKey: string) => void;
  onPlayTrack?: (trackKey: string) => void;
  onToggleTrackPlayback?: (trackKey: string) => void;
  variant?: "desktop" | "mobile";
};

/*
 * Track identifiers may repeat between releases, so library rows use
 * the same release-and-track key format as the main audio player.
 */
function getTrackKey(
  release: CatalogRelease,
  track: CatalogTrack,
): string {
  return `${release.id}::${track.id}`;
}

/* Convert a catalog-relative media path into a browser URL. */
function getMediaUrl(
  mediaBaseUrl: string,
  assetPath: string | null,
): string | null {
  if (!assetPath) {
    return null;
  }

  return `${mediaBaseUrl.replace(/\/$/, "")}/${assetPath}`;
}

/*
 * Accept both historical and current catalog artwork structures.
 * Current generated catalogs store release artwork under `.path`.
 */
function getReleaseArtworkPath(
  release: CatalogRelease,
): string | null {
  const artwork = release.artwork as
    | string
    | {
        source?: "release" | null;
        path: string | null;
      }
    | null;

  if (typeof artwork === "string") {
    return artwork;
  }

  return artwork?.path ?? null;
}

export default function LibraryBrowser({
  catalog,
  selectedTrackKey,
  playingTrackKey = null,
  onSelectTrack,
  onPlayTrack,
  onToggleTrackPlayback,
  variant = "desktop",
}: LibraryBrowserProps) {
  const [selectedReleaseId, setSelectedReleaseId] =
    useState<string>("all");

  const playableTracks = useMemo<LibraryTrack[]>(() => {
    if (!catalog) {
      return [];
    }

    return catalog.releases.flatMap((release) => {
      return release.tracks
        .filter((track) => track.playable)
        .map((track) => ({
          key: getTrackKey(release, track),
          release,
          track,
        }));
    });
  }, [catalog]);

  const visibleTracks = useMemo(() => {
    if (selectedReleaseId === "all") {
      return playableTracks;
    }

    return playableTracks.filter((entry) => {
      return entry.release.id === selectedReleaseId;
    });
  }, [playableTracks, selectedReleaseId]);

  if (!catalog || playableTracks.length === 0) {
    return null;
  }

  return (
    <section
      className={[
        "library-browser",
        `library-browser--${variant}`,
      ].join(" ")}
      aria-label="Music library"
    >
      <div className="library-browser__heading">
        <div>
          <span className="library-browser__eyebrow">
            Library
          </span>

          <h2>Browse releases and tracks</h2>
        </div>

        <span className="library-browser__count">
          {visibleTracks.length}{" "}
          {visibleTracks.length === 1
            ? "track"
            : "tracks"}
        </span>
      </div>

      <div
        className="library-browser__release-strip"
        aria-label="Filter tracks by release"
      >
        <button
          type="button"
          className="library-browser__release-button"
          aria-pressed={selectedReleaseId === "all"}
          onClick={() => {
            setSelectedReleaseId("all");
          }}
        >
          <span className="library-browser__all-artwork">
            All
          </span>

          <span className="library-browser__release-label">
            All tracks
          </span>
        </button>

        {catalog.releases.map((release) => {
          /*
           * Always use the catalog's release-level artwork. Do not
           * infer release artwork from track one or another track.
           */
          const artworkUrl = getMediaUrl(
            catalog.mediaBaseUrl,
            getReleaseArtworkPath(release),
          );

          return (
            <button
              key={release.id}
              type="button"
              className="library-browser__release-button"
              aria-pressed={
                selectedReleaseId === release.id
              }
              onClick={() => {
                setSelectedReleaseId(release.id);
              }}
            >
              <span className="library-browser__release-artwork">
                {artworkUrl ? (
                  <img
                    src={artworkUrl}
                    alt=""
                    aria-hidden="true"
                  />
                ) : (
                  <span aria-hidden="true">—</span>
                )}
              </span>

              <span className="library-browser__release-label">
                {release.title}
              </span>
            </button>
          );
        })}
      </div>

      <div className="library-browser__track-list">
        <div
          className="library-browser__track-header"
          aria-hidden="true"
        >
          <span />
          <span />
          <span>#</span>
          <span>Track</span>
          <span>Artist</span>
          <span>Release</span>
        </div>

        {visibleTracks.map((entry) => {
          const isSelected =
            entry.key === selectedTrackKey;

          const isPlaying =
            entry.key === playingTrackKey;

          const artist =
            entry.track.artist ??
            entry.track.metadata.resolved
              .primaryArtist.name ??
            "Unknown artist";

          const artworkUrl = getMediaUrl(
            catalog.mediaBaseUrl,
            getReleaseArtworkPath(entry.release),
          );

          return (
            <div
              key={entry.key}
              className="library-browser__track-row"
              data-selected={
                isSelected ? "true" : "false"
              }
              data-playing={
                isPlaying ? "true" : "false"
              }
            >
              <span
                className="
                  library-browser__track-artwork
                "
                aria-hidden="true"
              >
                {artworkUrl ? (
                  <img src={artworkUrl} alt="" />
                ) : (
                  <span>—</span>
                )}
              </span>

              <button
                type="button"
                className="
                  library-browser__track-play-button
                "
                aria-label={
                  isPlaying
                    ? `Pause ${entry.track.title}`
                    : `Play ${entry.track.title}`
                }
                aria-pressed={isPlaying}
                title={isPlaying ? "Pause" : "Play"}
                onClick={() => {
                  onToggleTrackPlayback?.(entry.key);
                }}
              >
                <span aria-hidden="true">
                  {isPlaying ? "Ⅱ" : "▶"}
                </span>
              </button>

              <button
                type="button"
                className="
                  library-browser__track-select-button
                "
                aria-current={
                  isSelected ? "true" : undefined
                }
                onClick={() => {
                  onSelectTrack(entry.key);
                }}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  onPlayTrack?.(entry.key);
                }}
              >
                <span
                  className="
                    library-browser__track-number
                  "
                >
                  {entry.track.trackNumber ?? "—"}
                </span>

                <strong>{entry.track.title}</strong>

                <span>{artist}</span>

                <span>{entry.release.title}</span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
