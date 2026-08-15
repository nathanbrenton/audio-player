import {
  getMediaUrl,
  getReleaseArtistId,
  getReleaseDate,
} from "./mediaCatalog";
import type {
  CatalogRelease,
  MediaCatalog,
} from "../types/MediaCatalog";

type JsonRecord = Record<string, unknown>;

type ArtistCatalogEntry = {
  id: string;
  slug: string;
  displayName: string;
  href: string;
};

export type PublicArtistPhoto = {
  id: string;
  path: string;
  primary: boolean;
};

export type PublicArtist = {
  id: string;
  name: string;
  slug: string;
  href: string;
  bio: string | null;
  primaryPhotoPath: string | null;
  photos: PublicArtistPhoto[];
  releases: CatalogRelease[];
  playableTrackCount: number;
  firstYear: string | null;
  latestYear: string | null;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value),
  );
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function releaseYear(
  release: CatalogRelease,
): string | null {
  const date = getReleaseDate(release);
  const match = date?.match(/^(\d{4})/);

  return match?.[1] ?? null;
}

function resolvePublishedPath(
  documentPath: string,
  href: string,
): string {
  const normalizedDocumentPath =
    documentPath.replace(/^\/+/, "");
  const baseUrl = new URL(
    normalizedDocumentPath,
    "https://hiplingo.invalid/",
  );
  const resolvedUrl = new URL(href, baseUrl);

  if (resolvedUrl.origin !== baseUrl.origin) {
    throw new Error(
      `Published Artist asset escapes /media/: ${href}`,
    );
  }

  return decodeURIComponent(
    resolvedUrl.pathname,
  ).replace(/^\/+/, "");
}

async function fetchPublishedJson(
  mediaBaseUrl: string,
  path: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const url = getMediaUrl(
    mediaBaseUrl,
    path,
  );

  if (!url) {
    throw new Error(
      `Invalid published Artist path: ${path}`,
    );
  }

  const response = await fetch(url, {
    signal,
  });

  if (!response.ok) {
    throw new Error(
      `Failed to load ${path}: ${response.status}`,
    );
  }

  return response.json();
}

function parseArtistCatalog(
  value: unknown,
): ArtistCatalogEntry[] {
  if (
    !isRecord(value) ||
    !Array.isArray(value.artists)
  ) {
    throw new Error(
      "Published artists.json is invalid.",
    );
  }

  return value.artists.map(
    (raw): ArtistCatalogEntry => {
      if (!isRecord(raw)) {
        throw new Error(
          "Published artists.json contains an invalid Artist reference.",
        );
      }

      const id = stringValue(raw.id);
      const slug = stringValue(raw.slug);
      const displayName =
        stringValue(raw.displayName);
      const href = stringValue(raw.href);

      if (
        !id ||
        !slug ||
        !displayName ||
        !href
      ) {
        throw new Error(
          "Published artists.json contains an incomplete Artist reference.",
        );
      }

      return {
        id,
        slug,
        displayName,
        href: href.replace(/^\/+/, ""),
      };
    },
  );
}

function releasesForArtist(
  catalog: MediaCatalog,
  artistId: string,
): CatalogRelease[] {
  return catalog.releases
    .filter(
      (release) =>
        getReleaseArtistId(release) ===
        artistId,
    )
    .sort((left, right) => {
      const leftDate =
        getReleaseDate(left) ?? "";
      const rightDate =
        getReleaseDate(right) ?? "";

      if (leftDate !== rightDate) {
        return rightDate.localeCompare(
          leftDate,
        );
      }

      return left.id.localeCompare(
        right.id,
        undefined,
        { numeric: true },
      );
    });
}

function artistYears(
  releases: CatalogRelease[],
): {
  firstYear: string | null;
  latestYear: string | null;
} {
  const years = releases
    .map(releaseYear)
    .filter(
      (year): year is string =>
        Boolean(year),
    )
    .sort();

  return {
    firstYear: years[0] ?? null,
    latestYear: years.at(-1) ?? null,
  };
}

