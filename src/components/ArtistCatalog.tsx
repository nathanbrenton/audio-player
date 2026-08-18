import {
  useEffect,
  useState,
} from "react";

import {
  getMediaUrl,
} from "../lib/mediaCatalog";
import {
  fetchPublicArtists,
  getArtistYearRange,
  type PublicArtist,
} from "../lib/publicArtists";
import type {
  MediaCatalog,
} from "../types/MediaCatalog";

type ArtistCatalogProps = {
  catalog: MediaCatalog | null;
  loading: boolean;
  error: string | null;
  onOpenArtist: (
    artistSlug: string,
  ) => void;
};

export default function ArtistCatalog({
  catalog,
  loading,
  error,
  onOpenArtist,
}: ArtistCatalogProps) {
  const [
    artists,
    setArtists,
  ] = useState<PublicArtist[]>([]);
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
      setArtists([]);
      setArtistLoading(false);
      setArtistError(null);
      return;
    }

    const controller =
      new AbortController();

    setArtists([]);
    setArtistLoading(true);
    setArtistError(null);

    void fetchPublicArtists(
      catalog,
      controller.signal,
    )
      .then((value) => {
        setArtists(value);
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
              : "Published Artist roster unavailable.",
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
  }, [catalog]);

  const effectiveLoading =
    loading || artistLoading;
  const effectiveError =
    error ?? artistError;

  return (
    <main className="hiplingo-page hiplingo-artists-page">
      <header className="hiplingo-catalog-heading">
        <div>
          <h1>Artists</h1>
        </div>

        {catalog ? (
          <p>
            {artists.length}{" "}
            {artists.length === 1
              ? "artist"
              : "artists"}
            {" · "}
            {catalog.releaseCount}{" "}
            {catalog.releaseCount === 1
              ? "release"
              : "releases"}
          </p>
        ) : null}
      </header>

      {effectiveLoading ? (
        <section
          className="hiplingo-catalog-state"
          aria-live="polite"
        >
          <strong>
            Loading artists…
          </strong>
          <span>
            Reading Hiplingo&apos;s published Artist snapshot.
          </span>
        </section>
      ) : null}

      {
        !effectiveLoading &&
        effectiveError
          ? (
            <section
              className="hiplingo-catalog-state hiplingo-catalog-state--error"
              role="alert"
            >
              <strong>
                Artist roster unavailable
              </strong>
              <span>
                {effectiveError}
              </span>
            </section>
          )
          : null
      }

      {
        !effectiveLoading &&
        !effectiveError &&
        catalog &&
        artists.length === 0
          ? (
            <section className="hiplingo-catalog-state">
              <strong>
                No artists published yet.
              </strong>
              <span>
                Artists appear here from the current published Artist snapshot.
              </span>
            </section>
          )
          : null
      }

      {
        catalog &&
        artists.length > 0
          ? (
            <section
              className="hiplingo-artist-grid"
              aria-label="Hiplingo artists"
            >
              {artists.map(
                (artist) => {
                  const photoUrl =
                    getMediaUrl(
                      catalog.mediaBaseUrl,
                      artist.primaryPhotoPath,
                    );
                  const yearRange =
                    getArtistYearRange(
                      artist,
                    );
                  const latestRelease =
                    artist.releases[0] ??
                    null;

                  return (
                    <button
                      key={artist.id}
                      type="button"
                      className="hiplingo-artist-card"
                      onClick={() =>
                        onOpenArtist(
                          artist.slug,
                        )
                      }
                    >
                      <span
                        className="hiplingo-artist-card__artwork hiplingo-artist-card__artwork--photo"
                        aria-hidden="true"
                      >
                        {photoUrl ? (
                          <img
                            src={photoUrl}
                            alt=""
                            loading="lazy"
                          />
                        ) : (
                          <span className="hiplingo-release-artwork-fallback">
                            HL
                          </span>
                        )}
                      </span>

                      <span className="hiplingo-artist-card__copy">
                        <strong>
                          {artist.name}
                        </strong>
                        <span>
                          {artist.releases.length}{" "}
                          {artist.releases.length ===
                          1
                            ? "release"
                            : "releases"}
                          {yearRange
                            ? ` · ${yearRange}`
                            : ""}
                        </span>
                        {latestRelease ? (
                          <small>
                            Latest:{" "}
                            {
                              latestRelease.title
                            }
                          </small>
                        ) : null}
                      </span>
                    </button>
                  );
                },
              )}
            </section>
          )
          : null
      }
    </main>
  );
}
