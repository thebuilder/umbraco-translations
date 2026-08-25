import type { Ref } from "react";
import type { MessageDetail } from "../../api/generated/models.js";
import { Button } from "../../bridge/uui/index.js";
import type { OverrideProblem } from "../validation/override.js";

/**
 * The field the pane exists for, and everything that says whether what is in it will be accepted.
 *
 * Without permission this is something to read, presented as a reading. A field that cannot be
 * saved is an invitation to waste an hour.
 */
export const OverrideField = ({
  message,
  language,
  canEdit,
  value,
  problem,
  leadsWithReference,
  reference,
  referenceText,
  field,
  setDraft,
}: {
  message: MessageDetail;
  /** The language being written, named rather than coded: this is a heading, not a key. */
  language: string;
  canEdit: boolean;
  value: string;
  problem: OverrideProblem | null;
  /** Whether the text being translated from leads the pane, which changes what the field is for. */
  leadsWithReference: boolean;
  reference?: { locale: string; name: string };
  referenceText: string | null;
  field: Ref<HTMLTextAreaElement>;
  setDraft: (value: string) => void;
}) => (
  <section className="pane__block">
    <div className="pane__blockhead">
      <h3>
        {canEdit ? (
          <label htmlFor="override">{language} · your text</label>
        ) : (
          `${language} · your text`
        )}
      </h3>
      {canEdit && leadsWithReference && reference && referenceText ? (
        // A starting point, not a translation. Most languages are closer to the reference than to
        // an empty box, and retyping a key name or a placeholder by hand is how a save fails
        // validation for a reason nobody meant.
        <Button className="button--soft" onClick={() => setDraft(referenceText)}>
          Copy {reference.name} in
        </Button>
      ) : null}
      {!leadsWithReference && message.updatedAt ? (
        <span className="pane__aside">
          edited {new Date(message.updatedAt).toLocaleDateString()}
          {message.updatedBy ? ` by ${message.updatedBy}` : ""}
        </span>
      ) : null}
    </div>

    {canEdit ? (
      <textarea
        aria-describedby={problem ? "override-problem" : "override-state"}
        aria-invalid={problem !== null}
        aria-label={`Your text in ${language}`}
        className="pane__field"
        id="override"
        onChange={(event) => setDraft(event.target.value)}
        placeholder={
          leadsWithReference
            ? `Write the ${language} text`
            : "Leave blank to use the application text"
        }
        ref={field}
        rows={3}
        value={value}
      />
    ) : (
      <p className="pane__reading">{message.overrideValue || <em>Nothing written here</em>}</p>
    )}

    <Placeholders message={message} problem={problem} />

    {problem ? (
      <p className="notice notice--error" id="override-problem" role="alert">
        {problem.message}
      </p>
    ) : (
      <p className="visually-hidden" id="override-state">
        {message.overrideValue === null ? "Using the application text" : "Your own text"}
      </p>
    )}
  </section>
);

/**
 * What the application will substitute, beside the text that has to contain them.
 *
 * Shown whether or not the draft is currently valid, because the one thing an editor needs when it
 * is not is the list of what was supposed to be in it, with the missing ones picked out.
 */
const Placeholders = ({
  message,
  problem,
}: {
  message: MessageDetail;
  problem: OverrideProblem | null;
}) => {
  const placeholders = Object.entries(message.arguments);
  if (placeholders.length === 0) {
    return null;
  }

  return (
    <p className="placeholders">
      <span className="placeholders__lead">Placeholders</span>
      {placeholders.map(([name, kind]) => (
        <span
          className={problem?.missing.includes(name) ? "token token--missing" : "token"}
          key={name}
        >
          {`{${name}}`}
          <span className="token__kind">{kind}</span>
        </span>
      ))}
    </p>
  );
};
