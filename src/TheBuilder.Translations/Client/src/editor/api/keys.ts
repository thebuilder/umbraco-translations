import type { EditorFilters } from "../state/filters.js";

/**
 * Query keys for the editor.
 *
 * Every key is rooted at `all` so a single prefix invalidation can reach everything, and the list
 * keys share the `keys()` prefix so an optimistic write can patch every loaded page without
 * knowing which filters are active.
 *
 * react-query hashes keys with sorted object properties, so field order does not matter, but the
 * values must be normalised first: `undefined`, `null` and `""` hash differently and would
 * silently produce a second cache entry for the same query. Always pass the output of
 * `normalizeFilters`.
 */
export const queryKeys = {
  all: ["translations"] as const,

  facets: () => [...queryKeys.all, "facets"] as const,
  permissions: () => [...queryKeys.all, "permissions"] as const,
  sources: () => [...queryKeys.all, "sources"] as const,

  tree: () => [...queryKeys.all, "tree"] as const,
  treeNode: (namespace: string | null, keyPrefix: string | null) =>
    [...queryKeys.tree(), namespace, keyPrefix] as const,

  /** Prefix shared by every message-list query, whatever the filters. */
  keys: () => [...queryKeys.all, "keys"] as const,
  keyList: (filters: EditorFilters) => [...queryKeys.keys(), filters] as const,

  message: (id: string) => [...queryKeys.all, "message", id] as const,

  /**
   * One key across every language. Under the list prefix so that saving, which already invalidates
   * the list, refreshes this with it -- the pane is showing the same rows from a different angle.
   */
  keyLocales: (sourceId: string, namespace: string, key: string, keySet: string) =>
    [...queryKeys.keys(), "locales", sourceId, namespace, key, keySet] as const,
} as const;
