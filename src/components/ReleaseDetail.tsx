import { useEffect, useState } from "react";
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
  onNowPlayingWaveformHostChange: (
    element: HTMLDivElement | null,
  ) => void;
};

function ReleaseHeroArtwork({
  release,
  catalog,
  onPlay,
  actionLabel,
  isPlaying = false,
}: {
  release: CatalogRelease;
  catalog: MediaCatalog;
  onPlay?: () => void;
  actionLabel?: string;
  isPlaying?: boolean;
}) {
  const artworkUrl = getMediaUrl(
    catalog.mediaBaseUrl,
    getReleaseArtworkPath(release),
  );

  const artwork = artworkUrl ? (
    <img src={artworkUrl} alt="" />
  ) : (
    <span className="hiplingo-release-artwork-fallback">HL</span>
  );

  if (onPlay) {
    return (
      <button
        type="button"
        className="hiplingo-release-detail__artwork hiplingo-release-detail__artwork--playable"
        onClick={onPlay}
        aria-label={actionLabel ?? `Play ${release.title}`}
        aria-pressed={isPlaying}
      >
        {artwork}
        <span className="hiplingo-release-detail__artwork-play" aria-hidden="true">
          {isPlaying ? "❚❚" : "▶"}
        </span>
      </button>
    );
  }

  return (
    <div className="hiplingo-release-detail__artwork" aria-hidden="true">
      {artwork}
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
  onNowPlayingWaveformHostChange,
}: ReleaseDetailProps) {
  const [selectedRowTrackKey, setSelectedRowTrackKey] =
    useState<string | null>(playbackState.trackKey);

  useEffect(() => {
    setSelectedRowTrackKey(playbackState.trackKey);
  }, [
    playbackState.trackKey,
    releaseId,
  ]);

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
  const releaseIsSelected = Boolean(
    playbackState.hasSelection &&
      playbackState.trackKey &&
      playableTrackKeys.includes(playbackState.trackKey),
  );
  const releaseArtworkActionLabel = releaseIsSelected
    ? playbackState.isPlaying
      ? `Pause ${release.title}`
      : `Resume ${release.title}`
    : `Play ${release.title}`;

  return (
    <main className="hiplingo-page hiplingo-release-detail-page">
      <div className="hiplingo-release-detail__masthead">
        <button type="button" className="hiplingo-release-back" onClick={onBack}>
          ← Releases
        </button>

        <button
          type="button"
          className="hiplingo-release-detail__artist"
          onClick={() => onOpenArtist(artist)}
        >
          {artist}
        </button>
      </div>

      <section className="hiplingo-release-detail__hero">
        <ReleaseHeroArtwork
          release={release}
          catalog={catalog}
          onPlay={
            playableTrackKeys.length > 0
              ? () => {
                  if (releaseIsSelected) {
                    onTogglePlayback();
                    return;
                  }

                  onPlayQueue(playableTrackKeys[0], playableTrackKeys);
                }
              : undefined
          }
          actionLabel={releaseArtworkActionLabel}
          isPlaying={releaseIsSelected && playbackState.isPlaying}
        />

        <div className="hiplingo-release-detail__intro">
          <div
            ref={onNowPlayingWaveformHostChange}
            className="hiplingo-release-detail__now-playing-waveform-host"
          />

          <div className="hiplingo-release-detail__copy">
            <span className="hiplingo-kicker">{type ?? "Release"}</span>
            <h1>{release.title}</h1>
            <p className="hiplingo-release-detail__meta">
              {[date, `${release.trackCount} ${release.trackCount === 1 ? "track" : "tracks"}`]
                .filter(Boolean)
                .join(" · ")}
            </p>

            {playableTrackKeys.length === 0 ? (
              <span className="hiplingo-release-detail__unavailable">No playable tracks published.</span>
            ) : null}
          </div>
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
          <h2 id="release-tracklist-heading">Track list</h2>
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

            const trackActionLabel = trackIsSelected
              ? playbackState.isPlaying
                ? `Pause ${track.title}`
                : `Resume ${track.title}`
              : `Play ${track.title}`;

            return (
              <div
                key={track.id}
                className="hiplingo-release-track"
                data-selected={
                  selectedRowTrackKey === trackKey
                    ? "true"
                    : "false"
                }
                data-playing={
                  trackIsSelected && playbackState.isPlaying
                    ? "true"
                    : "false"
                }
                onClick={() => {
                  setSelectedRowTrackKey(trackKey);
                }}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  setSelectedRowTrackKey(trackKey);
                  onPlayQueue(
                    trackKey,
                    playableTrackKeys,
                  );
                }}
              >
                <span className="hiplingo-release-track__number">{number}</span>
                <button
                  type="button"
                  className="hiplingo-release-track__title"
                  aria-current={
                    selectedRowTrackKey === trackKey
                      ? "true"
                      : undefined
                  }
                  onClick={() => {
                    setSelectedRowTrackKey(trackKey);
                  }}
                >
                  <strong>{track.title}</strong>
                  {trackArtist !== artist ? <small>{trackArtist}</small> : null}
                </button>
                <button
                  type="button"
                  className="hiplingo-release-track__action"
                  aria-label={trackActionLabel}
                  aria-pressed={trackIsSelected && playbackState.isPlaying}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedRowTrackKey(trackKey);

                    if (trackIsSelected) {
                      onTogglePlayback();
                      return;
                    }

                    onPlayQueue(
                      trackKey,
                      playableTrackKeys,
                    );
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <span aria-hidden="true">
                    {trackIsSelected && playbackState.isPlaying ? "❚❚" : "▶"}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
