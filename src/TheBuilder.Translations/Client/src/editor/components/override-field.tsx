import type { MessageDetail } from "../../api/generated/models.js";
import { MessageField } from "../syntax/message-field.js";
import { Previews } from "../syntax/previews.js";
import { SyntaxText } from "../syntax/syntax-text.js";
import type { OverrideProblem } from "../validation/override.js";

/**
 * The field the editor exists for, and everything that says whether what is in it will be accepted.
 *
 * The syntax is set apart from the words as they are typed: braces, keywords and placeholder names
 * in monospace, and only the words that get translated in the reading face.
 *
 * Without permission this is something to read, presented as a reading. A field that cannot be
 * saved is an invitation to waste an hour.
 */
export const OverrideField = ({
  message,
  language,
  locale,
  canEdit,
  value,
  problem,
  focusOnMount,
  setDraft,
}: {
  message: MessageDetail;
  /** The language being written, named rather than coded: this labels the field, not a key. */
  language: string;
  /** The language's code, which decides its plural rules and how numbers and dates are written. */
  locale: string;
  canEdit: boolean;
  value: string;
  problem: OverrideProblem | null;
  /** Whether the field takes focus as it appears: the editor took it, and this is where it goes. */
  focusOnMount: boolean;
  setDraft: (value: string) => void;
}) => (
  <section className="editor__block">
    {/* The sticky header above the list already names the column. This says it again only where
        the open row stacks and the field no longer sits under its heading. */}
    <h3 className="editor__label editor__label--stacked">{language}</h3>

    {canEdit ? (
      <MessageField
        describedBy={problem ? "override-problem" : "override-state"}
        focusOnMount={focusOnMount}
        format={message.format}
        invalid={problem !== null}
        label={`Your text in ${language}`}
        onChange={setDraft}
        placeholder={`Write the ${language} text`}
        value={value}
      />
    ) : (
      <div className="code code--readonly">
        <p className="code__text editor__own">
          <SyntaxText
            format={message.format}
            text={message.overrideValue ?? message.defaultValue}
          />
        </p>
      </div>
    )}

    <Placeholders message={message} problem={problem} />

    {message.format === "Icu" && value !== "" && problem === null ? (
      <Previews locale={locale} text={value} />
    ) : null}

    {problem ? (
      <p className="notice notice--error" id="override-problem" role="alert">
        {problem.message}
      </p>
    ) : (
      <p className="visually-hidden" id="override-state">
        {message.overrideValue === null ? "Using the default text" : "Custom text"}
      </p>
    )}
  </section>
);

/**
 * The placeholders the text has to keep, shown only when it has lost some: with the field
 * highlighting them as they are typed, a list of every one beside it would say each thing twice.
 * The one moment the list earns its place is when something is missing from the text and so cannot
 * be highlighted there.
 */
const Placeholders = ({
  message,
  problem,
}: {
  message: MessageDetail;
  problem: OverrideProblem | null;
}) => {
  const missing = Object.keys(message.arguments).filter((name) => problem?.missing.includes(name));
  if (missing.length === 0) {
    return null;
  }

  return (
    <p className="placeholders">
      <span className="placeholders__lead">Missing</span>
      {missing.map((name) => (
        <span className="token token--missing" key={name}>
          {`{${name}}`}
        </span>
      ))}
    </p>
  );
};
