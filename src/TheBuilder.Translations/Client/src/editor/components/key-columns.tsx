import {
  columnVisibilityFeature,
  createColumnHelper,
  metaHelper,
  rowSortingFeature,
  tableFeatures,
} from "@tanstack/react-table";
import type { MessageCell, MessageKey } from "../../api/generated/models.js";
import type { SortField } from "../state/filters.js";
import { cellStatus } from "./cell-status.js";

/**
 * What the renderer needs to know about a column that the table itself does not model: the track it
 * occupies in the row's CSS grid, and whether keyboard navigation stops on it.
 *
 * Widths live here rather than in the stylesheet because which columns exist is decided at runtime
 * -- the reference column disappears when the two locales are the same -- and a template written in
 * CSS would have to duplicate that rule and then drift from it.
 */
export interface KeyColumnMeta {
  width: string;
  /** Cells holding content an editor reads or acts on. The edit affordance is not one of them. */
  navigable?: boolean;
}

export const keyTableFeatures = tableFeatures({
  rowSortingFeature,
  // No sorted row model: the list is paged over thousands of keys, so ordering is done in SQL and
  // the feature is here for the state and the header affordances only. See `manualSorting`.
  columnVisibilityFeature,
  columnMeta: metaHelper<KeyColumnMeta>(),
});

/**
 * The server sort each sortable column asks for.
 *
 * Only columns whose heading names the thing being ordered are sortable. A locale column is headed
 * with the locale, so whatever it sorted by -- the prose alphabetically, or how translated each row
 * is -- the header would not have said so. "Which rows still need work" is a question the status
 * filter answers directly, and answering it by reordering instead would be a worse version of that.
 */
export const SORT_FIELD_BY_COLUMN: Readonly<Record<string, SortField>> = {
  key: "key",
  updated: "updatedAt",
};

export const columnForSort = (sort: SortField): string =>
  Object.keys(SORT_FIELD_BY_COLUMN).find((id) => SORT_FIELD_BY_COLUMN[id] === sort) ?? "key";

const helper = createColumnHelper<typeof keyTableFeatures, MessageKey>();

export const cellOf = (key: MessageKey | undefined, locale: string | null): MessageCell | undefined =>
  key && locale ? key.cells[locale] : undefined;

export const keyColumns = ({
  targetLocale, referenceLocale, showNamespace, onSelect,
}: {
  targetLocale: string | null;
  referenceLocale: string | null;
  /** False once the view is scoped to a single namespace, where repeating it on every row is noise. */
  showNamespace: boolean;
  onSelect: (messageId: string) => void;
}) =>
  helper.columns([
    helper.accessor((key) => key.key, {
      id: "key",
      header: "Key",
      meta: { width: "minmax(16rem, 1.1fr)", navigable: true },
      cell: ({ row }) => (
        <>
          {/* The namespace is its own label, not part of the key: it is the grouping the sidebar
              drills into, and running the two together made both unreadable. */}
          {showNamespace && <span className="namespace">{row.original.namespace}</span>}
          <span className="key" title={`${row.original.namespace}.${row.original.key}`}>
            {row.original.key}
          </span>
        </>
      ),
    }),

    helper.accessor((key) => cellOf(key, referenceLocale), {
      id: "reference",
      header: referenceLocale ?? "Reference",
      // Nothing on the server orders by the reference locale, and a header that looks sortable but
      // reorders by something else is worse than one that does not look sortable.
      enableSorting: false,
      meta: { width: "minmax(0, 1.4fr)", navigable: true },
      cell: (info) => <Value cell={info.getValue()} />,
    }),

    helper.accessor((key) => cellOf(key, targetLocale), {
      id: "target",
      header: targetLocale ?? "Text",
      enableSorting: false,
      meta: { width: "minmax(0, 1.5fr)", navigable: true },
      cell: (info) => {
        const status = cellStatus(info.getValue());
        return (
          <>
            <Value cell={info.getValue()} strong />
            {status.text && (
              <span className={status.warning ? "status status--warning" : "status"}>
                {status.warning && <span aria-hidden="true">⚠ </span>}
                {status.text}
              </span>
            )}
          </>
        );
      },
    }),

    helper.accessor((key) => cellOf(key, targetLocale)?.updatedAt ?? null, {
      id: "updated",
      header: "Updated",
      meta: { width: "5.5rem" },
      // Only customised rows carry a date, because it is the override that was edited. That makes an
      // empty cell meaningful rather than missing: nobody has touched this text.
      cell: (info) => {
        const at = info.getValue();
        if (!at) return null;
        const by = cellOf(info.row.original, targetLocale)?.updatedBy;
        return (
          <time className="updated" dateTime={at} title={by ? `${absolute(at)} by ${by}` : absolute(at)}>
            {relativeTime(at)}
          </time>
        );
      },
    }),

    helper.display({
      id: "edit",
      header: "Edit",
      meta: { width: "2.5rem" },
      cell: ({ row }) => {
        const target = cellOf(row.original, targetLocale);
        return (
          // An explicit affordance. A row being clickable is not discoverable on its own, so the row
          // stays clickable but this is what says so. It is out of the tab order because the row's
          // own keyboard handling opens the editor with Enter.
          <button
            type="button"
            className="edit"
            tabIndex={-1}
            aria-label={`Edit ${row.original.namespace}.${row.original.key}`}
            onClick={(event) => {
              event.stopPropagation();
              if (target) onSelect(target.id);
            }}
          >
            ✎
          </button>
        );
      },
    }),
  ]);

/**
 * Three states that would otherwise read as an empty cell: no row at all, an override that is
 * deliberately the empty string, and ordinary text. What distinguishes "using the application
 * default" from "custom text" is said in words underneath, not with a symbol in front.
 */
const Value = ({ cell, strong }: { cell?: MessageCell; strong?: boolean }) => {
  if (!cell) return <span className="value value--empty">Not translated</span>;

  const text = cell.overrideValue ?? cell.defaultValue;
  if (text === "") return <span className="value value--empty">Empty</span>;

  return <span className={strong ? "value value--strong" : "value"}>{text}</span>;
};

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "narrow" });
const ABSOLUTE = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

const UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["week", 604_800_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** A width that fits the column. The exact timestamp is in the tooltip for when it matters. */
export const relativeTime = (iso: string, now = Date.now()): string => {
  const elapsed = new Date(iso).getTime() - now;
  const unit = UNITS.find(([, size]) => Math.abs(elapsed) >= size);
  return unit ? RELATIVE.format(Math.round(elapsed / unit[1]), unit[0]) : RELATIVE.format(0, "minute");
};

const absolute = (iso: string) => ABSOLUTE.format(new Date(iso));
