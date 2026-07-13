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

type ScopedValidationWarning = {
  scope: "Release" | "Track";
  warning: CatalogValidationWarning;
};

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
          ) : (
            <p>
              The {verbosity} metadata view has not been
              implemented yet.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
