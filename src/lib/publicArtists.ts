import { getReleaseArtist, getReleaseDate } from "./mediaCatalog";
import type { CatalogRelease, MediaCatalog } from "../types/MediaCatalog";

export type PublicArtist = {
  name: string;
  slug: string;
  releases: CatalogRelease[];
  playableTrackCount: number;
  firstYear: string | null;
  latestYear: string | null;
};

function releaseYear(release: CatalogRelease): string | null {
  const date = getReleaseDate(release);
  const match = date?.match(/^(\d{4})/);
  return match?.[1] ?? null;
}

export function getArtistSlug(name: string): string {
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

export function buildPublicArtists(catalog: MediaCatalog): PublicArtist[] {
  const grouped = new Map<string, CatalogRelease[]>();

  for (const release of catalog.releases) {
    const artist = getReleaseArtist(release);
    const releases = grouped.get(artist) ?? [];
    releases.push(release);
    grouped.set(artist, releases);
  }

  return Array.from(grouped, ([name, releases]) => {
    const years = releases
      .map(releaseYear)
      .filter((year): year is string => Boolean(year))
      .sort();

    return {
      name,
      slug: getArtistSlug(name),
      releases,
      playableTrackCount: releases.reduce(
        (total, release) => total + release.playableTrackCount,
        0,
      ),
      firstYear: years[0] ?? null,
      latestYear: years.at(-1) ?? null,
    };
  }).sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
  );
}

export function findPublicArtist(
  catalog: MediaCatalog,
  slug: string,
): PublicArtist | null {
  const normalizedSlug = slug.toLowerCase();

  return (
    buildPublicArtists(catalog).find(
      (artist) => artist.slug.toLowerCase() === normalizedSlug,
    ) ?? null
  );
}

export function getArtistYearRange(artist: PublicArtist): string | null {
  if (!artist.firstYear || !artist.latestYear) {
    return null;
  }

  return artist.firstYear === artist.latestYear
    ? artist.firstYear
    : `${artist.firstYear}–${artist.latestYear}`;
}
