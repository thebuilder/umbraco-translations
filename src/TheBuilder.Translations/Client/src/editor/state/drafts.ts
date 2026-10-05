import { useSyncExternalStore } from "react";

/**
 * Unsaved text, by translation, and the only place it lives.
 *
 * Outside the editor, because the text has to outlive it: a virtualized list unmounts the open row
 * when it scrolls out of view, and a search can filter it out altogether, and neither should cost
 * anybody what they typed. Outside React state, because it changes on every keystroke: an editor
 * subscribes to its own entry and re-renders alone, rather than the whole list re-rendering under
 * it.
 *
 * An entry exists only while the text differs from what is saved. "Is there unsaved text" is
 * therefore just whether there is an entry.
 */
export interface DraftStore {
  get: (id: string) => string | undefined;
  has: (id: string) => boolean;
  /** Records the text, or forgets it when given undefined. */
  set: (id: string, draft: string | undefined) => void;
  subscribe: (listener: () => void) => () => void;
}

export const createDraftStore = (): DraftStore => {
  const drafts = new Map<string, string>();
  const listeners = new Set<() => void>();

  return {
    get: (id) => drafts.get(id),
    has: (id) => drafts.has(id),
    set: (id, draft) => {
      if (drafts.get(id) === draft) {
        return;
      }
      if (draft === undefined) {
        drafts.delete(id);
      } else {
        drafts.set(id, draft);
      }
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

/** One translation's unsaved text, re-rendering only when that text changes. */
export const useDraft = (store: DraftStore, id: string): string | undefined =>
  useSyncExternalStore(store.subscribe, () => store.get(id));
