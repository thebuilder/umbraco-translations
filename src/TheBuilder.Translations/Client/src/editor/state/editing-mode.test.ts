import { describe, expect, it } from "vitest";
import type { LocaleFacet } from "../../api/generated/models.js";
import { coverageOf, editingMode } from "./editing-mode.js";

const facet = (overrides: Partial<LocaleFacet>): LocaleFacet => ({
  code: "da",
  name: "Danish",
  isDefault: false,
  isConfigured: true,
  messageCount: 0,
  overriddenCount: 0,
  needsReviewCount: 0,
  absentKeyCount: 0,
  ...overrides,
});

describe("editingMode", () => {
  it("is the ordinary one for a language the application ships text in", () => {
    expect(
      editingMode(facet({ messageCount: 1284, overriddenCount: 118, absentKeyCount: 0 }))
    ).toBe("search");
  });

  it("is a queue for a language nothing has ever been written in", () => {
    expect(editingMode(facet({ messageCount: 0, absentKeyCount: 1284 }))).toBe("queue");
  });

  it("stays a queue once some of it has been written", () => {
    // The rows that exist are the ones somebody authored, which is what tells this apart from a
    // language the application ships: there is no default behind any of them to correct.
    expect(
      editingMode(facet({ messageCount: 412, overriddenCount: 412, absentKeyCount: 872 }))
    ).toBe("queue");
  });

  it("is not a queue once nothing is left absent, whatever else is true of it", () => {
    // A language whose every key is present is being maintained, not brought up from nothing, and
    // leading its rows with the reference would put the words being edited in the second column.
    expect(
      editingMode(facet({ messageCount: 1284, overriddenCount: 1284, absentKeyCount: 0 }))
    ).toBe("search");
  });

  it("assumes the ordinary job before the facts have arrived", () => {
    // Guessing "queue" while the facets load would swap the two columns under an editor's eyes the
    // moment they landed, which is the more disruptive of the two ways to be briefly wrong.
    expect(editingMode(undefined)).toBe("search");
  });
});

describe("coverageOf", () => {
  it("measures what has been written against every key there is", () => {
    expect(coverageOf(facet({ overriddenCount: 412 }), 1284)).toEqual({
      written: 412,
      total: 1284,
      fraction: 412 / 1284,
    });
  });

  it("does not run past the end when a language has rows the current key set does not", () => {
    // Keys removed from the source still carry text, so a locale can hold more than the live total.
    expect(coverageOf(facet({ overriddenCount: 20 }), 10).fraction).toBe(1);
  });

  it("has nothing to report before anything is synchronised", () => {
    expect(coverageOf(facet({}), 0).fraction).toBe(0);
  });
});
