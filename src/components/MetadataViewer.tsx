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
  onVerbosityChange: (
    verbosity: MetadataVerbosity,
  ) => void;
  audiophileMode: boolean;
  developerMode: boolean;
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

function findMetadataRowsByKeys(
  value: unknown,
  keys: string[],
): Array<{
  label: string;
  value: string;
}> {
  if (!isRecord(value)) {
    return [];
  }

  const normalizedKeys = new Set(
    keys.map((key) => key.toLowerCase()),
  );

  const rows: Array<{
    label: string;
    value: string;
  }> = [];

  function visit(
    current: unknown,
    prefix = "",
  ) {
    if (!isRecord(current)) {
      return;
    }

    for (
      const [key, entry]
      of Object.entries(current)
    ) {
      const label = prefix
        ? `${prefix} · ${humanizeMetadataKey(key)}`
        : humanizeMetadataKey(key);

      if (isRecord(entry)) {
        visit(entry, label);
        continue;
      }

      if (
        normalizedKeys.has(key.toLowerCase()) &&
        hasDisplayValue(entry)
      ) {
        rows.push({
          label,
          value: Array.isArray(entry)
            ? entry
                .filter(hasDisplayValue)
                .map(formatMetadataValue)
                .join(", ")
            : formatMetadataValue(entry),
        });
      }
    }
  }

  visit(value);

  return rows;
}

type ProvenanceMethod =
  | "manual"
  | "generated"
  | "inherited"
  | "fallback"
  | "missing";

type ProvenanceScope =
  | "track"
  | "release"
  | "directory";

type MetadataProvenance = {
  method: ProvenanceMethod;
  scope?: ProvenanceScope;
};

const provenanceMethodLabels: Record<
  ProvenanceMethod,
  string
> = {
  manual: "Manual",
  generated: "Generated",
  inherited: "Inherited",
  fallback: "Fallback",
  missing: "Missing",
};

const provenanceScopeLabels: Record<
  ProvenanceScope,
  string
> = {
  track: "Track",
  release: "Release",
  directory: "Directory",
};

function ProvenanceBadge({
  provenance,
}: {
  provenance: MetadataProvenance;
}) {
  return (
    <span className="metadata-viewer__provenance">
      <span
        className={[
          "metadata-viewer__provenance-part",
          "metadata-viewer__provenance-part--method",
          `metadata-viewer__provenance-part--${provenance.method}`,
        ].join(" ")}
      >
        {provenanceMethodLabels[provenance.method]}
      </span>

      {provenance.scope ? (
        <span
          className={[
            "metadata-viewer__provenance-part",
            "metadata-viewer__provenance-part--scope",
            `metadata-viewer__provenance-part--${provenance.scope}`,
          ].join(" ")}
        >
          {provenanceScopeLabels[provenance.scope]}
        </span>
      ) : null}
    </span>
  );
}

function MetadataSourceList({
  sources,
}: {
  sources: MetadataProvenance[];
}) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="metadata-viewer__section-sources">
      {sources.map((source, index) => (
        <ProvenanceBadge
          key={`${source.method}-${source.scope ?? "none"}-${index}`}
          provenance={source}
        />
      ))}
    </div>
  );
}

function getAuthoredSectionSources(
  release: CatalogRelease | null,
  track: CatalogTrack,
  section: "credits" | "production",
): MetadataProvenance[] {
  const sources: MetadataProvenance[] = [];

  if (
    section === "credits" &&
    hasDisplayValue(track.metadata.authored.credits)
  ) {
    sources.push({
      method: "manual",
      scope: "track",
    });
  }

  if (section === "production") {
    if (
      hasDisplayValue(
        track.metadata.authored.productionNotes,
      )
    ) {
      sources.push({
        method: "manual",
        scope: "track",
      });
    }

    if (
      hasDisplayValue(
        release?.metadata.authored.productionNotes,
      )
    ) {
      sources.push({
        method: "manual",
        scope: "release",
      });
    }
  }

  if (
    section === "credits" &&
    isRecord(release?.metadata.authored.release) &&
    hasDisplayValue(
      release.metadata.authored.release.credits,
    )
  ) {
    sources.push({
      method: "manual",
      scope: "release",
    });
  }

  return sources;
}

function getResolvedProvenance(
  source:
    | "track"
    | "release"
    | "directory"
    | "missing"
    | "authored-display-title"
    | "authored-fields",
): MetadataProvenance {
  if (
    source === "track" ||
    source === "authored-display-title" ||
    source === "authored-fields"
  ) {
    return {
      method: "manual",
      scope: "track",
    };
  }

  if (source === "release") {
    return {
      method: "inherited",
      scope: "release",
    };
  }

  if (source === "directory") {
    return {
      method: "fallback",
      scope: "directory",
    };
  }

  return {
    method: "missing",
  };
}

