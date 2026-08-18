import {
  ListenerMetadataViewer,
  type ListenerMetadataViewerProps,
} from "@hiplingo/media-player";

import "@hiplingo/media-player/listener-metadata-viewer.css";
import "./metadata-viewer-host.css";

import type {
  CatalogRelease,
  CatalogTrack,
} from "../types/MediaCatalog";

export type {
  MetadataVerbosity,
} from "@hiplingo/media-player";

type MetadataViewerProps = Omit<
  ListenerMetadataViewerProps,
  "release" | "track"
> & {
  release: CatalogRelease | null;
  track: CatalogTrack | null;
};

export default function MetadataViewer(
  props: MetadataViewerProps,
) {
  return <ListenerMetadataViewer {...props} />;
}
