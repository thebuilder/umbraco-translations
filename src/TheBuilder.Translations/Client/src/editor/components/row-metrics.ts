import type { MessageKey } from "../../api/generated/models.js";
import type { EditorFilters } from "../state/filters.js";

export interface DisplayedKey {
  /** The key as it should read under the current scope. */
  text: string;
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

  return {
    text: elided ? key.key.slice(prefix.length) : key.key,
    showNamespace: scope.namespace === null && namespaceCount > 1,
    elided,
  };
};
