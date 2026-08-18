import type {
  CatalogRelease,
  CatalogTrack,
  MediaCatalog,
  ResolvedCreditEntry,
  ResolvedCredits,
} from "../types/MediaCatalog";
import type {
  MetadataDocument,
  MetadataValue,
} from "../types/ResolvedMetadata";

const MEDIA_BASE_URL = "/media";

type JsonRecord = Record<string, unknown>;

type PublicCatalogEntry = {
  id: string;
  href: string;
  title: string | null;
  primaryArtist: string | null;
  artworkPath: string | null;
};

export function getTrackKey(
  release: CatalogRelease,
  track: CatalogTrack,
): string {
  return `${release.id}::${track.id}`;
}

export function getMediaUrl(
  mediaBaseUrl: string,
  assetPath: string | null,
): string | null {
  if (!assetPath) {
    return null;
  }

  return `${mediaBaseUrl.replace(/\/$/, "")}/${assetPath.replace(/^\/+/, "")}`;
}

export function getReleaseArtworkPath(
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

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value),
  );
}

function asMetadataDocument(
  value: unknown,
): MetadataDocument | null {
  return isRecord(value)
    ? (value as MetadataDocument)
    : null;
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function getObjectValue(
  value: MetadataValue | undefined,
): Record<string, MetadataValue> | null {
  if (
    value === null ||
    Array.isArray(value) ||
    typeof value !== "object"
  ) {
    return null;
  }

  return value;
}

function getStringValue(
  value: MetadataValue | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function resolveMediaPath(
  documentPath: string,
  href: string | null,
): string | null {
  if (!href) {
    return null;
  }

  const normalizedDocumentPath = documentPath.replace(/^\/+/, "");
  const baseUrl = new URL(
    normalizedDocumentPath,
    "https://hiplingo.invalid/",
  );
  const resolvedUrl = new URL(href, baseUrl);

  if (resolvedUrl.origin !== baseUrl.origin) {
    return null;
  }

  return decodeURIComponent(resolvedUrl.pathname).replace(/^\/+/, "");
}

function directoryForDocument(documentPath: string): string {
  const slashIndex = documentPath.lastIndexOf("/");

  return slashIndex >= 0
    ? documentPath.slice(0, slashIndex)
    : "";
}

function creditEntries(
  value: unknown,
  scope: "release" | "track",
): ResolvedCreditEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const name = stringValue(entry.name);

    if (!name) {
      return [];
    }

    return [
      {
        name,
        role: stringValue(entry.role),
        sortName:
          stringValue(entry.sort_name) ??
          stringValue(entry.sortName),
        provenance: [
          {
            method: "manual" as const,
            scope,
          },
        ],
      },
    ];
  });
}

function publicCredits(
  value: unknown,
  scope: "release" | "track",
): ResolvedCredits {
  const credits = isRecord(value) ? value : {};

  return {
    performers: creditEntries(credits.performers, scope),
    contributors: creditEntries(credits.contributors, scope),
    composers: creditEntries(credits.composers, scope),
    lyricists: creditEntries(credits.lyricists, scope),
    songwriters: creditEntries(credits.songwriters, scope),
    arrangers: creditEntries(credits.arrangers, scope),
    remixers: creditEntries(credits.remixers, scope),
    featuredArtists: creditEntries(
      credits.featured_artists ?? credits.featuredArtists,
      scope,
    ),
    publishing: asMetadataDocument(credits.publishing),
  };
}

function primaryArtistFromCredits(value: unknown): {
  name: string | null;
  sortName: string | null;
} {
  const credits = isRecord(value) ? value : {};
  const primaryArtist = isRecord(credits.primary_artist)
    ? credits.primary_artist
    : {};

  return {
    name: stringValue(primaryArtist.name),
    sortName:
      stringValue(primaryArtist.sort_name) ??
      stringValue(primaryArtist.sortName),
  };
}

