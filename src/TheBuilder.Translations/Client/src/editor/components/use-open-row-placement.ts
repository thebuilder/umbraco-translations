import { type RefObject, useCallback, useLayoutEffect, useRef } from "react";

/**
 * Puts the open row where the editor expects it, before the frame is painted.
 *
 * A clicked row goes back under the pointer. Opening a row below an open one collapses that one
 * first, which pulled the clicked row up by however tall the old editor happened to be, so where it
 * was clicked is remembered and restored. Then, clicked or stepped to from the keyboard, the least
 * scrolling that shows the whole editor -- and never so much that its top goes out of view.
 *
 * Runs when a different translation opens, not when its position changes, so a list that reorders
 * under an open editor after a save does not yank the view back to it.
 *
 * Returns what the row's click handler calls before opening it.
 */
export const useOpenRowPlacement = ({
  scroller,
  openId,
  openIndex,
  scrollToIndex,
}: {
  scroller: RefObject<HTMLElement | null>;
  /** Which translation is open, as `targetId`, or null. */
  openId: string | null;
  /** Where it is in the list, for when its row is not rendered and has to be scrolled to first. */
  openIndex: number;
  scrollToIndex: (index: number) => void;
}) => {
  const clickedAt = useRef<{ id: string; top: number } | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: openId is the trigger. openIndex and scrollToIndex are read only for the fallback, and re-running when the list reorders under an open row is exactly what this must not do.
  useLayoutEffect(() => {
    const body = scroller.current;
    const anchor = clickedAt.current;
    clickedAt.current = null;
    if (openId === null || body === null) {
      return;
    }

    const open = body.querySelector<HTMLElement>(".grid__row--open");
    if (open === null) {
      // Not rendered: stepped to from the keyboard past the rows in view.
      if (openIndex >= 0) {
        scrollToIndex(openIndex);
      }
      return;
    }

    // Only for the row that was clicked: a click held up by the unsaved-changes question, and then
    // abandoned, must not place whatever opens next.
    if (anchor?.id === openId) {
      body.scrollTop += open.getBoundingClientRect().top - anchor.top;
    }

    const view = body.getBoundingClientRect();
    const box = open.getBoundingClientRect();
    if (box.top < view.top) {
      body.scrollTop -= view.top - box.top;
    } else if (box.bottom > view.bottom) {
      body.scrollTop += Math.min(box.bottom - view.bottom, box.top - view.top);
    }
  }, [openId]);

  return useCallback((id: string, row: HTMLElement) => {
    clickedAt.current = { id, top: row.getBoundingClientRect().top };
  }, []);
};
