import type { LocaleFacet } from "../../api/generated/models.js";

/**
 * The two jobs this screen is used for, as a fact about the language being edited.
 *
 * "search" is the ordinary one: the application ships text in this language and the editor is
 * correcting it, reading it against another language.
 *
 * "queue" is a language the applications do not ship at all. Nothing exists to override; every row
 * is written from the reference, so the reference is what it is written "from", and how much of it
 * is written is the number worth showing.
 *
 * That is all it decides, at the level of the whole screen. What a single row offers -- copying the
 * reference in, moving on to the next one -- follows from whether that row has any text yet, not
 * from this. And it no longer reorders the columns: the language being edited always sits next to
 * the key, because swapping it put the language somebody had just picked under the other heading.
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
