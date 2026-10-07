import { type EditorFilters, normalizeFilters } from "./filters.js";

const STORAGE_KEY = "thebuilder-translations:languages";

type Languages = Pick<EditorFilters, "locale" | "referenceLocale">;

/**
 * The language pair, kept for the browser session. The URL holds the view, but leaving the section
 * and coming back starts from a URL with no query, and an editor working on Danish against English
 * should not have to choose both again every time they look something up in Content.
 *
 * Only the languages: they are the context everything else is read in, and they change rarely. A
 * search or a filter coming back unasked would hide rows from somebody who no longer remembers
 * setting it.
 *
 * Session rather than local storage, so a new day, or a colleague at the same machine, starts from
 * the site's own default. Storage can be unavailable or full; the editor then works as it did
 * without it.
 */
export const rememberLanguages = ({ locale, referenceLocale }: Languages): void => {
  if (locale === null) {
    return;
  }
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ locale, referenceLocale }));
  } catch {
    // Not remembered. Nothing else depends on it.
  }
};

/** The filters from the URL, with the remembered languages when the URL names none. */
export const withRememberedLanguages = (filters: EditorFilters): EditorFilters => {
  if (filters.locale !== null || filters.referenceLocale !== null) {
    return filters;
  }
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
    if (stored === null || typeof stored !== "object") {
      return filters;
    }
    const { locale, referenceLocale } = stored as Record<string, unknown>;
    return normalizeFilters({
      ...filters,
      locale: typeof locale === "string" ? locale : null,
      referenceLocale: typeof referenceLocale === "string" ? referenceLocale : null,
    });
  } catch {
    return filters;
  }
};
