import { Fragment } from "react";
import { splitOnMatch, type TextPart } from "./matching.js";

/**
 * The runs concatenate back to the original text, so each one's position in it is the running total
 * of the lengths before it. That is what identifies a run: the same word can appear twice in one
 * string, and keying on the array index instead makes React reuse a <mark> as plain text when the
 * term changes and the runs shift.
 */
const positioned = (parts: TextPart[]) => {
  let offset = 0;
  return parts.map((part) => {
    const at = offset;
    offset += part.text.length;
    return { ...part, offset: at };
  });
};

/**
 * Text with the search term marked in it.
 *
 * The runs come back as data and are rendered as elements, so the term never becomes markup. This
 * is user input echoed onto the page, and the version of this that builds an HTML string is the
 * version with an injection hole in it.
 */
export const Highlight = ({ text, term }: { text: string; term: string }) => (
  <>
    {positioned(splitOnMatch(text, term)).map((part) => (
      <Fragment key={part.offset}>
        {part.match ? <mark className="hit">{part.text}</mark> : part.text}
      </Fragment>
    ))}
  </>
);
