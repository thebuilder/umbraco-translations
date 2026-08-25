import type { LocaleFacet } from "../../api/generated/models.js";

/**
 * Comparing and looking up locale codes.
 *
 * Case is not significant in a language tag, and the server has always treated it that way: the
 * cells and coverage maps are built with `StringComparer.OrdinalIgnoreCase`, and the locales a
 * search matched come back verbatim from the database rows. The client was comparing the same
 * codes with `===` and indexing objects with them, which is exact -- so a row stored as "de-de"
 * against a facet reporting "de-DE" would lose its language's name and its text without any error
 * to notice. One place to make that decision, rather than eleven call sites that each have to
 * remember it.
 */
export const sameLocale = (one: string | null | undefined, other: string | null | undefined): boolean =>
  one !== null && one !== undefined &&
  other !== null && other !== undefined &&
  one.toLowerCase() === other.toLowerCase();

/**
 * A locale's entry in a map keyed by code.
 *
 * The exact key first, because that is what the server sends on every ordinary response and a scan
 * per lookup would be paid on every cell of every row. The scan is the fallback for the case the
 * exact hit cannot cover.
 */
export const localeIn = <T>(map: Record<string, T>, code: string | null | undefined): T | undefined => {
  if (code === null || code === undefined) return undefined;

  const exact = map[code];
  if (exact !== undefined) return exact;

  const found = Object.keys(map).find((candidate) => sameLocale(candidate, code));
  return found === undefined ? undefined : map[found];
};

export const facetFor = (
  locales: readonly LocaleFacet[],
  code: string | null | undefined,
): LocaleFacet | undefined => locales.find((locale) => sameLocale(locale.code, code));

/**
 * The language to edit when nothing else has said which.
 *
 * The server normally decides the pair and reports what it chose, but it has nothing to decide from
 * until something has been synchronised, and answers with empty strings. An editor looking at an
 * empty list still has to be told which language the screen is about -- and "none" is not a state
 * the rest of the editor can work in, because a row with no language to open cannot be opened.
 *
 * The site's own default, or the only language there is. This is the same choice the server makes
 * as soon as it is able to make one, not a second rule that disagrees with it.
 */
export const defaultLocale = (locales: readonly LocaleFacet[]): string | null =>
  (locales.find((locale) => locale.isDefault) ?? locales[0])?.code ?? null;

/**
 * The language an editor recognises. Falls back to the code, which is what a language the facets
 * do not know about deserves -- naming it badly is better than dropping it from the sentence.
 */
export const localeName = (
  locales: readonly LocaleFacet[],
  code: string | null | undefined,
): string => facetFor(locales, code)?.name || code || "";
