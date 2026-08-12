export type MediaTransportIconName =
  | "previous"
  | "play"
  | "pause"
  | "next";

export function MediaTransportIcon({
  name,
  className,
}: {
  name: MediaTransportIconName;
  className?: string;
}) {
  return (
    <span className={className} aria-hidden="true">
      <svg viewBox="0 0 48 48" focusable="false">
        {name === "previous" ? (
          <>
            <path d="M35 9 16 24l19 15Z" />
            <path d="M12 10v28" />
          </>
        ) : null}

        {name === "play" ? (
          <path d="M16 9 37 24 16 39Z" />
        ) : null}

        {name === "pause" ? (
          <>
            <rect x="14" y="10" width="7" height="28" rx="2" />
            <rect x="27" y="10" width="7" height="28" rx="2" />
          </>
        ) : null}

        {name === "next" ? (
          <>
            <path d="m13 9 19 15-19 15Z" />
            <path d="M36 10v28" />
          </>
        ) : null}
      </svg>
    </span>
  );
}
