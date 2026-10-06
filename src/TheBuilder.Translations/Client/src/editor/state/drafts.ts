import { useSyncExternalStore } from "react";
import { type EditTarget, targetId } from "./target.js";

/** Unsaved text for one translation, with what it was written against. */
export interface Draft {
  target: EditTarget;
  text: string;
  /**
   * The saved version the text was written against, sent with the save so that somebody else's
   * save in between is a conflict rather than silently overwritten. Null for a translation that
   * has never been saved.
   */
  version: number | null;
}

/**
 * Unsaved text, by translation, and the only place it lives.
 *
 * Outside the editor, because the text has to outlive it: closing a row keeps what was typed in it,
 * shown on the row as unsaved until it is saved or thrown away, and a virtualized list unmounts the
 * open row when it scrolls out of view. Outside React state, because it changes on every
 * keystroke: an editor subscribes to its own entry and re-renders alone, rather than the whole list
 * re-rendering under it.
 *
 * Kept in session storage too, so leaving the section for Content and coming back, or reloading,
 * does not cost anybody what they typed. The browser session is the limit: a new one starts clean.
 *
 * An entry exists only while the text differs from what is saved. "Is there unsaved text" is
 * therefore just whether there is an entry.
 */
export interface DraftStore {
  /** Every unsaved translation, in the order it was first changed. The same array until one changes. */
  all: () => readonly Draft[];
  get: (id: string) => string | undefined;
  has: (id: string) => boolean;
  /** Records the text, or forgets it when given undefined. */
  set: (target: EditTarget, text: string | undefined, version?: number | null) => void;
  subscribe: (listener: () => void) => () => void;
}

const STORAGE_KEY = "thebuilder-translations:drafts";

const isDraft = (value: unknown): value is Draft => {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const { target, text } = value as Record<string, unknown>;
  return typeof text === "string" && target !== null && typeof target === "object";
};

const load = (storage: Storage | undefined): Draft[] => {
  try {
    const stored: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter(isDraft) : [];
  } catch {
    return [];
  }
};

const sessionStore = (): Storage | undefined => {
  try {
    return sessionStorage;
  } catch {
    return undefined;
  }
};

/** A store over session storage, or over nothing when given null (as the tests do). */
export const createDraftStore = (storage: Storage | null = sessionStore() ?? null): DraftStore => {
  const drafts = new Map(
    load(storage ?? undefined).map((draft) => [targetId(draft.target), draft])
  );
  let snapshot: readonly Draft[] = [...drafts.values()];
  const listeners = new Set<() => void>();

  const save = () => {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Full or unavailable: the text is still held for as long as the page is open.
    }
  };

  return {
    get: (id) => drafts.get(id)?.text,
    has: (id) => drafts.has(id),
    all: () => snapshot,
    set: (target, text, version) => {
      const id = targetId(target);
      const current = drafts.get(id);
      if (current?.text === text) {
        return;
      }
      if (text === undefined) {
        drafts.delete(id);
      } else {
        drafts.set(id, { target, text, version: version ?? current?.version ?? null });
      }
      snapshot = [...drafts.values()];
      save();
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

/** Every unsaved translation. */
export const useDrafts = (store: DraftStore): readonly Draft[] =>
  useSyncExternalStore(store.subscribe, store.all);
