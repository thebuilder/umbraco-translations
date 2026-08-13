import type { SortingState } from "@tanstack/react-table";
import { useTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { MessageKey } from "../../api/generated/models.js";
import type { EditorFilters } from "../state/filters.js";
import { SORT_FIELD_BY_COLUMN, cellOf, columnForSort, keyColumns, keyTableFeatures } from "./key-columns.js";
import { useGridNavigation } from "./use-grid-navigation.js";

/** Two lines of key and two of value, at a size that can actually be read. */
export const ROW_HEIGHT = 64;

/** Rows left below the fold before the next page is requested. */
const PREFETCH_MARGIN = 20;

export const KeyGrid = ({
  keys, filters, total, loading, error, namespaceCount, update,
  selectedId, onSelect, onLoadMore, hasMore, loadingMore,
}: {
  keys: MessageKey[];
  filters: EditorFilters;
  total: number;
  loading: boolean;
  error?: Error;
  namespaceCount: number;
  update: (changes: Partial<EditorFilters>) => void;
  selectedId?: string;
  onSelect: (messageId: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  loadingMore: boolean;
}) => {
  const scroller = useRef<HTMLDivElement>(null);
  const singleLocale = filters.locale === filters.referenceLocale;

  const columns = useMemo(() => keyColumns({
    targetLocale: filters.locale,
    referenceLocale: filters.referenceLocale,
    showNamespace: namespaceCount > 1 || filters.namespace === null,
    onSelect,
  }), [filters.locale, filters.referenceLocale, filters.namespace, namespaceCount, onSelect]);

  const sorting: SortingState = useMemo(
    () => [{ id: columnForSort(filters.sort), desc: filters.direction === "desc" }],
    [filters.sort, filters.direction]);

  const table = useTable({
    features: keyTableFeatures,
    columns,
    data: keys,
    getRowId: (key) => `${key.sourceId}|${key.namespace}|${key.key}`,
    // The server sorts, filters and pages. The table owns the column model, the sort state and the
    // header affordances; asking it to reorder would only shuffle the page currently in hand.
    manualSorting: true,
    // One column at a time, and never back to unsorted: the query always has an ORDER BY, so there
    // is no state the grid could be in that "no sort" would describe.
    enableMultiSort: false,
    enableSortingRemoval: false,
    state: {
      sorting,
      // One text column when both locales are the same, rather than the same prose printed twice.
      columnVisibility: { reference: !singleLocale },
    },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const sort = next[0] && SORT_FIELD_BY_COLUMN[next[0].id];
      if (sort) update({ sort, direction: next[0]!.desc ? "desc" : "asc" });
    },
  });

  const rows = table.getRowModel().rows;
  const visible = table.getVisibleLeafColumns();

  const virtualizer = useVirtualizer({
    // The full result count rather than the rows in hand, so the scrollbar is the right size from
    // the first paint instead of shrinking under the cursor as each page arrives. Indices past what
    // has loaded render as placeholders. This is only sound because pages arrive in order and none
    // are ever evicted, which is what makes row N of the list row N of `rows`.
    count: total,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });
  const items = virtualizer.getVirtualItems();

  // Keeps pulling pages until everything matching is in hand, so scrolling never waits on a fetch.
  const last = items.at(-1)?.index ?? 0;
  useEffect(() => {
    if (hasMore && !loadingMore && last >= rows.length - PREFETCH_MARGIN) onLoadMore();
  }, [hasMore, loadingMore, last, rows.length, onLoadMore]);

  // Memoised by value rather than by array identity: the column defs are rebuilt whenever the
  // locales change, and handing the navigation hook a fresh array each time would keep re-running
  // the effect that guards focus against a column disappearing.
  const navigableIds = visible
    .filter((column) => column.columnDef.meta?.navigable)
    .map((column) => column.id)
    .join(",");
  const navigable = useMemo(() => navigableIds.split(",").filter(Boolean), [navigableIds]);

  const scrollToRow = useCallback((row: number) => virtualizer.scrollToIndex(row), [virtualizer]);
  const activate = useCallback(({ row }: { row: number }) => {
    const cell = cellOf(rows[row]?.original, filters.locale);
    if (cell) onSelect(cell.id);
  }, [rows, filters.locale, onSelect]);

  const { onKeyDown, cellProps } = useGridNavigation({
    rowCount: rows.length,
    columns: navigable,
    scrollToRow,
    onActivate: activate,
  });

  if (error) return <p className="panel error">{error.message}</p>;
  if (loading) return <p className="panel">Loading translations…</p>;
  if (rows.length === 0) return <p className="panel">No translations match these filters.</p>;

  // Built from the columns actually on screen, so the reference column disappearing closes its
  // track rather than leaving a gap.
  const template = visible
    .map((column) => column.columnDef.meta?.width ?? "minmax(0, 1fr)")
    .join(" ");

  return (
    <div
      role="grid"
      aria-rowcount={total}
      aria-colcount={visible.length}
      aria-label="Translations"
      className="grid"
      onKeyDown={onKeyDown}
    >
      {table.getHeaderGroups().map((group) => (
        <div
          key={group.id}
          role="row"
          aria-rowindex={1}
          className="grid__row grid__row--head"
          style={{ gridTemplateColumns: template }}
        >
          {group.headers.map((header) => {
            const sorted = header.column.getIsSorted();
            return (
              <span
                key={header.id}
                role="columnheader"
                aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : "none"}
                className={`grid__cell grid__cell--${header.column.id}`}
              >
                {header.column.getCanSort() ? (
                  <button type="button" className="sorter" onClick={header.column.getToggleSortingHandler()}>
                    <table.FlexRender header={header} />
                    <span className="sorter__mark" aria-hidden="true">
                      {sorted === "asc" ? "▲" : sorted === "desc" ? "▼" : "↕"}
                    </span>
                  </button>
                ) : (
                  <table.FlexRender header={header} />
                )}
              </span>
            );
          })}
        </div>
      ))}

      <div ref={scroller} className="grid__body">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {items.map((item) => {
            const row = rows[item.index];
            const style = {
              transform: `translateY(${item.start}px)`,
              height: item.size,
              gridTemplateColumns: template,
            };

            if (!row) {
              return (
                <div
                  key={`pending-${item.index}`}
                  role="row"
                  aria-rowindex={item.index + 2}
                  className="grid__row grid__row--pending"
                  style={style}
                >
                  {visible.map((column) => (
                    <span key={column.id} role="gridcell" className="grid__cell">
                      {column.columnDef.meta?.navigable && <span className="skeleton" />}
                    </span>
                  ))}
                </div>
              );
            }

            const target = cellOf(row.original, filters.locale);
            const selected = target !== undefined && target.id === selectedId;

            return (
              <div
                key={row.id}
                role="row"
                aria-rowindex={item.index + 2}
                aria-selected={selected}
                className={`grid__row${selected ? " grid__row--selected" : ""}`}
                style={style}
                onClick={() => target && onSelect(target.id)}
              >
                {row.getVisibleCells().map((cell) => (
                  <span
                    key={cell.id}
                    // Only the content columns are keyboard stops; the edit button is reachable by
                    // pressing Enter on the row it belongs to.
                    {...(cell.column.columnDef.meta?.navigable
                      ? cellProps(item.index, cell.column.id)
                      : { role: "gridcell" as const })}
                    className={`grid__cell grid__cell--${cell.column.id}`}
                  >
                    <table.FlexRender cell={cell} />
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
