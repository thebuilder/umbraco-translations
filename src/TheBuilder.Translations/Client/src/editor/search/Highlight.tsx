import { Fragment } from "react";
import { splitOnMatch } from "./matching.js";

/**
 * Text with the search term marked in it.
 *
 * The runs come back as data and are rendered as elements, so the term never becomes markup. This
 * is user input echoed onto the page, and the version of this that builds an HTML string is the
 * version with an injection hole in it.
 */
export const Highlight = ({ text, term }: { text: string; term: string }) => (
  <>
    {splitOnMatch(text, term).map((part, index) => (
      <Fragment key={index}>
        {part.match ? <mark className="hit">{part.text}</mark> : part.text}
      </Fragment>
    ))}
  </>
);
