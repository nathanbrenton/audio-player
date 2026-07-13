// React imports
import {
  useEffect,
  useRef,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import type {
  CatalogRelease,
  CatalogTrack,
  CatalogValidationWarning,
} from "../types/MediaCatalog";
import type {
  MetadataVerbosity,
} from "../types/ResolvedMetadata";

export type { MetadataVerbosity } from "../types/ResolvedMetadata";

type MetadataViewerProps = {
  isOpen: boolean;
  verbosity: MetadataVerbosity;
  release: CatalogRelease | null;
  track: CatalogTrack | null;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function hasDisplayValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.some(hasDisplayValue);
  }

  if (isRecord(value)) {
    return Object.values(value).some(hasDisplayValue);
  }

  return true;
}

function humanizeMetadataKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function formatMetadataValue(value: unknown): string {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "number") {
    return Number.isInteger(value)
      ? String(value)
      : String(Number(value.toFixed(3)));
  }

  if (typeof value === "string") {
    return value.trim();
  }

  return String(value);
}

function flattenMetadata(
  value: unknown,
  prefix = "",
): Array<{
  label: string;
  value: string;
}> {
  if (!isRecord(value)) {
    return [];
  }

  const rows: Array<{
    label: string;
    value: string;
  }> = [];

  for (const [key, entry] of Object.entries(value)) {
    if (!hasDisplayValue(entry)) {
      continue;
    }

    const label = prefix
      ? `${prefix} · ${humanizeMetadataKey(key)}`
      : humanizeMetadataKey(key);

    if (isRecord(entry)) {
      rows.push(...flattenMetadata(entry, label));
      continue;
    }

    if (Array.isArray(entry)) {
      const values = entry
        .filter(
          (item) =>
            !isRecord(item) &&
            hasDisplayValue(item),
        )
        .map(formatMetadataValue);

      if (values.length > 0) {
        rows.push({
          label,
          value: values.join(", "),
        });
      }

      continue;
    }

    rows.push({
      label,
      value: formatMetadataValue(entry),
    });
  }

  return rows;
}

type MetadataSource =
  | "track"
  | "release"
  | "directory"
  | "missing"
  | "authored-display-title"
  | "authored-fields";

const sourceLabels: Record<MetadataSource, string> = {
  track: "Track metadata",
  release: "Inherited from release",
  directory: "Directory fallback",
  missing: "Not provided",
  "authored-display-title": "Authored display title",
  "authored-fields": "Authored title fields",
};

function SourceBadge({
  source,
}: {
  source: MetadataSource;
}) {
  return (
    <span
      className={`metadata-viewer__source metadata-viewer__source--${source}`}
    >
      {sourceLabels[source]}
    </span>
  );
}

function MetadataValueList({
  values,
  emptyLabel = "Not provided",
}: {
  values: string[];
  emptyLabel?: string;
}) {
  if (values.length === 0) {
    return (
      <span className="metadata-viewer__empty">
        {emptyLabel}
      </span>
    );
  }

  return (
    <ul className="metadata-viewer__chips">
      {values.map((value) => (
        <li key={value}>{value}</li>
      ))}
    </ul>
  );
}

type ScopedValidationWarning = {
  scope: "Release" | "Track";
  warning: CatalogValidationWarning;
};

type CreditEntry = {
  name: string;
  role: string | null;
};

function getCreditEntries(
  value: unknown,
): CreditEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const name =
      typeof entry.name === "string"
        ? entry.name.trim()
        : "";

    if (!name) {
      return [];
    }

    const role =
      typeof entry.role === "string"
        ? entry.role.trim() || null
        : null;

    return [{
      name,
      role,
    }];
  });
}

