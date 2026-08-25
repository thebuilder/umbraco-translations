import { useEffect } from "react";

/**
 * Puts the cursor in the search field from anywhere in the editor.
 *
 * Two keys, because they answer to different habits: Ctrl/Cmd+K is the one every application with
 * a search box has trained people to press, and `/` is the one people who live in the keyboard
 * reach for. `/` is a printable character, so it only counts while nothing is being typed into --
 * otherwise it would eat the slash out of a translation someone was writing.
 *
 * The editor renders inside a shadow root, so a keystroke aimed at one of our fields arrives at
 * the document with the shadow host as its target. `composedPath` is what sees through that;
 * `event.target` alone would report the host element for every keystroke and let `/` fire while
 * the editor was typing.
 */
export const useSearchShortcut = (focus: () => void) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const shortcut = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
      const slash = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;
      if (!(shortcut || slash)) {
        return;
      }
      if (slash && isTyping(event)) {
        return;
      }

      event.preventDefault();
      focus();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focus]);
};

const isTyping = (event: KeyboardEvent): boolean =>
  event
    .composedPath()
    .some(
      (target) =>
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement)
    );
