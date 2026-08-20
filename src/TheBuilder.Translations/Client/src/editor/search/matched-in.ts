import type { MessageKey } from "../../api/generated/models.js";
import type { EditingMode } from "../state/editing-mode.js";
import { localeIn, sameLocale } from "../state/locales.js";
import { matchesTerm } from "./matching.js";

/**
 * What naming the hit needs to know: which languages have columns, what they are called, and how
 * to name one that does not. `KeyColumnOptions` extends this rather than the other way round, so
 * the row can hand its own options straight over without the two files importing each other.
 */
export interface MatchedInOptions {
  editing: string | null;
  comparison: string | null;
  editingName: string;
  comparisonName: string;
  /** How a language with no column reads to an editor, since neither name above covers it. */
  nameOf: (locale: string) => string;
  term: string;
  mode: EditingMode;
}

/*
 * The server's answer, always. Search is locale-blind there, so it is the only complete one: it can
 * name a language whose text this row never carries, and the values the row does carry are previews,
 * so a hit past the cut is invisible from here. An empty list is that answer too -- the server
 * searched and no language matched -- not an absence to paper over. The client and the server are
 * built and packed together, so there is no version of one that meets a different version of the
 * other and no fallback worth carrying for it.
 */

/** Which columns the list is showing, in the order the row reads them. */
const columns = ({ editing, comparison, mode }: MatchedInOptions) => ({
  lead: mode === "queue" ? comparison : editing,
  second: mode === "queue" ? editing : comparison,
});

/**
 * The languages a key matched in that the list has no column for. These are the hits that are
 * otherwise invisible: the row looks unrelated to what was typed, because the text that matched is
 * in a language nobody is looking at.
 */
export const matchedElsewhere = (
  row: MessageKey,
  term: string,
  shown: readonly (string | null)[],
): readonly string[] =>
  term.trim() === ""
    ? []
    : row.matchedLocales.filter((locale) => !shown.some((other) => sameLocale(locale, other)));

/**
 * Where the search hit was, when it was not in the words leading the row.
 *
 * Said only when it explains something. A hit in the leading column is already marked there, so
 * repeating it under every row would be a label down the whole list saying what the reader can
 * see. A hit in the second column is marked too, but that column is the quiet one and the eye goes
 * to the lead, so it is named.
 *
 * Past that, the search is locale-blind: somebody handed the German and asked to fix the Danish
 * gets the key back, and nothing on screen would otherwise say why. Those languages have no column
 * to be marked in, so naming them is the whole explanation -- all of them, when the sentence turns
 * up in more than one.
 */
export const matchedIn = (row: MessageKey, options: MatchedInOptions): string | null => {
  const { term, mode } = options;
  if (term.trim() === "") return null;

  const { lead, second } = columns(options);
  const matched = row.matchedLocales;
  const leadName = mode === "queue" ? options.comparisonName : options.editingName;
  const secondName = mode === "queue" ? options.editingName : options.comparisonName;

  /*
   * A hit in a column on screen is marked where it stands. The lead column therefore says nothing
   * -- repeating it under every row would be a label down the whole list telling the reader what
   * they can see -- and the second column is named, because it is the quiet one and the eye goes to
   * the lead.
   *
   * Both change when the row is showing a preview rather than the whole message. A hit past the cut
   * has nothing marked and nothing to look at, so the row has to say which language it is in and
   * that the words are further along than the ones on screen.
   */
  if (matched.some((locale) => sameLocale(locale, lead)))
    return truncated(row, lead) ? `${leadName}, further in` : null;

  if (second !== null && !sameLocale(second, lead) && matched.some((locale) => sameLocale(locale, second)))
    return truncated(row, second) ? `${secondName}, further in` : secondName;

  const elsewhere = matchedElsewhere(row, term, [lead, second]);
  if (elsewhere.length > 0)
    return elsewhere.map(options.nameOf).sort((one, other) => one.localeCompare(other)).join(", ");

  return matchesTerm(`${row.namespace}.${row.key}`, term) ? "the key" : null;
};

/** Whether the row is showing a cut-down preview of this language rather than the whole message. */
const truncated = (row: MessageKey, locale: string | null): boolean =>
  localeIn(row.cells, locale)?.truncated === true;
