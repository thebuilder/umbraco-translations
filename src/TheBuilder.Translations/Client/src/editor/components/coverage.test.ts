import { describe, expect, it } from "vitest";
import type { LocaleFacet, MessageKey, MessageLocaleState } from "../../api/generated/models.js";
import { MAXIMUM_DOTS, coverageOf, dotGlyph } from "./coverage.js";

const locale = (code: string): LocaleFacet => ({
  code,
  name: code,
  isDefault: false,
  isConfigured: true,
  messageCount: 1,
  overriddenCount: 0,
  needsReviewCount: 0,
  absentKeyCount: 0,
});

const key = (coverage: Record<string, MessageLocaleState>): MessageKey => ({
  sourceId: "source-1",
  namespace: "website",
  key: "cart.empty",
  format: "Icu",
  arguments: {},
  cells: {},
  coverage,
});

describe("coverageOf", () => {
  it("follows the order the toolbar lists locales, so dots line up down the page", () => {
    const coverage = coverageOf(
      key({ "da-DK": "Overridden", "en-US": "Default" }),
      [locale("en-US"), locale("da-DK")],
    );

    expect(coverage.dots.map((dot) => dot.locale)).toEqual(["en-US", "da-DK"]);
  });

  it("reports a locale the key has no entry for as absent rather than omitting it", () => {
    const coverage = coverageOf(key({ "en-US": "Default" }), [locale("en-US"), locale("de-DE")]);

    expect(coverage.dots).toEqual([
      { locale: "en-US", state: "Default" },
      { locale: "de-DE", state: "Absent" },
    ]);
  });

  it("collapses locales past the dot limit into a count", () => {
    const many = Array.from({ length: MAXIMUM_DOTS + 3 }, (_, index) => locale(`l${index}`));

    const coverage = coverageOf(key({}), many);

    expect(coverage.dots).toHaveLength(MAXIMUM_DOTS);
    expect(coverage.overflow).toBe(3);
  });

  it("summarises as counts, because reading a dozen locales aloud is unusable", () => {
    const coverage = coverageOf(
      key({ "en-US": "Default", "da-DK": "NeedsReview", "de-DE": "Absent" }),
      [locale("en-US"), locale("da-DK"), locale("de-DE")],
    );

    expect(coverage.label).toContain("translated in 2 of 3 locales");
    expect(coverage.label).toContain("missing in de-DE");
    expect(coverage.label).toContain("1 awaiting review");
  });

  it("says nothing about review or gaps when there are none", () => {
    const coverage = coverageOf(key({ "en-US": "Default" }), [locale("en-US")]);

    expect(coverage.label).toBe("translated in 1 of 1 locales");
  });

  it("handles a site with no locales at all", () => {
    const coverage = coverageOf(key({}), []);

    expect(coverage.dots).toEqual([]);
    expect(coverage.label).toBe("No locales");
  });
});

describe("dotGlyph", () => {
  it("gives every state its own shape, so the readout survives without colour", () => {
    const states: MessageLocaleState[] = ["Default", "Overridden", "NeedsReview", "Removed", "Absent"];
    const glyphs = states.map(dotGlyph);

    expect(new Set(glyphs).size).toBe(states.length);
  });
});