function releasePrimaryArtist(value: unknown): {
  name: string | null;
  sortName: string | null;
} {
  const metadata = isRecord(value) ? value : {};
  const primaryArtist = isRecord(metadata.primary_artist)
    ? metadata.primary_artist
    : {};

  return {
    name: stringValue(primaryArtist.name),
    sortName:
      stringValue(primaryArtist.sort_name) ??
      stringValue(primaryArtist.sortName),
  };
}

function releaseDateFromMetadata(value: unknown): string | null {
  const metadata = isRecord(value) ? value : {};
  const dates = isRecord(metadata.dates) ? metadata.dates : {};

  return (
    stringValue(dates.release) ??
    stringValue(dates.original_release) ??
    null
  );
}

function trackNumberFromMetadata(value: unknown): number | null {
  const metadata = isRecord(value) ? value : {};
  const numbering = isRecord(metadata.numbering)
    ? metadata.numbering
    : {};

  return numberValue(numbering.track_number);
}

function trackTitleFromMetadata(
  value: unknown,
  fallback: string,
): string {
  const metadata = isRecord(value) ? value : {};

  return (
    stringValue(metadata.display_title) ??
    stringValue(metadata.title) ??
    fallback
  );
}

function catalogEntries(value: unknown): PublicCatalogEntry[] {
  if (!isRecord(value) || !Array.isArray(value.releases)) {
    throw new Error("Published catalog does not contain a releases array.");
  }

  return value.releases.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const id = stringValue(entry.id);

    if (!id) {
      return [];
    }

    /*
     * metadata-editor catalogs provide href. The older audio-player
     * catalog did not, so derive the canonical release.json location
     * from its directory/id while that contaminated catalog is still
     * present in published-media.
     */
    const href =
      stringValue(entry.href) ??
      `${
        stringValue(entry.directory) ?? `releases/${id}`
      }/release.json`;

    const artwork = isRecord(entry.artwork) ? entry.artwork : {};

    return [
      {
        id,
        href: href.replace(/^\/+/, ""),
        title: stringValue(entry.title),
        primaryArtist:
          stringValue(entry.primaryArtist) ??
          stringValue(entry.artist),
        artworkPath:
          stringValue(artwork.href) ??
          stringValue(artwork.path),
      },
    ];
  });
}

async function fetchJsonDocument(
  path: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const url = getMediaUrl(MEDIA_BASE_URL, path);

  if (!url) {
    throw new Error(`Invalid published-media path: ${path}`);
  }

  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(
      `Failed to load ${path}: ${response.status}`,
    );
  }

  return response.json();
}

