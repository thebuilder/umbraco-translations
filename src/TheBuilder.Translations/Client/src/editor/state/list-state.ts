import { type EditorFilters, defaultFilters } from "./filters.js";

/**
 * What the list should be showing instead of rows, when it should not be showing rows.
 *
 * "Nothing here" has two completely different causes and two different answers. Nothing has been
 * synchronised yet, which an editor cannot fix and should not be asked to; or the filters exclude
 * everything, which they can fix and which the same sentence would hide from them.
 */
export type ListState =
  | { kind: "rows" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "no-sources" }
  | { kind: "no-matches" };

/** The filters that narrow a result set, as opposed to choosing which languages to look at. */
export const narrowingFilters = (filters: EditorFilters) => ({
  query: filters.query,
  namespace: filters.namespace,
  keyPrefix: filters.keyPrefix,
  status: filters.status,
});

export const hasNarrowingFilters = (filters: EditorFilters): boolean =>
  filters.query !== defaultFilters.query ||
  filters.namespace !== defaultFilters.namespace ||
  filters.keyPrefix !== defaultFilters.keyPrefix ||
  filters.status !== defaultFilters.status;

/** Clears what narrows the list without changing which languages are being looked at. */
export const clearedFilters = (): Partial<EditorFilters> => ({
  query: defaultFilters.query,
  namespace: defaultFilters.namespace,
  keyPrefix: defaultFilters.keyPrefix,
  status: defaultFilters.status,
});

export const describeListState = ({ error, loading, rowCount, totalKeys }: {
  error?: Error;
  loading: boolean;
  rowCount: number;
  /** Keys across every source and language, or undefined while the facets are still loading. */
  totalKeys?: number;
}): ListState => {
  // A failure outranks everything: rows already on screen are from the previous query and saying
  // nothing about the error would leave them looking current.
  if (error) return { kind: "error", message: error.message };
  if (rowCount > 0) return { kind: "rows" };
  if (loading) return { kind: "loading" };

  // Still unknown whether anything has ever been synchronised, so neither empty state can be
  // claimed yet. Guessing here is how an editor gets told to call an administrator about a
  // filter they set themselves.
  if (totalKeys === undefined) return { kind: "loading" };

  return totalKeys === 0 ? { kind: "no-sources" } : { kind: "no-matches" };
};
