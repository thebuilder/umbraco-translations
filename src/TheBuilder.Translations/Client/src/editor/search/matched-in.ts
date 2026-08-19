import type { MessageCell, MessageKey } from "../../api/generated/models.js";
import type { EditingMode } from "../state/editing-mode.js";
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

const is = (locale: string, other: string | null): boolean =>
  other !== null && locale.toLowerCase() === other.toLowerCase();

const valueOf = (cell: MessageCell | undefined): string | null =>
  cell === undefined ? null : cell.overrideValue ?? cell.defaultValue;

/**
 * The languages a key was found in.
 *
 * The server's answer is preferred wherever there is one, because it is the only complete answer.
 * Search is locale-blind there, so it can name a language whose text this row never carries -- and
 * the values it does carry are previews, so a hit past the cut would be invisible here. Falling
 * back to the cells in hand keeps an older server honest rather than having it claim nothing
 * matched, but it can only ever see what is on screen.
 */
const localesMatched = (row: MessageKey, term: string): readonly string[] => {
  const reported = row.matchedLocales as readonly string[] | undefined;
  if (reported) return reported;

  return Object.entries(row.cells)
    .filter(([, cell]) => matchesTerm(valueOf(cell), term))
    .map(([locale]) => locale);
};

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
    : localesMatched(row, term).filter((locale) => !shown.some((other) => is(locale, other)));

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
  const matched = localesMatched(row, term);

  if (matched.some((locale) => is(locale, lead))) return null;

  if (second !== null && second !== lead && matched.some((locale) => is(locale, second)))
    return mode === "queue" ? options.editingName : options.comparisonName;

  const elsewhere = matchedElsewhere(row, term, [lead, second]);
  if (elsewhere.length > 0)
    return elsewhere.map(options.nameOf).sort((one, other) => one.localeCompare(other)).join(", ");

  return matchesTerm(`${row.namespace}.${row.key}`, term) ? "the key" : null;
};
