import {
  getMediaUrl,
  getReleaseArtworkPath,
  getReleaseDate,
  getReleaseType,
} from "../lib/mediaCatalog";
import {
  findPublicArtist,
  getArtistYearRange,
} from "../lib/publicArtists";
import type { CatalogRelease, MediaCatalog } from "../types/MediaCatalog";

type ArtistDetailProps = {
  catalog: MediaCatalog | null;
  artistSlug: string;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onOpenRelease: (releaseId: string) => void;
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
    <span className="hiplingo-artist-release__artwork" aria-hidden="true">
      {artworkUrl ? (
        <img src={artworkUrl} alt="" loading="lazy" />
      ) : (
        <span className="hiplingo-release-artwork-fallback">HL</span>
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
  if (loading) {
    return (
      <main className="hiplingo-page hiplingo-artist-detail-page">
        <section className="hiplingo-catalog-state" aria-live="polite">
          <strong>Loading artist…</strong>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="hiplingo-page hiplingo-artist-detail-page">
        <section className="hiplingo-catalog-state hiplingo-catalog-state--error" role="alert">
          <strong>Artist unavailable</strong>
          <span>{error}</span>
          <button type="button" className="hiplingo-button" onClick={onBack}>
            Back to artists
          </button>
        </section>
      </main>
    );
  }

  const artist = catalog ? findPublicArtist(catalog, artistSlug) : null;

  if (!catalog || !artist) {
    return (
      <main className="hiplingo-page hiplingo-artist-detail-page">
        <section className="hiplingo-catalog-state">
          <strong>Artist not found.</strong>
          <span>The requested artist is not present in the current published catalog.</span>
          <button type="button" className="hiplingo-button" onClick={onBack}>
            Back to artists
          </button>
        </section>
      </main>
    );
  }

  const yearRange = getArtistYearRange(artist);

  return (
    <main className="hiplingo-page hiplingo-artist-detail-page">
      <button type="button" className="hiplingo-release-back" onClick={onBack}>
        ← Artists
      </button>

      <header className="hiplingo-artist-detail__heading">
        <span className="hiplingo-kicker">Artist</span>
        <h1>{artist.name}</h1>
        <p>
          {artist.releases.length} {artist.releases.length === 1 ? "release" : "releases"}
          {" · "}
          {artist.playableTrackCount} playable {artist.playableTrackCount === 1 ? "track" : "tracks"}
          {yearRange ? ` · ${yearRange}` : ""}
        </p>
      </header>

      <section className="hiplingo-artist-discography" aria-labelledby="artist-discography-heading">
        <div className="hiplingo-artist-discography__heading">
          <span className="hiplingo-kicker">Discography</span>
          <h2 id="artist-discography-heading">Published releases</h2>
        </div>

        <div className="hiplingo-artist-release-grid">
          {artist.releases.map((release) => {
            const date = getReleaseDate(release);
            const type = getReleaseType(release);

            return (
              <button
                key={release.id}
                type="button"
                className="hiplingo-artist-release"
                onClick={() => onOpenRelease(release.id)}
              >
                <ArtistReleaseArtwork catalog={catalog} release={release} />
                <span className="hiplingo-artist-release__copy">
                  <strong>{release.title}</strong>
                  <small>
                    {[date, type, `${release.trackCount} ${release.trackCount === 1 ? "track" : "tracks"}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
