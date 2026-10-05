import { useCallback, useMemo, useRef, useState } from "react";
import { createDraftStore, type DraftStore } from "../state/drafts.js";
import { type EditorFilters, editingLocale } from "../state/filters.js";
import { type EditTarget, sameTarget, targetId } from "../state/target.js";

/**
 * Whether the open translation has left the result, judged only when that is knowable.
 *
 * Not while a new search is loading: the list still holds the previous result, and the row being
 * missing from that says nothing. Not while pages are still to come either: a row ranked past the
 * ones loaded so far is still a result, only one nobody has scrolled to yet.
 */
export const leftResult = (
  query: {
    isSuccess: boolean;
    isFetching: boolean;
    isPlaceholderData: boolean;
    hasNextPage: boolean;
  },
  found: boolean
): boolean =>
  !found && query.isSuccess && !query.isFetching && !query.isPlaceholderData && !query.hasNextPage;

/**
 * Everything the editor needs from the selection, as one value: which translation it is on, what is
 * either side of it, the question it may be asking, and the ways out. Handed over whole, so the
 * editor is not a list of a dozen props each forwarded from here by hand.
 */
export interface OpenTranslation {
  /**
   * True once, for the translation that was opened on purpose. An editor that mounts again because
   * its row scrolled back into view, or came back into a search result, taking the caret out of
   * wherever it was would be stealing focus.
   */
  claimFocus: (target: EditTarget) => boolean;
  close: () => void;
  discard: () => void;
  /** Unsaved text, which outlives the editor. See DraftStore. */
  drafts: DraftStore;
  keepEditing: () => void;
  /** The row after this one, so a reviewer can work down the list without returning to it. */
  next?: EditTarget;
  /**
   * Set when leaving has been asked for and there is unsaved text in the way: where the editor is
   * trying to go, or "close". The question is answered in the editor's footer rather than by a
   * native dialog -- `confirm` is suppressed in enough contexts that relying on it left the editor
   * with no way out at all.
   */
  pending?: EditTarget | "close";
  previous?: EditTarget;
  select: (target: EditTarget) => void;
  target: EditTarget;
}

/**
 * Which translation is open, and what happens when something tries to leave it.
 *
 * The whole reason this is a state machine rather than a `setSelected` call is unsaved text:
 * anything that would close the open row has to ask first while there is some. Every route out --
 * another row, the close button, Escape -- goes through the same question.
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
  const [pending, setPending] = useState<EditTarget | "close">();
  const [drafts] = useState(createDraftStore);

  const unsaved = useCallback(
    (target: EditTarget | undefined) => target !== undefined && drafts.has(targetId(target)),
    [drafts]
  );

  const focusFor = useRef<string | null>(null);
  const claimFocus = useCallback((target: EditTarget): boolean => {
    if (focusFor.current !== targetId(target)) {
      return false;
    }
    focusFor.current = null;
    return true;
  }, []);

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
      focusFor.current = targetId(target);
      setSelected(target);
      if (target.locale !== locale) {
        update(editingLocale({ locale, referenceLocale }, target.locale));
      }
    },
    [locale, referenceLocale, update]
  );

  const select = useCallback(
    (target: EditTarget) => {
      if (!unsaved(selected) || sameTarget(target, selected)) {
        go(target);
      } else {
        setPending(target);
      }
    },
    [selected, go, unsaved]
  );

  const close = useCallback(() => {
    if (unsaved(selected)) {
      setPending("close");
    } else {
      setSelected(undefined);
    }
  }, [selected, unsaved]);

  const discard = useCallback(() => {
    if (selected) {
      drafts.set(targetId(selected), undefined);
    }
    if (pending === undefined || pending === "close") {
      setSelected(undefined);
    } else {
      go(pending);
    }
    setPending(undefined);
  }, [selected, pending, go, drafts]);

  const keepEditing = useCallback(() => setPending(undefined), []);

  /**
   * Closing without asking, for a translation that has already left the result. There is nobody to
   * ask: the row is not on screen. Its unsaved text stays in the store and comes back when it is
   * opened again. Keeping the selection instead only meant the row sprang back open when the
   * search was widened.
   *
   * Returns the translation if it had unsaved text, so the editor can be told where it went.
   */
  const drop = useCallback((): EditTarget | undefined => {
    setPending(undefined);
    setSelected(undefined);
    return unsaved(selected) ? selected : undefined;
  }, [selected, unsaved]);

  /** The open translation, less which one it is and its neighbours, which only the list knows. */
  const editing = useMemo(
    () => ({ pending, drafts, claimFocus, select, close, discard, keepEditing }),
    [pending, drafts, claimFocus, select, close, discard, keepEditing]
  );

  return { selected, editing, select, drop };
};
