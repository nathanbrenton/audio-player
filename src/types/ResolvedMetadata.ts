import type {
  CatalogRelease,
  CatalogTrack,
} from "./MediaCatalog";

/* Planned levels of metadata detail presented by the viewer. */
export type MetadataVerbosity =
  | "summary"
  | "standard"
  | "detailed"
  | "diagnostics";

/*
 * TOML and JSON documents may contain nested objects, arrays,
 * primitives, and null values.
 */
export type MetadataPrimitive =
  | string
  | number
  | boolean
  | null;

export type MetadataValue =
  | MetadataPrimitive
  | MetadataValue[]
  | {
      [key: string]: MetadataValue;
    };

export type MetadataDocument = {
  [key: string]: MetadataValue;
};

/* Track which input files were available during metadata resolution. */
export type MetadataFileStatus =
  | "loaded"
  | "missing"
  | "invalid";

export type MetadataFileDiagnostic = {
  path: string;
  format: "toml" | "json";
  status: MetadataFileStatus;
  data: MetadataDocument | null;
  error: string | null;
};

/* Record collisions when multiple sources define the same field. */
export type MetadataMergeConflict = {
  field: string;
  retainedSource: string;
  ignoredSource: string;
  retainedValue: MetadataValue;
  ignoredValue: MetadataValue;
};

/*
 * This is the eventual payload consumed by the metadata viewer.
 * Catalog objects remain available alongside merged metadata so the
 * diagnostics view can expose both raw and resolved information.
 */
export type ResolvedTrackMetadata = {
  release: CatalogRelease;
  track: CatalogTrack;

  authored: {
    release: MetadataDocument;
    track: MetadataDocument;
  };

  generated: {
    trackAnalysis: MetadataDocument | null;
    waveform: MetadataDocument | null;
  };

  resolved: MetadataDocument;

  diagnostics: {
    files: MetadataFileDiagnostic[];
    conflicts: MetadataMergeConflict[];
  };
};
