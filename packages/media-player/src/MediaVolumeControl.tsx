import {
  useEffect,
  useRef,
  useState,
} from "react";

export type MediaVolumeControlClassNames = {
  root?: string;
  button?: string;
  icon?: string;
  popup?: string;
  slider?: string;
};

export type MediaVolumeControlProps = {
  volumePercent: number;
  onVolumePercentChange: (volumePercent: number) => void;
  disabled?: boolean;
  inputId?: string;
  ariaLabel?: string;
  classNames?: MediaVolumeControlClassNames;
};

type MediaVolumeIconLevel =
  | "muted"
  | "low"
  | "medium"
  | "high";

export function clampVolumePercent(
  value: number,
): number {
  if (!Number.isFinite(value)) {
    return 100;
  }

  return Math.min(100, Math.max(0, value));
}

/*
 * Convert the visible 0–100 control into a perceptual media-element
 * amplitude. Squaring gives quieter values more usable adjustment range.
 */
export function volumePercentToGain(
  percent: number,
): number {
  const normalized =
    clampVolumePercent(percent) / 100;

  return normalized * normalized;
}

function getVolumeIconLevel(
  volumePercent: number,
): MediaVolumeIconLevel {
  if (volumePercent <= 0) {
    return "muted";
  }

  if (volumePercent < 34) {
    return "low";
  }

  if (volumePercent < 67) {
    return "medium";
  }

  return "high";
}

function MediaVolumeIcon({
  level,
  className,
}: {
  level: MediaVolumeIconLevel;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 20h8l10-8v24L16 28H8Z" />

      {level === "low" ||
      level === "medium" ||
      level === "high" ? (
        <path d="M31 20c2 2 2 6 0 8" />
      ) : null}

      {level === "medium" ||
      level === "high" ? (
        <path d="M35 16c5 5 5 11 0 16" />
      ) : null}

      {level === "high" ? (
        <path d="M39 12c8 7 8 17 0 24" />
      ) : null}

      {level === "muted" ? (
        <>
          <path d="m32 19 10 10" />
          <path d="m42 19-10 10" />
        </>
      ) : null}
    </svg>
  );
}

export function MediaVolumeControl({
  volumePercent,
  onVolumePercentChange,
  disabled = false,
  inputId,
  ariaLabel = "Volume control",
  classNames = {},
}: MediaVolumeControlProps) {
  const controlRef =
    useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const safeVolumePercent = Math.round(
    clampVolumePercent(volumePercent),
  );
  const iconLevel =
    getVolumeIconLevel(safeVolumePercent);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (
      event: PointerEvent,
    ) => {
      const target = event.target;

      if (
        target instanceof Node &&
        controlRef.current &&
        !controlRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener(
      "pointerdown",
      handlePointerDown,
    );
    document.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.removeEventListener(
        "pointerdown",
        handlePointerDown,
      );
      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [isOpen]);

  return (
    <div
      ref={controlRef}
      className={joinClassNames(
        "shared-volume-control",
        classNames.root,
      )}
      data-open={isOpen ? "true" : "false"}
      data-shared-volume-control="true"
    >
      <button
        type="button"
        className={joinClassNames(
          "shared-volume-control__button",
          classNames.button,
        )}
        disabled={disabled}
        aria-label={`Volume ${safeVolumePercent}%`}
        aria-haspopup="true"
        aria-expanded={isOpen}
        title={`Volume ${safeVolumePercent}%`}
        onClick={() => {
          setIsOpen((current) => !current);
        }}
      >
        <MediaVolumeIcon
          level={iconLevel}
          className={joinClassNames(
            "shared-volume-control__icon",
            classNames.icon,
          )}
        />
      </button>

      {isOpen ? (
        <div
          className={joinClassNames(
            "shared-volume-control__popup",
            classNames.popup,
          )}
          role="group"
          aria-label={ariaLabel}
        >
          <div
            className={joinClassNames(
              "shared-volume-control__slider",
              classNames.slider,
            )}
          >
            <input
              id={inputId}
              type="range"
              min="0"
              max="100"
              step="1"
              value={safeVolumePercent}
              aria-label="Volume"
              disabled={disabled}
              onChange={(event) => {
                onVolumePercentChange(
                  clampVolumePercent(
                    Number(
                      event.currentTarget.value,
                    ),
                  ),
                );
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function joinClassNames(
  ...classNames: Array<string | undefined>
) {
  return classNames.filter(Boolean).join(" ");
}
