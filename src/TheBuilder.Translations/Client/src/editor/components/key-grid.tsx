// biome-ignore-all lint/a11y/useSemanticElements: A <table> cannot be virtualized this way. Rows are positioned by transform inside a fixed-height scroller, and overriding a table element's `display` to do that strips the very semantics the rule is asking for, leaving the explicit roles as the only thing carrying them.
// biome-ignore-all lint/a11y/useFocusableInteractive: The grid uses roving tabindex over its navigable cells (see cellProps in use-grid-navigation.ts): exactly one cell is tabbable at a time, and rows and status cells are reached through it rather than being tab stops of their own. WAI-ARIA's grid pattern allows cell navigation instead of row navigation.
// biome-ignore-all lint/a11y/useKeyWithClickEvents: The keyboard equivalent of clicking a row is Enter, handled by the onKeyDown on the grid container so it works from whichever cell holds focus. The rule only looks for a handler on the same element.

import { useTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import type { LocaleFacet, MessageKey } from "../../api/generated/models.js";
import type { EditorFilters } from "../state/filters.js";
import { localeName } from "../state/locales.js";
import { type EditTarget, keyId, sameTarget, targetId, targetOf } from "../state/target.js";
import { keyColumns, keyTableFeatures } from "./key-columns.js";
import { useGridNavigation } from "./use-grid-navigation.js";
import { useOpenRowPlacement } from "./use-open-row-placement.js";

/**
 * One line of text at a size that can actually be read. An estimate rather than a rule: every row
 * is measured once rendered, because the open one grows into the editor and a search hit can carry
 * a second line saying where it matched.
 */
const ROW_HEIGHT = 41;

/** A cell the keyboard moves between: the roving tabindex marks every one of them. */
const NAVIGABLE_CELL = '[role="gridcell"][tabindex]';

/** Rows left below the fold before the next page is requested. */
const PREFETCH_MARGIN = 20;

export const KeyGrid = ({
  keys,
  filters,
  locales,
  total,
  namespaceCount,
  selected,
  onSelect,
  onLoadMore,
  hasMore,
  loadingMore,
  editor,
}: {
  keys: MessageKey[];
  filters: EditorFilters;
  locales: readonly LocaleFacet[];
  total: number;
  namespaceCount: number;
  selected?: EditTarget;
  onSelect: (target: EditTarget) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  /**
   * The editor for the open row, drawn in that row's place. Editing happens where the text was
   * found rather than in a pane beside the list: the pane took half the width from the results it
   * was opened from, and the job is one string at a time. It lays itself out on the grid's own
   * column template, so the field lines up under the language it writes.
   */
  editor?: (key: MessageKey) => ReactNode;
}) => {
  const scroller = useRef<HTMLDivElement>(null);
  // Comparing a language with itself is how "no comparison" is expressed, so that is also the
  // condition for the second column being absent.
  const comparing = filters.referenceLocale !== null && filters.referenceLocale !== filters.locale;

  const nameOf = useCallback((code: string | null) => localeName(locales, code), [locales]);

  const columns = useMemo(
    () =>
      keyColumns({
        editing: filters.locale,
        comparison: filters.referenceLocale,
        editingName: nameOf(filters.locale),
        comparisonName: nameOf(filters.referenceLocale),
        nameOf,
        showNamespace: namespaceCount > 1 || filters.namespace === null,
        term: filters.query,
      }),
    [
      filters.locale,
      filters.referenceLocale,
      filters.namespace,
      filters.query,
      namespaceCount,
      nameOf,
    ]
  );

  const table = useTable({
    features: keyTableFeatures,
    columns,
    data: keys,
    getRowId: keyId,
    // The server filters, orders and pages the whole result. The table owns the column model.
    state: { columnVisibility: { second: comparing } },
  });

  const { rows } = table.getRowModel();
  const visible = table.getVisibleLeafColumns();

  // Found once, by identity: the virtualizer's keys and the row being drawn both ask which row is
  // open, and a position remembered from before would point at the wrong row once the list
  // reorders under an open editor.
  const openIndex = useMemo(
    () =>
      selected
        ? rows.findIndex((row) => sameTarget(targetOf(row.original, selected.locale), selected))
        : -1,
    [rows, selected]
  );

  const virtualizer = useVirtualizer({
    // The full result count rather than the rows in hand, so the scrollbar is the right size from
    // the first paint instead of shrinking under the cursor as each page arrives. Indices past what
    // has loaded render as placeholders. This is only sound because pages arrive in order and none
    // are ever evicted, which is what makes row N of the list row N of `rows`.
    count: total,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    // Keyed by row identity so a measured height follows the key rather than the position: the
    // list reorders under an open editor when saving changes what it is sorted by.
    //
    // Open and closed are different keys. Sharing one kept the element, and with it the height it
    // was last measured at, until the resize observer caught up a frame later: a row closing stood
    // at the editor's full height for one paint and the rows below it jumped. A new key mounts a
    // new element, which is measured as it attaches, before anything is painted.
    getItemKey: (index) => {
      const key = keys[index];
      if (!key) {
        return `pending-${index}`;
      }
      return index === openIndex ? `${keyId(key)}:open` : keyId(key);
    },
  });
  const items = virtualizer.getVirtualItems();

  // Keeps pulling pages until everything matching is in hand, so scrolling never waits on a fetch.
  const last = items.at(-1)?.index ?? 0;
  useEffect(() => {
    if (hasMore && !loadingMore && last >= rows.length - PREFETCH_MARGIN) {
      onLoadMore();
    }
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
  const activate = useCallback(
    ({ row }: { row: number }) => {
      const key = rows[row]?.original;
      if (key && filters.locale) {
        onSelect(targetOf(key, filters.locale));
      }
    },
    [rows, filters.locale, onSelect]
  );

  const { onKeyDown, cellProps, restoreFocus } = useGridNavigation({
    rowCount: rows.length,
    columns: navigable,
    scrollToRow,
    onActivate: activate,
  });

  /**
   * Focus follows the editor back out. The editor takes focus into its field, and every way of
   * dismissing it -- Escape, the close button, saving -- left focus on nothing at all, so the next
   * Tab started again from the top of the backoffice.
   *
   * Which row to return to is looked up from the key that was open rather than remembered as a
   * position, because the row can move underneath: saving while sorted by when a translation was
   * last edited reorders the list before the editor closes.
   */
  const openedFrom = useRef<EditTarget | undefined>(undefined);
  useEffect(() => {
    if (selected !== undefined) {
      openedFrom.current = selected;
      return;
    }
    const target = openedFrom.current;
    openedFrom.current = undefined;
    if (target === undefined || rows.length === 0) {
      return;
    }

    const row = rows.findIndex((candidate) =>
      sameTarget(targetOf(candidate.original, target.locale), target)
    );
    restoreFocus(row >= 0 ? row : undefined);
  }, [selected, rows, restoreFocus]);

  const rememberClick = useOpenRowPlacement({
    scroller,
    openId: selected === undefined ? null : targetId(selected),
    openIndex,
    scrollToIndex: (index) => virtualizer.scrollToIndex(index, { align: "auto" }),
  });

  // Built from the columns actually on screen, so the reference column disappearing closes its
  // track rather than leaving a gap.
  const template = visible
    .map((column) => column.columnDef.meta?.width ?? "minmax(0, 1fr)")
    .join(" ");

  return (
    <div
      aria-colcount={visible.length}
      aria-label="Translations"
      aria-rowcount={total}
      className="grid"
      onKeyDown={(event) => {
        // The list's keys are for moving between its cells, so they apply only with focus on one.
        // Anywhere else -- the open editor's field, its buttons -- the key belongs to what has
        // focus.
        if (event.target instanceof HTMLElement && event.target.matches(NAVIGABLE_CELL)) {
          onKeyDown(event);
        }
      }}
      role="grid"
      // Every row and the open editor lay themselves out on this one template.
      style={{ "--columns": template } as CSSProperties}
    >
      {table.getHeaderGroups().map((group) => (
        <div aria-rowindex={1} className="grid__row grid__row--head" key={group.id} role="row">
          {group.headers.map((header) => (
            <span
              className={`grid__cell grid__cell--${header.column.id}`}
              key={header.id}
              role="columnheader"
            >
              <table.FlexRender header={header} />
            </span>
          ))}
        </div>
      ))}

      <div className="grid__body" ref={scroller}>
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {items.map((item) => {
            const row = rows[item.index];
            const style = { transform: `translateY(${item.start}px)` };

            if (!row) {
              return (
                <div
                  aria-rowindex={item.index + 2}
                  className="grid__row grid__row--pending"
                  data-index={item.index}
                  key={item.key}
                  ref={virtualizer.measureElement}
                  role="row"
                  style={style}
                >
                  {visible.map((column) => (
                    <span className="grid__cell" key={column.id} role="gridcell">
                      {column.columnDef.meta?.navigable ? <span className="skeleton" /> : null}
                    </span>
                  ))}
                </div>
              );
            }

            const target =
              filters.locale === null ? undefined : targetOf(row.original, filters.locale);
            const open = item.index === openIndex;

            if (open && editor) {
              return (
                <div
                  aria-rowindex={item.index + 2}
                  aria-selected={true}
                  className="grid__row grid__row--open"
                  data-index={item.index}
                  key={item.key}
                  ref={virtualizer.measureElement}
                  role="row"
                  style={style}
                >
                  <div aria-colspan={visible.length} className="grid__editor" role="gridcell">
                    {editor(row.original)}
                  </div>
                </div>
              );
            }

            return (
              <div
                aria-rowindex={item.index + 2}
                aria-selected={open}
                className={open ? "grid__row grid__row--selected" : "grid__row"}
                data-index={item.index}
                key={item.key}
                onClick={(event) => {
                  if (target) {
                    rememberClick(targetId(target), event.currentTarget);
                    onSelect(target);
                  }
                }}
                ref={virtualizer.measureElement}
                role="row"
                style={style}
              >
                {row.getVisibleCells().map((cell) => (
                  <span
                    key={cell.id}
                    // Only the content columns are keyboard stops; the status a row carries is
                    // reachable by pressing Enter on the row it belongs to.
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
