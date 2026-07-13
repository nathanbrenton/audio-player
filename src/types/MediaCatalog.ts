import type {
  MetadataDocument,
  MetadataFileDiagnostic,
} from "./ResolvedMetadata";

export type CatalogTrack = {
  id: string;
  directory: string;
  artist: string | null;
  trackNumber: number | null;
  title: string;

  artwork: {
    source: "track" | "release" | null;
    path: string | null;
  };

  assets: {
    audioMaster: string | null;
    audioPlayback: string | null;
    waveform: string | null;
  };

  metadataSources: {
    track: string | null;
    credits: string | null;
    productionNotes: string | null;
    analysis: string | null;
    waveform: string | null;
  };

  metadata: {
    authored: {
      track: MetadataDocument | null;
      credits: MetadataDocument | null;
      productionNotes: MetadataDocument | null;
    };

    generated: {
      analysis: MetadataDocument | null;
      waveform: MetadataDocument | null;
    };

    resolved: {
      display: {
        title: string;
        source:
          | "authored-display-title"
          | "authored-fields"
          | "directory";
      };

      primaryArtist: {
        name: string | null;
        sortName: string | null;
        source:
          | "track"
          | "release"
          | "directory"
          | "missing";
      };

      language: {
        value: string | null;
        source:
          | "track"
          | "release"
          | "missing";
      };

      releaseDate: {
        value: string | null;
        source:
          | "track"
          | "release"
          | "directory"
          | "missing";
      };

      genres: {
        values: string[];
        source:
          | "track"
          | "release"
          | "missing";
      };

      styles: {
        values: string[];
        source:
          | "track"
          | "release"
          | "missing";
      };

      moods: {
        values: string[];
        source:
          | "track"
          | "release"
          | "missing";
      };

      tags: {
        values: string[];
        source:
          | "track"
          | "release"
          | "missing";
      };

      track: MetadataDocument | null;
      credits: MetadataDocument | null;
      production: MetadataDocument | null;
      analysis: MetadataDocument | null;
      waveform: MetadataDocument | null;
    };

    diagnostics: MetadataFileDiagnostic[];
  };

  playable: boolean;
};

export type CatalogRelease = {
  id: string;
  directory: string;
  date: string | null;
  title: string;
  artwork: string | null;

  metadataSources: {
    release: string | null;
    productionNotes: string | null;
    settings: string | null;
  };

  metadata: {
    authored: {
      release: MetadataDocument | null;
      productionNotes: MetadataDocument | null;
      settings: MetadataDocument | null;
    };

    resolved: {
      release: MetadataDocument | null;
      production: MetadataDocument | null;
      settings: MetadataDocument | null;
    };

    diagnostics: MetadataFileDiagnostic[];
  };

  trackCount: number;
  playableTrackCount: number;
  tracks: CatalogTrack[];
};

export type MediaCatalog = {
  version: number;
  generatedAt: string;
  mediaBaseUrl: string;
  releaseCount: number;
  trackCount: number;
  playableTrackCount: number;
  releases: CatalogRelease[];
};
