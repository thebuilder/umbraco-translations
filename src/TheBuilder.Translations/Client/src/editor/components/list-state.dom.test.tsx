import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ListState as State } from "../state/list-state.js";
import { ListState } from "./ListState.js";

afterEach(cleanup);

const show = (state: State, props: Partial<Parameters<typeof ListState>[0]> = {}) =>
  render(
    <ListState
      state={state}
      term=""
      filtered={false}
      canManageSources={false}
      onClear={() => {}}
      onRetry={() => {}}
      {...props}
    />,
  );

describe("ListState", () => {
  it("draws the shape of the list while it loads, and says so to a screen reader", () => {
    const { container } = show({ kind: "loading" });

    expect(screen.getByRole("status", { name: "Loading translations" })).toBeTruthy();
    expect(container.querySelectorAll(".skeleton-row").length).toBeGreaterThan(0);
  });

  it("offers a retry on failure and announces it", () => {
    const onRetry = vi.fn();
    show({ kind: "error", message: "Gateway timeout" }, { onRetry });

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Gateway timeout")).toBeTruthy();
    screen.getByRole("button", { name: "Try again" }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("quotes the search back when nothing matched it", () => {
    const onClear = vi.fn();
    show({ kind: "no-matches" }, { term: "inspector report", filtered: true, onClear });

    expect(screen.getByRole("heading").textContent).toContain("inspector report");
    screen.getByRole("button", { name: "Clear filters" }).click();
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("does not offer to clear filters when none are set", () => {
    // Reachable when a language simply has no keys: there is nothing to clear, and a button that
    // does nothing is worse than no button.
    show({ kind: "no-matches" }, { filtered: false });

    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  });

  it("tells an editor who to ask when nothing has been synchronised", () => {
    show({ kind: "no-sources" });

    expect(screen.getByRole("heading").textContent).toBe("No translations are available");
    // Pointing an editor at a settings page they cannot open is worse than saying nothing.
    expect(screen.queryByRole("button", { name: "Open settings" })).toBeNull();
  });

  it("offers settings to somebody who can actually configure a source", () => {
    show({ kind: "no-sources" }, { canManageSources: true });

    expect(screen.getByRole("button", { name: "Open settings" })).toBeTruthy();
  });
});
