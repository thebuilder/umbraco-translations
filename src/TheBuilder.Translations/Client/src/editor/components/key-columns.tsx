import {
  columnVisibilityFeature,
  createColumnHelper,
  metaHelper,
  tableFeatures,
} from "@tanstack/react-table";
import type { MessageCell, MessageKey } from "../../api/generated/models.js";
import { Highlight } from "../search/Highlight.js";
import { matchesTerm } from "../search/matching.js";
import type { EditingMode } from "../state/editing-mode.js";
import { cellStatus } from "./cell-status.js";

/**
 * What the renderer needs to know about a column that the table itself does not model: the track it
 * occupies in the row's CSS grid, and whether keyboard navigation stops on it.
 *
 * Widths live here rather than in the stylesheet because which columns exist is decided at runtime
 * -- the comparison column is there only when a comparison language is chosen -- and a template
 * written in CSS would have to duplicate that rule and then drift from it.
 */
export interface KeyColumnMeta {
  width: string;
  /** Cells holding content an editor reads. The status a row carries is not one. */
  navigable?: boolean;
}

/**
 * No sorting feature: order is chosen once for the whole result in the filter bar, not per column.
 * Two of the three orders an editor can pick -- most recently edited, and what needs attention --
 * are not any single column, so a header that claimed to own them would be lying about its scope.
 */
export const keyTableFeatures = tableFeatures({
  columnVisibilityFeature,
  columnMeta: metaHelper<KeyColumnMeta>(),
});

const helper = createColumnHelper<typeof keyTableFeatures, MessageKey>();

export const cellOf = (key: MessageKey | undefined, locale: string | null): MessageCell | undefined =>
  key && locale ? key.cells[locale] : undefined;

export const valueOf = (cell: MessageCell | undefined): string | null =>
  cell === undefined ? null : cell.overrideValue ?? cell.defaultValue;

export interface KeyColumnOptions {
  editing: string | null;
  comparison: string | null;
  /** How each language reads to an editor, so a row names a language rather than a code. */
  editingName: string;
  comparisonName: string;
  /** False once the view is scoped to one namespace, where repeating it on every row says nothing. */
  showNamespace: boolean;
  /**
   * The active search, marked wherever it appears. The server matches on the key, the application
   * text and the custom text, so those are the three places a row can be a hit for reasons that
   * are otherwise invisible -- a match in the key explains a row whose text looks unrelated.
   */
  term: string;
  /**
   * Which language leads the row. Editing a language the application ships nothing for puts a
   * column of "Not written" first, which is a list of absences rather than a queue of work, so
   * there the row leads with the language being written from.
   */
  mode: EditingMode;
}

export const keyColumns = (options: KeyColumnOptions) => {
  const { editing, comparison, showNamespace, term, mode } = options;
  // In queue mode the two languages swap roles: the reference is the text being read and the
  // language being edited is the empty space beside it.
  const lead = mode === "queue" ? comparison : editing;
  const second = mode === "queue" ? editing : comparison;
  const secondName = mode === "queue" ? options.editingName : options.comparisonName;

  return helper.columns([
    /*
     * The words come first, because they are what the row is about; the key identifies it but is
     * not what it says, so it sits underneath in a quieter voice -- still readable, still searched,
     * and still available in full in the editing pane.
     */
    helper.accessor((key) => cellOf(key, lead), {
      id: "lead",
      header: () => <Heading name={mode === "queue" ? options.comparisonName : options.editingName} />,
      meta: { width: mode === "queue" ? "minmax(0, 1fr)" : "minmax(0, 1.45fr)", navigable: true },
      cell: (info) => (
        <>
          <span className="row__line">
            <Value cell={info.getValue()} term={term} absent={`Not written in ${options.editingName}`} />
          </span>
          <span className="row__key">
            {/* Part of the key, written the way the key is written, and dimmer because it is where
                the key lives rather than what the row is. */}
            {showNamespace && <span className="row__namespace">{info.row.original.namespace}.</span>}
            <span className="row__id" title={`${info.row.original.namespace}.${info.row.original.key}`}>
              <Highlight text={info.row.original.key} term={term} />
            </span>
          </span>
        </>
      ),
    }),

    helper.accessor((key) => cellOf(key, second), {
      id: "second",
      header: () => <Heading name={secondName} />,
      meta: { width: mode === "queue" ? "minmax(0, 1fr)" : "minmax(0, 1.15fr)", navigable: true },
      cell: (info) => {
        const source = matchedIn(info.row.original, options);
        return (
          <>
            <span className="row__line">
              <Value
                cell={info.getValue()}
                term={term}
                quiet
                absent={mode === "queue" ? "Not written" : `Not written in ${secondName}`}
              />
            </span>
            {/* Why this row is a result, when the reason is not in the words above it. */}
            {source && <span className="row__source">matched · {source}</span>}
          </>
        );
      },
    }),

    helper.display({
      id: "status",
      header: () => <span className="visually-hidden">Status</span>,
      meta: { width: "8.5rem" },
      cell: (info) => (
        <Status cell={cellOf(info.row.original, editing)} mode={mode} />
      ),
    }),
  ]);
};

