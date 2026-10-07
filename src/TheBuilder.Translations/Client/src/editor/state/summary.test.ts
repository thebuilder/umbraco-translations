import { describe, expect, it } from "vitest";
import type { LocaleFacet } from "../../api/generated/models.js";
import { defaultFilters } from "./filters.js";
import { workInList } from "./summary.js";

const danish = (overrides: Partial<LocaleFacet> = {}): LocaleFacet => ({
  code: "da-DK",
  name: "Danish",
  isDefault: false,
  isConfigured: true,
  messageCount: 0,
  overriddenCount: 0,
  needsReviewCount: 0,
  absentKeyCount: 115,
  ...overrides,
});

describe("workInList", () => {
  it("counts the list beyond the language's messages, not the language's own gap", () => {
    // Danish from German: 24 keys in the list, none written. The language itself is missing 115
    // keys, but most of those are in neither language on screen and so not in the list at all.
    expect(workInList(24, danish(), defaultFilters).notWritten).toBe(24);
    expect(workInList(115, danish({ messageCount: 66 }), defaultFilters).notWritten).toBe(49);
  });

  it("offers the language's changed defaults, every one of which is in the list", () => {
    expect(workInList(115, danish({ needsReviewCount: 3 }), defaultFilters).defaultChanged).toBe(3);
  });

  it("offers nothing while the list is narrowed, where the counts no longer describe it", () => {
    for (const narrowed of [
      { namespace: "checkout" },
      { keyPrefix: "checkout.payment" },
      { query: "basket" },
      { status: "Overridden" as const },
    ]) {
      expect(
        workInList(20, danish({ needsReviewCount: 3 }), { ...defaultFilters, ...narrowed })
      ).toEqual({ notWritten: 0, defaultChanged: 0 });
    }
  });

  it("offers nothing before the language is known", () => {
    expect(workInList(20, undefined, defaultFilters)).toEqual({ notWritten: 0, defaultChanged: 0 });
  });
});
