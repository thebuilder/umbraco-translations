import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MessageKey } from "../../api/generated/models.js";
import { createDraftStore, type DraftStore } from "../state/drafts.js";
import { type EditorFilters, editingLocale } from "../state/filters.js";
import { type EditTarget, sameTarget, targetId, targetOf } from "../state/target.js";

/** How far the list query has got, which decides whether a row missing from it is gone. */
export interface ListProgress {
  hasNextPage: boolean;
  isFetching: boolean;
  isPlaceholderData: boolean;
  isSuccess: boolean;
}

/**
 * Whether the open translation has left the result, judged only when that is knowable.
 *
 * Not while a new search is loading: the list still holds the previous result, and the row being
 * missing from that says nothing. Not while pages are still to come either: a row ranked past the
 * ones loaded so far is still a result, only one nobody has scrolled to yet.
 */
export const leftResult = (progress: ListProgress, found: boolean): boolean =>
  !found &&
  progress.isSuccess &&
  !progress.isFetching &&
  !progress.isPlaceholderData &&
  !progress.hasNextPage;

/**
 * Everything the editor needs from the selection, as one value: which translation it is on, what is
 * either side of it, the question it may be asking, and the ways out.
 */
export interface OpenTranslation {
  /**
   * True once, for a translation opened on purpose. An editor that mounts again because its row
   * scrolled back into view, or came back into a search result, taking the caret out of wherever
   * it was would be stealing focus.
   */
  claimFocus: () => boolean;
  /** Closes the row. Unsaved text stays, shown on the row, until it is saved or thrown away. */
  close: () => void;
  /** Unsaved text, which outlives the editor. See DraftStore. */
  drafts: DraftStore;
  /** The row after this one, so a reviewer can work down the list without returning to it. */
  next?: EditTarget;
  previous?: EditTarget;
  select: (target: EditTarget) => void;
  target: EditTarget;
}

/**
 * Which translation is open, and everything that follows from it: where it sits among the rows,
 * and what happens when the list moves out from under it.
 *
 * Nothing asks before leaving. Every route out -- another row, the close button, Escape -- closes
 * the row and keeps its unsaved text, which the row then shows as unsaved with its own Save. Asking
 * instead meant answering a question before the next row would open, and then answering "keep
 * editing" before the text could even be saved. The one route that needs saying is the row
 * leaving the result, where nothing on screen would show the text was kept; that goes to `onKept`.
 */
export const useEditorSelection = ({
  locale,
  referenceLocale,
  update,
  keys,
  progress,
  onKept,
}: {
  locale: string | null;
  referenceLocale: string | null;
  update: (patch: Partial<EditorFilters>) => void;
  /** The rows loaded so far, in the order the list shows them. */
  keys: readonly MessageKey[];
  progress: ListProgress;
  /** Told when a translation with unsaved text closes because it left the result. */
  onKept: (target: EditTarget) => void;
}) => {
  const [selected, setSelected] = useState<EditTarget>();
  const [drafts] = useState(() => createDraftStore());

  const focusFor = useRef<string | null>(null);

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

  const close = useCallback(() => setSelected(undefined), []);

  /*
   * Where the open translation sits in the list, looked up by identity rather than remembered as a
   * position, because the row moves underneath: saving while sorted by what needs attention
   * reorders the list while the editor is still open on the row that moved.
   */
  const index = useMemo(
    () =>
      selected ? keys.findIndex((key) => sameTarget(targetOf(key, selected.locale), selected)) : -1,
    [keys, selected]
  );

  /*
   * Closing without asking, for a translation that has left the result. Its unsaved text stays in
   * the store and comes back when it is opened again. Keeping the selection instead only meant the
   * row sprang back open when the search was widened.
   */
  const gone = leftResult(progress, index >= 0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: gone is the trigger. selected, drafts and onKept are read at the moment the row leaves, and a change to any of them alone is not a reason to close anything.
  useEffect(() => {
    if (!gone || selected === undefined) {
      return;
    }
    setSelected(undefined);
    if (drafts.has(targetId(selected))) {
      onKept(selected);
    }
  }, [gone]);

  const open = useMemo((): OpenTranslation | undefined => {
    if (selected === undefined) {
      return undefined;
    }
    const at = (offset: number) => {
      const neighbour = index >= 0 ? keys[index + offset] : undefined;
      return neighbour ? targetOf(neighbour, selected.locale) : undefined;
    };
    const id = targetId(selected);
    return {
      target: selected,
      previous: at(-1),
      next: at(1),
      drafts,
      claimFocus: () => {
        if (focusFor.current !== id) {
          return false;
        }
        focusFor.current = null;
        return true;
      },
      select: go,
      close,
    };
  }, [selected, index, keys, drafts, go, close]);

  return { selected, open, select: go, drafts };
};
