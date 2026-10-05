import { describe, expect, it } from "vitest";
import { type Token, tokenize } from "./tokens.js";

const kinds = (tokens: Token[]) => tokens.map((token) => `${token.kind}:${token.text}`);

/*
 * The field draws these behind a transparent textarea, so anything other than the exact input
 * moves every glyph after it out from under the caret. Half-typed syntax is the normal state of a
 * field being edited, so most of these are deliberately broken.
 */
const LOSSLESS = [
  "Welcome, {name}!",
  "{count, plural, =0 {No results} one {# result} other {# results}}",
  "{gender, select, female {She} other {{count, plural, one {# them} other {# them}}}}",
  "Arrives {date, date, medium}",
  "Price {amount, number, ::currency/EUR}",
  "It''s '{not a placeholder}' and Il n'y a {count}",
  "Unclosed {name",
  "Stray } brace {",
  "{count, plural, one {",
  "{,}{}{{}}",
  "",
];

describe("tokenize", () => {
  it.each(LOSSLESS)("gives back exactly what it was given: %j", (text) => {
    for (const format of ["Icu", "I18NextV4", "PlainText"] as const) {
      expect(
        tokenize(text, format)
          .map((token) => token.text)
          .join("")
      ).toBe(text);
    }
  });

  it("picks the placeholder out of the words around it", () => {
    expect(kinds(tokenize("Welcome, {name}!", "Icu"))).toEqual([
      "text:Welcome, ",
      "punct:{",
      "name:name",
      "punct:}",
      "text:!",
    ]);
  });

  it("tells the structure of a plural from the words in its branches", () => {
    expect(kinds(tokenize("{count, plural, one {# item} other {# items}}", "Icu"))).toEqual([
      "punct:{",
      "name:count",
      "punct:,",
      "type: plural",
      "punct:,",
      "option: one ",
      "punct:{",
      "hash:#",
      "text: item",
      "punct:}",
      "option: other ",
      "punct:{",
      "hash:#",
      "text: items",
      "punct:}",
      "punct:}",
    ]);
  });

  it("leaves a # alone outside a plural, where it is just a character", () => {
    expect(kinds(tokenize("Order #{id}", "Icu"))).toEqual([
      "text:Order #",
      "punct:{",
      "name:id",
      "punct:}",
    ]);
  });

  it("treats quoted braces as the text they are", () => {
    expect(kinds(tokenize("Use '{name}' literally", "Icu"))).toEqual([
      "text:Use '{name}' literally",
    ]);
  });

  it("marks i18next interpolation and nesting", () => {
    expect(kinds(tokenize("Hi {{name}}, $t(common.welcome)", "I18NextV4"))).toEqual([
      "text:Hi ",
      "punct:{{",
      "name:name",
      "punct:}}",
      "text:, ",
      "name:$t(common.welcome)",
    ]);
  });

  it("has nothing to mark in plain text", () => {
    expect(kinds(tokenize("Hi {name}", "PlainText"))).toEqual(["text:Hi {name}"]);
  });
});
