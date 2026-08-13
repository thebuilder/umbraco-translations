import {
  columnVisibilityFeature,
  createColumnHelper,
  metaHelper,
  tableFeatures,
} from "@tanstack/react-table";
import type { MessageCell, MessageKey } from "../../api/generated/models.js";
import { Highlight } from "../search/Highlight.js";
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
  /** Cells holding content an editor reads. The affordance that opens the editor is not one. */
  navigable?: boolean;
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

export const cellOf = (key: MessageKey | undefined, locale: string | null): MessageCell | undefined =>
  key && locale ? key.cells[locale] : undefined;

export const keyColumns = ({
  editing, comparison, editingName, comparisonName, showNamespace, term,
}: {
  editing: string | null;
  comparison: string | null;
  /** How each language reads to an editor, so the header names a language rather than a code. */
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
}) =>
  helper.columns([
    /*
     * The language being edited comes first, because it is the words the editor is responsible for
     * and the first thing their eye should land on. The key identifies the row but is not what the
     * row is about, so it sits underneath in a quieter voice -- still readable, still searched, and
     * still available in full in the editor.
     */
    helper.accessor((key) => cellOf(key, editing), {
      id: "editing",
      header: () => <Heading name={editingName} role="Editing" />,
      meta: { width: "minmax(0, 1.6fr)", navigable: true },
      cell: (info) => {
        const status = cellStatus(info.getValue());
        return (
          <>
            <span className="line">
              <Value cell={info.getValue()} term={term} />
              {status.custom && (
                <span className="mark" title="Custom text">
                  <span aria-hidden="true">●</span>
                  <span className="visually-hidden">Custom text</span>
                </span>
              )}
            </span>
            <span className="meta">
              {showNamespace && (
                <>
                  <span className="meta__namespace">{info.row.original.namespace}</span>
                  <span aria-hidden="true"> · </span>
                </>
              )}
              <span className="meta__key" title={`${info.row.original.namespace}.${info.row.original.key}`}>
                <Highlight text={info.row.original.key} term={term} />
              </span>
              {status.text && (
                <span className={status.warning ? "flag flag--warning" : "flag"}>
                  {status.warning && <span aria-hidden="true">⚠ </span>}
                  {status.text}
                </span>
              )}
            </span>
          </>
        );
      },
    }),

    helper.accessor((key) => cellOf(key, comparison), {
      id: "comparison",
      header: () => <Heading name={comparisonName} role="Reference" />,
      meta: { width: "minmax(0, 1.2fr)", navigable: true },
      cell: (info) => <Value cell={info.getValue()} quiet term={term} />,
    }),

    helper.display({
      id: "open",
      header: () => <span className="visually-hidden">Open</span>,
      meta: { width: "1.75rem" },
      // The whole row opens the editor; this only says so. It shows on hover and on focus rather
      // than marking every row permanently, and stays out of the tab order because Enter on the
      // row already does the same thing.
      cell: () => <span className="open" aria-hidden="true">›</span>,
    }),
  ]);

/** Which language the column holds, and what that language is for in this view. */
const Heading = ({ name, role }: { name: string; role: string }) => (
  <>
    <span className="head__name">{name}</span>
    <span className="head__role"> · {role}</span>
  </>
);

/**
 * The text an editor would see at runtime: their custom text where there is any, the application's
 * otherwise. Three states would read as an empty cell without help -- no row in this language at
 * all, text deliberately set to nothing, and ordinary text -- so the first two say what they are.
 */
const Value = ({ cell, quiet, term }: { cell?: MessageCell; quiet?: boolean; term: string }) => {
  if (!cell) return <span className="value value--absent">Not translated</span>;

  const text = cell.overrideValue ?? cell.defaultValue;
  if (text === "") return <span className="value value--absent">Empty</span>;

  return (
    <span className={quiet ? "value value--quiet" : "value"}>
      <Highlight text={text} term={term} />
    </span>
  );
};
