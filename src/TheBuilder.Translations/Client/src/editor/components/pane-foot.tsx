import { Button } from "../../bridge/uui/index.js";
import type { EditingMode } from "../state/editing-mode.js";
import type { EditTarget } from "../state/target.js";

/**
 * The three states the footer reports before anything is pressed. An override the server has never
 * been given is absent rather than empty, and it arrives as either `null` or `undefined` depending
 * on which endpoint answered, so both mean "nothing written here yet".
 */
const describeDraftState = (dirty: boolean, overrideValue: string | null | undefined) => {
  if (dirty) {
    return "Unsaved changes";
  }
  if (overrideValue === null || overrideValue === undefined) {
    return "Nothing written here yet";
  }
  return "Your text is saved";
};

/**
 * No Cancel button. Leaving without saving is the close control in the header and Escape, both of
 * which already ask about unsaved text, and a third way to do it was crowding the one action
 * anybody came here to press.
 *
 * Which action is the obvious one depends on the job. Correcting a reported string ends with Save;
 * working down a queue ends with the next item, so there Save & next is the primary and Skip is the
 * way past a row that needs somebody else.
 */
export const PaneFoot = ({
  pending,
  canEdit,
  dirty,
  overrideValue,
  mode,
  next,
  savable,
  saving,
  select,
  commit,
  onKeepEditing,
  onDiscard,
}: {
  /** Set when leaving has been asked for and there is unsaved text in the way. */
  pending?: EditTarget | "close";
  canEdit: boolean;
  dirty: boolean;
  overrideValue: string | null | undefined;
  mode: EditingMode;
  next?: EditTarget;
  savable: boolean;
  saving: boolean;
  select: (target: EditTarget) => void;
  commit: (then: "close" | "next") => void;
  onKeepEditing: () => void;
  onDiscard: () => void;
}) => {
  if (pending) {
    return (
      <div className="pane__foot">
        <p className="pane__state">
          {pending === "close"
            ? "Close without saving your changes?"
            : "Open another translation without saving?"}
        </p>
        <span className="pane__actions">
          <Button look="primary" onClick={onKeepEditing}>
            Keep editing
          </Button>
          <Button look="danger" onClick={onDiscard}>
            Discard
          </Button>
        </span>
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="pane__foot">
        <p className="pane__state">You have view-only access to translations.</p>
      </div>
    );
  }

  return (
    <div className="pane__foot">
      <p className="pane__state">{describeDraftState(dirty, overrideValue)}</p>
      <span className="pane__actions">
        {mode === "queue" && next ? (
          <>
            <Button onClick={() => select(next)}>Skip</Button>
            <Button disabled={!savable} look="primary" onClick={() => commit("next")}>
              {saving ? "Saving…" : "Save & next"}
            </Button>
          </>
        ) : (
          <>
            {/* Not a second primary: two of them side by side leave neither reading as the
                obvious one, and this is the shortcut for a long review rather than the usual exit. */}
            {next ? (
              <Button disabled={!savable} onClick={() => commit("next")}>
                Save &amp; next
              </Button>
            ) : null}
            <Button disabled={!savable} look="primary" onClick={() => commit("close")}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        )}
      </span>
    </div>
  );
};
