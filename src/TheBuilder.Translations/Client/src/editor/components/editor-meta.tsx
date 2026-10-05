import { useEffect, useRef, useState } from "react";
import type { MessageCell } from "../../api/generated/models.js";
import type { BackofficeBridge } from "../../bridge/backoffice-bridge.js";
import { type EditTarget, fullKey } from "../state/target.js";
import { cellStatus } from "./cell-status.js";
import { StatusBadge } from "./status-badge.js";

/**
 * The key the open row is about, and what is known about the text written under it.
 *
 * Said plainly rather than folded away behind a disclosure, and taken from the row rather than the
 * fetched message, so it is all there on the first frame: facts that arrived with the message made
 * this column, and with it the open row, grow a moment after opening. The format and the source
 * revision are left out: both are set once on the source, so they say nothing about this key.
 */
export const EditorMeta = ({
  target,
  cell,
  focusOnMount,
  bridge,
}: {
  target: EditTarget;
  /** The row's own cell for this language, which carries its status and who last edited it. */
  cell: MessageCell | undefined;
  /** Takes focus as it appears: the editor took it, and there is no field yet to give it to. */
  focusOnMount: boolean;
  bridge: BackofficeBridge;
}) => {
  const key = useRef<HTMLButtonElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: on mount only. Whether to take focus is decided as the editor opens, and taking it again later would be taking it back from wherever it went.
  useEffect(() => {
    if (focusOnMount) {
      key.current?.focus();
    }
  }, []);

  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  /**
   * The clipboard is refused outside a secure context and while the document is unfocused, and the
   * backoffice is served over plain HTTP often enough for that to be the normal case rather than
   * the exceptional one. Unanswered, the button looks like it worked and the paste is whatever was
   * copied before it, so a failure still says so. Success is said in place, where the click was.
   */
  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(fullKey(target));
      setCopied(true);
    } catch {
      bridge.notify("danger", "Could not copy the key", "Select the key and copy it manually.");
    }
  };

  return (
    <div className="editor__cell editor__meta">
      {/* The key is the copy button: it is the thing being copied, and a separate button beside it
          sat closer to the language heading than to the key it was for. */}
      <button
        className="editor__key"
        onClick={() => {
          copyKey();
        }}
        ref={key}
        title="Copy the full key"
        type="button"
      >
        <span className="editor__namespace">{target.namespace}.</span>
        {target.key}
        <span aria-live="polite" className="editor__copied">
          {copied ? "Copied" : "Copy"}
        </span>
      </button>
      <StatusBadge status={cellStatus(cell)} />
      {cell?.updatedAt ? (
        <p className="editor__note">
          Edited {new Date(cell.updatedAt).toLocaleDateString()}
          {cell.updatedBy ? ` by ${cell.updatedBy}` : ""}
        </p>
      ) : null}
    </div>
  );
};
