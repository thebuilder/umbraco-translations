import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useGridNavigation } from "./use-grid-navigation.js";

afterEach(cleanup);

/** What the grid renders when the reference locale differs from the one being edited. */
const BOTH_LOCALES = ["key", "reference", "target"];

/** A grid small enough to assert on, rendering every row so focus can be observed directly. */
const Grid = ({ rowCount = 5, columns = BOTH_LOCALES, scrollToRow = () => {}, onActivate = () => {}, expose }: {
  rowCount?: number;
  columns?: string[];
  scrollToRow?: (row: number) => void;
  onActivate?: (focus: { row: number }) => void;
  /** Hands the restore callback out, standing in for the editor drawer closing. */
  expose?: (restoreFocus: (row?: number) => void) => void;
}) => {
  const { onKeyDown, cellProps, focus, restoreFocus } = useGridNavigation({ rowCount, columns, scrollToRow, onActivate });
  expose?.(restoreFocus);
  return (
    <div role="grid" onKeyDown={onKeyDown} data-focus={`${focus.row}:${focus.column}`}>
      {Array.from({ length: rowCount }, (_, row) => (
        <div role="row" key={row}>
          {columns.map((column) => (
            <span key={column} {...cellProps(row, column)} data-testid={`${row}:${column}`} />
          ))}
        </div>
      ))}
    </div>
  );
};

const press = (grid: HTMLElement, key: string, init: object = {}) =>
  act(() => void fireEvent.keyDown(grid, { key, ...init }));

describe("useGridNavigation", () => {
  it("starts on the column being edited, which is where the work is", () => {
    const { container } = render(<Grid />);

    expect(container.querySelector("[role=grid]")).toHaveProperty("dataset.focus", "0:target");
  });

  it("moves between rows and columns", () => {
    const { container } = render(<Grid />);
    const grid = container.querySelector("[role=grid]")!;

    press(grid as HTMLElement, "ArrowDown");
    expect(grid).toHaveProperty("dataset.focus", "1:target");

    press(grid as HTMLElement, "ArrowLeft");
    expect(grid).toHaveProperty("dataset.focus", "1:reference");
  });

  it("stops at the edges rather than wrapping", () => {
    const { container } = render(<Grid rowCount={3} />);
    const grid = container.querySelector("[role=grid]") as HTMLElement;

    press(grid, "ArrowUp");
    expect(grid).toHaveProperty("dataset.focus", "0:target");

    press(grid, "ArrowRight");
    expect(grid).toHaveProperty("dataset.focus", "0:target");

    for (let i = 0; i < 10; i++) press(grid, "ArrowDown");
    expect(grid).toHaveProperty("dataset.focus", "2:target");
  });

  it("uses Home and End for the row, and with a modifier for the grid", () => {
    const { container } = render(<Grid rowCount={4} />);
    const grid = container.querySelector("[role=grid]") as HTMLElement;

    press(grid, "Home");
    expect(grid).toHaveProperty("dataset.focus", "0:key");

    press(grid, "End", { ctrlKey: true });
    expect(grid).toHaveProperty("dataset.focus", "3:target");
  });

  it("keeps exactly one cell in the tab order", () => {
    const { container } = render(<Grid rowCount={3} />);

    const tabbable = [...container.querySelectorAll("[role=gridcell]")]
      .filter((cell) => cell.getAttribute("tabindex") === "0");

    expect(tabbable).toHaveLength(1);
  });

  it("scrolls a row into view before focusing it, because it may not be rendered yet", () => {
    const scrollToRow = vi.fn();
    const { container } = render(<Grid rowCount={100} scrollToRow={scrollToRow} />);

    press(container.querySelector("[role=grid]") as HTMLElement, "PageDown");

    expect(scrollToRow).toHaveBeenCalledWith(10);
  });

  it("activates the focused row on Enter", () => {
    const onActivate = vi.fn();
    const { container } = render(<Grid onActivate={onActivate} />);
    const grid = container.querySelector("[role=grid]") as HTMLElement;

    press(grid, "ArrowDown");
    press(grid, "Enter");

    expect(onActivate).toHaveBeenCalledWith({ row: 1, column: "target" });
  });

  it("pulls focus back inside when the list shrinks under it", () => {
    const { container, rerender } = render(<Grid rowCount={5} />);
    const grid = container.querySelector("[role=grid]") as HTMLElement;

    press(grid, "ArrowDown");
    press(grid, "ArrowDown");
    press(grid, "ArrowDown");
    expect(grid).toHaveProperty("dataset.focus", "3:target");

    // A filter change can leave focus pointing past the end of the new list.
    rerender(<Grid rowCount={2} />);
    expect(container.querySelector("[role=grid]")).toHaveProperty("dataset.focus", "1:target");
  });

  it("pulls focus off a column that has just been hidden", () => {
    const { container, rerender } = render(<Grid />);
    const grid = container.querySelector("[role=grid]") as HTMLElement;

    press(grid, "ArrowLeft");
    expect(grid).toHaveProperty("dataset.focus", "0:reference");

    // Selecting the reference locale as the one being edited drops the reference column, and focus
    // sitting on a column that is no longer rendered goes nowhere at all.
    rerender(<Grid columns={["key", "target"]} />);
    expect(container.querySelector("[role=grid]")).toHaveProperty("dataset.focus", "0:target");
  });

  it("arrows across only the columns it was given", () => {
    const { container } = render(<Grid columns={["key", "target"]} />);
    const grid = container.querySelector("[role=grid]") as HTMLElement;

    press(grid, "ArrowLeft");
    expect(grid).toHaveProperty("dataset.focus", "0:key");

    press(grid, "ArrowRight");
    expect(grid).toHaveProperty("dataset.focus", "0:target");
  });

  it("takes focus back to the cell after the editor closes over it", () => {
    let restore: (row?: number) => void = () => {};
    const { container, getByTestId } = render(<Grid expose={(fn) => { restore = fn; }} />);
    const grid = container.querySelector("[role=grid]") as HTMLElement;

    press(grid, "ArrowDown");
    // The editor drawer opens over the grid and focuses its own heading.
    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    act(() => elsewhere.focus());
    expect(document.activeElement).toBe(elsewhere);

    act(() => restore());

    expect(document.activeElement).toBe(getByTestId("1:target"));
    elsewhere.remove();
  });

  it("returns to the row it is given, because the list can reorder while the editor is open", () => {
    let restore: (row?: number) => void = () => {};
    const scrollToRow = vi.fn();
    const { getByTestId } = render(<Grid scrollToRow={scrollToRow} expose={(fn) => { restore = fn; }} />);

    act(() => restore(3));

    // Scrolled first: the row may not have been rendered at the moment focus was asked for.
    expect(scrollToRow).toHaveBeenCalledWith(3);
    expect(document.activeElement).toBe(getByTestId("3:target"));
  });

  it("follows focus that the user moved by clicking", () => {
    const { container, getByTestId } = render(<Grid rowCount={4} />);

    act(() => void fireEvent.focus(getByTestId("2:key")));

    expect(container.querySelector("[role=grid]")).toHaveProperty("dataset.focus", "2:key");
  });
});