function MetadataFieldLabel({
  label,
  source,
  provenance,
  showSource = false,
}: {
  label: string;
  source?:
    | "track"
    | "release"
    | "directory"
    | "missing"
    | "authored-display-title"
    | "authored-fields";
  provenance?: MetadataProvenance;
  showSource?: boolean;
}) {
  return (
    <dt className="metadata-viewer__field-label">
      <span>{label}</span>

      {showSource && (provenance || source) ? (
        <ProvenanceBadge
          provenance={
            provenance ??
            getResolvedProvenance(source!)
          }
        />
      ) : null}
    </dt>
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
  sources: MetadataProvenance[];
  detail?: string | null;
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

    const sources = Array.isArray(entry.provenance)
      ? entry.provenance.flatMap((source) => {
          if (
            !isRecord(source) ||
            source.method !== "manual" ||
            (
              source.scope !== "track" &&
              source.scope !== "release"
            )
          ) {
            return [];
          }

          return [{
            method: "manual" as const,
            scope: source.scope as
              | "track"
              | "release",
          }];
        })
      : [];

    return [{
      name,
      role,
      sources,
    }];
  });
}

function getReleaseCreditEntries(
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
      sources: [{
        method: "manual" as const,
        scope: "release" as const,
      }],
    }];
  });
}

type CreditGroupKey =
  | "production"
  | "arrangement"
  | "recording"
  | "mixing"
  | "mastering"
  | "writing"
  | "other";

type CreditRoleRule = {
  role: string;
  aliases?: string[];
};

const creditRoleHierarchy: Record<
  Exclude<CreditGroupKey, "other">,
  CreditRoleRule[]
> = {
  production: [
    { role: "Producer" },
    { role: "Co-Producer" },
    { role: "Additional Producer" },
    { role: "Executive Producer" },
    { role: "Vocal Producer" },
    { role: "Associate Producer" },
  ],
  arrangement: [
    {
      role: "Arranged By",
      aliases: ["Arranger"],
    },
    { role: "Vocal Arranger" },
    { role: "String Arranger" },
    { role: "Horn Arranger" },
    { role: "Orchestral Arranger" },
    { role: "Additional Arranger" },
  ],
  recording: [
    { role: "Recording Engineer" },
    { role: "Engineer" },
    { role: "Additional Recording Engineer" },
    { role: "Assistant Recording Engineer" },
    { role: "Assistant Engineer" },
    { role: "Editor" },
    { role: "Additional Editor" },
  ],
  mixing: [
    {
      role: "Mixer",
      aliases: [
        "Mix Engineer",
        "Mixing Engineer",
      ],
    },
    { role: "Additional Mixer" },
    { role: "Assistant Mixer" },
    { role: "Mix Assistant" },
  ],
  mastering: [
    { role: "Mastering Engineer" },
    { role: "Additional Mastering Engineer" },
    { role: "Mastering Assistant" },
    { role: "Mastered By" },
  ],
  writing: [
    { role: "Written By" },
    { role: "Songwriter" },
    { role: "Composer" },
    { role: "Lyricist" },
    { role: "Music By" },
    { role: "Lyrics By" },
  ],
};

