import { useCallback, useRef, useState } from "react";
import { type EditorFilters, editingLocale } from "../state/filters.js";
import { type EditTarget, sameTarget } from "../state/target.js";

/**
 * Which translation is open, and what happens when something tries to leave it.
 *
 * The whole reason this is a state machine rather than a `setSelected` call is unsaved text: it
 * lives only in the pane, so anything that would unmount the pane has to ask first. Every route out
 * -- another row, the close button, Escape -- goes through the same question.
 */
export const useEditorSelection = ({
  locale,
  referenceLocale,
  update,
}: {
  locale: string | null;
  referenceLocale: string | null;
  update: (patch: Partial<EditorFilters>) => void;
}) => {
  const [selected, setSelected] = useState<EditTarget>();

  /**
   * Typed text that has not been saved. A ref rather than state: this changes on every keystroke
   * and re-rendering the whole editor for it would be absurd, and nothing on screen depends on the
   * value.
   */
  const unsaved = useRef(false);
  const onDirtyChange = useCallback((dirty: boolean) => {
    unsaved.current = dirty;
  }, []);

  /**
   * Where the editor is trying to go while unsaved text is in the way: another translation, or
   * "close". The pane asks about it in its own footer.
   *
   * This used to be `confirm()`, which is suppressed in enough contexts that the dialog never
   * appeared and its false return left the pane with no way out at all -- Escape and the close
   * button both silently did nothing, with the text still in the field.
   */
  const [pending, setPending] = useState<EditTarget | "close">();

  /**
   * Opening a translation, including one in another language.
   *
   * Correcting the reference language is editing it, so it moves the whole view rather than opening
   * a second field beside the first: two editable languages on screen at once is a way to save text
   * into the wrong one. The comparison follows, or the view ends up comparing a language with
   * itself and the reference column silently disappears.
   */
  const go = useCallback(
    (target: EditTarget) => {
      setSelected(target);
      if (target.locale !== locale) {
        update(editingLocale({ locale, referenceLocale }, target.locale));
      }
    },
    [locale, referenceLocale, update]
  );

  // Both routes out of an open translation: picking another row, and closing altogether.
  const select = useCallback(
    (target: EditTarget) => {
      if (!unsaved.current || sameTarget(target, selected)) {
        go(target);
      } else {
        setPending(target);
      }
    },
    [selected, go]
  );

  const close = useCallback(() => {
    if (unsaved.current) {
      setPending("close");
    } else {
      setSelected(undefined);
    }
  }, []);

  const discard = useCallback(() => {
    unsaved.current = false;
    if (pending === undefined || pending === "close") {
      setSelected(undefined);
    } else {
      go(pending);
    }
    setPending(undefined);
  }, [pending, go]);

  const keepEditing = useCallback(() => setPending(undefined), []);

  return { selected, pending, onDirtyChange, select, close, discard, keepEditing };
};
