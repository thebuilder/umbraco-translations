import {
  columnVisibilityFeature,
  createColumnHelper,
  metaHelper,
  tableFeatures,
} from "@tanstack/react-table";
import type { MessageCell, MessageKey } from "../../api/generated/models.js";
import { Highlight } from "../search/highlight.js";
import { type MatchedInOptions, matchedIn } from "../search/matched-in.js";
import { matchesTerm } from "../search/matching.js";
import { localeIn } from "../state/locales.js";
import { cellStatus } from "./cell-status.js";

/**
 * What the renderer needs to know about a column that the table itself does not model: the track it
 * occupies in the row's CSS grid, and whether keyboard navigation stops on it.
 *
 * Widths live here rather than in the stylesheet because which columns exist is decided at runtime
 * -- the comparison column is there only when a comparison language is chosen -- and a template
 * written in CSS would have to duplicate that rule and then drift from it.
 */
interface KeyColumnMeta {
  /** Cells holding content an editor reads. The key and the status a row carries are not. */
  navigable?: boolean;
  width: string;
}

/**
 * No sorting feature: order is chosen once for the whole result in the toolbar, not per column.
 * Two of the three orders an editor can pick -- most recently edited, and what needs attention --
 * are not any single column, so a header that claimed to own them would be lying about its scope.
 */
export const keyTableFeatures = tableFeatures({
  columnVisibilityFeature,
  columnMeta: metaHelper<KeyColumnMeta>(),
});

const helper = createColumnHelper<typeof keyTableFeatures, MessageKey>();

const cellOf = (key: MessageKey | undefined, locale: string | null): MessageCell | undefined =>
  key ? localeIn(key.cells, locale) : undefined;

export const textOf = (cell: MessageCell | undefined): string | null =>
  cell === undefined ? null : (cell.overrideValue ?? cell.defaultValue);

/**
 * Extends what naming a search hit needs -- the two languages, their names, a way to name a third,
 * and the term -- because a row is where that naming is done and passing the same object
 * on is cheaper than restating it.
 */
export interface KeyColumnOptions extends MatchedInOptions {
  /** False once the view is scoped to one namespace, where repeating it on every row says nothing. */
  showNamespace: boolean;
}

/**
 * One line per key: the key, the two languages, and whatever the row is asking for.
 *
 * The key has a column of its own rather than a second line under the words. Two lines a row
 * halved how much of the list fit on screen, and a list that has to be scrolled to be scanned is
 * the opposite of what search results are for. Set in mono and a quieter colour, it still reads as
 * identity rather than content.
 */
export const keyColumns = (options: KeyColumnOptions) => {
  const { editing, comparison, showNamespace, term } = options;
  // The language being edited always sits next to the key, whatever the job. Swapping it with the
  // reference for a language with nothing written yet put the language somebody had just chosen to
  // edit in the second column, under a heading they had not picked.
  const lead = editing;
  const second = comparison;

  return helper.columns([
    helper.display({
      id: "key",
      header: () => <span className="row__heading">Key</span>,
      meta: { width: "minmax(9rem, 0.85fr)" },
      cell: (info) => {
        const source = matchedIn(info.row.original, options);
        return (
          <>
            <span
              className="row__key"
              title={`${info.row.original.namespace}.${info.row.original.key}`}
            >
              <KeyName
                full={showNamespace}
                keyName={info.row.original.key}
                namespace={info.row.original.namespace}
                term={term}
              />
            </span>
            {/* Why this row is a result, when the reason is not in the words beside it. */}
            {source && <span className="row__source">{source}</span>}
          </>
        );
      },
    }),

    helper.accessor((key) => cellOf(key, lead), {
      id: "lead",
      header: () => <Heading name={options.editingName} />,
      meta: { width: "minmax(0, 1.3fr)", navigable: true },
      cell: (info) => <Value cell={info.getValue()} term={term} />,
    }),

    helper.accessor((key) => cellOf(key, second), {
      id: "second",
      header: () => <Heading name={options.comparisonName} />,
      meta: { width: "minmax(0, 1.3fr)", navigable: true },
      cell: (info) => <Value cell={info.getValue()} quiet term={term} />,
    }),

    helper.display({
      id: "status",
      header: () => <span className="visually-hidden">Status</span>,
      meta: { width: "7.5rem" },
      cell: (info) => <Status cell={cellOf(info.row.original, editing)} />,
    }),
  ]);
};

/**
 * The key, with its namespace before it in a dimmer voice because it is where the key lives rather
 * than what the row is.
 *
 * Everything the search matched is marked, because a hit with nothing marked on the row is a result
 * nobody can account for. So the namespace is shown when it was hit even in a view scoped to one,
 * and a search for the whole dotted key -- which neither half contains -- is marked as one piece.
 */
const KeyName = ({
  namespace,
  keyName,
  term,
  full,
}: {
  namespace: string;
  keyName: string;
  term: string;
  /** Whether the namespace is shown at all, which it is not once the view is scoped to one. */
  full: boolean;
}) => {
  const whole = `${namespace}.${keyName}`;
  if (matchesTerm(whole, term) && !matchesTerm(keyName, term) && !matchesTerm(namespace, term)) {
    return <Highlight term={term} text={whole} />;
  }

  return (
    <>
      {full || matchesTerm(namespace, term) ? (
        <span className="row__namespace">
          <Highlight term={term} text={namespace} />.
        </span>
      ) : null}
      <Highlight term={term} text={keyName} />
    </>
  );
};

/** Which language the column holds. What it is for is said once, above the list. */
const Heading = ({ name }: { name: string }) => <span className="row__heading">{name}</span>;

/**
 * The text an editor would see at runtime: their custom text where there is any, the application's
 * otherwise. Three states would read as an empty cell without help -- no row in this language at
 * all, text deliberately set to nothing, and ordinary text -- so the first two say what they are.
 * The column heading names the language, so the absence does not have to.
 */
const Value = ({ cell, quiet, term }: { cell?: MessageCell; quiet?: boolean; term: string }) => {
  if (!cell) {
    return <span className="row__value row__value--absent">Not written</span>;
  }

  const text = cell.overrideValue ?? cell.defaultValue;
  if (text === "") {
    return <span className="row__value row__value--absent">Deliberately empty</span>;
  }

  return (
    <span className={quiet ? "row__value row__value--quiet" : "row__value"} title={text}>
      <Highlight term={term} text={text} />
    </span>
  );
};

/**
 * What the row is asking of the editor, at the end of it where the eye lands last.
 *
 * Only the two states that need a decision get a badge, because they are rare and the whole point
 * of them is to be picked out of a screen of ordinary rows. Custom text recedes to a dot and a
 * word. Application text and an absence say nothing here: the words beside it already do, and a
 * label repeated down every row buries the ones that matter.
 */
const Status = ({ cell }: { cell: MessageCell | undefined }) => {
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
        <span aria-hidden="true" className="row__dot" />
        Custom
      </span>
    );
  }

  return null;
};
