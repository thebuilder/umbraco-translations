import type { LocaleFacet } from "../../api/generated/models.js";

/**
 * The two jobs this screen is used for, which need the same rows presented in opposite directions.
 *
 * "search" is the ordinary one: the application ships text in this language and the editor is
 * correcting it, so the language being edited leads and the reference is context beside it.
 *
 * "queue" is a language the applications do not ship at all. Nothing exists to override; every row
 * is written from the reference. Leading with the language being edited there produces a column of
 * "Not written", which is a list of absences rather than a queue of work -- so the reference leads
 * and the language being edited is the empty space to fill.
 *
 * Not a new screen and not a mode switch an editor has to find: it follows from the language they
 * picked, because it is a fact about that language rather than a preference.
 */
export type EditingMode = "search" | "queue";

export const editingMode = (locale: LocaleFacet | undefined): EditingMode => {
  if (locale === undefined) {
    return "search";
  }

  // Nothing at all in this language yet, so there is nothing but authoring to do.
  if (locale.messageCount === 0) {
    return "queue";
  }

  /*
   * Every row this language has exists only because somebody wrote it here, and there are still
   * keys it does not have. A language the application ships text for would have to be overridden
   * key for key, with none left over, to look like this; a language it ships nothing for looks
   * like this from the first save onwards.
   */
  return locale.messageCount === locale.overriddenCount && locale.absentKeyCount > 0
    ? "queue"
    : "search";
};

/** How much of the language has been written, for the one coverage line the strip carries. */
export const coverageOf = (locale: LocaleFacet, totalKeys: number) => ({
  written: locale.overriddenCount,
  total: totalKeys,
  fraction: totalKeys > 0 ? Math.min(1, locale.overriddenCount / totalKeys) : 0,
});
