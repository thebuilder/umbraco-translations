import type { InfiniteData } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type {
  MessageCell,
  MessageKey,
  MessageKeyList,
  MessageLocaleState,
} from "../../api/generated/models.js";
import {
  applyOverride,
  findKeyByMessageId,
  flattenKeys,
  MAXIMUM_PREVIEW_LENGTH,
  nextPageParam,
  patchInfinite,
  patchPage,
  previewOf,
  stateAfterOverride,
  totalOf,
} from "./cache.js";

const cell = (id: string, overrides: Partial<MessageCell> = {}): MessageCell => ({
  id,
  locale: "da-DK",
  defaultValue: "Din kurv er tom",
  overrideValue: null,
  hasOverride: false,
  needsReview: false,
  truncated: false,
  state: "Default",
  version: null,
  updatedAt: null,
  updatedBy: null,
  ...overrides,
});

const key = (
  name: string,
  cells: Record<string, MessageCell>,
  coverage: Record<string, MessageLocaleState> = {}
): MessageKey => ({
  sourceId: "source-1",
  namespace: "website",
  key: name,
  format: "Icu",
  arguments: {},
  cells,
  coverage: { "de-DE": "Absent", ...coverage },
  matchedLocales: [],
});

const page = (items: MessageKey[], overrides: Partial<MessageKeyList> = {}): MessageKeyList => ({
  items,
  page: 1,
  pageSize: 100,
  total: items.length,
  referenceLocale: "en-US",
  targetLocale: "da-DK",
  compareLocales: [],
  ...overrides,
});

describe("previewOf", () => {
  it("mirrors the server's cap so an optimistic value does not snap shorter on refetch", () => {
    const long = "a".repeat(MAXIMUM_PREVIEW_LENGTH + 50);

    const preview = previewOf(long);

    expect(preview.text).toHaveLength(MAXIMUM_PREVIEW_LENGTH);
    expect(preview.text.endsWith("...")).toBe(true);
    expect(preview.truncated).toBe(true);
  });

  it("leaves a value at the cap untouched", () => {
    const exact = "a".repeat(MAXIMUM_PREVIEW_LENGTH);

    expect(previewOf(exact)).toEqual({ text: exact, truncated: false });
  });
});

describe("stateAfterOverride", () => {
  it("moves a default cell to overridden and back", () => {
    expect(stateAfterOverride("Default", "Ny tekst")).toBe("Overridden");
    expect(stateAfterOverride("Overridden", null)).toBe("Default");
  });

  it("clears needs-review, because a fresh save is against the current source text", () => {
    expect(stateAfterOverride("NeedsReview", "Ny tekst")).toBe("Overridden");
  });

  it("keeps removed sticky", () => {
    // Saving an override does not bring back a key the source deleted, and showing it as merely
    // overridden would hide that it no longer exists upstream.
    expect(stateAfterOverride("Removed", "Beholdt")).toBe("Removed");
    expect(stateAfterOverride("Removed", null)).toBe("Removed");
  });
});

describe("applyOverride", () => {
  it("patches the cell and the coverage entry together", () => {
    const row = key("cart.empty", { "da-DK": cell("m1") }, { "da-DK": "Default" });

    const patched = applyOverride(row, "da-DK", "Din tilpassede tekst", 4);

    expect(patched.cells["da-DK"]).toMatchObject({
      overrideValue: "Din tilpassede tekst",
      hasOverride: true,
      needsReview: false,
      state: "Overridden",
      version: 4,
    });
    // Coverage drives the dots, so leaving it stale would show the wrong state for the locale
    // being edited.
    expect(patched.coverage["da-DK"]).toBe("Overridden");
  });

  it("clears the override on a reset", () => {
    const row = key(
      "cart.empty",
      {
        "da-DK": cell("m1", {
          overrideValue: "Gammel",
          hasOverride: true,
          state: "Overridden",
          version: 2,
        }),
      },
      { "da-DK": "Overridden" }
    );

    const patched = applyOverride(row, "da-DK", null);

    expect(patched.cells["da-DK"]?.overrideValue).toBeNull();
    expect(patched.cells["da-DK"]?.hasOverride).toBe(false);
    expect(patched.coverage["da-DK"]).toBe("Default");
  });

  it("truncates an optimistic value the way the server will", () => {
    const row = key("cart.empty", { "da-DK": cell("m1") }, { "da-DK": "Default" });

    const patched = applyOverride(row, "da-DK", "b".repeat(MAXIMUM_PREVIEW_LENGTH + 10));

    expect(patched.cells["da-DK"]?.overrideValue).toHaveLength(MAXIMUM_PREVIEW_LENGTH);
    expect(patched.cells["da-DK"]?.truncated).toBe(true);
  });

  it("keeps a row truncated when a short override lands on a cut-off default", () => {
    // defaultValue is already the server's preview, so re-measuring it would call a truncated
    // default complete and wrongly make the cell inline-editable.
    const row = key(
      "cart.empty",
      {
        "da-DK": cell("m1", { defaultValue: "a".repeat(MAXIMUM_PREVIEW_LENGTH), truncated: true }),
      },
      { "da-DK": "Default" }
    );

    const patched = applyOverride(row, "da-DK", "Kort");

    expect(patched.cells["da-DK"]?.truncated).toBe(true);
  });

  it("leaves other locales alone", () => {
    const row = key("cart.empty", {
      "da-DK": cell("m1"),
      "en-US": cell("m2", { locale: "en-US" }),
    });

    const patched = applyOverride(row, "da-DK", "Ny");

    expect(patched.cells["en-US"]).toBe(row.cells["en-US"]);
  });

  it("returns the row unchanged when the locale has no cell", () => {
    const row = key("cart.empty", { "da-DK": cell("m1") });

    expect(applyOverride(row, "sv-SE", "Ny")).toBe(row);
  });
});

