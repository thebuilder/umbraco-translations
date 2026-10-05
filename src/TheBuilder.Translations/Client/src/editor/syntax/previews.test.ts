import { describe, expect, it } from "vitest";
import { previewsFor } from "./previews.js";

const labels = (text: string, locale = "en") =>
  previewsFor(text, locale).map((preview) => preview.label);

describe("previewsFor", () => {
  it("shows a plural once per branch, with a count that lands in each", () => {
    // `other` is 2, not 0: the =0 branch has already claimed nought.
    expect(labels("{count, plural, =0 {No results} one {# result} other {# results}}")).toEqual([
      "count = 0",
      "count = 1",
      "count = 2",
    ]);
  });

  it("picks the counts from the language's own plural rules", () => {
    // Polish puts 2-4 in `few`, nought and 5 upwards in `many`, and keeps `other` for fractions.
    expect(labels("{n, plural, one {#} few {#} many {#} other {#}}", "pl")).toEqual([
      "n = 1",
      "n = 2",
      "n = 0",
      "n = 1.5",
    ]);
  });

  it("takes the offset off before choosing a category, as the formatter does", () => {
    // offset:1 puts n=2 in `one` (2 - 1 = 1), not n=1, which the formatter would read as nought.
    expect(
      labels(
        "{n, plural, offset:1 =0 {nobody} =1 {you} one {you and one other} other {you and # others}}"
      )
    ).toEqual(["n = 0", "n = 1", "n = 2", "n = 3"]);
  });

  it("shows a select once per branch, under the branch's own name", () => {
    expect(labels("{gender, select, female {She} male {He} other {They}}")).toEqual([
      "gender = female",
      "gender = male",
      "gender = other",
    ]);
  });

  it("renders each case, holding the other arguments still and leaving plain ones as gaps", () => {
    expect(
      previewsFor(
        "{name} has {count, plural, =0 {nothing} one {# item} other {# items}}",
        "en"
      ).map((preview) => preview.parts)
    ).toEqual([
      [{ gap: "name" }, " has nothing"],
      [{ gap: "name" }, " has 1 item"],
      [{ gap: "name" }, " has 2 items"],
    ]);
  });

  it("writes numbers the way the language does", () => {
    expect(previewsFor("Betal {amount, number}", "da-DK")[0]?.parts).toEqual(["Betal 1.234,5"]);
  });

  it("previews a message with no branches once, for how its numbers and dates are written", () => {
    expect(labels("Pay {amount, number}")).toEqual([""]);
    expect(labels("Arrives {date, date, medium}")).toEqual([""]);
  });

  it("has nothing to add for plain placeholders, which the field already shows", () => {
    expect(labels("Welcome, {name}!")).toEqual([]);
  });

  it("has nothing to show for plain text, or for text that does not parse yet", () => {
    expect(labels("Welcome!")).toEqual([]);
    expect(labels("{count, plural, one {")).toEqual([]);
  });
});
