import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSearchShortcut } from "./use-search-shortcut.js";

afterEach(cleanup);

const Harness = ({ focus }: { focus: () => void }) => {
  useSearchShortcut(focus);
  return (
    <>
      <input data-testid="search" />
      <textarea data-testid="editor" />
      <div data-testid="plain" tabIndex={-1} />
    </>
  );
};

const press = (key: string, target: Element, init: KeyboardEventInit = {}) =>
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, composed: true, ...init })
    );
  });

describe("useSearchShortcut", () => {
  it("focuses search on Ctrl+K and on Cmd+K", () => {
    const focus = vi.fn();
    const { getByTestId } = render(<Harness focus={focus} />);

    press("k", getByTestId("plain"), { ctrlKey: true });
    press("k", getByTestId("plain"), { metaKey: true });

    expect(focus).toHaveBeenCalledTimes(2);
  });

  it("focuses search on a bare slash", () => {
    const focus = vi.fn();
    const { getByTestId } = render(<Harness focus={focus} />);

    press("/", getByTestId("plain"));

    expect(focus).toHaveBeenCalledOnce();
  });

  it("leaves the slash alone while a translation is being typed", () => {
    const focus = vi.fn();
    const { getByTestId } = render(<Harness focus={focus} />);

    // A slash is a character. Stealing it here would delete it from the text being written.
    press("/", getByTestId("editor"));
    press("/", getByTestId("search"));

    expect(focus).not.toHaveBeenCalled();
  });

  it("still answers Ctrl+K from inside a field, because it is not a character", () => {
    const focus = vi.fn();
    const { getByTestId } = render(<Harness focus={focus} />);

    press("k", getByTestId("editor"), { ctrlKey: true });

    expect(focus).toHaveBeenCalledOnce();
  });

  it("ignores a keystroke something else has already handled", () => {
    const focus = vi.fn();
    const { getByTestId } = render(<Harness focus={focus} />);
    const target = getByTestId("plain");

    act(() => {
      const event = new KeyboardEvent("keydown", {
        key: "/",
        bubbles: true,
        composed: true,
        cancelable: true,
      });
      event.preventDefault();
      target.dispatchEvent(event);
    });

    expect(focus).not.toHaveBeenCalled();
  });
});
