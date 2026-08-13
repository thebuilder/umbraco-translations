import type { MessageKey } from "../../api/generated/models.js";
import type { EditorFilters } from "../state/filters.js";

export interface DisplayedKey {
  /** The key as it should read under the current scope. */
  text: string;
  /**
   * The segment directly above the leaf, with a leading ellipsis when more sit above it. Computed
   * rather than clipped with CSS: truncating a dotted path from the left needs `direction: rtl`,
   * and bidi reordering then moves the separators, turning "a.articles.lastUpdated" into
   * "…a.articleslastUpdated".
   */
  path: string;
  /** The last segment: what an editor recognises the message by. */
  leaf: string;
  /** Whether the namespace still carries information the row does not already imply. */
  showNamespace: boolean;
  /** True when a prefix was stripped, so the caller can show the full key some other way. */
  elided: boolean;
}

/**
 * How a key should read once the surrounding navigation has already said part of it.
 *
 * The namespace is grouping, not content: repeating "website.checkout.errors." on every row while
 * the scope already says so is noise. It stays only when it is still telling the reader something —
 * no namespace is selected, and more than one exists.
 */
export const displayKey = (
  key: MessageKey,
  scope: Pick<EditorFilters, "namespace" | "keyPrefix">,
  namespaceCount: number,
): DisplayedKey => {
  const prefix = scope.keyPrefix ? `${scope.keyPrefix}.` : null;
  const elided = prefix !== null && key.key.startsWith(prefix);

  const text = elided ? key.key.slice(prefix.length) : key.key;
  // Split so the row can give the last segment the weight and let the path truncate. Keys run long
  // ("aeldrereformen.articles.lastUpdated") and it is the tail that identifies the message, so
  // ellipsising from the right hides the only part worth reading.
  const segments = text.split(".");
  const leaf = segments.at(-1) ?? text;
  const parent = segments.length > 1 ? segments.at(-2)! : "";
  // Anything above the immediate parent is context the tree and breadcrumb already carry.
  const truncated = segments.length > 2;

  return {
    text,
    path: parent === "" ? "" : `${truncated ? "…" : ""}${parent}.`,
    leaf,
    showNamespace: scope.namespace === null && namespaceCount > 1,
    elided,
  };
};
