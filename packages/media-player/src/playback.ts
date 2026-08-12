export function formatPlaybackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;

  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function isPlaybackTextEntryTarget(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      [
        "textarea",
        "[contenteditable='true']",
        "[role='textbox']",
        "input:not([type])",
        "input[type='text']",
        "input[type='search']",
        "input[type='email']",
        "input[type='url']",
        "input[type='tel']",
        "input[type='password']",
      ].join(", "),
    ),
  );
}
