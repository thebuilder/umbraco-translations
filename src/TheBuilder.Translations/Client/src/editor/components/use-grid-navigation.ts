import { useCallback, useEffect, useRef, useState } from "react";

export interface GridFocus {
  row: number;
  column: string;
}

interface Options {
  rowCount: number;
  /**
   * The navigable column ids, left to right. Passed in rather than fixed, because which columns
   * exist changes: the reference column is dropped when the target and reference locales are the
   * same, and arrowing onto a column that is not rendered moves focus nowhere.
   */
  columns: readonly string[];
  /** Brings a row into view before focus moves to it; it may not be mounted yet. */
  scrollToRow: (row: number) => void;
  onActivate: (focus: GridFocus) => void;
}

/**
 * Roving tabindex over a virtualized grid.
 *
 * Focus is held as a coordinate rather than an element, because virtualization unmounts the row the
 * moment it scrolls out of view; a stored node would be detached and focusing it would silently do
 * nothing. Moving focus therefore scrolls first and focuses on the next frame, once the target row
 * has actually been rendered.
 */
export const useGridNavigation = ({ rowCount, columns, scrollToRow, onActivate }: Options) => {
  const [focus, setFocus] = useState<GridFocus>({ row: 0, column: "target" });
  // Set only while the grid is deliberately moving focus, so re-renders do not steal it back from
  // whatever the user clicked into.
  const claiming = useRef(false);

  useEffect(() => {
    // A shorter list must not leave focus pointing past the end.
    setFocus((current) =>
      current.row < rowCount || rowCount === 0 ? current : { ...current, row: rowCount - 1 });
  }, [rowCount]);

  useEffect(() => {
    // Nor may a column that has just been hidden keep it. Falling back to the last column lands on
    // the target locale, which is the one being edited.
    setFocus((current) =>
      columns.length === 0 || columns.includes(current.column)
        ? current
        : { ...current, column: columns.at(-1)! });
  }, [columns]);

  const moveTo = useCallback((next: GridFocus) => {
    const row = Math.min(Math.max(next.row, 0), Math.max(rowCount - 1, 0));
    setFocus({ row, column: next.column });
    claiming.current = true;
    scrollToRow(row);
  }, [rowCount, scrollToRow]);

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (columns.length === 0) return;
    const columnIndex = columns.indexOf(focus.column);
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };

    switch (event.key) {
      case "ArrowDown": handled(); return moveTo({ ...focus, row: focus.row + 1 });
      case "ArrowUp": handled(); return moveTo({ ...focus, row: focus.row - 1 });
      case "ArrowRight":
        if (columnIndex >= columns.length - 1) return;
        handled();
        return moveTo({ ...focus, column: columns[columnIndex + 1]! });
      case "ArrowLeft":
        if (columnIndex <= 0) return;
        handled();
        return moveTo({ ...focus, column: columns[columnIndex - 1]! });
      case "Home":
        handled();
        // Ctrl+Home is the whole grid; Home alone is the row, which is what a spreadsheet does.
        return moveTo(event.ctrlKey || event.metaKey
          ? { row: 0, column: columns[0]! }
          : { ...focus, column: columns[0]! });
      case "End":
        handled();
        return moveTo(event.ctrlKey || event.metaKey
          ? { row: rowCount - 1, column: columns.at(-1)! }
          : { ...focus, column: columns.at(-1)! });
      case "PageDown": handled(); return moveTo({ ...focus, row: focus.row + PAGE_ROWS });
      case "PageUp": handled(); return moveTo({ ...focus, row: focus.row - PAGE_ROWS });
      case "Enter": handled(); return onActivate(focus);
      default:
    }
  }, [columns, focus, moveTo, onActivate, rowCount]);

  /**
   * Applied to the cell that currently holds focus. The ref focuses it only when the grid asked for
   * the move, so clicking elsewhere is not undone on the next render.
   */
  const cellProps = useCallback((row: number, column: string) => {
    const current = focus.row === row && focus.column === column;
    return {
      role: "gridcell" as const,
      tabIndex: current ? 0 : -1,
      ref: (element: HTMLElement | null) => {
        if (!current || !element || !claiming.current) return;
        claiming.current = false;
        element.focus({ preventScroll: true });
      },
      onFocus: () => setFocus({ row, column }),
    };
  }, [focus]);

  return { focus, onKeyDown, cellProps, moveTo };
};

const PAGE_ROWS = 10;
