import { describe, expect, it } from "vitest";
import type { MessageCell, MessageLocaleState } from "../../api/generated/models.js";
import { cellStatus, summarise } from "./cell-status.js";

const cell = (state: MessageLocaleState, hasOverride = false): MessageCell => ({
  id: "m1", locale: "da-DK", defaultValue: "Tekst", overrideValue: hasOverride ? "Min tekst" : null,
  hasOverride, needsReview: state === "NeedsReview", truncated: false, state,
  version: null, updatedAt: null, updatedBy: null,
});

describe("cellStatus", () => {
  it("says nothing for a row using the application text", () => {
    // The common case. Annotating it on every row buries the few rows that differ.
    expect(cellStatus(cell("Default"))).toEqual({ custom: false, text: null, warning: false, state: "Default" });
  });

  it("marks custom text rather than labelling it, because most rows would carry the label", () => {
    expect(cellStatus(cell("Overridden", true))).toEqual({ custom: true, text: null, warning: false, state: "Overridden" });
  });

  it("leaves an untranslated row to the value, which already says so", () => {
    expect(cellStatus(undefined)).toEqual({ custom: false, text: null, warning: false, state: null });
  });

  it("uses words only where the editor has something to decide", () => {
    expect(cellStatus(cell("NeedsReview", true)).text).toBe("App text changed");
    expect(cellStatus(cell("Removed", true)).text).toBeTruthy();
  });

  it("still marks custom text on a row that also needs attention", () => {
    // The two are independent: a row can need review and have custom text, and losing the mark
    // would make it look untouched at exactly the moment someone is deciding what to do with it.
    expect(cellStatus(cell("NeedsReview", true)).custom).toBe(true);
    expect(cellStatus(cell("NeedsReview", false)).custom).toBe(false);
  });

  it("emphasises only what asks the editor to act", () => {
    expect(cellStatus(cell("Overridden", true)).warning).toBe(false);
    expect(cellStatus(undefined).warning).toBe(false);
    expect(cellStatus(cell("NeedsReview", true)).warning).toBe(true);
    expect(cellStatus(cell("Removed", true)).warning).toBe(true);
  });
});

describe("summarise", () => {
  it("counts what an editor would act on", () => {
    const counts = summarise([
      cell("Default"), cell("Overridden", true), cell("NeedsReview", true), undefined,
    ]);

    expect(counts).toEqual({ customised: 2, needsReview: 1, missing: 1 });
  });

  it("does not count a removed row as customised, since it is not a live translation", () => {
    expect(summarise([cell("Removed", true)]).customised).toBe(0);
  });
});
