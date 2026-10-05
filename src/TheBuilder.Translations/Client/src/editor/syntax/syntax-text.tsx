import type { MessageFormat } from "../../api/generated/models.js";
import { tokenize } from "./tokens.js";

/**
 * A message with its placeholders picked out. Colour and background only, never weight or size:
 * the field draws this behind its own text, and anything that changed a glyph's width would put
 * the caret somewhere other than where it appears to be.
 */
export const SyntaxText = ({ text, format }: { text: string; format: MessageFormat }) => {
  let offset = 0;
  return (
    <>
      {tokenize(text, format).map((token) => {
        const at = offset;
        offset += token.text.length;
        return token.kind === "text" ? (
          <span key={at}>{token.text}</span>
        ) : (
          <span className={`syn syn--${token.kind}`} key={at}>
            {token.text}
          </span>
        );
      })}
    </>
  );
};
