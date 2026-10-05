import type { LocaleFacet } from "../../api/generated/models.js";
import type { EditorFilters } from "./filters.js";
import { hasNarrowingFilters } from "./list-state.js";

/**
 * The work waiting in the list on screen, as the two counts the summary offers to filter by. Zero
 * means there is nothing to offer.
 *
 * Only for a list nothing is narrowing. The counts come from the language as a whole, and beside a
 * namespace, a key path or a search they contradicted the count next to them -- "20 keys, 48 not
 * written" -- and taking the offer showed fewer rows than it promised.
 *
 * "Not written" is not the language's own count of missing keys either. The list holds the keys the
 * two languages on screen have between them, not every key any language has, so that count could be
 * larger than the list: "24 keys, 115 not written". Every message the language has is in the list,
 * so what the list holds beyond those is exactly what is not written in it.
 */
export const workInList = (
  total: number,
  language: LocaleFacet | undefined,
  filters: EditorFilters
): { notWritten: number; defaultChanged: number } => {
  if (language === undefined || hasNarrowingFilters(filters)) {
    return { notWritten: 0, defaultChanged: 0 };
  }
  return {
    notWritten: Math.max(0, total - language.messageCount),
    defaultChanged: language.needsReviewCount,
  };
};
