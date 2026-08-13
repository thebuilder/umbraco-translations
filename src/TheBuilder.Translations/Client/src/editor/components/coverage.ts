import type { LocaleFacet, MessageKey, MessageLocaleState } from "../../api/generated/models.js";

/** How many locales get a dot before the rest collapse into a count. */
export const MAXIMUM_DOTS = 10;

export interface CoverageDot {
  locale: string;
  state: MessageLocaleState;
}

export interface Coverage {
  dots: readonly CoverageDot[];
  /** Locales beyond the dot limit, so the row can say "+3" rather than wrap. */
  overflow: number;
  /** Read aloud in place of the dots, which carry no meaning to a screen reader. */
  label: string;
}

/**
 * Per-locale state for one key, in the order the toolbar lists locales so a column of dots lines up
 * down the page. A locale the key has no entry for is absent rather than missing from the readout.
 */
export const coverageOf = (key: MessageKey, locales: readonly LocaleFacet[]): Coverage => {
  const all = locales.map((locale) => ({
    locale: locale.code,
    state: key.coverage[locale.code] ?? ("Absent" as MessageLocaleState),
  }));

  return {
    dots: all.slice(0, MAXIMUM_DOTS),
    overflow: Math.max(0, all.length - MAXIMUM_DOTS),
    label: describe(all),
  };
};

/**
 * Counts rather than a locale-by-locale reading: at a dozen locales the latter is unusable, and
 * what an editor needs from this cell is how much is left to do.
 */
const describe = (dots: readonly CoverageDot[]): string => {
  if (dots.length === 0) return "No locales";

  const absent = dots.filter((dot) => dot.state === "Absent");
  const review = dots.filter((dot) => dot.state === "NeedsReview");
  const parts = [`translated in ${dots.length - absent.length} of ${dots.length} locales`];

  if (absent.length > 0) parts.push(`missing in ${absent.map((dot) => dot.locale).join(", ")}`);
  if (review.length > 0) parts.push(`${review.length} awaiting review`);
  return parts.join("; ");
};

/** Shape as well as colour, so the readout survives a monochrome or colour-blind view. */
export const dotGlyph = (state: MessageLocaleState): string => {
  switch (state) {
    case "Absent": return "○";
    case "NeedsReview": return "◐";
    case "Removed": return "⊘";
    case "Overridden": return "●";
    default: return "◉";
  }
};