/**
 * Where the search hit was, when it was not in the words leading the row.
 *
 * Said only when it explains something. A hit in the leading column is already marked there, and a
 * row whose hit is in neither language on screen says nothing rather than guessing: the server
 * matches the key and both languages' text, so anything else would be an invented explanation.
 */
const matchedIn = (row: MessageKey, { editing, comparison, term, mode, ...names }: KeyColumnOptions): string | null => {
  if (term.trim() === "") return null;

  const lead = mode === "queue" ? comparison : editing;
  const second = mode === "queue" ? editing : comparison;
  if (matchesTerm(valueOf(cellOf(row, lead)), term)) return null;

  if (second !== null && second !== lead && matchesTerm(valueOf(cellOf(row, second)), term))
    return mode === "queue" ? names.editingName : names.comparisonName;

  return matchesTerm(`${row.namespace}.${row.key}`, term) ? "the key" : null;
};

/** Which language the column holds. What it is for is said once, above the list. */
const Heading = ({ name }: { name: string }) => <span className="row__heading">{name}</span>;

/**
 * The text an editor would see at runtime: their custom text where there is any, the application's
 * otherwise. Three states would read as an empty cell without help -- no row in this language at
 * all, text deliberately set to nothing, and ordinary text -- so the first two say what they are.
 */
const Value = ({ cell, quiet, term, absent }: {
  cell?: MessageCell;
  quiet?: boolean;
  term: string;
  absent: string;
}) => {
  if (!cell) return <span className="row__value row__value--absent">{absent}</span>;

  const text = cell.overrideValue ?? cell.defaultValue;
  if (text === "") return <span className="row__value row__value--absent">Deliberately empty</span>;

  return (
    <span className={quiet ? "row__value row__value--quiet" : "row__value"}>
      <Highlight text={text} term={term} />
    </span>
  );
};

/**
 * What the row is asking of the editor, at the end of it where the eye lands last.
 *
 * The two states that need a decision are badges with their own colour, because they are rare and
 * the whole point of them is to be picked out of a screen of ordinary rows. The two that need
 * nothing recede to a word: saying "custom text" loudly on most of a list is a label repeated down
 * a column that buries the rows that actually need attention.
 */
const Status = ({ cell, mode }: { cell: MessageCell | undefined; mode: EditingMode }) => {
  // Nothing here yet, so the useful thing to offer is the way to start. The whole row opens the
  // pane; this names the action for somebody scanning the last column for what to do next.
  if (!cell) return <span className="row__write">Write</span>;

  const status = cellStatus(cell);
  if (status.warning) {
    return (
      <span className={status.state === "Removed" ? "badge badge--danger" : "badge badge--warning"}>
        {status.text}
      </span>
    );
  }

  if (status.custom) {
    return (
      <span className="row__custom">
        <span className="row__dot" aria-hidden="true" />
        {mode === "queue" ? "Written" : "Custom"}
      </span>
    );
  }

  return <span className="row__plain">App text</span>;
};