async function hydrateArtist(
  catalog: MediaCatalog,
  entry: ArtistCatalogEntry,
  signal?: AbortSignal,
): Promise<PublicArtist> {
  const raw = await fetchPublishedJson(
    catalog.mediaBaseUrl,
    entry.href,
    signal,
  );

  if (!isRecord(raw)) {
    throw new Error(
      `Published Artist document is invalid: ${entry.href}`,
    );
  }

  const id = stringValue(raw.id);
  const slug = stringValue(raw.slug);
  const displayName =
    stringValue(raw.displayName);

  if (
    id !== entry.id ||
    slug !== entry.slug ||
    displayName !== entry.displayName
  ) {
    throw new Error(
      `Published Artist identity mismatch: ${entry.href}`,
    );
  }

  const photoValues = Array.isArray(
    raw.photos,
  )
    ? raw.photos
    : [];

  const photos: PublicArtistPhoto[] =
    photoValues.map((rawPhoto) => {
      if (!isRecord(rawPhoto)) {
        throw new Error(
          `Published Artist photo is invalid: ${entry.href}`,
        );
      }

      const photoId =
        stringValue(rawPhoto.id);
      const href =
        stringValue(rawPhoto.href);

      if (!photoId || !href) {
        throw new Error(
          `Published Artist photo is incomplete: ${entry.href}`,
        );
      }

      return {
        id: photoId,
        path: resolvePublishedPath(
          entry.href,
          href,
        ),
        primary:
          rawPhoto.primary === true,
      };
    });

  const primaryPhoto =
    isRecord(raw.primaryPhoto)
      ? raw.primaryPhoto
      : null;
  const primaryHref =
    primaryPhoto
      ? stringValue(
          primaryPhoto.href,
        )
      : null;

  const primaryPhotoPath =
    primaryHref
      ? resolvePublishedPath(
          entry.href,
          primaryHref,
        )
      : (
          photos.find(
            (photo) =>
              photo.primary,
          )?.path ?? null
        );

  const releases = releasesForArtist(
    catalog,
    entry.id,
  );

  const years = artistYears(
    releases,
  );

  return {
    id: entry.id,
    name: entry.displayName,
    slug: entry.slug,
    href: entry.href,
    bio: stringValue(raw.bio),
    primaryPhotoPath,
    photos,
    releases,
    playableTrackCount:
      releases.reduce(
        (total, release) =>
          total +
          release.playableTrackCount,
        0,
      ),
    ...years,
  };
}

async function fetchArtistEntries(
  catalog: MediaCatalog,
  signal?: AbortSignal,
): Promise<ArtistCatalogEntry[]> {
  const raw = await fetchPublishedJson(
    catalog.mediaBaseUrl,
    "artists.json",
    signal,
  );

  return parseArtistCatalog(raw);
}

export async function fetchPublicArtists(
  catalog: MediaCatalog,
  signal?: AbortSignal,
): Promise<PublicArtist[]> {
  const entries =
    await fetchArtistEntries(
      catalog,
      signal,
    );

  const artists =
    await Promise.all(
      entries.map(
        (entry) =>
          hydrateArtist(
            catalog,
            entry,
            signal,
          ),
      ),
    );

  return artists.sort(
    (left, right) =>
      left.name.localeCompare(
        right.name,
        undefined,
        {
          sensitivity: "base",
        },
      ),
  );
}

export async function fetchPublicArtist(
  catalog: MediaCatalog,
  slug: string,
  signal?: AbortSignal,
): Promise<PublicArtist | null> {
  const entries =
    await fetchArtistEntries(
      catalog,
      signal,
    );

  const normalizedSlug =
    slug.toLowerCase();

  const entry =
    entries.find(
      (candidate) =>
        candidate.slug.toLowerCase() ===
        normalizedSlug,
    ) ?? null;

  if (!entry) {
    return null;
  }

  return hydrateArtist(
    catalog,
    entry,
    signal,
  );
}

/*
 * URL convenience for the existing release-page Artist link.
 * Artist publication membership and release association never use
 * this name-derived value; those use the stable Artist ID.
 */
export function getArtistSlug(
  name: string,
): string {
  const slug = name
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "artist";
}

export function getArtistYearRange(
  artist: PublicArtist,
): string | null {
  if (
    !artist.firstYear ||
    !artist.latestYear
  ) {
    return null;
  }

  return artist.firstYear ===
    artist.latestYear
    ? artist.firstYear
    : `${artist.firstYear}–${artist.latestYear}`;
}