function normalizeTrack(
  release: CatalogRelease,
  trackId: string,
  trackPath: string,
  document: unknown,
): CatalogTrack {
  if (!isRecord(document)) {
    throw new Error(
      `Published track metadata is not an object: ${trackPath}`,
    );
  }

  const metadata = isRecord(document.metadata)
    ? document.metadata
    : {};
  const credits = isRecord(document.credits)
    ? document.credits
    : {};
  const stream = isRecord(document.stream)
    ? document.stream
    : {};
  const waveform = isRecord(document.waveform)
    ? document.waveform
    : {};
  const artwork = isRecord(document.artwork)
    ? document.artwork
    : {};

  const primaryArtist = primaryArtistFromCredits(credits);
  const fallbackArtist = getReleaseArtist(release);
  const waveformPath = resolveMediaPath(
    trackPath,
    stringValue(waveform.href),
  );
  const streamPath = resolveMediaPath(
    trackPath,
    stringValue(stream.href),
  );
  const artworkPath = resolveMediaPath(
    trackPath,
    stringValue(artwork.href),
  );
  const resolvedCredits = publicCredits(credits, "track");
  const metadataDocument = asMetadataDocument(metadata);
  const creditsDocument = asMetadataDocument(credits);

  const trackNumber = trackNumberFromMetadata(metadata);
  const title = trackTitleFromMetadata(metadata, trackId);

  return {
    id: stringValue(document.id) ?? trackId,
    directory: directoryForDocument(trackPath),
    artist: primaryArtist.name ?? fallbackArtist,
    trackNumber,
    title,
    artwork: {
      source: artworkPath
        ? artwork.inheritedFromRelease === true
          ? "release"
          : "track"
        : null,
      path: artworkPath,
    },
    assets: {
      audioMaster: null,
      audioPlayback: null,
      stream: streamPath
        ? {
            path: streamPath,
            protocol: stringValue(stream.protocol),
            codec: stringValue(stream.codec),
            bitrateKbps: numberValue(stream.bitrateKbps),
          }
        : null,
      waveform: waveformPath,
    },
    metadataSources: {
      track: trackPath,
      credits: trackPath,
      productionNotes: null,
      analysis: null,
      waveform: waveformPath,
    },
    metadata: {
      authored: {
        track: metadataDocument,
        credits: resolvedCredits,
        productionNotes: null,
      },
      generated: {
        analysis: null,
        waveform: null,
      },
      resolved: {
        display: {
          title,
          source: metadataDocument?.display_title
            ? "authored-display-title"
            : metadataDocument?.title
              ? "authored-fields"
              : "directory",
        },
        primaryArtist: {
          name: primaryArtist.name ?? fallbackArtist,
          sortName: primaryArtist.sortName,
          source: primaryArtist.name ? "track" : "release",
        },
        language: {
          value: stringValue(metadata.language),
          source: stringValue(metadata.language)
            ? "track"
            : "missing",
        },
        releaseDate: {
          value: releaseDateFromMetadata(metadata) ?? release.date,
          source: releaseDateFromMetadata(metadata)
            ? "track"
            : release.date
              ? "release"
              : "missing",
        },
        genres: {
          values: [],
          source: "missing",
        },
        styles: {
          values: [],
          source: "missing",
        },
        moods: {
          values: [],
          source: "missing",
        },
        tags: {
          values: [],
          source: "missing",
        },
        track: metadataDocument,
        credits: creditsDocument,
        production: null,
        analysis: null,
        waveform: null,
      },
      diagnostics: [],
      validation: [],
    },
    playable: Boolean(streamPath),
  };
}

async function hydrateRelease(
  entry: PublicCatalogEntry,
  signal?: AbortSignal,
): Promise<CatalogRelease> {
  const document = await fetchJsonDocument(entry.href, signal);

  if (!isRecord(document)) {
    throw new Error(
      `Published release metadata is not an object: ${entry.href}`,
    );
  }

  const metadata = isRecord(document.metadata)
    ? document.metadata
    : {};
  const artwork = isRecord(document.artwork)
    ? document.artwork
    : {};
  const frontArtwork = isRecord(artwork.front)
    ? artwork.front
    : {};
  const releaseArtist = releasePrimaryArtist(metadata);

  if (!releaseArtist.name && entry.primaryArtist) {
    metadata.primary_artist = {
      name: entry.primaryArtist,
      sort_name: "",
    };
  }

  const releaseArtworkPath =
    resolveMediaPath(
      entry.href,
      stringValue(frontArtwork.href),
    ) ?? entry.artworkPath;

  const trackReferences = Array.isArray(document.tracks)
    ? document.tracks
    : [];

  const release: CatalogRelease = {
    id: stringValue(document.id) ?? entry.id,
    directory: directoryForDocument(entry.href),
    date: releaseDateFromMetadata(metadata),
    title:
      stringValue(metadata.title) ??
      entry.title ??
      entry.id,
    artwork: releaseArtworkPath,
    metadataSources: {
      release: entry.href,
      productionNotes: null,
      settings: null,
    },
    metadata: {
      authored: {
        release: asMetadataDocument(metadata),
        productionNotes: null,
        settings: null,
      },
      resolved: {
        release: asMetadataDocument(metadata),
        production: null,
        settings: null,
      },
      diagnostics: [],
      validation: [],
    },
    trackCount: trackReferences.length,
    playableTrackCount: 0,
    tracks: [],
  };

  const tracks = await Promise.all(
    trackReferences.flatMap((reference, index) => {
      if (!isRecord(reference)) {
        return [];
      }

      const trackId =
        stringValue(reference.id) ??
        `${entry.id}-track-${index + 1}`;
      const trackPath = resolveMediaPath(
        entry.href,
        stringValue(reference.href),
      );

      if (!trackPath) {
        return [];
      }

      return [
        fetchJsonDocument(trackPath, signal).then((trackDocument) =>
          normalizeTrack(
            release,
            trackId,
            trackPath,
            trackDocument,
          ),
        ),
      ];
    }),
  );

  tracks.sort((left, right) => {
    const leftNumber = left.trackNumber ?? Number.MAX_SAFE_INTEGER;
    const rightNumber = right.trackNumber ?? Number.MAX_SAFE_INTEGER;

    if (leftNumber !== rightNumber) {
      return leftNumber - rightNumber;
    }

    return left.id.localeCompare(right.id, undefined, {
      numeric: true,
    });
  });

  release.tracks = tracks;
  release.trackCount = tracks.length;
  release.playableTrackCount = tracks.filter(
    (track) => track.playable,
  ).length;

  return release;
}

