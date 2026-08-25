import type { MessageDetail } from "../../api/generated/models.js";
import type { BackofficeBridge } from "../../bridge/backoffice-bridge.js";
import { Button } from "../../bridge/uui/index.js";
import { type EditTarget, fullKey } from "../state/target.js";

/**
 * Everything a developer might need and an editor never does.
 *
 * Folded away rather than left out: the key, the format and the source revision are what a bug
 * report about a wrong string is answered with, and the person filing it is usually the person
 * looking at the pane.
 */
export const TechnicalDetails = ({
  target,
  message,
  bridge,
}: {
  target: EditTarget;
  message: MessageDetail;
  bridge: BackofficeBridge;
}) => {
  /**
   * The clipboard is refused outside a secure context and while the document is unfocused, and the
   * backoffice is served over plain HTTP often enough for that to be the normal case rather than
   * the exceptional one. Unanswered, the button looks like it worked and the paste is whatever was
   * copied before it.
   */
  const copyKey = async () => {
    const key = fullKey(target);
    try {
      await navigator.clipboard.writeText(key);
      bridge.notify("positive", "Key copied", key);
    } catch {
      bridge.notify("danger", "Could not copy the key", "Select the key and copy it manually.");
    }
  };

  return (
    <details className="technical">
      <summary>Technical details</summary>
      <dl>
        <dt>Full key</dt>
        <dd>
          <code>{fullKey(target)}</code>
          <Button
            className="button--small"
            label="Copy full key"
            onClick={() => {
              copyKey();
            }}
          >
            Copy
          </Button>
        </dd>
        <dt>Language</dt>
        <dd>{target.locale}</dd>
        <dt>Format</dt>
        <dd>{message.format}</dd>
        {message.sourceRevision ? (
          <>
            <dt>Source revision</dt>
            <dd>
              <code>{message.sourceRevision}</code>
            </dd>
          </>
        ) : null}
        {message.updatedAt ? (
          <>
            <dt>Last changed</dt>
            <dd>
              {new Date(message.updatedAt).toLocaleString()}
              {message.updatedBy ? ` by ${message.updatedBy}` : ""}
            </dd>
          </>
        ) : null}
      </dl>
    </details>
  );
};