function CreditGroup({
  label,
  entries,
}: {
  label: string;
  entries: CreditEntry[];
}) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="metadata-viewer__credit-group">
      <h4>{label}</h4>

      <ul className="metadata-viewer__credit-list">
        {entries.map((entry, index) => (
          <li key={`${entry.name}-${entry.role}-${index}`}>
            <span className="metadata-viewer__credit-name">
              {entry.name}
            </span>

            {entry.role ? (
              <span className="metadata-viewer__credit-role">
                {entry.role}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetadataRows({
  rows,
  emptyLabel,
}: {
  rows: Array<{
    label: string;
    value: string;
  }>;
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="metadata-viewer__section-empty">
        {emptyLabel}
      </p>
    );
  }

  return (
    <dl className="metadata-viewer__detail-rows">
      {rows.map((row, index) => (
        <div key={`${row.label}-${index}`}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function DetailedMetadataView({
  release,
  track,
}: {
  release: CatalogRelease | null;
  track: CatalogTrack | null;
}) {
  if (!track) {
    return (
      <p className="metadata-viewer__empty-state">
        No detailed track metadata is available.
      </p>
    );
  }

  const credits = isRecord(
    track.metadata.resolved.credits,
  )
    ? track.metadata.resolved.credits
    : {};

  const performers = getCreditEntries(
    credits.performers,
  );
  const contributors = getCreditEntries(
    credits.contributors,
  );
  const composers = getCreditEntries(
    credits.composers,
  );
  const lyricists = getCreditEntries(
    credits.lyricists,
  );
  const songwriters = getCreditEntries(
    credits.songwriters,
  );
  const arrangers = getCreditEntries(
    credits.arrangers,
  );
  const remixers = getCreditEntries(
    credits.remixers,
  );
  const featuredArtists = getCreditEntries(
    credits.featured_artists,
  );

  const hasCredits = [
    performers,
    contributors,
    composers,
    lyricists,
    songwriters,
    arrangers,
    remixers,
    featuredArtists,
  ].some((entries) => entries.length > 0);

  const publishingRows = flattenMetadata(
    credits.publishing,
  );

  const productionRows = flattenMetadata(
    track.metadata.resolved.production,
  );

  const analysis = isRecord(
    track.metadata.resolved.analysis,
  )
    ? track.metadata.resolved.analysis
    : {};

  const technicalRows = [
    ...flattenMetadata(
      analysis.master,
      "Master",
    ),
    ...flattenMetadata(
      analysis.playback,
      "Playback",
    ),
    ...flattenMetadata(
      analysis.loudness,
      "Loudness",
    ),
  ];

  const waveformRows = flattenMetadata(
    track.metadata.resolved.waveform,
  );

  return (
    <div className="metadata-viewer__detailed">
      <BasicMetadataView
        release={release}
        track={track}
      />

      <section
        className="metadata-viewer__section"
        aria-labelledby="metadata-credits-title"
      >
        <div className="metadata-viewer__section-heading">
          <div>
            <span className="metadata-viewer__section-eyebrow">
              Credits
            </span>
            <h3 id="metadata-credits-title">
              Artists and contributors
            </h3>
          </div>
        </div>

        {hasCredits ? (
          <div className="metadata-viewer__credit-grid">
            <CreditGroup
              label="Performers"
              entries={performers}
            />
            <CreditGroup
              label="Contributors"
              entries={contributors}
            />
            <CreditGroup
              label="Composers"
              entries={composers}
            />
            <CreditGroup
              label="Songwriters"
              entries={songwriters}
            />
            <CreditGroup
              label="Lyricists"
              entries={lyricists}
            />
            <CreditGroup
              label="Arrangers"
              entries={arrangers}
            />
            <CreditGroup
              label="Remixers"
              entries={remixers}
            />
            <CreditGroup
              label="Featured artists"
              entries={featuredArtists}
            />
          </div>
        ) : (
          <p className="metadata-viewer__section-empty">
            No named credits are available.
          </p>
        )}

        {publishingRows.length > 0 ? (
          <div className="metadata-viewer__subsection">
            <h4>Publishing</h4>
            <MetadataRows
              rows={publishingRows}
              emptyLabel="No publishing information is available."
            />
          </div>
        ) : null}
      </section>

      <section
        className="metadata-viewer__section"
        aria-labelledby="metadata-production-title"
      >
        <div className="metadata-viewer__section-heading">
          <div>
            <span className="metadata-viewer__section-eyebrow">
              Production
            </span>
            <h3 id="metadata-production-title">
              Recording and mastering
            </h3>
          </div>
        </div>

        <MetadataRows
          rows={productionRows}
          emptyLabel="No production notes have been entered."
        />
      </section>

      <section
        className="metadata-viewer__section"
        aria-labelledby="metadata-technical-title"
      >
        <div className="metadata-viewer__section-heading">
          <div>
            <span className="metadata-viewer__section-eyebrow">
              Technical
            </span>
            <h3 id="metadata-technical-title">
              Audio analysis
            </h3>
          </div>
        </div>

        <MetadataRows
          rows={technicalRows}
          emptyLabel="No populated master, playback, or loudness analysis is available."
        />
      </section>

      <section
        className="metadata-viewer__section"
        aria-labelledby="metadata-waveform-title"
      >
        <div className="metadata-viewer__section-heading">
          <div>
            <span className="metadata-viewer__section-eyebrow">
              Waveform
            </span>
            <h3 id="metadata-waveform-title">
              Generated waveform data
            </h3>
          </div>
        </div>

        <MetadataRows
          rows={waveformRows}
          emptyLabel="No waveform metadata is available."
        />
      </section>
    </div>
  );
}

function BasicMetadataView({
  release,
  track,
}: {
  release: CatalogRelease | null;
  track: CatalogTrack | null;
}) {
  if (!track) {
    return (
      <p className="metadata-viewer__empty-state">
        No track metadata is available.
      </p>
    );
  }

  const resolved = track.metadata.resolved;

  return (
    <div className="metadata-viewer__basic">
      <section
        className="metadata-viewer__section"
        aria-labelledby="metadata-overview-title"
      >
        <div className="metadata-viewer__section-heading">
          <div>
            <span className="metadata-viewer__section-eyebrow">
              Overview
            </span>
            <h3 id="metadata-overview-title">
              Track details
            </h3>
          </div>
        </div>

        <dl className="metadata-viewer__field-grid">
          <div className="metadata-viewer__field metadata-viewer__field--wide">
            <dt>Title</dt>
            <dd>
              <span className="metadata-viewer__primary-value">
                {resolved.display.title}
              </span>

              <SourceBadge
                source={resolved.display.source}
              />
            </dd>
          </div>

          <div className="metadata-viewer__field">
            <dt>Artist</dt>
            <dd>
              <span>
                {resolved.primaryArtist.name ?? (
                  <span className="metadata-viewer__empty">
                    Not provided
                  </span>
                )}
              </span>

              <SourceBadge
                source={resolved.primaryArtist.source}
              />
            </dd>
          </div>

          <div className="metadata-viewer__field">
            <dt>Release</dt>
            <dd>
              <span>
                {release?.title ?? (
                  <span className="metadata-viewer__empty">
                    Not provided
                  </span>
                )}
              </span>
            </dd>
          </div>

          <div className="metadata-viewer__field">
            <dt>Release date</dt>
            <dd>
              <span>
                {resolved.releaseDate.value ?? (
                  <span className="metadata-viewer__empty">
                    Not provided
                  </span>
                )}
              </span>

              <SourceBadge
                source={resolved.releaseDate.source}
              />
            </dd>
          </div>

          <div className="metadata-viewer__field">
            <dt>Language</dt>
            <dd>
              <span>
                {resolved.language.value ?? (
                  <span className="metadata-viewer__empty">
                    Not provided
                  </span>
                )}
              </span>

              <SourceBadge
                source={resolved.language.source}
              />
            </dd>
          </div>
        </dl>
      </section>

      <section
        className="metadata-viewer__section"
        aria-labelledby="metadata-classification-title"
      >
        <div className="metadata-viewer__section-heading">
          <div>
            <span className="metadata-viewer__section-eyebrow">
              Classification
            </span>
            <h3 id="metadata-classification-title">
              Sound and context
            </h3>
          </div>
        </div>

        <dl className="metadata-viewer__field-grid">
          <div className="metadata-viewer__field">
            <dt>Genres</dt>
            <dd>
              <MetadataValueList
                values={resolved.genres.values}
              />
              <SourceBadge
                source={resolved.genres.source}
              />
            </dd>
          </div>

          <div className="metadata-viewer__field">
            <dt>Styles</dt>
            <dd>
              <MetadataValueList
                values={resolved.styles.values}
              />
              <SourceBadge
                source={resolved.styles.source}
              />
            </dd>
          </div>

          <div className="metadata-viewer__field">
            <dt>Moods</dt>
            <dd>
              <MetadataValueList
                values={resolved.moods.values}
              />
              <SourceBadge
                source={resolved.moods.source}
              />
            </dd>
          </div>

          <div className="metadata-viewer__field">
            <dt>Tags</dt>
            <dd>
              <MetadataValueList
                values={resolved.tags.values}
              />
              <SourceBadge
                source={resolved.tags.source}
              />
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function ValidationWarnings({
  warnings,
}: {
  warnings: ScopedValidationWarning[];
}) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <section
      className="metadata-viewer__warnings"
      aria-labelledby="metadata-viewer-warnings-title"
    >
      <h3 id="metadata-viewer-warnings-title">
        Warnings
      </h3>

      <ul className="metadata-viewer__warning-list">
        {warnings.map(({ scope, warning }, index) => (
          <li
            key={`${scope}-${warning.code}-${index}`}
            className="metadata-viewer__warning"
          >
            <strong>{scope}:</strong>{" "}
            {warning.message}

            {warning.trackIds &&
            warning.trackIds.length > 0 ? (
              <span>
                {" "}
                Tracks: {warning.trackIds.join(", ")}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export default function MetadataViewer({
  isOpen,
  verbosity,
  release,
  track,
  triggerRef,
  onClose,
}: MetadataViewerProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  /*
   * Move focus into the modal when it opens and prevent the page
   * beneath it from scrolling.
   */
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  function closeViewer() {
    onClose();

    /*
     * Wait until React removes the modal before restoring focus to
     * the information button that opened it.
     */
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLDivElement>,
  ) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeViewer();
      return;
    }

    if (event.key !== "Tab" || !dialogRef.current) {
      return;
    }

    const focusableElements = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        focusableSelector,
      ),
    );

    if (focusableElements.length === 0) {
      event.preventDefault();
      dialogRef.current.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement =
      focusableElements[focusableElements.length - 1];

    if (
      event.shiftKey &&
      document.activeElement === firstElement
    ) {
      event.preventDefault();
      lastElement.focus();
    } else if (
      !event.shiftKey &&
      document.activeElement === lastElement
    ) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  if (!isOpen) {
    return null;
  }

  const validationWarnings: ScopedValidationWarning[] = [
    ...(release?.metadata.validation ?? []).map(
      (warning) => ({
        scope: "Release" as const,
        warning,
      }),
    ),
    ...(track?.metadata.validation ?? []).map(
      (warning) => ({
        scope: "Track" as const,
        warning,
      }),
    ),
  ];

  const diagnostics = {
    verbosity,
    release,
    track,
  };

  return createPortal(
    <div
      className="metadata-viewer__backdrop"
      onMouseDown={(event) => {
        // Close only when the backdrop itself was clicked.
        if (event.target === event.currentTarget) {
          closeViewer();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="metadata-viewer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="metadata-viewer-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="metadata-viewer__header">
          <div>
            <span className="metadata-viewer__eyebrow">
              Track metadata
            </span>

            <h2 id="metadata-viewer-title">
              {track?.title ?? "Metadata diagnostics"}
            </h2>
          </div>

          <button
            type="button"
            className="metadata-viewer__close-button"
            onClick={closeViewer}
            aria-label="Close metadata viewer"
          >
            ×
          </button>
        </header>

        <div className="metadata-viewer__content">
          <ValidationWarnings
            warnings={validationWarnings}
          />

          {verbosity === "diagnostics" ? (
            <pre className="metadata-viewer__json">
              {JSON.stringify(diagnostics, null, 2)}
            </pre>
          ) : verbosity === "summary" ? (
            <BasicMetadataView
              release={release}
              track={track}
            />
          ) : (
            <DetailedMetadataView
              release={release}
              track={track}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
