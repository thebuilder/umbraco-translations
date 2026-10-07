import { Button } from "../../bridge/uui/index.js";
import type { OpenTranslation } from "../app/use-editor-selection.js";
import { EditorKeys } from "./shortcuts.js";

/**
 * The bottom edge of the open row: what state the text is in, and the ways out.
 *
 * Which action is the obvious one depends on the job. Correcting a reported string ends with Save;
 * working down a queue ends with the next item, so there Save & next is the primary and Skip is the
 * way past a row that needs somebody else.
 */
export const EditorFoot = ({
  open,
  canEdit,
  state,
  dirty,
  unwritten,
  savable,
  saving,
  commit,
}: {
  open: Pick<OpenTranslation, "pending" | "next" | "select" | "close" | "discard" | "keepEditing">;
  canEdit: boolean;
  /** What the text in the field is, in a few words: saved, unsaved, the default. */
  state: string;
  dirty: boolean;
  /**
   * Nothing written in this language yet. Writing a translation from nothing is working down a
   * queue, so the obvious way out is on to the next row; correcting one is not.
   */
  unwritten: boolean;
  savable: boolean;
  saving: boolean;
  commit: (then: "close" | "next") => void;
}) => {
  const { pending, next, select, close } = open;
  if (pending) {
    return (
      <div className="editor__foot editor__foot--asking">
        <p className="editor__state">
          {pending === "close"
            ? "Close without saving your changes?"
            : "Open another translation without saving?"}
        </p>
        <span className="editor__actions">
          <Button look="danger" onClick={open.discard}>
            Discard
          </Button>
          <Button look="primary" onClick={open.keepEditing}>
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
      <p className={dirty ? "editor__state editor__state--dirty" : "editor__state"}>{state}</p>
      <EditorKeys next={next !== undefined} />
      <span className="editor__actions">
        {closeButton}
        {unwritten && next ? (
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
