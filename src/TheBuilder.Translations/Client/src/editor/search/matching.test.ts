import { describe, expect, it } from "vitest";
import { matchesTerm, splitOnMatch } from "./matching.js";

const rendered = (parts: { text: string; match: boolean }[]) =>
  parts.map((part) => (part.match ? `[${part.text}]` : part.text)).join("");

describe("splitOnMatch", () => {
  it("leaves text alone when nothing is being searched for", () => {
    expect(splitOnMatch("Din kurv er tom", "")).toEqual([
      { text: "Din kurv er tom", match: false },
    ]);
    expect(splitOnMatch("Din kurv er tom", "   ")).toEqual([
      { text: "Din kurv er tom", match: false },
    ]);
  });

  it("marks a hit in the middle", () => {
    expect(rendered(splitOnMatch("Din kurv er tom", "kurv"))).toBe("Din [kurv] er tom");
  });

  it("marks every occurrence, not just the first", () => {
    expect(rendered(splitOnMatch("tom tom tom", "tom"))).toBe("[tom] [tom] [tom]");
  });

  it("matches regardless of case but keeps the text's own casing", () => {
    // The search itself is case-insensitive, so marking only exact-case runs would leave visible
    // hits unmarked. The marked runs come out of the original text, not the lowered copy.
    expect(rendered(splitOnMatch("Erik er ERGO", "er"))).toBe("[Er]ik [er] [ER]GO");
  });

  it("treats the term literally, because a regular expression would not survive a text field", () => {
    expect(rendered(splitOnMatch("cart.empty and cartXempty", "cart.empty"))).toBe(
      "[cart.empty] and cartXempty"
    );
    expect(rendered(splitOnMatch("a (b) c", "(b)"))).toBe("a [(b)] c");
    expect(rendered(splitOnMatch("100% done", "100%"))).toBe("[100%] done");
  });

  it("returns the whole text as one unmatched run when there is no hit", () => {
    expect(splitOnMatch("Din kurv er tom", "zzz")).toEqual([
      { text: "Din kurv er tom", match: false },
    ]);
  });

  it("handles a hit at each end", () => {
    expect(rendered(splitOnMatch("tom er tom", "tom"))).toBe("[tom] er [tom]");
    expect(rendered(splitOnMatch("kurv", "kurv"))).toBe("[kurv]");
  });

  it("ignores whitespace the editor typed around the term", () => {
    expect(rendered(splitOnMatch("Din kurv er tom", "  kurv  "))).toBe("Din [kurv] er tom");
  });

  it("never loses characters, whatever the split", () => {
    const text = "Vis alle {count} søgemuligheder";
    for (const term of ["", "vis", "{count}", "øge", "zzz", "  "]) {
      expect(
        splitOnMatch(text, term)
          .map((part) => part.text)
          .join("")
      ).toBe(text);
    }
  });
});

describe("matchesTerm", () => {
  it("finds the term the same way the highlighter does, so a row never says it matched where nothing is marked", () => {
    expect(matchesTerm("Welcome back, {name}!", "welcome back")).toBe(true);
    expect(matchesTerm("Velkommen tilbage", "welcome back")).toBe(false);
  });

  it("matches literally, because the server escapes the term into a LIKE pattern rather than a regex", () => {
    expect(matchesTerm("cart.empty", "cart.empty")).toBe(true);
    expect(matchesTerm("cartXempty", "cart.empty")).toBe(false);
    expect(matchesTerm("50% off", "%")).toBe(true);
  });

  it("is false for an empty search, which is not a match on everything", () => {
    expect(matchesTerm("anything", "")).toBe(false);
    expect(matchesTerm("anything", "   ")).toBe(false);
  });

  it("treats a language with no row as having nothing to match", () => {
    expect(matchesTerm(null, "welcome")).toBe(false);
    expect(matchesTerm(undefined, "welcome")).toBe(false);
  });
});
