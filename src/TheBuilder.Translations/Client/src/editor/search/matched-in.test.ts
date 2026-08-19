import { describe, expect, it } from "vitest";
import type { MessageCell, MessageKey } from "../../api/generated/models.js";
import { matchedElsewhere, matchedIn, type MatchedInOptions } from "./matched-in.js";

const cell = (locale: string, value: string): MessageCell => ({
  id: `m-${locale}`, locale, defaultValue: value, overrideValue: null,
  hasOverride: false, needsReview: false, truncated: false, state: "Default",
  version: null, updatedAt: null, updatedBy: null,
});

const key = ({
  name = "cart.empty",
  cells = {},
  matchedLocales = [],
}: {
  name?: string;
  cells?: Record<string, MessageCell>;
  matchedLocales?: string[];
} = {}): MessageKey => ({
  sourceId: "source-1",
  namespace: "website",
  key: name,
  format: "Icu",
  arguments: {},
  cells,
  coverage: {},
  matchedLocales,
});

const names: Record<string, string> = {
  "da-DK": "Danish", "en-US": "English", "de-DE": "German", "sv-SE": "Swedish",
};

const options = (overrides: Partial<MatchedInOptions> = {}): MatchedInOptions => ({
  editing: "da-DK",
  comparison: "en-US",
  editingName: "Danish",
  comparisonName: "English",
  nameOf: (locale) => names[locale] ?? locale,
  term: "",
  mode: "search",
  ...overrides,
});

describe("matchedIn", () => {
  it("says nothing when the leading words are the hit", () => {
    // The highlight marks it where it stands. Repeating it under every row is a label down the
    // whole list saying what the reader can already see.
    expect(matchedIn(key({ matchedLocales: ["da-DK"] }), options({ term: "kurv" }))).toBeNull();
  });

  it("names the quiet column when the hit is only there", () => {
    expect(matchedIn(key({ matchedLocales: ["en-US"] }), options({ term: "cart" }))).toBe("English");
  });

  it("names a language the list has no column for", () => {
    // The whole point of a locale-blind search: somebody was handed the German and has to fix the
    // Danish, and neither column would otherwise explain why this row came back.
    expect(matchedIn(key({ matchedLocales: ["de-DE"] }), options({ term: "Warenkorb" }))).toBe("German");
  });

  it("names every one of them", () => {
    expect(matchedIn(key({ matchedLocales: ["de-DE", "sv-SE"] }), options({ term: "korg" })))
      .toBe("German, Swedish");
  });

  it("names the key when no language matched at all", () => {
    // The words above the key look unrelated to what was typed, so the identifier is the only
    // thing that can have made this a result.
    expect(matchedIn(key({ name: "cart.empty" }), options({ term: "cart.empty" }))).toBe("the key");
  });

  it("says nothing when nothing was searched for", () => {
    expect(matchedIn(key({ matchedLocales: ["de-DE"] }), options({ term: "   " }))).toBeNull();
  });

  it("follows the swap when the reference leads the row", () => {
    // In queue mode the reference is the text being read and the language being written is the
    // empty space beside it, so a hit in the reference is the one that needs no words.
    const queue = options({ term: "cart", mode: "queue" });

    expect(matchedIn(key({ matchedLocales: ["en-US"] }), queue)).toBeNull();
    expect(matchedIn(key({ matchedLocales: ["da-DK"] }), queue)).toBe("Danish");
    expect(matchedIn(key({ matchedLocales: ["de-DE"] }), queue)).toBe("German");
  });

  it("prefers the server's answer over the cells in hand", () => {
    // The cells are previews of two languages; the server searched the whole text of all of them.
    // Believing the cells here would drop the hit the row exists to report.
    const row = key({
      cells: { "da-DK": cell("da-DK", "Din kurv er tom") },
      matchedLocales: ["sv-SE"],
    });

    expect(matchedIn(row, options({ term: "varukorg" }))).toBe("Swedish");
  });

  it("falls back to the cells when the server does not answer at all", () => {
    // An older server sends no such field. Claiming nothing matched would be a lie about a row
    // that is demonstrably a result.
    const row = key({ cells: { "de-DE": cell("de-DE", "Ihr Warenkorb ist leer") } });
    delete (row as { matchedLocales?: string[] }).matchedLocales;

    expect(matchedIn(row, options({ term: "Warenkorb" }))).toBe("German");
  });

  it("matches the same text the highlight marks, case and all", () => {
    expect(matchedIn(key({ name: "cart.empty" }), options({ term: "CART.EMPTY" }))).toBe("the key");
  });
});

describe("matchedElsewhere", () => {
  it("counts only the languages with no column", () => {
    expect(matchedElsewhere(key({ matchedLocales: ["en-US", "da-DK", "de-DE"] }), "x", ["da-DK", "en-US"]))
      .toEqual(["de-DE"]);
  });

  it("is empty with no search, whatever the server last said", () => {
    expect(matchedElsewhere(key({ matchedLocales: ["de-DE"] }), "", ["da-DK", "en-US"])).toEqual([]);
  });

  it("treats a language nobody chose as one with no column", () => {
    expect(matchedElsewhere(key({ matchedLocales: ["de-DE"] }), "x", ["da-DK", null])).toEqual(["de-DE"]);
  });
});
