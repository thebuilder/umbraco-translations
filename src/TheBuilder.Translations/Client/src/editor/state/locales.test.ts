import { describe, expect, it } from "vitest";
import type { LocaleFacet } from "../../api/generated/models.js";
import { defaultLocale } from "./locales.js";

const locale = (code: string, overrides: Partial<LocaleFacet> = {}): LocaleFacet => ({
  code,
  name: code,
  isDefault: false,
  isConfigured: true,
  messageCount: 0,
  overriddenCount: 0,
  needsReviewCount: 0,
  absentKeyCount: 0,
  ...overrides,
});

/**
 * The server reports which language it chose, but it has nothing to choose from until something has
 * been synchronised and answers with empty strings. Left as a language, that empty string names no
 * facet, and the strip ended up offering a menu it could not be used to pick anything from.
 */
describe("defaultLocale", () => {
  it("takes the site's own default", () => {
    expect(defaultLocale([locale("da-DK"), locale("en-US", { isDefault: true })])).toBe("en-US");
  });

  it("takes the only language there is when none is marked", () => {
    expect(defaultLocale([locale("en-US")])).toBe("en-US");
  });

  it("has nothing to offer before the facets arrive", () => {
    expect(defaultLocale([])).toBeNull();
  });
});
