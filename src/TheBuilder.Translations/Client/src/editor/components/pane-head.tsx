import type { Ref } from "react";
import { Button } from "../../bridge/uui/index.js";
import type { EditingMode } from "../state/editing-mode.js";
import type { EditTarget } from "../state/target.js";
import type { CellStatus } from "./cell-status.js";
import { Chevron, Cross } from "./glyphs.js";
import { MODIFIER } from "./shortcuts.js";

/**
 * What the pane is showing, and the ways out of it.
 *
 * The key names the row; the badge beside it is the one-word version of whatever callout the body
 * spells out. The step control and the close button are separated deliberately: stepping stays
 * inside the same job, and closing ends it.
 */
export const PaneHead = ({
  target,
  status,
  position,
  mode,
  previous,
  next,
  heading,
  select,
  close,
}: {
  target: EditTarget;
  status: CellStatus;
  /** Where this row sits in the result, so a long queue says how much of it is left. */
  position?: { index: number; total: number };
  mode: EditingMode;
  previous?: EditTarget;
  next?: EditTarget;
  /** Focused instead of the field when there is nothing to type into. */
  heading: Ref<HTMLParagraphElement>;
  select: (target: EditTarget) => void;
  close: () => void;
}) => (
  <div className="pane__head">
    <div className="pane__identity">
      <p className="pane__key" ref={heading} tabIndex={-1}>
        <span className="pane__namespace">{target.namespace}.</span>
        {target.key}
      </p>
      {status.text ? (
        <span
          className={status.state === "Removed" ? "badge badge--danger" : "badge badge--warning"}
        >
          {status.text}
        </span>
      ) : null}
    </div>

    <div className="pane__controls">
      {position ? (
        <span className="pane__position">
          {position.index.toLocaleString()} of {position.total.toLocaleString()}
          {/* The queue is worked an item at a time, and the keystroke that does it is the
              difference between typing and reaching for the mouse a thousand times. Said beside
              how much is left, because that is where somebody looks to ask how long this takes. */}
          {mode === "queue" && next ? (
            <span className="pane__shortcut"> · ⇧{MODIFIER}↵ next</span>
          ) : null}
        </span>
      ) : null}
      {/* The pair is one control with two directions, so it is spaced as one and the close
          button keeps the gap that says it does something else entirely. */}
      <span className="pane__step">
        <Button
          disabled={!previous}
          icon
          keyShortcuts="Meta+ArrowUp Control+ArrowUp"
          label="Previous translation"
          onClick={() => previous && select(previous)}
          title={`Previous translation (${MODIFIER}↑)`}
        >
          <Chevron className="pane__chevron" direction="up" />
        </Button>
        <Button
          disabled={!next}
          icon
          keyShortcuts="Meta+ArrowDown Control+ArrowDown"
          label="Next translation"
          onClick={() => next && select(next)}
          title={`Next translation (${MODIFIER}↓)`}
        >
          <Chevron className="pane__chevron" direction="down" />
        </Button>
      </span>
      <Button icon label="Close editor" onClick={close}>
        <Cross className="pane__cross" />
      </Button>
    </div>
  </div>
);
