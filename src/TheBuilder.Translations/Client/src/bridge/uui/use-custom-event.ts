import { useEffect, useRef, type RefObject } from "react";

/**
 * Subscribes to an event React cannot express as a prop.
 *
 * React 19 does dispatch `onChange`, `onInput`, `onClick`, `onKeyDown`, `onFocus` and `onBlur` on
 * custom elements, so those need no help. Hyphenated names (`uui-combobox-change`) are not React
 * event names and would be set as an attribute instead, so they have to be bound directly.
 *
 * The handler is held in a ref so a new closure on every render does not detach and re-attach the
 * listener, which would drop events fired mid-render.
 */
export const useCustomEvent = <TElement extends HTMLElement, TEvent extends Event = Event>(
  ref: RefObject<TElement | null>,
  type: string,
  handler: (event: TEvent) => void,
): void => {
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const listener = (event: Event) => latest.current(event as TEvent);
    element.addEventListener(type, listener);
    return () => element.removeEventListener(type, listener);
  }, [ref, type]);
};

/**
 * Reads the value of the element that actually dispatched an event.
 *
 * UUI elements dispatch from inside their shadow root, so `event.target` can be the inner control
 * rather than the custom element. `composedPath()[0]` is what the backoffice's own components use.
 */
export const valueOf = (event: Event): string => {
  const source = event.composedPath()[0] ?? event.target;
  return typeof source === "object" && source !== null && "value" in source
    ? String((source as { value: unknown }).value ?? "")
    : "";
};