export function getReleaseArtistId(
  release: CatalogRelease,
): string | null {
  const releaseMetadata =
    release.metadata.resolved.release;
  const primaryArtist = getObjectValue(
    releaseMetadata?.primary_artist,
  );

  return getStringValue(primaryArtist?.id);
}

export function getReleaseArtist(
  release: CatalogRelease,
): string {
  const releaseMetadata = release.metadata.resolved.release;
  const primaryArtist = getObjectValue(
    releaseMetadata?.primary_artist,
  );
  const authoredArtist = getStringValue(primaryArtist?.name);

  if (authoredArtist) {
    return authoredArtist;
  }

  for (const track of release.tracks) {
    const resolvedArtist =
      track.metadata.resolved.primaryArtist.name ??
      track.artist;

    if (resolvedArtist?.trim()) {
      return resolvedArtist.trim();
    }
  }

  return "Unknown artist";
}



export function formatPublicRuntime(
  durationSeconds: number | null | undefined,
): string | null {
  if (
    durationSeconds == null ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds < 0
  ) {
    return null;
  }

  const rounded = Math.max(
    0,
    Math.round(durationSeconds),
  );
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor(
    (rounded % 3600) / 60,
  );
  const seconds = rounded % 60;

  if (hours > 0) {
    return [
      hours,
      String(minutes).padStart(2, "0"),
      String(seconds).padStart(2, "0"),
    ].join(":");
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function hlsExtinfDurationSeconds(
  playlist: string,
): number | null {
  const durations = [
    ...playlist.matchAll(
      /^#EXTINF:([0-9]+(?:\.[0-9]+)?)/gm,
    ),
  ]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));

  if (durations.length === 0) {
    return null;
  }

  return durations.reduce(
    (total, value) => total + value,
    0,
  );
}

function firstHlsChildPlaylist(
  playlist: string,
): string | null {
  return (
    playlist
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(
        (line) =>
          line.length > 0 &&
          !line.startsWith("#") &&
          /\.m3u8(?:\?|$)/i.test(line),
      ) ?? null
  );
}

async function fetchHlsDurationSeconds(
  playlistUrl: string,
  signal?: AbortSignal,
  allowChildPlaylist = true,
): Promise<number | null> {
  const response = await fetch(playlistUrl, {
    signal,
    cache: "no-cache",
  });

  if (!response.ok) {
    return null;
  }

  const playlist = await response.text();
  const directDuration =
    hlsExtinfDurationSeconds(playlist);

  if (directDuration != null) {
    return directDuration;
  }

  if (!allowChildPlaylist) {
    return null;
  }

  const child = firstHlsChildPlaylist(playlist);

  if (!child) {
    return null;
  }

  const childUrl = new URL(
    child,
    new URL(playlistUrl, window.location.href),
  ).toString();

  return fetchHlsDurationSeconds(
    childUrl,
    signal,
    false,
  );
}

