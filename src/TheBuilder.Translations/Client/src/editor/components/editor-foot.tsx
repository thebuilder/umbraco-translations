import { Button } from "../../bridge/uui/index.js";
import type { EditingMode } from "../state/editing-mode.js";
import type { EditTarget } from "../state/target.js";
import { EditorKeys } from "./shortcuts.js";

/**
 * The states the footer reports before anything is pressed. An override the server has never
 * been given is absent rather than empty, and it arrives as either `null` or `undefined` depending
 * on which endpoint answered, so both mean "nothing written here yet".
 */
const describeDraftState = (
  dirty: boolean,
  overrideValue: string | null | undefined,
  defaultValue: string | undefined
) => {
  if (dirty) {
    return "Unsaved changes";
  }
  if (overrideValue !== null && overrideValue !== undefined) {
    return "Your text is saved";
  }
  // The field starts from the application's text, so where there is some, that is what it holds.
  return defaultValue ? "Default text" : "Nothing written here yet";
};

/**
 * The bottom edge of the open row: what state the text is in, and the ways out.
 *
 * Which action is the obvious one depends on the job. Correcting a reported string ends with Save;
 * working down a queue ends with the next item, so there Save & next is the primary and Skip is the
 * way past a row that needs somebody else.
 */
export const EditorFoot = ({
  pending,
  canEdit,
  dirty,
  overrideValue,
  defaultValue,
  mode,
  next,
  savable,
  saving,
  select,
  commit,
  close,
  onKeepEditing,
  onDiscard,
}: {
  /** Set when leaving has been asked for and there is unsaved text in the way. */
  pending?: EditTarget | "close";
  canEdit: boolean;
  dirty: boolean;
  overrideValue: string | null | undefined;
  /** The default text, which the field holds until something replaces it. */
  defaultValue: string | undefined;
  mode: EditingMode;
  next?: EditTarget;
  savable: boolean;
  saving: boolean;
  select: (target: EditTarget) => void;
  commit: (then: "close" | "next") => void;
  close: () => void;
  onKeepEditing: () => void;
  onDiscard: () => void;
}) => {
  if (pending) {
    return (
      <div className="editor__foot editor__foot--asking">
        <p className="editor__state">
          {pending === "close"
            ? "Close without saving your changes?"
            : "Open another translation without saving?"}
        </p>
        <span className="editor__actions">
          <Button look="danger" onClick={onDiscard}>
            Discard
          </Button>
          <Button look="primary" onClick={onKeepEditing}>
            Keep editing
          </Button>
        </span>
      </div>
    );
  }

  const closeButton = (
    <Button className="button--quiet" label="Close editor" onClick={close}>
      Close
    </Button>
  );

  if (!canEdit) {
    return (
      <div className="editor__foot">
        <p className="editor__state">You have view-only access to translations.</p>
        <span className="editor__actions">{closeButton}</span>
      </div>
    );
  }

  return (
    <div className="editor__foot">
      <p className={dirty ? "editor__state editor__state--dirty" : "editor__state"}>
        {describeDraftState(dirty, overrideValue, defaultValue)}
      </p>
      <EditorKeys next={next !== undefined} />
      <span className="editor__actions">
        {closeButton}
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
                obvious one, and this is the shortcut for a long review rather than the usual
                exit. */}
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
