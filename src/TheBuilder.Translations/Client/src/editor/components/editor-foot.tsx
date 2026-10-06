import type { ReactNode } from "react";
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
  discard,
  tools,
}: {
  open: Pick<OpenTranslation, "next" | "select" | "close">;
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
  /** Throws the unsaved text away, back to what is saved. */
  discard: () => void;
  /** Offers that work on the field rather than leave it, drawn ahead of the ways out. */
  tools?: ReactNode;
}) => {
  const { next, select, close } = open;

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
        {tools ? <span className="editor__tools">{tools}</span> : null}
        {/* Close keeps unsaved text, shown on the row; this is the way to drop it. */}
        {dirty ? (
          <Button className="button--quiet" onClick={discard}>
            Discard
          </Button>
        ) : null}
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
