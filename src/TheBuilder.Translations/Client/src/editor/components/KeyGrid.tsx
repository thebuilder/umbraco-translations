import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useRef } from "react";
import type { MessageCell, MessageKey } from "../../api/generated/models.js";
import type { EditorFilters } from "../state/filters.js";
import { cellStatus } from "./cell-status.js";
import { GRID_COLUMNS, useGridNavigation } from "./use-grid-navigation.js";

/** Two lines of key and two of value, at a size that can actually be read. */
export const ROW_HEIGHT = 64;

/** Rows left below the fold before the next page is requested. */
const PREFETCH_MARGIN = 20;

export const KeyGrid = ({
  keys, filters, total, loading, error, namespaceCount,
  selectedId, onSelect, onLoadMore, hasMore, loadingMore,
}: {
  keys: readonly MessageKey[];
  filters: EditorFilters;
  total: number;
  loading: boolean;
  error?: Error;
  namespaceCount: number;
  selectedId?: string;
  onSelect: (messageId: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  loadingMore: boolean;
}) => {
  const scroller = useRef<HTMLDivElement>(null);
  const singleLocale = filters.locale === filters.referenceLocale;

  const virtualizer = useVirtualizer({
    // The full result count, so the scrollbar is the right size from the first paint instead of
    // shrinking under the cursor as each page arrives. Rows not loaded yet render as placeholders.
    count: total,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });
  const items = virtualizer.getVirtualItems();

  // Keeps pulling pages until everything matching is in hand, so scrolling never waits on a fetch.
  const last = items.at(-1)?.index ?? 0;
  useEffect(() => {
    if (hasMore && !loadingMore && last >= keys.length - PREFETCH_MARGIN) onLoadMore();
  }, [hasMore, loadingMore, last, keys.length, onLoadMore]);

  const scrollToRow = useCallback((row: number) => virtualizer.scrollToIndex(row), [virtualizer]);
  const activate = useCallback(({ row }: { row: number }) => {
    const cell = cellFor(keys[row], filters.locale);
    if (cell) onSelect(cell.id);
  }, [keys, filters.locale, onSelect]);

  const { onKeyDown, cellProps } = useGridNavigation({
    rowCount: keys.length,
    scrollToRow,
    onActivate: activate,
  });

  if (error) return <p className="panel error">{error.message}</p>;
  if (loading) return <p className="panel">Loading translations…</p>;
  if (keys.length === 0) return <p className="panel">No translations match these filters.</p>;

  const rowClass = (extra = "") =>
    ["grid__row", singleLocale ? "grid__row--single" : "", extra].filter(Boolean).join(" ");

  return (
    <div
      role="grid"
      aria-rowcount={total}
      aria-colcount={GRID_COLUMNS.length}
      aria-label="Translations"
      className="grid"
      onKeyDown={onKeyDown}
    >
      <div role="row" aria-rowindex={1} className={rowClass("grid__row--head")}>
        <span role="columnheader" className="grid__cell">Key</span>
        {!singleLocale && (
          <span role="columnheader" className="grid__cell">{filters.referenceLocale}</span>
        )}
        <span role="columnheader" className="grid__cell">
          {singleLocale ? "Text" : filters.locale}
        </span>
        <span role="columnheader" className="grid__cell grid__cell--edit">Edit</span>
      </div>

      <div ref={scroller} className="grid__body">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {items.map((item) => {
            const key = keys[item.index];
            if (!key) {
              return (
                <div
                  key={`pending-${item.index}`}
                  role="row"
                  aria-rowindex={item.index + 2}
                  className={rowClass("grid__row--pending")}
                  style={{ transform: `translateY(${item.start}px)`, height: item.size }}
                >
                  <span role="gridcell" className="grid__cell"><span className="skeleton" /></span>
                  {!singleLocale && <span role="gridcell" className="grid__cell"><span className="skeleton" /></span>}
                  <span role="gridcell" className="grid__cell"><span className="skeleton" /></span>
                  <span role="gridcell" className="grid__cell" />
                </div>
              );
            }
            const target = cellFor(key, filters.locale);
            const reference = cellFor(key, filters.referenceLocale);
            const status = cellStatus(target);
            const selected = target !== undefined && target.id === selectedId;

            return (
              <div
                key={`${key.sourceId}|${key.namespace}|${key.key}`}
                role="row"
                aria-rowindex={item.index + 2}
                aria-selected={selected}
                className={rowClass(selected ? "grid__row--selected" : "")}
                style={{ transform: `translateY(${item.start}px)`, height: item.size }}
                onClick={() => target && onSelect(target.id)}
              >
                <span {...cellProps(item.index, "key")} className="grid__cell grid__cell--key">
                  {/* The namespace is its own label, not part of the key: it is the grouping the
                      sidebar drills into, and running the two together made both unreadable. */}
                  {(namespaceCount > 1 || filters.namespace === null) && (
                    <span className="namespace">{key.namespace}</span>
                  )}
                  <span className="key" title={`${key.namespace}.${key.key}`}>{key.key}</span>
                </span>

                {!singleLocale && (
                  <span {...cellProps(item.index, "reference")} className="grid__cell grid__cell--value">
                    <Value cell={reference} />
                  </span>
                )}

                <span {...cellProps(item.index, "target")} className="grid__cell grid__cell--value">
                  <Value cell={target} strong />
                  {status.text && (
                    <span className={status.warning ? "status status--warning" : "status"}>
                      {status.warning && <span aria-hidden="true">⚠ </span>}
                      {status.text}
                    </span>
                  )}
                </span>

                <span className="grid__cell grid__cell--edit">
                  {/* An explicit affordance. A row being clickable is not discoverable on its own,
                      so the row stays clickable but this is what says so. */}
                  <button
                    type="button"
                    className="edit"
                    tabIndex={-1}
                    aria-label={`Edit ${key.namespace}.${key.key}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (target) onSelect(target.id);
                    }}
                  >
                    ✎
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};

const cellFor = (key: MessageKey | undefined, locale: string | null): MessageCell | undefined =>
  key && locale ? key.cells[locale] : undefined;

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
