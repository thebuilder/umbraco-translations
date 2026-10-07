import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageKey } from "../../api/generated/models.js";
import { type EditTarget, targetId } from "../state/target.js";
import { type ListProgress, leftResult, useEditorSelection } from "./use-editor-selection.js";

// Unsaved text is kept in session storage; each test starts without any.
beforeEach(() => sessionStorage.clear());

const target = (key: string): EditTarget => ({
  sourceId: "s1",
  namespace: "website",
  key,
  locale: "da",
});

const row = (key: string): MessageKey => ({
  sourceId: "s1",
  namespace: "website",
  key,
  format: "Icu",
  arguments: {},
  cells: {},
  coverage: {},
  matchedLocales: [],
});

const settled: ListProgress = {
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

/** The hook over a list, which a test can change underneath it the way a search would. */
const selection = (keys: MessageKey[] = [row("a"), row("b"), row("c")]) => {
  const onKept = vi.fn();
  const hook = renderHook(
    ({ rows }: { rows: MessageKey[] }) =>
      useEditorSelection({
        locale: "da",
        referenceLocale: "en",
        update: vi.fn(),
        keys: rows,
        progress: settled,
        onKept,
      }),
    { initialProps: { rows: keys } }
  );
  return { ...hook, onKept };
};

describe("the open translation", () => {
  it("knows its neighbours in the list", () => {
    const { result } = selection();
    act(() => result.current.select(target("b")));

    expect(result.current.open?.target).toEqual(target("b"));
    expect(result.current.open?.previous).toEqual(target("a"));
    expect(result.current.open?.next).toEqual(target("c"));
  });

  it("claims focus once, because it was opened on purpose", () => {
    // An editor mounting again because its row scrolled back into view must not take the caret.
    const { result } = selection();
    act(() => result.current.select(target("a")));

    expect(result.current.open?.claimFocus()).toBe(true);
    expect(result.current.open?.claimFocus()).toBe(false);
  });
});

describe("leaving the result", () => {
  it("closes, keeps the unsaved text, and says so", () => {
    const { result, rerender, onKept } = selection();
    act(() => result.current.select(target("a")));
    act(() => result.current.open?.drafts.set(target("a"), "Halvskrevet"));

    rerender({ rows: [row("b")] });

    expect(result.current.open).toBeUndefined();
    expect(onKept).toHaveBeenCalledWith(target("a"));
    // Still there for when it is opened again.
    act(() => result.current.select(target("b")));
    expect(result.current.open?.drafts.get(targetId(target("a")))).toBe("Halvskrevet");
  });

  it("closes quietly when there was nothing to keep", () => {
    const { result, rerender, onKept } = selection();
    act(() => result.current.select(target("a")));

    rerender({ rows: [row("b")] });

    expect(result.current.open).toBeUndefined();
    expect(onKept).not.toHaveBeenCalled();
  });
});

describe("unsaved text", () => {
  it("never stands in the way: another row opens, and the text stays for the row it was typed in", () => {
    const { result } = selection();
    act(() => result.current.select(target("a")));
    act(() => result.current.open?.drafts.set(target("a"), "Halvskrevet"));

    act(() => result.current.select(target("b")));

    expect(result.current.open?.target).toEqual(target("b"));
    expect(result.current.drafts.get(targetId(target("a")))).toBe("Halvskrevet");
  });

  it("closes without asking, and keeps the text", () => {
    const { result } = selection();
    act(() => result.current.select(target("a")));
    act(() => result.current.open?.drafts.set(target("a"), "Halvskrevet"));

    act(() => result.current.open?.close());

    expect(result.current.open).toBeUndefined();
    expect(result.current.drafts.get(targetId(target("a")))).toBe("Halvskrevet");
  });
});
