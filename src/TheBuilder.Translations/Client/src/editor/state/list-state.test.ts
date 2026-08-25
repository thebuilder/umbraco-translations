import { describe, expect, it } from "vitest";
import { defaultFilters, normalizeFilters } from "./filters.js";
import { clearedFilters, describeListState, hasNarrowingFilters } from "./list-state.js";

describe("describeListState", () => {
  const base = { loading: false, rowCount: 0, totalKeys: 100 };

  it("shows rows when there are rows", () => {
    expect(describeListState({ ...base, rowCount: 5 })).toEqual({ kind: "rows" });
  });

  it("reports a failure even over rows left from the previous query", () => {
    // Those rows are stale. Showing them without a word about the error leaves them looking current.
    expect(
      describeListState({ ...base, rowCount: 5, error: new Error("Gateway timeout") })
    ).toEqual({ kind: "error", message: "Gateway timeout" });
  });

  it("distinguishes nothing synchronised from filters that exclude everything", () => {
    expect(describeListState({ ...base, totalKeys: 0 })).toEqual({ kind: "no-sources" });
    expect(describeListState({ ...base, totalKeys: 100 })).toEqual({ kind: "no-matches" });
  });

  it("waits rather than guessing which empty it is", () => {
    // Guessing here is how an editor gets told to call an administrator about a filter they set.
    expect(describeListState({ ...base, totalKeys: undefined })).toEqual({ kind: "loading" });
  });

  it("keeps showing rows while a refetch is in flight", () => {
    expect(describeListState({ ...base, loading: true, rowCount: 5 })).toEqual({ kind: "rows" });
  });

  it("loads when there is nothing yet and the query is still running", () => {
    expect(describeListState({ ...base, loading: true, rowCount: 0 })).toEqual({ kind: "loading" });
  });
});

describe("hasNarrowingFilters", () => {
  it("ignores the language choices, which do not narrow anything", () => {
    const filters = normalizeFilters({ ...defaultFilters, locale: "da", referenceLocale: "en" });

    expect(hasNarrowingFilters(filters)).toBe(false);
  });

  it("notices each of the filters that do", () => {
    for (const patch of [
      { query: "cart" },
      { namespace: "website" },
      { keyPrefix: "cart" },
      { status: "NeedsReview" as const },
    ]) {
      expect(hasNarrowingFilters(normalizeFilters({ ...defaultFilters, ...patch }))).toBe(true);
    }
  });
});

describe("clearedFilters", () => {
  it("clears what narrows the list and leaves the languages alone", () => {
    const before = normalizeFilters({
      locale: "da",
      referenceLocale: "en",
      sort: "updatedAt",
      direction: "desc",
      query: "cart",
      namespace: "website",
      keyPrefix: "cart.items",
      status: "NeedsReview",
    });

    const after = normalizeFilters({ ...before, ...clearedFilters() });

    expect(hasNarrowingFilters(after)).toBe(false);
    expect(after.locale).toBe("da");
    expect(after.referenceLocale).toBe("en");
    // The order is a preference, not a filter; resetting it would be a second surprise.
    expect(after.sort).toBe("updatedAt");
    expect(after.direction).toBe("desc");
  });
});
