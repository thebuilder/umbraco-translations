import type { LocaleFacet } from "../../api/generated/models.js";
import type { EditingMode } from "../state/editing-mode.js";
import type { EditorFilters } from "../state/filters.js";

/**
 * The shape of the result, said before it is scrolled.
 *
 * How many, what they were matched on, and -- where the answer is not already a chip in the bar
 * above -- what order they are in.
 */
export const ResultsHead = ({
  total,
  filters,
  queued,
  elsewhere,
  mode,
  current,
  onShowAbsent,
}: {
  total: number;
  filters: EditorFilters;
  /** Whether the list is in the application's own key order, which nothing above says. */
  queued: boolean;
  /** Rows that are results on the strength of a language neither column shows. */
  elsewhere: number;
  mode: EditingMode;
  current?: LocaleFacet;
  onShowAbsent: () => void;
}) => (
  <div className="results__head">
    <span>
      <strong>{total.toLocaleString()}</strong> {total === 1 ? "key" : "keys"}
      {filters.query ? <> matching “{filters.query}”</> : null}
      {/* A queue is worked from the top down, so what decides the top is part of what it is. Said
          only where it is unstated: any other order is a chip in the bar above, and this one is
          the absence of a chip. */}
      {queued ? <>, in the order the application defines them</> : null}
    </span>

    {/* Said once here rather than only row by row, so the shape of the result is legible before
        scrolling it: a search that mostly hit a language nobody is looking at is a different
        thing from one that hit the words on screen. */}
    {elsewhere > 0 ? (
      <span className="results__because">
        {elsewhere.toLocaleString()} matched in a language you are not viewing
      </span>
    ) : null}

    {/* A queue is worth narrowing to the work still in it, but not behind the editor's back: the
        offer says how many, and taking it is one press. */}
    {mode === "queue" && filters.status === "All" && current && current.absentKeyCount > 0 ? (
      <button className="link" onClick={onShowAbsent} type="button">
        Show only the {current.absentKeyCount.toLocaleString()} not written yet
      </button>
    ) : null}
  </div>
);
