import type { MessageDetail } from "../../api/generated/models.js";
import { Button } from "../../bridge/uui/index.js";

/**
 * What the application ships, and the way back to it.
 *
 * Reverting lives here rather than in the footer because it is a fact about this text, not one of
 * the two things somebody came to the pane to press.
 */
export const DefaultValue = ({
  message,
  language,
  canEdit,
  reverting,
  onRevert,
}: {
  message: MessageDetail;
  language: string;
  canEdit: boolean;
  reverting: boolean;
  onRevert: () => void;
}) => {
  if (message.defaultValue === "") {
    return null;
  }

  return (
    <section className="pane__block">
      <h3>{language} · from the application</h3>
      <div className="pane__default">
        <span className="pane__reading">{message.defaultValue}</span>
        {canEdit && message.overrideValue !== null ? (
          <Button disabled={reverting} label="Revert to the application text" onClick={onRevert}>
            Revert to this
          </Button>
        ) : null}
      </div>
    </section>
  );
};
