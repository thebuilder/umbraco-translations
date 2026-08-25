import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUrlFilters } from "./use-url-filters.js";

beforeEach(() => {
  history.replaceState(null, "", "/umbraco/section/translation/view/overview");
});
afterEach(() => {
  cleanup();
  // Without this the history spies stack across tests and their call counts accumulate.
  vi.restoreAllMocks();
});

describe("useUrlFilters", () => {
  it("reads the initial filters out of the url", () => {
    history.replaceState(null, "", "/view?locale=da-DK&status=Absent");

    const { result } = renderHook(() => useUrlFilters());

    expect(result.current[0].locale).toBe("da-DK");
    expect(result.current[0].status).toBe("Absent");
  });

  it("writes a navigational change as a history entry", async () => {
    const push = vi.spyOn(history, "pushState");
    const { result } = renderHook(() => useUrlFilters());

    act(() => result.current[1]({ locale: "da-DK" }));
    await waitFor(() => expect(push).toHaveBeenCalled());

    expect(location.search).toContain("locale=da-DK");
  });

  it("writes a search as a replacement, so typing does not fill the history", async () => {
    const push = vi.spyOn(history, "pushState");
    const replace = vi.spyOn(history, "replaceState");
    const { result } = renderHook(() => useUrlFilters());

    act(() => result.current[1]({ query: "cart" }));
    await waitFor(() => expect(replace).toHaveBeenCalled());

    expect(push).not.toHaveBeenCalled();
  });

  it("coalesces a burst of changes into one write", async () => {
    const replace = vi.spyOn(history, "replaceState");
    const { result } = renderHook(() => useUrlFilters());

    act(() => {
      result.current[1]({ query: "c" });
      result.current[1]({ query: "ca" });
      result.current[1]({ query: "car" });
    });
    await waitFor(() => expect(replace).toHaveBeenCalled());

    expect(replace).toHaveBeenCalledOnce();
    expect(location.search).toContain("q=car");
  });

  it("writes the pathname back verbatim", async () => {
    history.replaceState(null, "", "/umbraco/section/translation/view/overview");
    const { result } = renderHook(() => useUrlFilters());

    act(() => result.current[1]({ locale: "da-DK" }));
    await waitFor(() => expect(location.search).toContain("locale=da-DK"));

    // Rebuilding the path is how you end up fighting the backoffice router.
    expect(location.pathname).toBe("/umbraco/section/translation/view/overview");
  });

  it("picks up a filter change from the back button", async () => {
    const { result } = renderHook(() => useUrlFilters());

    history.replaceState(null, "", "/view?locale=de-DE");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await waitFor(() => expect(result.current[0].locale).toBe("de-DE"));
  });

  it("ignores a change that would not alter the url", () => {
    const { result } = renderHook(() => useUrlFilters());
    const [before] = result.current;

    act(() => result.current[1]({ query: "" }));

    // The same state object, so every query keyed on it stays put rather than refetching.
    expect(result.current[0]).toBe(before);
    expect(location.search).toBe("");
  });

  it("normalises what it writes", async () => {
    const { result } = renderHook(() => useUrlFilters());

    act(() => result.current[1]({ keyPrefix: "checkout.errors.", locale: "  da-DK  " }));
    await waitFor(() => expect(location.search).toContain("prefix=checkout.errors"));

    expect(result.current[0].locale).toBe("da-DK");
    expect(location.search).not.toContain("errors.&");
  });
});
