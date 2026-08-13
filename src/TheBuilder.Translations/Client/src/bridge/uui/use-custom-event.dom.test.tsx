import { render, cleanup } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCustomEvent, valueOf } from "./use-custom-event.js";

afterEach(cleanup);

/**
 * A stand-in for a UUI element. Real custom elements cannot be upgraded in jsdom, and the point of
 * the hook is that it binds a listener directly rather than relying on React's event names.
 */
const Subject = ({ onEvent, type = "uui-combobox-change" }: {
  onEvent: (event: Event) => void;
  type?: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  useCustomEvent(ref, type, onEvent);
  return <div ref={ref} data-testid="element" />;
};

describe("useCustomEvent", () => {
  it("receives a hyphenated event React cannot express as a prop", () => {
    const onEvent = vi.fn();
    const { getByTestId } = render(<Subject onEvent={onEvent} />);

    getByTestId("element").dispatchEvent(new Event("uui-combobox-change"));

    expect(onEvent).toHaveBeenCalledOnce();
  });

  it("calls the latest handler without rebinding the listener", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { getByTestId, rerender } = render(<Subject onEvent={first} />);

    rerender(<Subject onEvent={second} />);
    getByTestId("element").dispatchEvent(new Event("uui-combobox-change"));

    // A new closure every render must not detach the listener, or events fired between the
    // detach and re-attach would be dropped.
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it("stops listening once the element unmounts", () => {
    const onEvent = vi.fn();
    const { getByTestId, unmount } = render(<Subject onEvent={onEvent} />);
    const element = getByTestId("element");

    unmount();
    element.dispatchEvent(new Event("uui-combobox-change"));

    expect(onEvent).not.toHaveBeenCalled();
  });

  it("survives a component that has not rendered its element yet", () => {
    const Late = () => {
      const ref = useRef<HTMLDivElement>(null);
      const [shown, setShown] = useState(false);
      useCustomEvent(ref, "uui-change", () => {});
      return shown ? <div ref={ref} /> : <button onClick={() => setShown(true)}>show</button>;
    };

    expect(() => render(<Late />)).not.toThrow();
  });
});

describe("valueOf", () => {
  it("reads the value from the element that dispatched the event", () => {
    const input = document.createElement("input");
    input.value = "da-DK";
    document.body.append(input);

    let seen = "";
    input.addEventListener("change", (event) => { seen = valueOf(event); });
    input.dispatchEvent(new Event("change", { composed: true }));

    expect(seen).toBe("da-DK");
    input.remove();
  });

  it("returns an empty string when the source carries no value", () => {
    const element = document.createElement("div");
    let seen = "unset";
    element.addEventListener("change", (event) => { seen = valueOf(event); });
    element.dispatchEvent(new Event("change"));

    expect(seen).toBe("");
  });
});
