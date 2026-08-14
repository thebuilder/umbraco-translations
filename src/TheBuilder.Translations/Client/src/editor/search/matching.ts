export interface TextPart {
  text: string;
  match: boolean;
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
export const splitOnMatch = (text: string, term: string): TextPart[] => {
  const needle = term.trim().toLowerCase();
  if (needle.length === 0 || text.length === 0) return [{ text, match: false }];

  const haystack = text.toLowerCase();
  const parts: TextPart[] = [];
  let cursor = 0;

  for (;;) {
    const hit = haystack.indexOf(needle, cursor);
    if (hit < 0) break;
    if (hit > cursor) parts.push({ text: text.slice(cursor, hit), match: false });
    // Sliced out of the original rather than the lowered copy, so the text keeps its own casing.
    parts.push({ text: text.slice(hit, hit + needle.length), match: true });
    cursor = hit + needle.length;
  }

  if (parts.length === 0) return [{ text, match: false }];
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return parts;
};
