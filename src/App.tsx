import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import ArtistCatalog from "./components/ArtistCatalog";
import ArtistDetail from "./components/ArtistDetail";
import AudioPlayer, {
  type AudioPlayerHandle,
  type PlaybackStateSnapshot,
} from "./components/AudioPlayer";
import ReleaseCatalog from "./components/ReleaseCatalog";
import ReleaseDetail from "./components/ReleaseDetail";
import {
  fetchMediaCatalog,
  getMediaUrl,
  getReleaseArtist,
  getReleaseArtworkPath,
  getReleaseDate,
  getTrackKey,
} from "./lib/mediaCatalog";
import { getArtistSlug } from "./lib/publicArtists";
import type { CatalogRelease, MediaCatalog } from "./types/MediaCatalog";

type SiteRoute =
  | "/"
  | "/listen"
  | "/releases"
  | "/artists"
  | "/journal"
  | "/jam"
  | "/about";

type ParsedRoute = {
  section: SiteRoute;
  releaseId: string | null;
  artistSlug: string | null;
};

const SITE_ROUTES = new Set<SiteRoute>([
  "/",
  "/listen",
  "/releases",
  "/artists",
  "/journal",
  "/jam",
  "/about",
]);

function parseRoute(pathname: string): ParsedRoute {
  const route = pathname.replace(/\/+$/, "") || "/";

  if (SITE_ROUTES.has(route as SiteRoute)) {
    return {
      section: route as SiteRoute,
      releaseId: null,
      artistSlug: null,
    };
  }

  const releaseMatch = route.match(/^\/releases\/([^/]+)$/);

  if (releaseMatch) {
    try {
      return {
        section: "/releases",
        releaseId: decodeURIComponent(releaseMatch[1]),
        artistSlug: null,
      };
    } catch {
      return {
        section: "/releases",
        releaseId: releaseMatch[1],
        artistSlug: null,
      };
    }
  }

  const artistMatch = route.match(/^\/artists\/([^/]+)$/);

  if (artistMatch) {
    try {
      return {
        section: "/artists",
        releaseId: null,
        artistSlug: decodeURIComponent(artistMatch[1]),
      };
    } catch {
      return {
        section: "/artists",
        releaseId: null,
        artistSlug: artistMatch[1],
      };
    }
  }

  return {
    section: "/",
    releaseId: null,
    artistSlug: null,
  };
}

function getLocationKey() {
  return `${window.location.pathname}${window.location.search}`;
}

