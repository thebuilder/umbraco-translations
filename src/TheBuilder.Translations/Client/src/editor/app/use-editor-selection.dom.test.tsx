import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { type EditTarget, targetId } from "../state/target.js";
import { leftResult, useEditorSelection } from "./use-editor-selection.js";

const target = (key: string): EditTarget => ({
  sourceId: "s1",
  namespace: "website",
  key,
  locale: "da",
});

const settled = {
  isSuccess: true,
  isFetching: false,
  isPlaceholderData: false,
  hasNextPage: false,
};

describe("leftResult", () => {
  it("is true only for a settled, complete result without the row", () => {
    expect(leftResult(settled, false)).toBe(true);
    expect(leftResult(settled, true)).toBe(false);
  });

  it("waits while a new search is loading, because the list still holds the old one", () => {
    expect(leftResult({ ...settled, isFetching: true }, false)).toBe(false);
    expect(leftResult({ ...settled, isPlaceholderData: true }, false)).toBe(false);
  });

  it("keeps a row that may be on a page not loaded yet", () => {
    // Ranked past the first page is still a result, only one nobody has scrolled to.
    expect(leftResult({ ...settled, hasNextPage: true }, false)).toBe(false);
  });
});

const selection = () =>
  renderHook(() => useEditorSelection({ locale: "da", referenceLocale: "en", update: vi.fn() }));

describe("unsaved text", () => {
  it("is kept when the row leaves the result, and given back when it is opened again", () => {
    const { result } = selection();
    act(() => result.current.select(target("a")));
    act(() => result.current.editing.drafts.set(targetId(target("a")), "Halvskrevet"));

    let kept: EditTarget | undefined;
    act(() => {
      kept = result.current.drop();
    });

    expect(kept).toEqual(target("a"));
    expect(result.current.selected).toBeUndefined();
    expect(result.current.editing.drafts.get(targetId(target("a")))).toBe("Halvskrevet");
  });

  it("is forgotten when it is discarded", () => {
    const { result } = selection();
    act(() => result.current.select(target("a")));
    act(() => result.current.editing.drafts.set(targetId(target("a")), "Halvskrevet"));
    act(() => result.current.editing.close());
    expect(result.current.editing.pending).toBe("close");

    act(() => result.current.editing.discard());

    expect(result.current.editing.drafts.get(targetId(target("a")))).toBeUndefined();
  });

  it("says nothing was kept when there was nothing to keep", () => {
    const { result } = selection();
    act(() => result.current.select(target("a")));

    let kept: EditTarget | undefined = target("x");
    act(() => {
      kept = result.current.drop();
    });

    expect(kept).toBeUndefined();
  });
});

describe("focus", () => {
  it("is claimed once, by the translation that was opened", () => {
    // An editor mounting again because its row scrolled back into view must not take the caret.
    const { result } = selection();
    act(() => result.current.select(target("a")));

    expect(result.current.editing.claimFocus(target("b"))).toBe(false);
    expect(result.current.editing.claimFocus(target("a"))).toBe(true);
    expect(result.current.editing.claimFocus(target("a"))).toBe(false);
  });
});
