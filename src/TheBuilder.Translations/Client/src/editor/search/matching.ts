export interface TextPart {
  match: boolean;
  text: string;
}

/**
 * Splits text into the runs that match the search term and the runs that do not, so the caller can
 * mark the first kind without ever putting the term into markup.
 *
 * No regular expression. The term comes from a text field, so `.` or `(` would either throw or
 * quietly match the wrong thing, and the server matches literally too -- it escapes the term into a
 * LIKE pattern. Anything cleverer here would highlight text the server did not consider a hit.
 *
 * Matching is case-insensitive, which is what the search itself does: SQL Server's default
 * collation is case-insensitive and the SQLite queries use LIKE, which is case-insensitive for
 * ASCII. Marking only exact-case runs would leave visible hits unmarked.
 */
/**
 * Whether the term is in this text at all, by the same literal, case-insensitive rule the server
 * applies. Used to say *why* a row is a result: the server matches the key, the application text
 * and the custom text, so a row whose visible words look unrelated was matched by something else,
 * and naming it is the difference between a result and a puzzle.
 */
export const matchesTerm = (text: string | null | undefined, term: string): boolean => {
  const needle = term.trim().toLowerCase();
  return needle.length > 0 && (text ?? "").toLowerCase().includes(needle);
};

export const splitOnMatch = (text: string, term: string): TextPart[] => {
  const needle = term.trim().toLowerCase();
  if (needle.length === 0 || text.length === 0) {
    return [{ text, match: false }];
  }

  const haystack = text.toLowerCase();
  const parts: TextPart[] = [];
  let cursor = 0;

  for (;;) {
    const hit = haystack.indexOf(needle, cursor);
    if (hit < 0) {
      break;
    }
    if (hit > cursor) {
      parts.push({ text: text.slice(cursor, hit), match: false });
    }
    // Sliced out of the original rather than the lowered copy, so the text keeps its own casing.
    parts.push({ text: text.slice(hit, hit + needle.length), match: true });
    cursor = hit + needle.length;
  }

  if (parts.length === 0) {
    return [{ text, match: false }];
  }
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), match: false });
  }
  return parts;
};
