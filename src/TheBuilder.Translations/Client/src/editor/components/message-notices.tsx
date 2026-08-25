import type { MessageDetail } from "../../api/generated/models.js";

/**
 * Said in full, once, where the decision is made. The badge in the pane header is the same fact in
 * one word; this is the sentence that explains what to do about it.
 *
 * A removed key outranks a changed one: once the application has stopped asking for the string,
 * whether its wording drifted first is no longer the thing to act on.
 */
export const MessageNotices = ({ message }: { message: MessageDetail }) => {
  if (message.state === "Removed") {
    return (
      <p className="callout callout--danger">
        <span aria-hidden="true" className="callout__mark">
          ⚠
        </span>
        The application no longer ships this key. Your text is kept and still served, but nothing in
        the application asks for it any more.
      </p>
    );
  }

  if (message.needsReview) {
    return (
      <p className="callout callout--warning">
        <span aria-hidden="true" className="callout__mark">
          ⚠
        </span>
        The application text changed after this was written. Check it still reads correctly; saving
        clears the warning.
      </p>
    );
  }

  return null;
};
