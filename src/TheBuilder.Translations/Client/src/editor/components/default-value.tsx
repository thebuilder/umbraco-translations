import type { MessageDetail } from "../../api/generated/models.js";
import { Button } from "../../bridge/uui/index.js";

/**
 * What the application ships, shown only once something else has replaced it.
 *
 * Without custom text the field already holds this, so saying it again underneath would be the
 * same sentence twice. With custom text it is the thing a revert goes back to, and that is worth
 * reading before pressing it.
 */
export const DefaultValue = ({
  message,
  canEdit,
  reverting,
  onRevert,
}: {
  message: MessageDetail;
  canEdit: boolean;
  reverting: boolean;
  onRevert: () => void;
}) => {
  if (message.overrideValue === null || message.defaultValue === "") {
    return null;
  }

  return (
    <div className="editor__default">
      <span className="editor__label">Default text</span>
      <span className="editor__default-text">{message.defaultValue}</span>
      {canEdit ? (
        // Soft, like the other offers in the row, rather than quiet: quiet text beside a label in
        // the same grey read as a second label, and nobody could tell it was the way back.
        <Button className="button--soft" disabled={reverting} onClick={onRevert}>
          {reverting ? "Reverting…" : "Revert to default"}
        </Button>
      ) : null}
    </div>
  );
};
