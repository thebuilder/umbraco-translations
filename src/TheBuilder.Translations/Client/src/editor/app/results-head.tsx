import type { LocaleFacet } from "../../api/generated/models.js";
import type { EditingMode } from "../state/editing-mode.js";
import { coverageOf } from "../state/editing-mode.js";
import type { EditorFilters } from "../state/filters.js";
import { workInList } from "../state/summary.js";
import type { UnsavedSummary } from "./use-unsaved.js";

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
  unsaved,
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
  unsaved: UnsavedSummary;
}) => {
  const { notWritten, defaultChanged } = workInList(total, current, filters);
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

      {notWritten > 0 ? (
        <button
          className="summary__item summary__link"
          onClick={() => update({ status: "Absent" })}
          type="button"
        >
          {notWritten.toLocaleString()} not written
        </button>
      ) : null}
      {defaultChanged > 0 ? (
        <button
          className="summary__item summary__link summary__link--warning"
          onClick={() => update({ status: "NeedsReview" })}
          type="button"
        >
          {defaultChanged.toLocaleString()} default changed
        </button>
      ) : null}

      {syncing ? (
        <span className="summary__item" role="status">
          Syncing…
        </span>
      ) : null}
      {viewOnly ? <span className="summary__item">View only</span> : null}

      {/* Last on the line, and in the editor's own colour: the one thing here that is waiting on
          the editor rather than describing the list. */}
      {unsaved.count > 0 ? (
        <span className="summary__unsaved">
          <span aria-hidden="true" className="row__dot" />
          {unsaved.count} unsaved
          {unsaved.saveAll ? (
            <button
              className="button button--primary button--small"
              disabled={unsaved.saving}
              onClick={unsaved.saveAll}
              type="button"
            >
              {unsaved.saving ? "Saving…" : "Save all"}
            </button>
          ) : null}
        </span>
      ) : null}
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
