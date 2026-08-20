import type { ReactNode } from "react";

/**
 * The modifier this keyboard actually has.
 *
 * The editor takes either -- the handlers check `metaKey || ctrlKey` -- so a hint that names only
 * one of them is wrong for whoever is on the other platform, and a hint that names both is a hint
 * nobody finishes reading. Read once: it cannot change while the page is open.
 */
export const MODIFIER =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";

/**
 * What the keyboard can do, said where it is done rather than in a shortcut sheet nobody opens.
 *
 * Which keys those are depends on where focus is, so the line says one thing or the other rather
 * than listing both at once. Four hints covering two contexts is a list nobody reads, and half of
 * it is a lie at any given moment: with nothing open there is nothing to save, and with the pane
 * open a bare arrow belongs to the text in the field rather than to the list.
 */
export const Shortcuts = ({ editing }: {
  /** Whether a translation is open, which is what decides who the arrow keys belong to. */
  editing: boolean;
}) => (
  <span className="results__keys">
    {editing ? (
      <>
        <Hint caps={[MODIFIER, "↑", "↓"]}>switch</Hint>
        <Hint caps={[MODIFIER, "↵"]}>save</Hint>
        <Hint caps={["esc"]}>close</Hint>
      </>
    ) : (
      <>
        <Hint caps={["↑", "↓"]}>move</Hint>
        <Hint caps={["↵"]}>open</Hint>
      </>
    )}
  </span>
);

/**
 * Keycaps rather than a run of symbols. The glyphs are the part worth picking out, and at a size
 * small enough to whisper they were simply unreadable.
 */
const Hint = ({ caps, children }: { caps: readonly string[]; children: ReactNode }) => (
  <span className="results__key">
    {caps.map((cap) => <kbd key={cap}>{cap}</kbd>)}
    {children}
  </span>
);
