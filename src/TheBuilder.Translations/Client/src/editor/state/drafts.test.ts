import { describe, expect, it, vi } from "vitest";
import { createDraftStore } from "./drafts.js";
import type { EditTarget } from "./target.js";

const target = (key: string): EditTarget => ({
  sourceId: "s1",
  namespace: "web",
  key,
  locale: "da",
});
const id = (key: string) => `s1|web|${key}|da`;

/** Storage that is only a map, so a test can look at what was written and read it back. */
const memory = (): Storage => {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: () => null,
    get length() {
      return values.size;
    },
  };
};

describe("the draft store", () => {
  it("holds text by translation, and forgets it when given nothing", () => {
    const drafts = createDraftStore(null);
    drafts.set(target("a"), "Halvskrevet", 3);

    expect(drafts.get(id("a"))).toBe("Halvskrevet");
    expect(drafts.has(id("a"))).toBe(true);
    expect(drafts.has(id("b"))).toBe(false);
    expect(drafts.all()).toEqual([{ target: target("a"), text: "Halvskrevet", version: 3 }]);

    drafts.set(target("a"), undefined);
    expect(drafts.has(id("a"))).toBe(false);
    expect(drafts.all()).toEqual([]);
  });

  it("tells its listeners when something changed, and only then", () => {
    // Every keystroke goes through here; telling every editor about a write that changed nothing
    // would re-render them all for it.
    const drafts = createDraftStore(null);
    const listener = vi.fn();
    const unsubscribe = drafts.subscribe(listener);

    drafts.set(target("a"), "x");
    drafts.set(target("a"), "x");
    drafts.set(target("b"), undefined);
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    drafts.set(target("a"), "y");
    expect(listener).toHaveBeenCalledOnce();
  });

  it("keeps the text across a new store over the same storage, as after leaving the section", () => {
    const storage = memory();
    createDraftStore(storage).set(target("a"), "Halvskrevet", 3);

    const again = createDraftStore(storage);

    expect(again.get(id("a"))).toBe("Halvskrevet");
    expect(again.all()[0]?.version).toBe(3);
  });

  it("starts empty from storage it cannot read", () => {
    const storage = memory();
    storage.setItem("thebuilder-translations:drafts", "{not json");

    expect(createDraftStore(storage).all()).toEqual([]);
  });
});