function normalizeCreditRole(role: string | null): string {
  return (role ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function getRoleAliases(
  rule: CreditRoleRule,
): string[] {
  return [
    rule.role,
    ...(rule.aliases ?? []),
  ].map(normalizeCreditRole);
}

function matchesRoleRule(
  normalizedRole: string,
  rule: CreditRoleRule,
): boolean {
  return getRoleAliases(rule).includes(
    normalizedRole,
  );
}

function classifyCreditRole(
  role: string | null,
): CreditGroupKey {
  const normalizedRole = normalizeCreditRole(role);

  if (!normalizedRole) {
    return "other";
  }

  for (
    const [group, rules]
    of Object.entries(creditRoleHierarchy)
  ) {
    if (
      rules.some((rule) =>
        matchesRoleRule(normalizedRole, rule),
      )
    ) {
      return group as Exclude<
        CreditGroupKey,
        "other"
      >;
    }
  }

  /*
   * Unknown specialized roles remain visible in the
   * closest matching family.
   */
  if (normalizedRole.includes("producer")) {
    return "production";
  }

  if (
    normalizedRole.includes("arrang") ||
    normalizedRole.includes("orchestrat")
  ) {
    return "arrangement";
  }

  if (
    normalizedRole.includes("master")
  ) {
    return "mastering";
  }

  if (
    normalizedRole.includes("mix")
  ) {
    return "mixing";
  }

  if (
    normalizedRole.includes("record") ||
    normalizedRole.includes("engineer") ||
    normalizedRole.includes("editor")
  ) {
    return "recording";
  }

  if (
    normalizedRole.includes("writ") ||
    normalizedRole.includes("compos") ||
    normalizedRole.includes("lyric")
  ) {
    return "writing";
  }

  return "other";
}

function getCreditRolePriority(
  entry: CreditEntry,
  group: Exclude<CreditGroupKey, "other">,
): number {
  const normalizedRole = normalizeCreditRole(
    entry.role,
  );

  const index = creditRoleHierarchy[group]
    .findIndex((rule) =>
      matchesRoleRule(normalizedRole, rule),
    );

  return index === -1
    ? creditRoleHierarchy[group].length
    : index;
}

function sortCreditEntries(
  entries: CreditEntry[],
  group: Exclude<CreditGroupKey, "other">,
): CreditEntry[] {
  return [...entries].sort((left, right) => {
    const priorityDifference =
      getCreditRolePriority(left, group) -
      getCreditRolePriority(right, group);

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    const roleDifference =
      (left.role ?? "").localeCompare(
        right.role ?? "",
      );

    if (roleDifference !== 0) {
      return roleDifference;
    }

    return left.name.localeCompare(right.name);
  });
}

function appendGroupDetail(
  entries: CreditEntry[],
  detail: string,
): CreditEntry[] {
  if (!detail) {
    return entries;
  }

  if (entries.length === 0) {
    return [{
      name: detail,
      role: null,
      sources: [],
    }];
  }

  return entries.map((entry, index) =>
    index === entries.length - 1
      ? {
          ...entry,
          detail,
        }
      : entry,
  );
}

function CreditGroup({
  label,
  entries,
  roleFirst = false,
  showSources = false,
}: {
  label: string;
  entries: CreditEntry[];
  roleFirst?: boolean;
  showSources?: boolean;
}) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="metadata-viewer__credit-group">
      <div className="metadata-viewer__credit-heading">
        <h4>{label}</h4>
      </div>

      <ul className="metadata-viewer__credit-list">
        {entries.map((entry, index) => (
          <li
            key={`${entry.name}-${entry.role}-${index}`}
            className={
              roleFirst
                ? "metadata-viewer__credit-entry--role-first"
                : undefined
            }
          >
            {roleFirst && entry.role ? (
              <span className="metadata-viewer__credit-role">
                {entry.role}
              </span>
            ) : null}

            <span className="metadata-viewer__credit-name">
              {entry.name}
            </span>

            {showSources ? (
              <MetadataSourceList
                sources={entry.sources}
              />
            ) : null}

            {entry.detail ? (
              <span className="metadata-viewer__credit-role">
                {entry.detail}
              </span>
            ) : null}

            {!roleFirst && entry.role ? (
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
  sources = [],
}: {
  rows: Array<{
    label: string;
    value: string;
  }>;
  emptyLabel: string;
  sources?: MetadataProvenance[];
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
          <dt className="metadata-viewer__detail-label">
            <span>{row.label}</span>
            <MetadataSourceList sources={sources} />
          </dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CreditsMetadataView({
  release,
  track,
  showSources,
}: {
  release: CatalogRelease | null;
  track: CatalogTrack | null;
  showSources: boolean;
}) {
  if (!track) {
    return (
      <p className="metadata-viewer__empty-state">
        No track credits are available.
      </p>
    );
  }

  const credits = isRecord(
    track.metadata.resolved.credits,
  )
    ? track.metadata.resolved.credits
    : {};

  const releaseMetadata = isRecord(
    release?.metadata.resolved.release,
  )
    ? release.metadata.resolved.release
    : {};

  const releaseCredits = isRecord(
    releaseMetadata.credits,
  )
    ? releaseMetadata.credits
    : {};

  const production = isRecord(
    track.metadata.resolved.production,
  )
    ? track.metadata.resolved.production
    : {};

  const recording = isRecord(production.recording)
    ? production.recording
    : {};

  const mix = isRecord(production.mix)
    ? production.mix
    : {};

  const mastering = isRecord(production.mastering)
    ? production.mastering
    : {};

  const performers = getCreditEntries(
    credits.performers,
  );

  const contributors = [
    ...getReleaseCreditEntries(
      releaseCredits.contributors,
    ),
    ...getCreditEntries(
      credits.contributors,
    ),
  ];

  const arrangers = getCreditEntries(
    credits.arrangers,
  ).map((entry) => ({
    ...entry,
    role: entry.role ?? "Arranged By",
  }));

  const composers = getCreditEntries(
    credits.composers,
  ).map((entry) => ({
    ...entry,
    role: entry.role ?? "Composer",
  }));

  const songwriters = getCreditEntries(
    credits.songwriters,
  ).map((entry) => ({
    ...entry,
    role: entry.role ?? "Songwriter",
  }));

  const lyricists = getCreditEntries(
    credits.lyricists,
  ).map((entry) => ({
    ...entry,
    role: entry.role ?? "Lyricist",
  }));

  const productionEntries = sortCreditEntries(
    contributors.filter(
      (entry) =>
        classifyCreditRole(entry.role) ===
        "production",
    ),
    "production",
  );

  const arrangementEntries = sortCreditEntries(
    [
      ...arrangers,
      ...contributors.filter(
        (entry) =>
          classifyCreditRole(entry.role) ===
          "arrangement",
      ),
    ],
    "arrangement",
  );

  const recordingEntries = appendGroupDetail(
    sortCreditEntries(
      contributors.filter(
        (entry) =>
          classifyCreditRole(entry.role) ===
          "recording",
      ),
      "recording",
    ),
    typeof recording.location === "string" &&
    recording.location.trim()
      ? `Recording location: ${
          recording.location.trim()
        }`
      : "",
  );

  const mixingEntries = appendGroupDetail(
    sortCreditEntries(
      contributors.filter(
        (entry) =>
          classifyCreditRole(entry.role) ===
          "mixing",
      ),
      "mixing",
    ),
    typeof mix.location === "string" &&
    mix.location.trim()
      ? `Mixing location: ${
          mix.location.trim()
        }`
      : "",
  );

  const masteringEntries = appendGroupDetail(
    sortCreditEntries(
      contributors.filter(
        (entry) =>
          classifyCreditRole(entry.role) ===
          "mastering",
      ),
      "mastering",
    ),
    typeof mastering.location === "string" &&
    mastering.location.trim()
      ? `Mastering location: ${
          mastering.location.trim()
        }`
      : "",
  );

  const writingEntries = sortCreditEntries(
    [
      ...songwriters,
      ...composers,
      ...lyricists,
      ...contributors.filter(
        (entry) =>
          classifyCreditRole(entry.role) ===
          "writing",
      ),
    ],
    "writing",
  );

  const otherContributors = contributors
    .filter(
      (entry) =>
        classifyCreditRole(entry.role) ===
        "other",
    )
    .sort((left, right) =>
      (left.role ?? "").localeCompare(
        right.role ?? "",
      ) ||
      left.name.localeCompare(right.name),
    );

  const remixers = getCreditEntries(
    credits.remixers,
  );

  const featuredArtists = getCreditEntries(
    credits.featuredArtists,
  );

  const publishingRows = flattenMetadata(
    credits.publishing,
  );

  const creditSources = showSources
    ? getAuthoredSectionSources(
        release,
        track,
        "credits",
      )
    : [];

  const hasCredits = [
    performers,
    productionEntries,
    arrangementEntries,
    recordingEntries,
    mixingEntries,
    masteringEntries,
    writingEntries,
    otherContributors,
    remixers,
    featuredArtists,
  ].some((entries) => entries.length > 0);

  return (
    <div className="metadata-viewer__detailed">
      <section
        className="metadata-viewer__section"
        aria-labelledby="metadata-credits-title"
      >
        <div className="metadata-viewer__section-heading">
          <h3 id="metadata-credits-title">
            Artists and contributors
          </h3>
        </div>

        {hasCredits ? (
          <div className="metadata-viewer__credit-grid">
            <CreditGroup
              label="Performers"
              entries={performers}
              roleFirst
              showSources={showSources}
            />

            <CreditGroup
              label="Production"
              entries={productionEntries}
              roleFirst
              showSources={showSources}
            />

            <CreditGroup
              label="Arrangement"
              entries={arrangementEntries}
              roleFirst
              showSources={showSources}
            />

            <CreditGroup
              label="Recording and Editing"
              entries={recordingEntries}
              roleFirst
              showSources={showSources}
            />

            <CreditGroup
              label="Mixing"
              entries={mixingEntries}
              roleFirst
              showSources={showSources}
            />

            <CreditGroup
              label="Mastering"
              entries={masteringEntries}
              roleFirst
              showSources={showSources}
            />

            <CreditGroup
              label="Writing and Composition"
              entries={writingEntries}
              roleFirst
              showSources={showSources}
            />

            <CreditGroup
              label="Other Contributors"
              entries={otherContributors}
              roleFirst
              showSources={showSources}
            />

            <CreditGroup
              label="Remixers"
              entries={remixers}
              showSources={showSources}
            />

            <CreditGroup
              label="Featured Artists"
              entries={featuredArtists}
              showSources={showSources}
            />
          </div>
        ) : (
          <p className="metadata-viewer__section-empty">
            No named credits are available.
          </p>
        )}

        {publishingRows.length > 0 ? (
          <div className="metadata-viewer__subsection">
            <div className="metadata-viewer__subsection-heading">
              <h4>Publishing</h4>

              <MetadataSourceList
                sources={creditSources}
              />
            </div>

            <MetadataRows
              rows={publishingRows}
              sources={creditSources}
              emptyLabel="No publishing information is available."
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}

function DetailedMetadataView({
  release,
  track,
  showSources,
}: {
  release: CatalogRelease | null;
  track: CatalogTrack | null;
  showSources: boolean;
}) {
  if (!track) {
    return (
      <p className="metadata-viewer__empty-state">
        No detailed track metadata is available.
      </p>
    );
  }

  const productionRows = flattenMetadata(
    track.metadata.resolved.production,
  ).filter((row) => ![
    "Location",
    "Room",
    "City",
    "Region",
    "Country",
    "Recording · Location",
    "Mix · Location",
    "Mastering · Location",
  ].includes(row.label));

  const waveformTechnicalRows =
    findMetadataRowsByKeys(
      track.metadata.resolved.waveform,
      [
        "sampleRate",
        "sourceChannels",
        "bitsPerSample",
      ],
    );

  const waveformSources: MetadataProvenance[] =
    showSources &&
    track.metadata.generated.waveform
      ? [{
          method: "generated",
          scope: "track",
        }]
      : [];

  const productionSources = showSources
    ? getAuthoredSectionSources(
        release,
        track,
        "production",
      )
    : [];

  return (
    <div className="metadata-viewer__detailed">
      <section
        className="metadata-viewer__section"
        aria-labelledby="metadata-production-title"
      >
        <div className="metadata-viewer__section-heading">
          <h3 id="metadata-production-title">
            Recording and mastering
          </h3>

          <MetadataSourceList
            sources={productionSources}
          />
        </div>

        <MetadataRows
          rows={productionRows}
          sources={productionSources}
          emptyLabel="No production notes have been entered."
        />
      </section>

      <section
        className="metadata-viewer__section"
        aria-labelledby="metadata-source-audio-title"
      >
        <div className="metadata-viewer__section-heading">
          <h3 id="metadata-source-audio-title">
            Source audio
          </h3>

          <MetadataSourceList
            sources={waveformSources}
          />
        </div>

        <MetadataRows
          rows={waveformTechnicalRows}
          sources={waveformSources}
          emptyLabel="No source-audio properties are available."
        />
      </section>
    </div>
  );
}

function TrackInformationView({
  track,
  showSources,
}: {
  track: CatalogTrack | null;
  showSources: boolean;
}) {
  if (!track) {
    return (
      <p className="metadata-viewer__empty-state">
        No track information is available.
      </p>
    );
  }

  const resolved = track.metadata.resolved;
  const authoredTrack = isRecord(resolved.track)
    ? resolved.track
    : {};
  const authoredAudio = isRecord(authoredTrack.audio)
    ? authoredTrack.audio
    : {};

  const manualTrackProvenance: MetadataProvenance = {
    method: "manual",
    scope: "track",
  };

  function displayValue(value: unknown) {
    return hasDisplayValue(value)
      ? formatMetadataValue(value)
      : null;
  }

  const bpm = displayValue(authoredAudio.bpm);
  const musicalKey = displayValue(authoredAudio.key);
  const camelotKey = displayValue(
    authoredAudio.camelot_key,
  );
  const timeSignature = displayValue(
    authoredAudio.time_signature,
  );
  const tuning = displayValue(
    authoredAudio.tuning_hz,
  );

  return (
    <div className="metadata-viewer__basic">
      <section
        className="metadata-viewer__section"
        aria-labelledby="metadata-track-information-title"
      >
        <div className="metadata-viewer__section-heading">
          <h3 id="metadata-track-information-title">
            Track information
          </h3>
        </div>

        <dl className="metadata-viewer__field-grid">
          <div className="metadata-viewer__field">
            <MetadataFieldLabel
              label="BPM"
              provenance={manualTrackProvenance}
              showSource={showSources}
            />
            <dd>
              {bpm ?? (
                <span className="metadata-viewer__empty">
                  Not provided
                </span>
              )}
            </dd>
          </div>

          <div className="metadata-viewer__field">
            <MetadataFieldLabel
              label="Time Signature"
              provenance={manualTrackProvenance}
              showSource={showSources}
            />
            <dd>
              {timeSignature ?? (
                <span className="metadata-viewer__empty">
                  Not provided
                </span>
              )}
            </dd>
          </div>

          <div className="metadata-viewer__field">
            <MetadataFieldLabel
              label="Key"
              provenance={manualTrackProvenance}
              showSource={showSources}
            />
            <dd>
              {musicalKey ?? (
                <span className="metadata-viewer__empty">
                  Not provided
                </span>
              )}
            </dd>
          </div>

          <div className="metadata-viewer__field">
            <MetadataFieldLabel
              label="Camelot Key"
              provenance={manualTrackProvenance}
              showSource={showSources}
            />
            <dd>
              {camelotKey ?? (
                <span className="metadata-viewer__empty">
                  Not provided
                </span>
              )}
            </dd>
          </div>

          <div className="metadata-viewer__field">
            <MetadataFieldLabel
              label="Tuning"
              provenance={manualTrackProvenance}
              showSource={showSources}
            />
            <dd>
              {tuning ? `${tuning} Hz` : (
                <span className="metadata-viewer__empty">
                  Not provided
                </span>
              )}
            </dd>
          </div>

          <div className="metadata-viewer__field">
            <MetadataFieldLabel
              label="Language"
              source={resolved.language.source}
              showSource={showSources}
            />
            <dd>
              {resolved.language.value ?? (
                <span className="metadata-viewer__empty">
                  Not provided
                </span>
              )}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function DeepMetadataView({
  track,
  showSources,
}: {
  track: CatalogTrack | null;
  showSources: boolean;
}) {
  if (!track) {
    return (
      <p className="metadata-viewer__empty-state">
        No deep metadata is available.
      </p>
    );
  }

  const resolvedTrack = isRecord(
    track.metadata.resolved.track,
  )
    ? track.metadata.resolved.track
    : {};

  const script =
    typeof resolvedTrack.script === "string" &&
    resolvedTrack.script.trim()
      ? resolvedTrack.script.trim()
      : null;

  const manualTrackProvenance: MetadataProvenance = {
    method: "manual",
    scope: "track",
  };

  return (
    <div className="metadata-viewer__basic">
      <section
        className="metadata-viewer__section"
        aria-labelledby="metadata-deep-title"
      >
        <div className="metadata-viewer__section-heading">
          <h3 id="metadata-deep-title">
            D33P metadata
          </h3>
        </div>

        <dl className="metadata-viewer__field-grid">
          <div className="metadata-viewer__field">
            <MetadataFieldLabel
              label="Script"
              provenance={manualTrackProvenance}
              showSource={showSources}
            />
            <dd>
              {script ?? (
                <span className="metadata-viewer__empty">
                  Not provided
                </span>
              )}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function FilesMetadataView({
  track,
  showSources,
}: {
  track: CatalogTrack | null;
  showSources: boolean;
}) {
  if (!track) {
    return (
      <p className="metadata-viewer__empty-state">
        No file metadata is available.
      </p>
    );
  }

  const analysis = isRecord(
    track.metadata.resolved.analysis,
  )
    ? track.metadata.resolved.analysis
    : {};

  /*
   * Keep storage paths, existence checks, and source-file
   * diagnostics separate from listener-facing analysis.
   */
  const fileRows = findMetadataRowsByKeys(
    analysis,
    [
      "path",
      "master_path",
      "playback_path",
      "exists",
      "master_exists",
      "playback_exists",
      "source",
      "source_path",
      "loudness_source",
    ],
  );

  const fileSources: MetadataProvenance[] =
    showSources &&
    track.metadata.generated.analysis
      ? [{
          method: "generated",
          scope: "track",
        }]
      : [];

  return (
    <div className="metadata-viewer__detailed">
      <section
        className="metadata-viewer__section"
        aria-labelledby="metadata-files-title"
      >
        <div className="metadata-viewer__section-heading">
          <h3 id="metadata-files-title">
            Files
          </h3>

          <MetadataSourceList
            sources={fileSources}
          />
        </div>

        <MetadataRows
          rows={fileRows}
          sources={fileSources}
          emptyLabel="No generated file diagnostics are available."
        />
      </section>
    </div>
  );
}

function WaveformMetadataView({
  track,
  showSources,
}: {
  track: CatalogTrack | null;
  showSources: boolean;
}) {
  if (!track) {
    return (
      <p className="metadata-viewer__empty-state">
        No waveform metadata is available.
      </p>
    );
  }

  const waveformRows = flattenMetadata(
    track.metadata.resolved.waveform,
  ).filter((row) => ![
    "Sample Rate",
    "Source Channels",
    "Bits Per Sample",
  ].includes(row.label));

  const waveformSources: MetadataProvenance[] =
    showSources &&
    track.metadata.generated.waveform
      ? [{
          method: "generated",
          scope: "track",
        }]
      : [];

  return (
    <div className="metadata-viewer__detailed">
      <section
        className="metadata-viewer__section"
        aria-labelledby="metadata-waveform-title"
      >
        <div className="metadata-viewer__section-heading">
          <h3 id="metadata-waveform-title">
            Waveform generation
          </h3>

          <MetadataSourceList
            sources={waveformSources}
          />
        </div>

        <MetadataRows
          rows={waveformRows}
          sources={waveformSources}
          emptyLabel="No waveform metadata is available."
        />
      </section>
    </div>
  );
}

function BasicMetadataView({
  release,
  track,
  showSources,
}: {
  release: CatalogRelease | null;
  track: CatalogTrack | null;
  showSources: boolean;
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
          <h3 id="metadata-overview-title">
            Track details
          </h3>
        </div>

        <dl className="metadata-viewer__field-grid">
          <div className="metadata-viewer__field metadata-viewer__field--wide">
            <MetadataFieldLabel
              label="Title"
              source={resolved.display.source}
              showSource={showSources}
            />
            <dd>
              <span className="metadata-viewer__primary-value">
                {resolved.display.title}
              </span>

            </dd>
          </div>

          <div className="metadata-viewer__field">
            <MetadataFieldLabel
              label="Artist"
              source={resolved.primaryArtist.source}
              showSource={showSources}
            />
            <dd>
              <span>
                {resolved.primaryArtist.name ?? (
                  <span className="metadata-viewer__empty">
                    Not provided
                  </span>
                )}
              </span>

            </dd>
          </div>

          <div className="metadata-viewer__field">
            <MetadataFieldLabel
              label="Release"
              provenance={{
                method: "inherited",
                scope: "release",
              }}
              showSource={showSources}
            />
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
            <MetadataFieldLabel
              label="Release date"
              source={resolved.releaseDate.source}
              showSource={showSources}
            />
            <dd>
              <span>
                {resolved.releaseDate.value ?? (
                  <span className="metadata-viewer__empty">
                    Not provided
                  </span>
                )}
              </span>

            </dd>
          </div>

        </dl>
      </section>

      <section
        className="metadata-viewer__section"
        aria-labelledby="metadata-classification-title"
      >
        <div className="metadata-viewer__section-heading">
          <h3 id="metadata-classification-title">
            Classification
          </h3>
        </div>

        <dl className="metadata-viewer__field-grid">
          <div className="metadata-viewer__field">
            <MetadataFieldLabel
              label="Genres"
              source={resolved.genres.source}
              showSource={showSources}
            />
            <dd>
              <MetadataValueList
                values={resolved.genres.values}
              />
            </dd>
          </div>

          <div className="metadata-viewer__field">
            <MetadataFieldLabel
              label="Styles"
              source={resolved.styles.source}
              showSource={showSources}
            />
            <dd>
              <MetadataValueList
                values={resolved.styles.values}
              />
            </dd>
          </div>

          <div className="metadata-viewer__field">
            <MetadataFieldLabel
              label="Moods"
              source={resolved.moods.source}
              showSource={showSources}
            />
            <dd>
              <MetadataValueList
                values={resolved.moods.values}
              />
            </dd>
          </div>

          <div className="metadata-viewer__field">
            <MetadataFieldLabel
              label="Tags"
              source={resolved.tags.source}
              showSource={showSources}
            />
            <dd>
              <MetadataValueList
                values={resolved.tags.values}
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
  onVerbosityChange,
  audiophileMode,
  developerMode,
  release,
  track,
  triggerRef,
  onClose,
}: MetadataViewerProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  type MetadataViewDefinition = {
    value: MetadataVerbosity;
    label: string;
    theme: "default" | "audiophile" | "developer";
  };

  /*
   * General metadata lives in the primary row. Developer-only
   * diagnostics and generated artifacts use a separate row.
   */
  const primaryMetadataViews: MetadataViewDefinition[] = [
    {
      value: "summary",
      label: "Overview",
      theme: "default",
    },
    {
      value: "credits",
      label: "Credits",
      theme: "default",
    },
    {
      value: "track-info",
      label: "Tab3",
      theme: "default",
    },
    ...(audiophileMode
      ? [{
          value: "detailed" as const,
          label: "Details",
          theme: "audiophile" as const,
        }]
      : []),
  ];

  const developerMetadataViews: MetadataViewDefinition[] =
    developerMode
      ? [
          {
            value: "waveforms",
            label: "Waveforms",
            theme: "developer",
          },
          {
            value: "d33p",
            label: "D33P",
            theme: "developer",
          },
          {
            value: "files",
            label: "Files",
            theme: "developer",
          },
          {
            value: "raw",
            label: "Raw Metadata",
            theme: "developer",
          },
        ]
      : [];

  const metadataViews = [
    ...primaryMetadataViews,
    ...developerMetadataViews,
  ];

  useEffect(() => {
    const viewIsAvailable = metadataViews.some(
      (view) => view.value === verbosity,
    );

    if (!viewIsAvailable) {
      onVerbosityChange("summary");
    }
  }, [
    audiophileMode,
    developerMode,
    verbosity,
    onVerbosityChange,
  ]);

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

  function handleViewKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    views: MetadataViewDefinition[],
    currentIndex: number,
  ) {
    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }

    event.preventDefault();

    let nextIndex = currentIndex;

    if (event.key === "ArrowRight") {
      nextIndex =
        (currentIndex + 1) % views.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex =
        (currentIndex - 1 + views.length) %
        views.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = views.length - 1;
    }

    const nextView = views[nextIndex];

    onVerbosityChange(nextView.value);

    window.requestAnimationFrame(() => {
      document
        .getElementById(
          `metadata-view-tab-${nextView.value}`,
        )
        ?.focus();
    });
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

  const rawMetadata = {
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
        aria-label="Track metadata"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="metadata-viewer__header">
          <div>
            <span className="metadata-viewer__eyebrow">
              Track metadata
            </span>

            
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

        <div className="metadata-viewer__tab-rows">
          <div
            className="metadata-viewer__tabs"
            role="tablist"
            aria-label="Metadata views"
          >
            {primaryMetadataViews.map((view, index) => {
              const isSelected =
                verbosity === view.value;

              return (
                <button
                  key={view.value}
                  id={`metadata-view-tab-${view.value}`}
                  type="button"
                  className={[
                    "metadata-viewer__tab",
                    view.theme !== "default"
                      ? `metadata-viewer__tab--${view.theme}`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  role="tab"
                  aria-selected={isSelected}
                  aria-controls="metadata-view-panel"
                  tabIndex={isSelected ? 0 : -1}
                  onClick={() => {
                    onVerbosityChange(view.value);
                  }}
                  onKeyDown={(event) => {
                    handleViewKeyDown(
                      event,
                      primaryMetadataViews,
                      index,
                    );
                  }}
                >
                  {view.label}
                </button>
              );
            })}
          </div>

          {developerMetadataViews.length > 0 ? (
            <div
              className={[
                "metadata-viewer__tabs",
                "metadata-viewer__tabs--developer",
              ].join(" ")}
              role="tablist"
              aria-label="Developer metadata views"
            >
              {developerMetadataViews.map(
                (view, index) => {
                  const isSelected =
                    verbosity === view.value;

                  return (
                    <button
                      key={view.value}
                      id={`metadata-view-tab-${view.value}`}
                      type="button"
                      className={[
                        "metadata-viewer__tab",
                        "metadata-viewer__tab--developer",
                      ].join(" ")}
                      role="tab"
                      aria-selected={isSelected}
                      aria-controls="metadata-view-panel"
                      tabIndex={isSelected ? 0 : -1}
                      onClick={() => {
                        onVerbosityChange(view.value);
                      }}
                      onKeyDown={(event) => {
                        handleViewKeyDown(
                          event,
                          developerMetadataViews,
                          index,
                        );
                      }}
                    >
                      {view.label}
                    </button>
                  );
                },
              )}
            </div>
          ) : null}
        </div>

        <div
          id="metadata-view-panel"
          className="metadata-viewer__content"
          role="tabpanel"
          aria-labelledby={`metadata-view-tab-${verbosity}`}
        >
          <ValidationWarnings
            warnings={validationWarnings}
          />

          {verbosity === "raw" ? (
            <pre className="metadata-viewer__json">
              {JSON.stringify(rawMetadata, null, 2)}
            </pre>
          ) : verbosity === "d33p" ? (
            <DeepMetadataView
              track={track}
              showSources={developerMode}
            />
          ) : verbosity === "files" ? (
            <FilesMetadataView
              track={track}
              showSources={developerMode}
            />
          ) : verbosity === "waveforms" ? (
            <WaveformMetadataView
              track={track}
              showSources={developerMode}
            />
          ) : verbosity === "credits" ? (
            <CreditsMetadataView
              release={release}
              track={track}
              showSources={developerMode}
            />
          ) : verbosity === "track-info" ? (
            <TrackInformationView
              track={track}
              showSources={developerMode}
            />
          ) : verbosity === "detailed" ? (
            <DetailedMetadataView
              release={release}
              track={track}
              showSources={developerMode}
            />
          ) : (
            <BasicMetadataView
              release={release}
              track={track}
              showSources={developerMode}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
