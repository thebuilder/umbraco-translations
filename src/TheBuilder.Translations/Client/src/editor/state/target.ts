import type { MessageKey } from "../../api/generated/models.js";

/**
 * Which translation the editing pane is open on.
 *
 * Identity rather than a message id, because the pane has to be able to open on a translation that
 * does not exist yet. A locale the application never shipped has no row and therefore no id until
 * something is written to it, and writing those is the whole of the queue job -- addressing the
 * pane by id made every one of them unopenable.
 *
 * The writes already work this way: `saveOverride` takes (source, namespace, key, locale) and
 * creates the row if it has to. This is the same identity, carried through the interface.
 */
export interface EditTarget {
  key: string;
  locale: string;
  namespace: string;
  sourceId: string;
}

export const targetOf = (row: MessageKey, locale: string): EditTarget => ({
  sourceId: row.sourceId,
  namespace: row.namespace,
  key: row.key,
  locale,
});

export const sameTarget = (a: EditTarget | undefined, b: EditTarget | undefined): boolean =>
  a !== undefined &&
  b !== undefined &&
  a.sourceId === b.sourceId &&
  a.namespace === b.namespace &&
  a.key === b.key &&
  a.locale === b.locale;

/** Stable enough to key a React element and a query on. */
export const targetId = (target: EditTarget): string =>
  `${target.sourceId}|${target.namespace}|${target.key}|${target.locale}`;

/**
 * The same identity without a language, which is what the list is a list of: one row per key, with
 * a cell per language on it. Named here beside `targetId` so the row's id and the pane's cannot
 * drift into two different spellings of the same thing.
 */
export const keyId = (key: { sourceId: string; namespace: string; key: string }): string =>
  `${key.sourceId}|${key.namespace}|${key.key}`;

/** The key as an editor would say it, with the namespace kept as the quieter half. */
export const fullKey = (target: { namespace: string; key: string }): string =>
  `${target.namespace}.${target.key}`;