function navigateTo(route: string) {
  if (getLocationKey() !== route) {
    window.history.pushState({}, "", route);
  }

  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

type SiteLinkProps = {
  route: string;
  children: ReactNode;
  className?: string;
  currentRoute?: SiteRoute;
};

function SiteLink({
  route,
  children,
  className,
  currentRoute,
}: SiteLinkProps) {
  return (
    <a
      href={route}
      className={className}
      aria-current={currentRoute === route ? "page" : undefined}
      onClick={(event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        event.preventDefault();
        navigateTo(route);
      }}
    >
      {children}
    </a>
  );
}

function SiteHeader({
  currentRoute,
  libraryAvailable,
  onBrowseLibrary,
  onTogglePlayerMenu,
}: {
  currentRoute: SiteRoute;
  libraryAvailable: boolean;
  onBrowseLibrary: () => void;
  onTogglePlayerMenu: () => void;
}) {
  return (
    <header className="hiplingo-site-header">
      <SiteLink
        route="/"
        currentRoute={currentRoute}
        className="hiplingo-site-brand"
      >
        <img
          src="/brand/hiplingo-logo-white.webp"
          alt=""
          aria-hidden="true"
        />
        <span>Hiplingo</span>
      </SiteLink>

      <nav className="hiplingo-site-nav" aria-label="Main navigation">
        <SiteLink route="/listen" currentRoute={currentRoute}>
          Listen
        </SiteLink>
        <SiteLink route="/releases" currentRoute={currentRoute}>
          Releases
        </SiteLink>
        <SiteLink route="/artists" currentRoute={currentRoute}>
          Artists
        </SiteLink>
        <SiteLink route="/journal" currentRoute={currentRoute}>
          Journal
        </SiteLink>
        <SiteLink route="/jam" currentRoute={currentRoute}>
          Jam Agreement
        </SiteLink>
      </nav>

      <div className="hiplingo-site-actions">
        <button
          type="button"
          className="hiplingo-site-browse"
          disabled={!libraryAvailable}
          onClick={onBrowseLibrary}
          aria-haspopup="dialog"
        >
          <span className="hiplingo-site-browse__wide">Browse Library</span>
          <span className="hiplingo-site-browse__short">Browse</span>
        </button>

        <button
          type="button"
          className="hiplingo-site-menu"
          onClick={onTogglePlayerMenu}
          aria-label="Open player settings"
          aria-haspopup="dialog"
        >
          <span aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

function FeaturedRelease({
  catalog,
  release,
  playbackState,
  onOpenRelease,
  onPlayQueue,
  onTogglePlayback,
}: {
  catalog: MediaCatalog;
  release: CatalogRelease;
  playbackState: PlaybackStateSnapshot;
  onOpenRelease: (releaseId: string) => void;
  onPlayQueue: (trackKey: string, queueTrackKeys: string[]) => void;
  onTogglePlayback: () => void;
}) {
  const artworkUrl = getMediaUrl(
    catalog.mediaBaseUrl,
    getReleaseArtworkPath(release),
  );
  const artist = getReleaseArtist(release);
  const date = getReleaseDate(release);
  const playableTracks = release.tracks.filter((track) => track.playable);
  const queueTrackKeys = playableTracks.map((track) =>
    getTrackKey(release, track),
  );
  const firstPlayableTrack = playableTracks[0] ?? null;
  const releaseIsSelected = Boolean(
    playbackState.hasSelection &&
      playbackState.trackKey &&
      queueTrackKeys.includes(playbackState.trackKey),
  );
  const releaseActionLabel = releaseIsSelected
    ? playbackState.isPlaying
      ? "❚❚ Pause"
      : "▶ Resume"
    : "▶ Play release";

  return (
    <section className="hiplingo-home-release" aria-labelledby="hiplingo-latest-release-title">
      <button
        type="button"
        className="hiplingo-home-release__artwork"
        onClick={() => onOpenRelease(release.id)}
        aria-label={`Open ${release.title}`}
      >
        {artworkUrl ? (
          <img src={artworkUrl} alt="" />
        ) : (
          <span className="hiplingo-release-artwork-fallback">HL</span>
        )}
      </button>

      <div className="hiplingo-home-release__copy">
        <span className="hiplingo-kicker">Latest release</span>
        <h2 id="hiplingo-latest-release-title">{release.title}</h2>
        <p className="hiplingo-home-release__artist">{artist}</p>
        <p className="hiplingo-home-release__meta">
          {[date, `${release.trackCount} ${release.trackCount === 1 ? "track" : "tracks"}`]
            .filter(Boolean)
            .join(" · ")}
        </p>

        <div className="hiplingo-home-release__actions">
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
                  queueTrackKeys,
                );
              }}
              aria-pressed={releaseIsSelected && playbackState.isPlaying}
            >
              {releaseActionLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="hiplingo-button"
            onClick={() => onOpenRelease(release.id)}
          >
            View release
          </button>
        </div>
      </div>
    </section>
  );
}

function HomePage({
  currentRoute,
  catalog,
  loading,
  error,
  playbackState,
  onOpenRelease,
  onPlayQueue,
  onTogglePlayback,
}: {
  currentRoute: SiteRoute;
  catalog: MediaCatalog | null;
  loading: boolean;
  error: string | null;
  playbackState: PlaybackStateSnapshot;
  onOpenRelease: (releaseId: string) => void;
  onPlayQueue: (trackKey: string, queueTrackKeys: string[]) => void;
  onTogglePlayback: () => void;
}) {
  const latestRelease = catalog?.releases[0] ?? null;

  return (
    <main className="hiplingo-page hiplingo-home">
      <section className="hiplingo-hero">
        <div className="hiplingo-hero__banner" aria-hidden="true" />
        <div className="hiplingo-hero__identity">
          <div className="hiplingo-hero__logo" aria-hidden="true">
            <img src="/brand/hiplingo-logo-white.webp" alt="" />
          </div>

          <div className="hiplingo-hero__copy">
            <span className="hiplingo-kicker">Independent record label</span>
            <h1>Music first. Context included.</h1>
            <p>
              Releases, artists, sessions, and the stories around them—built
              around a focused listening experience.
            </p>

            <div className="hiplingo-hero__actions">
              <SiteLink
                route="/releases"
                currentRoute={currentRoute}
                className="hiplingo-button hiplingo-button--primary"
              >
                Browse releases
              </SiteLink>
              <SiteLink
                route="/listen"
                currentRoute={currentRoute}
                className="hiplingo-button"
              >
                Open full player
              </SiteLink>
            </div>
          </div>
        </div>
      </section>

      {latestRelease && catalog ? (
        <FeaturedRelease
          catalog={catalog}
          release={latestRelease}
          playbackState={playbackState}
          onOpenRelease={onOpenRelease}
          onPlayQueue={onPlayQueue}
          onTogglePlayback={onTogglePlayback}
        />
      ) : loading ? (
        <section className="hiplingo-home-release hiplingo-home-release--state" aria-live="polite">
          <span className="hiplingo-kicker">Catalog</span>
          <strong>Loading the latest release…</strong>
        </section>
      ) : error ? (
        <section className="hiplingo-home-release hiplingo-home-release--state" role="status">
          <span className="hiplingo-kicker">Catalog</span>
          <strong>Published releases are temporarily unavailable.</strong>
        </section>
      ) : null}

      <section className="hiplingo-feature-grid" aria-label="Explore Hiplingo">
        <SiteLink route="/artists" className="hiplingo-feature-card">
          <span>Artists</span>
          <strong>Artist presentations</strong>
          <p>Profiles, releases, credits, media, and long-form context.</p>
        </SiteLink>
        <SiteLink route="/journal" className="hiplingo-feature-card">
          <span>Journal</span>
          <strong>Stories behind the work</strong>
          <p>Sessions, production notes, announcements, and label writing.</p>
        </SiteLink>
        <SiteLink route="/jam" className="hiplingo-feature-card">
          <span>Collaborate</span>
          <strong>Jam Agreement</strong>
          <p>A clear participant-facing path into collaborative sessions.</p>
        </SiteLink>
      </section>
    </main>
  );
}

function PlaceholderPage({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <main className="hiplingo-page hiplingo-placeholder-page">
      <section className="hiplingo-placeholder-card">
        <span className="hiplingo-kicker">{eyebrow}</span>
        <h1>{title}</h1>
        <div className="hiplingo-placeholder-copy">{children}</div>
        {action ? <div className="hiplingo-placeholder-action">{action}</div> : null}
      </section>
    </main>
  );
}

function SiteFooter({ currentRoute }: { currentRoute: SiteRoute }) {
  return (
    <footer className="hiplingo-site-footer">
      <span>© {new Date().getFullYear()} Hiplingo</span>
      <SiteLink route="/about" currentRoute={currentRoute}>
        About
      </SiteLink>
    </footer>
  );
}

export default function App() {
  const [locationKey, setLocationKey] = useState(getLocationKey);
  const [catalog, setCatalog] = useState<MediaCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [playbackState, setPlaybackState] = useState<PlaybackStateSnapshot>({
    trackKey: null,
    isPlaying: false,
    hasSelection: false,
  });
  const audioPlayerRef = useRef<AudioPlayerHandle | null>(null);

  const currentLocation = new URL(
    locationKey,
    window.location.origin,
  );
  const route = parseRoute(currentLocation.pathname);
  const requestedTrackKey = currentLocation.searchParams.get(
    "track",
  );

  useEffect(() => {
    const handleNavigation = () => {
      setLocationKey(getLocationKey());
    };

    window.addEventListener("popstate", handleNavigation);

    return () => {
      window.removeEventListener("popstate", handleNavigation);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCatalog() {
      setCatalogLoading(true);

      try {
        const loadedCatalog = await fetchMediaCatalog(controller.signal);
        setCatalog(loadedCatalog);
        setCatalogError(null);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setCatalog(null);
        setCatalogError(
          error instanceof Error
            ? error.message
            : "Failed to load media catalog.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setCatalogLoading(false);
        }
      }
    }

    void loadCatalog();

    return () => {
      controller.abort();
    };
  }, []);

  function requestPlayback(
    trackKey: string,
    queueTrackKeys: string[],
  ) {
    audioPlayerRef.current?.playQueue({
      trackKey,
      queueTrackKeys,
      autoplay: true,
    });
  }

  function requestTogglePlayback() {
    audioPlayerRef.current?.togglePlayback();
  }

  function requestOpenLibrary() {
    audioPlayerRef.current?.openLibrary();
  }

  function requestTogglePlayerMenu() {
    audioPlayerRef.current?.toggleSettings();
  }

  let content: ReactNode;

  switch (route.section) {
    case "/listen":
      content = null;
      break;

    case "/releases":
      content = route.releaseId ? (
        <ReleaseDetail
          catalog={catalog}
          releaseId={route.releaseId}
          loading={catalogLoading}
          error={catalogError}
          onBack={() => navigateTo("/releases")}
          onOpenArtist={(artistName) => {
            navigateTo(
              `/artists/${encodeURIComponent(getArtistSlug(artistName))}`,
            );
          }}
          playbackState={playbackState}
          onPlayQueue={requestPlayback}
          onTogglePlayback={requestTogglePlayback}
        />
      ) : (
        <ReleaseCatalog
          catalog={catalog}
          loading={catalogLoading}
          error={catalogError}
          onOpenRelease={(releaseId) => {
            navigateTo(`/releases/${encodeURIComponent(releaseId)}`);
          }}
        />
      );
      break;

    case "/artists":
      content = route.artistSlug ? (
        <ArtistDetail
          catalog={catalog}
          artistSlug={route.artistSlug}
          loading={catalogLoading}
          error={catalogError}
          onBack={() => navigateTo("/artists")}
          onOpenRelease={(releaseId) => {
            navigateTo(`/releases/${encodeURIComponent(releaseId)}`);
          }}
        />
      ) : (
        <ArtistCatalog
          catalog={catalog}
          loading={catalogLoading}
          error={catalogError}
          onOpenArtist={(artistSlug) => {
            navigateTo(`/artists/${encodeURIComponent(artistSlug)}`);
          }}
        />
      );
      break;

    case "/journal":
      content = (
        <PlaceholderPage eyebrow="Stories" title="Journal">
          <p>
            A home for session notes, production stories, release context,
            announcements, and other blog-style presentations.
          </p>
        </PlaceholderPage>
      );
      break;

    case "/jam":
      content = (
        <PlaceholderPage eyebrow="Collaborate" title="Jam Agreement">
          <p>
            Hiplingo is preparing a participant-facing agreement flow for
            musicians and artists joining collaborative creative sessions.
          </p>
          <p>
            The private rights, provenance, session, and commercial-clearance
            manager remains an administrative tool and is not exposed here.
          </p>
        </PlaceholderPage>
      );
      break;

    case "/about":
      content = (
        <PlaceholderPage eyebrow="Label" title="About Hiplingo">
          <p>
            Hiplingo is an independent record-label and media project centered
            on recorded music, collaborative creation, provenance, and durable
            presentation of the work around each release.
          </p>
        </PlaceholderPage>
      );
      break;

    default:
      content = (
        <HomePage
          currentRoute={route.section}
          catalog={catalog}
          loading={catalogLoading}
          error={catalogError}
          playbackState={playbackState}
          onOpenRelease={(releaseId) => {
            navigateTo(`/releases/${encodeURIComponent(releaseId)}`);
          }}
          onPlayQueue={requestPlayback}
          onTogglePlayback={requestTogglePlayback}
        />
      );
      break;
  }

  const playerDisplayMode =
    route.section === "/listen" ? "full" : "compact";

  return (
    <div className="hiplingo-site-shell">
      <SiteHeader
        currentRoute={route.section}
        libraryAvailable={Boolean(
          catalog?.releases.some((release) =>
            release.tracks.some((track) => track.playable),
          ),
        )}
        onBrowseLibrary={requestOpenLibrary}
        onTogglePlayerMenu={requestTogglePlayerMenu}
      />

      <div className="hiplingo-route-content">
        {content}
      </div>

      <div
        className={`hiplingo-player-page hiplingo-player-host--${playerDisplayMode}`}
        role={playerDisplayMode === "full" ? "main" : undefined}
      >
        <AudioPlayer
          ref={audioPlayerRef}
          catalog={catalog}
          catalogError={catalogError}
          initialTrackKey={requestedTrackKey}
          displayMode={playerDisplayMode}
          onOpenFullPlayer={() => navigateTo("/listen")}
          onPlaybackStateChange={setPlaybackState}
        />
      </div>

      <SiteFooter currentRoute={route.section} />
    </div>
  );
}