describe("patching pages", () => {
  it("finds the key owning a message id", () => {
    const target = key("cart.empty", { "da-DK": cell("m1") });
    const other = key("cart.total", { "da-DK": cell("m2") });

    expect(findKeyByMessageId(page([other, target]), "m1")).toBe(target);
    expect(findKeyByMessageId(page([other]), "m1")).toBeUndefined();
  });

  it("patches the row holding the message and preserves the rest by reference", () => {
    const other = key("cart.total", { "da-DK": cell("m2") });
    const source = page([other, key("cart.empty", { "da-DK": cell("m1") })]);

    const patched = patchPage(source, "m1", (row, locale) => applyOverride(row, locale, "Ny"));

    expect(patched.items[0]).toBe(other);
    expect(patched.items[1]?.cells["da-DK"]?.overrideValue).toBe("Ny");
  });

  it("returns the same page reference when nothing matches, so react-query can skip a render", () => {
    const source = page([key("cart.total", { "da-DK": cell("m2") })]);

    expect(patchPage(source, "missing", (row) => row)).toBe(source);
  });

  it("patches across loaded pages and leaves untouched pages by reference", () => {
    const first = page([key("a", { "da-DK": cell("m1") })]);
    const second = page([key("b", { "da-DK": cell("m2") })], { page: 2 });
    const data = { pages: [first, second], pageParams: [1, 2] } as InfiniteData<MessageKeyList>;

    const patched = patchInfinite(data, "m2", (row, locale) => applyOverride(row, locale, "Ny"));

    expect(patched?.pages[0]).toBe(first);
    expect(patched?.pages[1]?.items[0]?.cells["da-DK"]?.overrideValue).toBe("Ny");
  });

  it("handles an empty cache", () => {
    expect(patchInfinite(undefined, "m1", (row) => row)).toBeUndefined();
  });
});

describe("flattenKeys", () => {
  it("concatenates loaded pages in order", () => {
    const data = {
      pages: [page([key("a", {})]), page([key("b", {})], { page: 2 })],
      pageParams: [1, 2],
    } as InfiniteData<MessageKeyList>;

    expect(flattenKeys(data).map((item) => item.key)).toEqual(["a", "b"]);
  });

  it("drops a key a later page repeats", () => {
    // A sync inserting rows mid-scroll shifts the offset window, so the same key can arrive twice.
    // Rendering it twice would give two rows the same React key.
    const duplicate = key("a", {});
    const data = {
      pages: [page([duplicate, key("b", {})]), page([duplicate, key("c", {})], { page: 2 })],
      pageParams: [1, 2],
    } as InfiniteData<MessageKeyList>;

    expect(flattenKeys(data).map((item) => item.key)).toEqual(["a", "b", "c"]);
  });

  it("keeps the same key from two different sources", () => {
    const first = key("a", {});
    const second = { ...key("a", {}), sourceId: "source-2" };
    const data = {
      pages: [page([first, second])],
      pageParams: [1],
    } as InfiniteData<MessageKeyList>;

    expect(flattenKeys(data)).toHaveLength(2);
  });
});

describe("paging", () => {
  it("reads the total from the most recent page", () => {
    const data = {
      pages: [page([], { total: 10 }), page([], { total: 12, page: 2 })],
      pageParams: [1, 2],
    } as InfiniteData<MessageKeyList>;

    expect(totalOf(data)).toBe(12);
    expect(totalOf(undefined)).toBe(0);
  });

  it("asks for the next page until everything matching is loaded", () => {
    const first = page([key("a", {}), key("b", {})], { total: 3 });
    const second = page([key("c", {})], { total: 3, page: 2 });

    expect(nextPageParam(first, [first])).toBe(2);
    expect(nextPageParam(second, [first, second])).toBeUndefined();
  });

  it("stops when a page comes back empty", () => {
    const empty = page([], { total: 0 });

    expect(nextPageParam(empty, [empty])).toBeUndefined();
  });
});
