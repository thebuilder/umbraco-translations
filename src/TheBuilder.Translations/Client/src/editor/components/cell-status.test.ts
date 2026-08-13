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
    expect(cellStatus(cell("Default")).text).toBeNull();
  });

  it("speaks up only where the row differs", () => {
    expect(cellStatus(undefined).text).toBe("Not translated");
    expect(cellStatus(cell("Overridden", true)).text).toBe("Customised");
    expect(cellStatus(cell("NeedsReview", true)).text).toBeTruthy();
    expect(cellStatus(cell("Removed", true)).text).toBeTruthy();
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