export async function fetchPublishedTrackDurationSeconds(
  catalog: MediaCatalog,
  track: CatalogTrack,
  signal?: AbortSignal,
): Promise<number | null> {
  if (
    getTrackPlaybackProtocol(track) !== "hls"
  ) {
    return null;
  }

  const playbackPath =
    getTrackPlaybackPath(track);

  if (!playbackPath) {
    return null;
  }

  const playlistUrl = getMediaUrl(
    catalog.mediaBaseUrl,
    playbackPath,
  );

  if (!playlistUrl) {
    return null;
  }

  return fetchHlsDurationSeconds(
    playlistUrl,
    signal,
  );
}

export function formatPublicDate(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const [year, month, day] = value
    .split("-")
    .map(Number);
  const date = new Date(
    Date.UTC(year, month - 1, day),
  );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    },
  ).format(date);
}

export function getReleaseDate(
  release: CatalogRelease,
): string | null {
  const releaseMetadata = release.metadata.resolved.release;
  const dates = getObjectValue(releaseMetadata?.dates);

  return (
    getStringValue(dates?.release) ??
    release.date
  );
}

export function getReleaseType(
  release: CatalogRelease,
): string | null {
  return getStringValue(
    release.metadata.resolved.release?.type,
  );
}

export function getReleaseDescription(
  release: CatalogRelease,
): string | null {
  return getStringValue(
    release.metadata.resolved.release?.description,
  );
}

export function getTrackArtist(
  track: CatalogTrack,
): string {
  return (
    track.metadata.resolved.primaryArtist.name ??
    track.artist ??
    "Unknown artist"
  );
}

export function getTrackPlaybackPath(
  track: CatalogTrack,
): string | null {
  return (
    track.assets.stream?.path ??
    track.assets.audioPlayback
  );
}

export function getTrackPlaybackProtocol(
  track: CatalogTrack,
): string | null {
  return track.assets.stream?.protocol ?? null;
}

export async function fetchMediaCatalog(
  signal?: AbortSignal,
): Promise<MediaCatalog> {
  const response = await fetch(`${MEDIA_BASE_URL}/catalog.json`, {
    signal,
  });

  if (!response.ok) {
    throw new Error(
      `Failed to load catalog: ${response.status}`,
    );
  }

  const publicCatalog = (await response.json()) as unknown;
  const entries = catalogEntries(publicCatalog);
  const releases = await Promise.all(
    entries.map((entry) => hydrateRelease(entry, signal)),
  );

  releases.sort((left, right) => {
    const leftDate = getReleaseDate(left) ?? "";
    const rightDate = getReleaseDate(right) ?? "";

    if (leftDate !== rightDate) {
      return rightDate.localeCompare(leftDate);
    }

    return left.id.localeCompare(right.id, undefined, {
      numeric: true,
    });
  });

  const trackCount = releases.reduce(
    (total, release) => total + release.trackCount,
    0,
  );
  const playableTrackCount = releases.reduce(
    (total, release) => total + release.playableTrackCount,
    0,
  );

  const catalogRecord = isRecord(publicCatalog)
    ? publicCatalog
    : {};
  const schema = isRecord(catalogRecord.schema)
    ? catalogRecord.schema
    : {};

  return {
    version:
      numberValue(schema.version) ??
      numberValue(catalogRecord.version) ??
      1,
    generatedAt:
      stringValue(catalogRecord.generatedAt) ??
      "",
    mediaBaseUrl: MEDIA_BASE_URL,
    releaseCount: releases.length,
    trackCount,
    playableTrackCount,
    releases,
  };
}
