import { useCallback, useRef, useState } from "react";
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
 * Which translation is open, and what happens when something tries to leave it.
 *
 * The whole reason this is a state machine rather than a `setSelected` call is unsaved text: it
 * lives in the open row, so anything that would close that row has to ask first. Every route out
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
   * Typed text that has not been saved, by translation. Held here rather than in the editor, so it
   * outlives the editor: a virtualized list unmounts the open row when it is scrolled out of view,
   * and a search can filter it out altogether, and neither should cost anybody what they typed. A
   * ref rather than state, because it changes on every keystroke and nothing here renders it.
   */
  const drafts = useRef(new Map<string, string>());
  // Read by callbacks that must not change identity on every selection, so the open translation is
  // reached through a ref rather than captured.
  const selectedRef = useRef<EditTarget | undefined>(undefined);
  selectedRef.current = selected;
  const unsaved = useCallback(
    () => selectedRef.current !== undefined && drafts.current.has(targetId(selectedRef.current)),
    []
  );

  /** Reported by the editor as the text changes: the draft, or undefined once it is saved. */
  const onDraftChange = useCallback((target: EditTarget, draft: string | undefined) => {
    if (draft === undefined) {
      drafts.current.delete(targetId(target));
    } else {
      drafts.current.set(targetId(target), draft);
    }
  }, []);

  /** What an editor opening on this translation should start from, if text was left in it. */
  const draftFor = useCallback(
    (target: EditTarget): string | undefined => drafts.current.get(targetId(target)),
    []
  );

  /**
   * The translation that was opened on purpose and has not yet had focus put in it. Focus moves
   * only when somebody opens a row. An editor that mounts again because its row scrolled back into
   * view, or came back into a search result, taking the caret out of wherever it was is the editor
   * stealing focus.
   */
  const focusFor = useRef<string | null>(null);
  const claimFocus = useCallback((target: EditTarget): boolean => {
    if (focusFor.current !== targetId(target)) {
      return false;
    }
    focusFor.current = null;
    return true;
  }, []);

  /**
   * Where the editor is trying to go while unsaved text is in the way: another translation, or
   * "close". The open row asks about it in its own footer.
   *
   * This used to be `confirm()`, which is suppressed in enough contexts that the dialog never
   * appeared and its false return left the editor with no way out at all -- Escape and the close
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
      focusFor.current = targetId(target);
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
      if (!unsaved() || sameTarget(target, selected)) {
        go(target);
      } else {
        setPending(target);
      }
    },
    [selected, go, unsaved]
  );

  const close = useCallback(() => {
    if (unsaved()) {
      setPending("close");
    } else {
      setSelected(undefined);
    }
  }, [unsaved]);

  const discard = useCallback(() => {
    if (selectedRef.current) {
      drafts.current.delete(targetId(selectedRef.current));
    }
    if (pending === undefined || pending === "close") {
      setSelected(undefined);
    } else {
      go(pending);
    }
    setPending(undefined);
  }, [pending, go]);

  const keepEditing = useCallback(() => setPending(undefined), []);

  /**
   * Closing without asking, for a translation that has already left the result. There is nobody to
   * ask: the row is not on screen. Its unsaved text is kept, and comes back when it is opened
   * again.
   * Keeping the selection instead only meant the row sprang back open when the search was widened.
   *
   * Returns the translation if it had unsaved text, so the editor can be told where it went.
   */
  const drop = useCallback((): EditTarget | undefined => {
    const left = selectedRef.current;
    setPending(undefined);
    setSelected(undefined);
    return left !== undefined && drafts.current.has(targetId(left)) ? left : undefined;
  }, []);

  return {
    selected,
    pending,
    onDraftChange,
    draftFor,
    claimFocus,
    select,
    close,
    discard,
    keepEditing,
    drop,
  };
};
