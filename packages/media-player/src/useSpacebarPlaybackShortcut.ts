import { useEffect, useRef } from "react";

import { isPlaybackTextEntryTarget } from "./playback.js";

export type SpacebarPlaybackShortcutOptions = {
  onToggle: () => void | Promise<void>;
  canToggle?: () => boolean;
};

export function useSpacebarPlaybackShortcut({
  onToggle,
  canToggle,
}: SpacebarPlaybackShortcutOptions) {
  const onToggleRef = useRef(onToggle);
  const canToggleRef = useRef(canToggle);

  onToggleRef.current = onToggle;
  canToggleRef.current = canToggle;

  useEffect(() => {
    const isUnmodifiedSpace = (event: KeyboardEvent) =>
      (event.code === "Space" || event.key === " ") &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        !isUnmodifiedSpace(event) ||
        isPlaybackTextEntryTarget(event.target)
      ) {
        return;
      }

      // Reserve plain Space for playback so focused buttons, summaries,
      // and page scrolling never receive a second native Space action.
      event.preventDefault();
      event.stopPropagation();

      if (canToggleRef.current && !canToggleRef.current()) {
        return;
      }

      void onToggleRef.current();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (
        !isUnmodifiedSpace(event) ||
        isPlaybackTextEntryTarget(event.target)
      ) {
        return;
      }

      // Buttons commonly activate on Space keyup. Suppress that native
      // activation after the transport shortcut consumed keydown.
      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("keyup", handleKeyUp, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("keyup", handleKeyUp, true);
    };
  }, []);
}
