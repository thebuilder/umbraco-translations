import type { LocaleFacet } from "../../api/generated/models.js";
import type { EditingMode } from "../state/editing-mode.js";
import { coverageOf } from "../state/editing-mode.js";
import type { EditorFilters } from "../state/filters.js";
import { hasNarrowingFilters } from "../state/list-state.js";

/**
 * The shape of the result, said before it is scrolled.
 *
 * How many, what they were matched on, and the work waiting in the language being edited -- each
 * piece of work as a way to see only that, because a count of rows that need something is a list
 * somebody is about to want.
 */
export const ResultsHead = ({
  total,
  totalKeys,
  filters,
  elsewhere,
  mode,
  current,
  syncing,
  viewOnly,
  update,
}: {
  total: number;
  totalKeys: number | undefined;
  filters: EditorFilters;
  /** Rows that are results on the strength of a language neither column shows. */
  elsewhere: number;
  mode: EditingMode;
  current?: LocaleFacet;
  syncing: boolean;
  /** Known to be view-only, as opposed to not yet known either way. */
  viewOnly: boolean;
  update: (patch: Partial<EditorFilters>) => void;
}) => {
  /*
   * The counts behind the two offers are the whole language's. Beside a namespace, a key path or a
   * search they contradicted the count next to them -- "20 keys, 48 not written" -- and taking the
   * offer showed fewer rows than it promised. So they are offered only where they describe the
   * list.
   */
  const unfiltered = !hasNarrowingFilters(filters);
  /*
   * Not the language's own count of missing keys. The list holds the keys the two languages on
   * screen have between them, not every key any language has, so that count could be larger than
   * the list: "24 keys, 115 not written". Every message the language has is in the list, so what
   * the list holds beyond those is exactly what is not written in it.
   */
  const notWritten = current ? Math.max(0, total - current.messageCount) : 0;
  return (
    <div className="summary">
      <span className="summary__count">
        <strong>{total.toLocaleString()}</strong> {total === 1 ? "key" : "keys"}
        {filters.query ? <> matching “{filters.query}”</> : null}
      </span>

      {/* Said once here rather than only row by row, so the shape of the result is legible before
          scrolling it: a search that mostly hit a language nobody is looking at is a different
          thing from one that hit the words on screen. */}
      {elsewhere > 0 ? (
        <span className="summary__item summary__because">
          {elsewhere.toLocaleString()} matched in another language
        </span>
      ) : null}

      {mode === "queue" && current && totalKeys ? (
        <Progress locale={current} totalKeys={totalKeys} />
      ) : null}

      {unfiltered && notWritten > 0 ? (
        <button
          className="summary__item summary__link"
          onClick={() => update({ status: "Absent" })}
          type="button"
        >
          {notWritten.toLocaleString()} not written
        </button>
      ) : null}
      {unfiltered && current && current.needsReviewCount > 0 ? (
        <button
          className="summary__item summary__link summary__link--warning"
          onClick={() => update({ status: "NeedsReview" })}
          type="button"
        >
          {current.needsReviewCount.toLocaleString()} default changed
        </button>
      ) : null}

      {syncing ? (
        <span className="summary__item" role="status">
          Syncing…
        </span>
      ) : null}
      {viewOnly ? <span className="summary__item">View only</span> : null}
    </div>
  );
};

/** How far through the language is, which working down a queue is the number worth a glance. */
const Progress = ({ locale, totalKeys }: { locale: LocaleFacet; totalKeys: number }) => {
  const coverage = coverageOf(locale, totalKeys);
  return (
    <span className="summary__item progress">
      <span
        aria-label={`Written in ${locale.name || locale.code}`}
        aria-valuemax={coverage.total}
        aria-valuemin={0}
        aria-valuenow={coverage.written}
        className="progress__track"
        role="progressbar"
      >
        <span className="progress__fill" style={{ inlineSize: `${coverage.fraction * 100}%` }} />
      </span>
      {Math.round(coverage.fraction * 100)}% written
    </span>
  );
};
