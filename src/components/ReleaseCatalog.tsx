import type { CatalogRelease, MediaCatalog } from "../types/MediaCatalog";
import {
  getMediaUrl,
  getReleaseArtist,
  getReleaseArtworkPath,
  getReleaseDate,
  getReleaseType,
} from "../lib/mediaCatalog";

type ReleaseCatalogProps = {
  catalog: MediaCatalog | null;
  loading: boolean;
  error: string | null;
  onOpenRelease: (releaseId: string) => void;
};

function ReleaseArtwork({
  release,
  catalog,
}: {
  release: CatalogRelease;
  catalog: MediaCatalog;
}) {
  const artworkUrl = getMediaUrl(
    catalog.mediaBaseUrl,
    getReleaseArtworkPath(release),
  );

  return (
    <span className="hiplingo-release-card__artwork" aria-hidden="true">
      {artworkUrl ? (
        <img src={artworkUrl} alt="" loading="lazy" />
      ) : (
        <span className="hiplingo-release-artwork-fallback">HL</span>
      )}
    </span>
  );
}

export default function ReleaseCatalog({
  catalog,
  loading,
  error,
  onOpenRelease,
}: ReleaseCatalogProps) {
  return (
    <main className="hiplingo-page hiplingo-releases-page">
      <header className="hiplingo-catalog-heading">
        <div>
          <span className="hiplingo-kicker">Catalog</span>
          <h1>Releases</h1>
        </div>

        {catalog ? (
          <p>
            {catalog.releaseCount} {catalog.releaseCount === 1 ? "release" : "releases"}
            {" · "}
            {catalog.playableTrackCount} playable {catalog.playableTrackCount === 1 ? "track" : "tracks"}
          </p>
        ) : null}
      </header>

      {loading ? (
        <section className="hiplingo-catalog-state" aria-live="polite">
          <strong>Loading releases…</strong>
          <span>Reading Hiplingo&apos;s published media catalog.</span>
        </section>
      ) : null}

      {!loading && error ? (
        <section className="hiplingo-catalog-state hiplingo-catalog-state--error" role="alert">
          <strong>Release catalog unavailable</strong>
          <span>{error}</span>
        </section>
      ) : null}

      {!loading && !error && catalog?.releases.length === 0 ? (
        <section className="hiplingo-catalog-state">
          <strong>No releases published yet.</strong>
          <span>The catalog is ready for the next metadata-editor publication package.</span>
        </section>
      ) : null}

      {catalog && catalog.releases.length > 0 ? (
        <section className="hiplingo-release-grid" aria-label="Hiplingo releases">
          {catalog.releases.map((release) => {
            const artist = getReleaseArtist(release);
            const date = getReleaseDate(release);
            const type = getReleaseType(release);

            return (
              <button
                key={release.id}
                type="button"
                className="hiplingo-release-card"
                onClick={() => onOpenRelease(release.id)}
              >
                <ReleaseArtwork release={release} catalog={catalog} />

                <span className="hiplingo-release-card__copy">
                  <strong>{release.title}</strong>
                  <span>{artist}</span>
                  <small>
                    {[date, type, `${release.trackCount} ${release.trackCount === 1 ? "track" : "tracks"}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </span>
              </button>
            );
          })}
        </section>
      ) : null}
    </main>
  );
}
