import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useRef } from "react";
import type { LocaleFacet, MessageCell, MessageKey } from "../../api/generated/models.js";
import { Tag } from "../../bridge/uui/index.js";
import type { EditorFilters } from "../state/filters.js";
import { coverageOf, dotGlyph } from "./coverage.js";
import { displayKey } from "./row-metrics.js";
import { GRID_COLUMNS, useGridNavigation } from "./use-grid-navigation.js";

export const ROW_HEIGHT = 44;

/** Rows left below the fold before the next page is requested. */
const PREFETCH_MARGIN = 20;

export const KeyGrid = ({
  keys, filters, locales, total, loading, error, namespaceCount,
  onSelect, onLoadMore, hasMore, loadingMore, onLocaleChange,
}: {
  keys: readonly MessageKey[];
  filters: EditorFilters;
  locales: readonly LocaleFacet[];
  total: number;
  loading: boolean;
  error?: Error;
  namespaceCount: number;
  onSelect: (messageId: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLocaleChange: (locale: string) => void;
}) => {
  const scroller = useRef<HTMLDivElement>(null);
  const singleLocale = filters.locale === filters.referenceLocale;

  const virtualizer = useVirtualizer({
    count: keys.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const items = virtualizer.getVirtualItems();

  // Fetching before the user reaches the end keeps scrolling continuous rather than stalling at
  // each page boundary.
  const last = items.at(-1)?.index ?? 0;
  useEffect(() => {
    if (hasMore && !loadingMore && last >= keys.length - PREFETCH_MARGIN) onLoadMore();
  }, [hasMore, loadingMore, last, keys.length, onLoadMore]);

  const scrollToRow = useCallback((row: number) => virtualizer.scrollToIndex(row), [virtualizer]);
  const activate = useCallback(
    ({ row }: { row: number }) => {
      const cell = cellFor(keys[row], filters.locale);
      if (cell) onSelect(cell.id);
    },
    [keys, filters.locale, onSelect],
  );
  const { focus, onKeyDown, cellProps } = useGridNavigation({
    rowCount: keys.length,
    scrollToRow,
    onActivate: activate,
  });

  if (error) return <p className="panel error">{error.message}</p>;
  if (loading) return <p className="panel">Loading translations…</p>;
  if (keys.length === 0) return <p className="panel">No translations match these filters.</p>;

  return (
    <section className="grid-frame">
      <div
        role="grid"
        // The unloaded total, not the rendered count: it is what the list actually contains, and
        // announcing the window would tell a screen reader the wrong size.
        aria-rowcount={total}
        aria-colcount={GRID_COLUMNS.length}
        aria-label="Translations"
        className="grid"
        onKeyDown={onKeyDown}
      >
        <div role="row" aria-rowindex={1} className="grid__row grid__row--head">
          <span role="columnheader" className="grid__cell">Key</span>
          <span role="columnheader" className="grid__cell">{filters.referenceLocale ?? "Reference"}</span>
          <span role="columnheader" className="grid__cell">
            {singleLocale ? "Text" : filters.locale ?? "Translation"}
          </span>
          <span role="columnheader" className="grid__cell grid__cell--coverage">Locales</span>
        </div>

        <div ref={scroller} className="grid__body">
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {items.map((item) => {
              const key = keys[item.index]!;
              const target = cellFor(key, filters.locale);
              const reference = cellFor(key, filters.referenceLocale);
              const shown = displayKey(key, filters, namespaceCount);
              const coverage = coverageOf(key, locales);

              return (
                <div
                  key={`${key.sourceId}|${key.namespace}|${key.key}`}
                  role="row"
                  // Offset by the header, which is row 1.
                  aria-rowindex={item.index + 2}
                  className={`grid__row grid__row--${(target?.state ?? "Absent").toLowerCase()}`}
                  style={{ transform: `translateY(${item.start}px)`, height: item.size }}
                >
                  <span
                    {...cellProps(item.index, "key")}
                    className="grid__cell grid__cell--key"
                    title={`${key.namespace}.${key.key}`}
                  >
                    {shown.showNamespace && <span className="muted">{key.namespace} </span>}
                    <span className="key">{shown.text}</span>
                  </span>

                  <span {...cellProps(item.index, "reference")} className="grid__cell muted">
                    <Value cell={reference} />
                  </span>

                  <span
                    {...cellProps(item.index, "target")}
                    className="grid__cell grid__cell--target"
                    onDoubleClick={() => target && onSelect(target.id)}
                  >
                    <Value cell={target} />
                    <Status cell={target} />
                  </span>

                  <span role="gridcell" className="grid__cell grid__cell--coverage">
                    {/* The dots carry no meaning to a screen reader, so the summary is the content
                        and they are decoration. Clicking one is a mouse shortcut for the toolbar. */}
                    <span className="visually-hidden">{coverage.label}</span>
                    <span aria-hidden="true" className="dots">
                      {coverage.dots.map((dot) => (
                        <button
                          key={dot.locale}
                          type="button"
                          tabIndex={-1}
                          className={`dot dot--${dot.state.toLowerCase()}`}
                          title={`${dot.locale}: ${dot.state}`}
                          onClick={() => onLocaleChange(dot.locale)}
                        >
                          {dotGlyph(dot.state)}
                        </button>
                      ))}
                      {coverage.overflow > 0 && <span className="dot dot--more">+{coverage.overflow}</span>}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="pagination">
        <span className="muted" role="status">
          {keys.length === total ? `${total} keys` : `${keys.length} of ${total} keys`}
          {loadingMore && " · loading more…"}
        </span>
        <span className="muted">Row {focus.row + 1}</span>
      </div>
    </section>
  );
};

const cellFor = (key: MessageKey | undefined, locale: string | null): MessageCell | undefined =>
  key && locale ? key.cells[locale] : undefined;

/**
 * Three states that would otherwise all render as an empty cell: no row at all, a row using the
 * application's text, and an override that is deliberately the empty string.
 */
const Value = ({ cell }: { cell?: MessageCell }) => {
  if (!cell) return <span className="absent">— not translated</span>;

  const text = cell.overrideValue ?? cell.defaultValue;
  if (text === "") return <span className="absent">∅ empty string</span>;

  return (
    <span className={cell.hasOverride ? "value" : "value inherited"}>
      {cell.hasOverride ? "" : "↳ "}
      {text}
    </span>
  );
};

/** Nothing for the ordinary case: a chip on every row is not a signal. */
const Status = ({ cell }: { cell?: MessageCell }) => {
  switch (cell?.state) {
    case "NeedsReview": return <Tag color="warning">Review</Tag>;
    case "Removed": return <Tag color="danger">Removed</Tag>;
    default: return null;
  }
};
