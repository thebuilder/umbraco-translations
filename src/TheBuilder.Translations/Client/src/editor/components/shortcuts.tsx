/**
 * The modifier this keyboard actually has.
 *
 * The editor takes either -- the handlers check `metaKey || ctrlKey` -- so a hint that names only
 * one of them is wrong for whoever is on the other platform, and a hint that names both is a hint
 * nobody finishes reading. Read once: it cannot change while the page is open.
 */
const MODIFIER =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";

/**
 * What the keyboard can do in the editor, said where it is done rather than in a shortcut sheet
 * nobody opens. Only the editor's keys: the list's own are the arrows and Enter, which is what any
 * list answers to and needs no saying.
 */
export const EditorKeys = ({ next }: { next: boolean }) => (
  <span aria-hidden="true" className="keys">
    <span className="keys__item">
      <kbd>{MODIFIER}</kbd>
      <kbd>↵</kbd> save
    </span>
    {next ? (
      <span className="keys__item">
        <kbd>{MODIFIER}</kbd>
        <kbd>↓</kbd> next
      </span>
    ) : null}
    <span className="keys__item">
      <kbd>esc</kbd> close
    </span>
  </span>
);
