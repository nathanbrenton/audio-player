import { useMemo } from "react";

import {
  getMediaUrl,
  getReleaseArtworkPath,
} from "../lib/mediaCatalog";
import {
  buildPublicArtists,
  getArtistYearRange,
} from "../lib/publicArtists";
import type { MediaCatalog } from "../types/MediaCatalog";

type ArtistCatalogProps = {
  catalog: MediaCatalog | null;
  loading: boolean;
  error: string | null;
  onOpenArtist: (artistSlug: string) => void;
};

export default function ArtistCatalog({
  catalog,
  loading,
  error,
  onOpenArtist,
}: ArtistCatalogProps) {
  const artists = useMemo(
    () => (catalog ? buildPublicArtists(catalog) : []),
    [catalog],
  );

  return (
    <main className="hiplingo-page hiplingo-artists-page">
      <header className="hiplingo-catalog-heading">
        <div>
          <span className="hiplingo-kicker">Roster</span>
          <h1>Artists</h1>
        </div>

        {catalog ? (
          <p>
            {artists.length} {artists.length === 1 ? "artist" : "artists"}
            {" · "}
            {catalog.releaseCount} {catalog.releaseCount === 1 ? "release" : "releases"}
          </p>
        ) : null}
      </header>

      {loading ? (
        <section className="hiplingo-catalog-state" aria-live="polite">
          <strong>Loading artists…</strong>
          <span>Building the roster from Hiplingo&apos;s published releases.</span>
        </section>
      ) : null}

      {!loading && error ? (
        <section className="hiplingo-catalog-state hiplingo-catalog-state--error" role="alert">
          <strong>Artist roster unavailable</strong>
          <span>{error}</span>
        </section>
      ) : null}

      {!loading && !error && catalog && artists.length === 0 ? (
        <section className="hiplingo-catalog-state">
          <strong>No artists published yet.</strong>
          <span>Artists will appear here as releases enter the public catalog.</span>
        </section>
      ) : null}

      {catalog && artists.length > 0 ? (
        <section className="hiplingo-artist-grid" aria-label="Hiplingo artists">
          {artists.map((artist) => {
            const latestRelease = artist.releases[0] ?? null;
            const artworkUrl = latestRelease
              ? getMediaUrl(
                  catalog.mediaBaseUrl,
                  getReleaseArtworkPath(latestRelease),
                )
              : null;
            const yearRange = getArtistYearRange(artist);

            return (
              <button
                key={artist.name}
                type="button"
                className="hiplingo-artist-card"
                onClick={() => onOpenArtist(artist.slug)}
              >
                <span className="hiplingo-artist-card__artwork" aria-hidden="true">
                  {artworkUrl ? (
                    <img src={artworkUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="hiplingo-release-artwork-fallback">HL</span>
                  )}
                </span>

                <span className="hiplingo-artist-card__copy">
                  <strong>{artist.name}</strong>
                  <span>
                    {artist.releases.length} {artist.releases.length === 1 ? "release" : "releases"}
                    {yearRange ? ` · ${yearRange}` : ""}
                  </span>
                  {latestRelease ? <small>Latest: {latestRelease.title}</small> : null}
                </span>
              </button>
            );
          })}
        </section>
      ) : null}
    </main>
  );
}
