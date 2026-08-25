export type Shortcut =
  | { kind: "leave" }
  | { kind: "move"; back: boolean }
  | { kind: "save"; andThen: "close" | "next" };

/**
 * What a keystroke means in the editing pane, decided from the keystroke alone so that what it
 * means and what it can do stay separate questions.
 *
 * Ctrl/Cmd+S and Ctrl/Cmd+Enter both save. Enter alone cannot: the field holds real newlines, and
 * messages legitimately contain them. Both have to be caught, or the browser offers to save the
 * page and the Enter goes into the text instead.
 *
 * Ctrl/Cmd and an arrow moves to the translation above or below, which is the same thing the arrows
 * do in the list. The modifier is what makes it possible at all: the caret is in a text field, so a
 * bare arrow belongs to the text, and without a way past that the pane is a dead end for anyone not
 * reaching for the mouse. Saving already had a way onward -- Shift+Ctrl/Cmd+Enter -- but only
 * forwards and only by saving, which is no use for reading down a list of results.
 */
export const shortcutFor = (event: KeyboardEvent): Shortcut | null => {
  if (event.key === "Escape") {
    return { kind: "leave" };
  }
  if (!(event.metaKey || event.ctrlKey)) {
    return null;
  }
  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    return { kind: "move", back: event.key === "ArrowUp" };
  }
  if (event.key.toLowerCase() === "s" || event.key === "Enter") {
    return { kind: "save", andThen: event.shiftKey ? "next" : "close" };
  }
  return null;
};
