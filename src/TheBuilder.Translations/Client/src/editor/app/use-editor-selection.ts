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
 * Which translation is open, and everything that follows from it: where it sits among the rows,
 * what happens when something tries to leave it, and what happens when the list moves out from
 * under it.
 *
 * The whole reason this is a state machine rather than a `setSelected` call is unsaved text:
 * anything that would close the open row has to ask first while there is some. Every route out --
 * another row, the close button, Escape -- goes through the same question. The one route nobody
 * can be asked about is the row leaving the result, so that one closes without asking and keeps the
 * text, and says so through `onKept`.
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
  const [pending, setPending] = useState<EditTarget | "close">();
  const [drafts] = useState(createDraftStore);

  const unsaved = useCallback(
    (target: EditTarget | undefined) => target !== undefined && drafts.has(targetId(target)),
    [drafts]
  );

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
  // biome-ignore lint/correctness/useExhaustiveDependencies: gone is the trigger. selected, unsaved and onKept are read at the moment the row leaves, and a change to any of them alone is not a reason to close anything.
  useEffect(() => {
    if (!gone || selected === undefined) {
      return;
    }
    setPending(undefined);
    setSelected(undefined);
    if (unsaved(selected)) {
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
      pending,
      drafts,
      claimFocus: () => {
        if (focusFor.current !== id) {
          return false;
        }
        focusFor.current = null;
        return true;
      },
      select,
      close,
      discard,
      keepEditing,
    };
  }, [selected, index, keys, pending, drafts, select, close, discard, keepEditing]);

  return { selected, open, select };
};
