import { useMemo, useState } from "react";

import type {
  CatalogRelease,
  CatalogTrack,
  MediaCatalog,
} from "../types/MediaCatalog";
import {
  getMediaUrl,
  getReleaseArtist,
  getReleaseArtworkPath,
  getReleaseDate,
  getTrackArtist,
  getTrackKey,
} from "../lib/mediaCatalog";

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

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function releaseMatchesSearch(
  release: CatalogRelease,
  query: string,
): boolean {
  if (!query) {
    return true;
  }

  const releaseText = [
    release.title,
    getReleaseArtist(release),
    getReleaseDate(release) ?? "",
  ]
    .join(" ")
    .toLocaleLowerCase();

  if (releaseText.includes(query)) {
    return true;
  }

  return release.tracks.some((track) => {
    return [track.title, getTrackArtist(track)]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query);
  });
}

function trackMatchesSearch(
  entry: LibraryTrack,
  query: string,
): boolean {
  if (!query) {
    return true;
  }

  return [
    entry.track.title,
    getTrackArtist(entry.track),
    entry.release.title,
    getReleaseArtist(entry.release),
  ]
    .join(" ")
    .toLocaleLowerCase()
    .includes(query);
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
  const [mobileReleaseId, setMobileReleaseId] =
    useState<string>("all");
  const [desktopReleaseId, setDesktopReleaseId] =
    useState<string | null>(null);
  const [desktopMode, setDesktopMode] =
    useState<"releases" | "tracks">("releases");
  const [searchValue, setSearchValue] = useState("");

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

  const mobileVisibleTracks = useMemo(() => {
    if (mobileReleaseId === "all") {
      return playableTracks;
    }

    return playableTracks.filter((entry) => {
      return entry.release.id === mobileReleaseId;
    });
  }, [mobileReleaseId, playableTracks]);

  if (!catalog || playableTracks.length === 0) {
    return null;
  }

  const searchQuery = normalizeSearch(searchValue);
  const selectedTrackEntry = playableTracks.find(
    (entry) => entry.key === selectedTrackKey,
  );
  const selectedRelease =
    catalog.releases.find(
      (release) => release.id === desktopReleaseId,
    ) ??
    selectedTrackEntry?.release ??
    catalog.releases[0];
  const selectedReleaseArtist = getReleaseArtist(selectedRelease);
  const selectedReleaseDate = getReleaseDate(selectedRelease);
  const selectedReleaseArtwork = getMediaUrl(
    catalog.mediaBaseUrl,
    getReleaseArtworkPath(selectedRelease),
  );
  const selectedReleaseTracks = playableTracks.filter(
    (entry) => entry.release.id === selectedRelease.id,
  );
  const selectedReleaseMatchesQuery = releaseMatchesSearch(
    selectedRelease,
    searchQuery,
  );
  const visibleSelectedReleaseTracks = selectedReleaseMatchesQuery
    ? selectedReleaseTracks
    : selectedReleaseTracks.filter((entry) =>
        trackMatchesSearch(entry, searchQuery),
      );
  const visibleDesktopTracks = playableTracks.filter((entry) =>
    trackMatchesSearch(entry, searchQuery),
  );
  const visibleReleases = catalog.releases.filter((release) =>
    releaseMatchesSearch(release, searchQuery),
  );
  const selectedReleaseTrackKeys = selectedReleaseTracks.map(
    (entry) => entry.key,
  );
  const selectedReleaseIsPlaying = Boolean(
    playingTrackKey &&
      selectedReleaseTrackKeys.includes(playingTrackKey),
  );
  const selectedReleaseHasSelection = Boolean(
    selectedTrackKey &&
      selectedReleaseTrackKeys.includes(selectedTrackKey),
  );
  const selectedReleaseActionLabel = selectedReleaseIsPlaying
    ? "Pause release"
    : selectedReleaseHasSelection
      ? "Resume release"
      : "Play release";

  function toggleSelectedReleasePlayback() {
    if (selectedReleaseIsPlaying && playingTrackKey) {
      onToggleTrackPlayback?.(playingTrackKey);
      return;
    }

    if (selectedReleaseHasSelection) {
      onToggleTrackPlayback?.(selectedTrackKey);
      return;
    }

    const firstTrack = selectedReleaseTracks[0];
    if (firstTrack) {
      onPlayTrack?.(firstTrack.key);
    }
  }

  function renderDesktopTrackRow(
    entry: LibraryTrack,
    includeRelease: boolean,
  ) {
    const isSelected = entry.key === selectedTrackKey;
    const isPlaying = entry.key === playingTrackKey;
    const artist = getTrackArtist(entry.track);

    return (
      <div
        key={entry.key}
        className="library-workspace__track-row"
        data-selected={isSelected ? "true" : "false"}
        data-playing={isPlaying ? "true" : "false"}
      >
        <button
          type="button"
          className="library-workspace__track-play"
          aria-label={
            isPlaying
              ? `Pause ${entry.track.title}`
              : `Play ${entry.track.title}`
          }
          aria-pressed={isPlaying}
          onClick={() => onToggleTrackPlayback?.(entry.key)}
        >
          <span aria-hidden="true">{isPlaying ? "Ⅱ" : "▶"}</span>
        </button>

        <button
          type="button"
          className="library-workspace__track-main"
          aria-current={isSelected ? "true" : undefined}
          onClick={() => onSelectTrack(entry.key)}
          onDoubleClick={(event) => {
            event.preventDefault();
            onPlayTrack?.(entry.key);
          }}
        >
          <span className="library-workspace__track-number">
            {entry.track.trackNumber ?? "—"}
          </span>
          <strong>{entry.track.title}</strong>
          <span>{artist}</span>
          {includeRelease ? <span>{entry.release.title}</span> : null}
        </button>
      </div>
    );
  }

  return (
    <section
      className={[
        "library-browser",
        `library-browser--${variant}`,
      ].join(" ")}
      aria-label="Music library"
    >
      <div className="library-browser__desktop-workspace">
        <div className="library-workspace__toolbar">
          <div
            className="library-workspace__modes"
            role="tablist"
            aria-label="Library view"
          >
            <button
              type="button"
              role="tab"
              aria-selected={desktopMode === "releases"}
              onClick={() => setDesktopMode("releases")}
            >
              Releases
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={desktopMode === "tracks"}
              onClick={() => setDesktopMode("tracks")}
            >
              Tracks
            </button>
          </div>

          <label className="library-workspace__search">
            <span className="sr-only">Search music library</span>
            <input
              type="search"
              value={searchValue}
              placeholder="Search releases, artists, tracks…"
              onChange={(event) => setSearchValue(event.currentTarget.value)}
            />
          </label>
        </div>

        {desktopMode === "releases" ? (
          <div className="library-workspace__release-layout">
            <aside
              className="library-workspace__release-nav"
              aria-label="Releases"
            >
              <div className="library-workspace__pane-heading">
                <span>Releases</span>
                <span>{visibleReleases.length}</span>
              </div>

              <div className="library-workspace__release-list">
                {visibleReleases.map((release) => {
                  const artworkUrl = getMediaUrl(
                    catalog.mediaBaseUrl,
                    getReleaseArtworkPath(release),
                  );
                  const isActive = release.id === selectedRelease.id;

                  return (
                    <button
                      key={release.id}
                      type="button"
                      className="library-workspace__release-row"
                      aria-pressed={isActive}
                      onClick={() => setDesktopReleaseId(release.id)}
                    >
                      <span className="library-workspace__release-thumb">
                        {artworkUrl ? (
                          <img src={artworkUrl} alt="" aria-hidden="true" />
                        ) : (
                          <span aria-hidden="true">HL</span>
                        )}
                      </span>
                      <span className="library-workspace__release-copy">
                        <strong>{release.title}</strong>
                        <span>{getReleaseArtist(release)}</span>
                        <small>
                          {[getReleaseDate(release), `${release.playableTrackCount} tracks`]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      </span>
                    </button>
                  );
                })}

                {visibleReleases.length === 0 ? (
                  <p className="library-workspace__empty">
                    No releases match your search.
                  </p>
                ) : null}
              </div>
            </aside>

            <section className="library-workspace__release-detail">
              <div className="library-workspace__release-hero">
                <div className="library-workspace__hero-artwork" aria-hidden="true">
                  {selectedReleaseArtwork ? (
                    <img src={selectedReleaseArtwork} alt="" />
                  ) : (
                    <span>HL</span>
                  )}
                </div>

                <div className="library-workspace__hero-copy">
                  <span className="library-workspace__eyebrow">Selected release</span>
                  <h3>{selectedRelease.title}</h3>
                  <p>{selectedReleaseArtist}</p>
                  <small>
                    {[selectedReleaseDate, `${selectedRelease.playableTrackCount} playable tracks`]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>

                  <button
                    type="button"
                    className="library-workspace__play-release"
                    onClick={toggleSelectedReleasePlayback}
                  >
                    {selectedReleaseIsPlaying ? "❚❚" : "▶"} {selectedReleaseActionLabel}
                  </button>
                </div>
              </div>

              <div className="library-workspace__track-table">
                <div className="library-workspace__track-header" aria-hidden="true">
                  <span>#</span>
                  <span>Track</span>
                  <span>Artist</span>
                  <span />
                </div>

                <div className="library-workspace__track-scroll">
                  {visibleSelectedReleaseTracks.map((entry) =>
                    renderDesktopTrackRow(entry, false),
                  )}

                  {visibleSelectedReleaseTracks.length === 0 ? (
                    <p className="library-workspace__empty">
                      No tracks in this release match your search.
                    </p>
                  ) : null}
                </div>
              </div>
            </section>
          </div>
        ) : (
          <section className="library-workspace__all-tracks">
            <div className="library-workspace__pane-heading">
              <span>All tracks</span>
              <span>{visibleDesktopTracks.length}</span>
            </div>

            <div className="library-workspace__track-table library-workspace__track-table--all">
              <div className="library-workspace__track-header library-workspace__track-header--all" aria-hidden="true">
                <span>#</span>
                <span>Track</span>
                <span>Artist</span>
                <span>Release</span>
                <span />
              </div>
              <div className="library-workspace__track-scroll">
                {visibleDesktopTracks.map((entry) =>
                  renderDesktopTrackRow(entry, true),
                )}
                {visibleDesktopTracks.length === 0 ? (
                  <p className="library-workspace__empty">
                    No tracks match your search.
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        )}
      </div>

      <div className="library-browser__mobile-workspace">
        <div className="library-browser__heading">
          <div>
            <span className="library-browser__eyebrow">Library</span>
            <h2>Browse releases and tracks</h2>
          </div>

          <span className="library-browser__count">
            {mobileVisibleTracks.length}{" "}
            {mobileVisibleTracks.length === 1 ? "track" : "tracks"}
          </span>
        </div>

        <div
          className="library-browser__release-strip"
          aria-label="Filter tracks by release"
        >
          <button
            type="button"
            className="library-browser__release-button"
            aria-pressed={mobileReleaseId === "all"}
            onClick={() => setMobileReleaseId("all")}
          >
            <span className="library-browser__all-artwork">All</span>
            <span className="library-browser__release-label">All tracks</span>
          </button>

          {catalog.releases.map((release) => {
            const artworkUrl = getMediaUrl(
              catalog.mediaBaseUrl,
              getReleaseArtworkPath(release),
            );

            return (
              <button
                key={release.id}
                type="button"
                className="library-browser__release-button"
                aria-pressed={mobileReleaseId === release.id}
                onClick={() => setMobileReleaseId(release.id)}
              >
                <span className="library-browser__release-artwork">
                  {artworkUrl ? (
                    <img src={artworkUrl} alt="" aria-hidden="true" />
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
          <div className="library-browser__track-header" aria-hidden="true">
            <span />
            <span />
            <span>#</span>
            <span>Track</span>
            <span>Artist</span>
            <span>Release</span>
          </div>

          {mobileVisibleTracks.map((entry) => {
            const isSelected = entry.key === selectedTrackKey;
            const isPlaying = entry.key === playingTrackKey;
            const artist = getTrackArtist(entry.track);
            const artworkUrl = getMediaUrl(
              catalog.mediaBaseUrl,
              getReleaseArtworkPath(entry.release),
            );

            return (
              <div
                key={entry.key}
                className="library-browser__track-row"
                data-selected={isSelected ? "true" : "false"}
                data-playing={isPlaying ? "true" : "false"}
              >
                <span
                  className="library-browser__track-artwork"
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
                  className="library-browser__track-play-button"
                  aria-label={
                    isPlaying
                      ? `Pause ${entry.track.title}`
                      : `Play ${entry.track.title}`
                  }
                  aria-pressed={isPlaying}
                  title={isPlaying ? "Pause" : "Play"}
                  onClick={() => onToggleTrackPlayback?.(entry.key)}
                >
                  <span aria-hidden="true">{isPlaying ? "Ⅱ" : "▶"}</span>
                </button>

                <button
                  type="button"
                  className="library-browser__track-select-button"
                  aria-current={isSelected ? "true" : undefined}
                  onClick={() => onSelectTrack(entry.key)}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    onPlayTrack?.(entry.key);
                  }}
                >
                  <span className="library-browser__track-number">
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
      </div>
    </section>
  );
}
