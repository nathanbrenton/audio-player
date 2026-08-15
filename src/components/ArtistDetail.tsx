import {
  useEffect,
  useState,
} from "react";

import {
  getMediaUrl,
  getReleaseArtworkPath,
  getReleaseDate,
  getReleaseType,
} from "../lib/mediaCatalog";
import {
  fetchPublicArtist,
  getArtistYearRange,
  type PublicArtist,
} from "../lib/publicArtists";
import type {
  CatalogRelease,
  MediaCatalog,
} from "../types/MediaCatalog";

type ArtistDetailProps = {
  catalog: MediaCatalog | null;
  artistSlug: string;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onOpenRelease: (
    releaseId: string,
  ) => void;
};

function ArtistReleaseArtwork({
  catalog,
  release,
}: {
  catalog: MediaCatalog;
  release: CatalogRelease;
}) {
  const artworkUrl = getMediaUrl(
    catalog.mediaBaseUrl,
    getReleaseArtworkPath(release),
  );

  return (
    <span
      className="hiplingo-artist-release__artwork"
      aria-hidden="true"
    >
      {artworkUrl ? (
        <img
          src={artworkUrl}
          alt=""
          loading="lazy"
        />
      ) : (
        <span className="hiplingo-release-artwork-fallback">
          HL
        </span>
      )}
    </span>
  );
}

export default function ArtistDetail({
  catalog,
  artistSlug,
  loading,
  error,
  onBack,
  onOpenRelease,
}: ArtistDetailProps) {
  const [
    artist,
    setArtist,
  ] = useState<PublicArtist | null>(
    null,
  );
  const [
    artistLoading,
    setArtistLoading,
  ] = useState(false);
  const [
    artistError,
    setArtistError,
  ] = useState<string | null>(null);

  useEffect(() => {
    if (!catalog) {
      setArtist(null);
      setArtistLoading(false);
      setArtistError(null);
      return;
    }

    const controller =
      new AbortController();

    setArtist(null);
    setArtistLoading(true);
    setArtistError(null);

    void fetchPublicArtist(
      catalog,
      artistSlug,
      controller.signal,
    )
      .then((value) => {
        setArtist(value);
      })
      .catch(
        (caught: unknown) => {
          if (
            controller.signal.aborted
          ) {
            return;
          }

          setArtistError(
            caught instanceof Error
              ? caught.message
              : "Published Artist unavailable.",
          );
        },
      )
      .finally(() => {
        if (
          !controller.signal.aborted
        ) {
          setArtistLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [
    catalog,
    artistSlug,
  ]);

  const effectiveLoading =
    loading || artistLoading;
  const effectiveError =
    error ?? artistError;

  if (effectiveLoading) {
    return (
      <main className="hiplingo-page hiplingo-artist-detail-page">
        <section
          className="hiplingo-catalog-state"
          aria-live="polite"
        >
          <strong>
            Loading artist…
          </strong>
        </section>
      </main>
    );
  }

  if (effectiveError) {
    return (
      <main className="hiplingo-page hiplingo-artist-detail-page">
        <section
          className="hiplingo-catalog-state hiplingo-catalog-state--error"
          role="alert"
        >
          <strong>
            Artist unavailable
          </strong>
          <span>
            {effectiveError}
          </span>
          <button
            type="button"
            className="hiplingo-button"
            onClick={onBack}
          >
            Back to artists
          </button>
        </section>
      </main>
    );
  }

  if (!catalog || !artist) {
    return (
      <main className="hiplingo-page hiplingo-artist-detail-page">
        <section className="hiplingo-catalog-state">
          <strong>
            Artist not found.
          </strong>
          <span>
            The requested Artist is not present in the current published Artist snapshot.
          </span>
          <button
            type="button"
            className="hiplingo-button"
            onClick={onBack}
          >
            Back to artists
          </button>
        </section>
      </main>
    );
  }

  const yearRange =
    getArtistYearRange(artist);
  const primaryPhotoUrl =
    getMediaUrl(
      catalog.mediaBaseUrl,
      artist.primaryPhotoPath,
    );

  return (
    <main className="hiplingo-page hiplingo-artist-detail-page">
      <button
        type="button"
        className="hiplingo-release-back"
        onClick={onBack}
      >
        ← Artists
      </button>

      <header className="hiplingo-artist-detail__heading hiplingo-artist-detail__heading--with-photo">
        <span
          className="hiplingo-artist-detail__photo"
          aria-hidden="true"
        >
          {primaryPhotoUrl ? (
            <img
              src={primaryPhotoUrl}
              alt=""
            />
          ) : (
            <span className="hiplingo-release-artwork-fallback">
              HL
            </span>
          )}
        </span>

        <span className="hiplingo-kicker">
          Artist
        </span>
        <h1>
          {artist.name}
        </h1>
        <p>
          {artist.releases.length}{" "}
          {artist.releases.length === 1
            ? "release"
            : "releases"}
          {" · "}
          {artist.playableTrackCount}{" "}
          playable{" "}
          {artist.playableTrackCount === 1
            ? "track"
            : "tracks"}
          {yearRange
            ? ` · ${yearRange}`
            : ""}
        </p>
      </header>

      {artist.bio ? (
        <section
          className="hiplingo-public-summary hiplingo-artist-bio"
          aria-labelledby="artist-bio-heading"
        >
          <span className="hiplingo-kicker">About</span>
          <h2 id="artist-bio-heading">Artist bio</h2>
          <p>{artist.bio}</p>
        </section>
      ) : null}

      <section
        className="hiplingo-artist-discography"
        aria-labelledby="artist-discography-heading"
      >
        <header className="hiplingo-artist-discography__heading">
          <span className="hiplingo-kicker">
            Discography
          </span>
          <h2 id="artist-discography-heading">
            Published releases
          </h2>
        </header>

        <div className="hiplingo-artist-release-grid">
          {artist.releases.map(
            (release) => {
              const date =
                getReleaseDate(release);
              const type =
                getReleaseType(release);

              return (
                <button
                  key={release.id}
                  type="button"
                  className="hiplingo-artist-release"
                  onClick={() =>
                    onOpenRelease(
                      release.id,
                    )
                  }
                >
                  <ArtistReleaseArtwork
                    catalog={catalog}
                    release={release}
                  />

                  <span className="hiplingo-artist-release__copy">
                    <strong>
                      {release.title}
                    </strong>
                    <small>
                      {[
                        date,
                        type,
                        `${release.trackCount} ${
                          release.trackCount === 1
                            ? "track"
                            : "tracks"
                        }`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </span>
                </button>
              );
            },
          )}
        </div>
      </section>
    </main>
  );
}
