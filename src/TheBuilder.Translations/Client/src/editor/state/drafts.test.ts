import { describe, expect, it, vi } from "vitest";
import { createDraftStore } from "./drafts.js";

describe("the draft store", () => {
  it("holds text by translation, and forgets it when given nothing", () => {
    const drafts = createDraftStore();
    drafts.set("a", "Halvskrevet");

    expect(drafts.get("a")).toBe("Halvskrevet");
    expect(drafts.has("a")).toBe(true);
    expect(drafts.has("b")).toBe(false);

    drafts.set("a", undefined);
    expect(drafts.has("a")).toBe(false);
  });

  it("tells its listeners when something changed, and only then", () => {
    // Every keystroke goes through here; telling every editor about a write that changed nothing
    // would re-render them all for it.
    const drafts = createDraftStore();
    const listener = vi.fn();
    const unsubscribe = drafts.subscribe(listener);

    drafts.set("a", "x");
    drafts.set("a", "x");
    drafts.set("b", undefined);
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    drafts.set("a", "y");
    expect(listener).toHaveBeenCalledOnce();
  });
});
