import type { PlaybackStateSnapshot } from "./AudioPlayer";
import type { CatalogRelease, MediaCatalog } from "../types/MediaCatalog";
import {
  getMediaUrl,
  getReleaseArtist,
  getReleaseArtworkPath,
  getReleaseDate,
  getReleaseDescription,
  getReleaseType,
  getTrackArtist,
  getTrackKey,
} from "../lib/mediaCatalog";

type ReleaseDetailProps = {
  catalog: MediaCatalog | null;
  releaseId: string;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onOpenArtist: (artistName: string) => void;
  playbackState: PlaybackStateSnapshot;
  onPlayQueue: (trackKey: string, queueTrackKeys: string[]) => void;
  onTogglePlayback: () => void;
};

function ReleaseHeroArtwork({
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
    <div className="hiplingo-release-detail__artwork" aria-hidden="true">
      {artworkUrl ? (
        <img src={artworkUrl} alt="" />
      ) : (
        <span className="hiplingo-release-artwork-fallback">HL</span>
      )}
    </div>
  );
}

export default function ReleaseDetail({
  catalog,
  releaseId,
  loading,
  error,
  onBack,
  onOpenArtist,
  playbackState,
  onPlayQueue,
  onTogglePlayback,
}: ReleaseDetailProps) {
  const release = catalog?.releases.find(
    (entry) => entry.id === releaseId,
  );

  if (loading) {
    return (
      <main className="hiplingo-page hiplingo-release-detail-page">
        <section className="hiplingo-catalog-state" aria-live="polite">
          <strong>Loading release…</strong>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="hiplingo-page hiplingo-release-detail-page">
        <section className="hiplingo-catalog-state hiplingo-catalog-state--error" role="alert">
          <strong>Release unavailable</strong>
          <span>{error}</span>
          <button type="button" className="hiplingo-button" onClick={onBack}>
            Back to releases
          </button>
        </section>
      </main>
    );
  }

  if (!catalog || !release) {
    return (
      <main className="hiplingo-page hiplingo-release-detail-page">
        <section className="hiplingo-catalog-state">
          <strong>Release not found.</strong>
          <span>The requested release is not present in the current published catalog.</span>
          <button type="button" className="hiplingo-button" onClick={onBack}>
            Back to releases
          </button>
        </section>
      </main>
    );
  }

  const artist = getReleaseArtist(release);
  const date = getReleaseDate(release);
  const type = getReleaseType(release);
  const description = getReleaseDescription(release);
  const playableTrackKeys = release.tracks
    .filter((track) => track.playable)
    .map((track) => getTrackKey(release, track));
  const firstPlayableTrack = release.tracks.find((track) => track.playable) ?? null;
  const releaseIsSelected = Boolean(
    playbackState.hasSelection &&
      playbackState.trackKey &&
      playableTrackKeys.includes(playbackState.trackKey),
  );
  const releaseActionLabel = releaseIsSelected
    ? playbackState.isPlaying
      ? "Pause release"
      : "Resume release"
    : "Play release";

  return (
    <main className="hiplingo-page hiplingo-release-detail-page">
      <button type="button" className="hiplingo-release-back" onClick={onBack}>
        ← Releases
      </button>

      <section className="hiplingo-release-detail__hero">
        <ReleaseHeroArtwork release={release} catalog={catalog} />

        <div className="hiplingo-release-detail__intro">
          <span className="hiplingo-kicker">{type ?? "Release"}</span>
          <h1>{release.title}</h1>
          <button
            type="button"
            className="hiplingo-release-detail__artist"
            onClick={() => onOpenArtist(artist)}
          >
            {artist}
          </button>
          <p className="hiplingo-release-detail__meta">
            {[date, `${release.trackCount} ${release.trackCount === 1 ? "track" : "tracks"}`]
              .filter(Boolean)
              .join(" · ")}
          </p>

          {firstPlayableTrack ? (
            <button
              type="button"
              className="hiplingo-button hiplingo-button--primary"
              onClick={() => {
                if (releaseIsSelected) {
                  onTogglePlayback();
                  return;
                }

                onPlayQueue(
                  getTrackKey(release, firstPlayableTrack),
                  playableTrackKeys,
                );
              }}
              aria-pressed={releaseIsSelected && playbackState.isPlaying}
            >
              {releaseActionLabel}
            </button>
          ) : (
            <span className="hiplingo-release-detail__unavailable">No playable tracks published.</span>
          )}
        </div>
      </section>

      {description ? (
        <section
          className="hiplingo-public-summary hiplingo-release-description"
          aria-labelledby="release-description-heading"
        >
          <span className="hiplingo-kicker">About this release</span>
          <h2 id="release-description-heading">Release notes</h2>
          <p>{description}</p>
        </section>
      ) : null}

      <section className="hiplingo-release-tracklist" aria-labelledby="release-tracklist-heading">
        <div className="hiplingo-release-tracklist__heading">
          <span className="hiplingo-kicker">Track list</span>
          <h2 id="release-tracklist-heading">{release.title}</h2>
        </div>

        <div className="hiplingo-release-tracklist__rows">
          {release.tracks.map((track, index) => {
            const trackArtist = getTrackArtist(track);
            const number = track.trackNumber ?? index + 1;

            if (!track.playable) {
              return (
                <div key={track.id} className="hiplingo-release-track hiplingo-release-track--unavailable">
                  <span className="hiplingo-release-track__number">{number}</span>
                  <span className="hiplingo-release-track__title">
                    <strong>{track.title}</strong>
                    {trackArtist !== artist ? <small>{trackArtist}</small> : null}
                  </span>
                  <span className="hiplingo-release-track__status">Unavailable</span>
                </div>
              );
            }

            const trackKey = getTrackKey(release, track);
            const trackIsSelected =
              playbackState.hasSelection &&
              playbackState.trackKey === trackKey;

            return (
              <button
                key={track.id}
                type="button"
                className="hiplingo-release-track"
                aria-pressed={trackIsSelected && playbackState.isPlaying}
                onClick={() => {
                  if (trackIsSelected) {
                    onTogglePlayback();
                    return;
                  }

                  onPlayQueue(
                    trackKey,
                    playableTrackKeys,
                  );
                }}
              >
                <span className="hiplingo-release-track__number">{number}</span>
                <span className="hiplingo-release-track__title">
                  <strong>{track.title}</strong>
                  {trackArtist !== artist ? <small>{trackArtist}</small> : null}
                </span>
                <span className="hiplingo-release-track__action" aria-hidden="true">
                  {trackIsSelected && playbackState.isPlaying ? "❚❚" : "▶"}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
