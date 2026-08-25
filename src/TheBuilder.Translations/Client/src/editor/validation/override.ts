import type { MessageFormat } from "../../api/generated/models.js";
import { type MessageArguments, validateMessage } from "./message-format.js";

/**
 * The override column is unbounded in the database, so the server caps the length instead. Mirrors
 * MessageOverrideValidation.MaximumValueLength.
 */
const MAXIMUM_VALUE_LENGTH = 100_000;

export interface OverrideProblem {
  /** One sentence naming what is wrong, in the words an editor would use. */
  message: string;
  /** Placeholders the text should have used and does not. */
  missing: readonly string[];
  /** Placeholders the text uses that the application does not provide. */
  unexpected: readonly string[];
}

/**
 * Whether a draft can be saved, decided by the same rule the server applies: the text must parse,
 * and it must use exactly the placeholders the source message uses, with the same kinds.
 *
 * The rule is copied; the wording is not. The server answers one generic sentence because it has no
 * one to explain it to, whereas here the editor is looking at the field and can be told which
 * placeholder is missing. Being more permissive than the server would trade a blocked save for a
 * 400 on save, and being stricter would block a save the server would have taken, so the *decision*
 * has to stay identical even though the message does not.
 *
 * Source: src/TheBuilder.Translations.Core/Validation/MessageOverrideValidation.cs
 */
export const describeOverride = (
  value: string,
  message: { format: MessageFormat; arguments: MessageArguments }
): OverrideProblem | null => {
  if (value.length > MAXIMUM_VALUE_LENGTH) {
    return {
      message: `The text has to be ${MAXIMUM_VALUE_LENGTH.toLocaleString()} characters or fewer.`,
      missing: [],
      unexpected: [],
    };
  }

  const result = validateMessage(value, message.format);
  if (!result.valid) {
    return { message: readable(result.error), missing: [], unexpected: [] };
  }

  const expected = message.arguments;
  const missing = Object.keys(expected).filter((name) => result.arguments[name] === undefined);
  const unexpected = Object.keys(result.arguments).filter((name) => expected[name] === undefined);
  // Present in both but used differently: {count} written as plain text where the application
  // formats it as a number. Named separately because neither list above describes it.
  const mismatched = Object.keys(expected).filter(
    (name) => result.arguments[name] !== undefined && result.arguments[name] !== expected[name]
  );

  if (missing.length === 0 && unexpected.length === 0 && mismatched.length === 0) {
    return null;
  }

  return {
    message: explain(missing, unexpected, mismatched, expected, result.arguments),
    missing,
    unexpected,
  };
};

const explain = (
  missing: readonly string[],
  unexpected: readonly string[],
  mismatched: readonly string[],
  expected: MessageArguments,
  actual: MessageArguments
): string => {
  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`is missing ${list(missing)}`);
  }
  if (unexpected.length > 0) {
    parts.push(`uses ${list(unexpected)}, which the application does not provide`);
  }
  for (const name of mismatched) {
    parts.push(
      `uses {${name}} as ${describeKind(actual[name])} where the application uses it as ${describeKind(expected[name])}`
    );
  }

  return `Your text ${join(parts)}.`;
};

const list = (names: readonly string[]) => join(names.map((name) => `{${name}}`));

const join = (parts: readonly string[]): string =>
  parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;

/** The scanner's kinds are ICU vocabulary; these are what they mean to somebody writing text. */
const describeKind = (kind: string | undefined): string => {
  switch (kind) {
    case "number":
      return "a number";
    case "date":
      return "a date";
    case "time":
      return "a time";
    case "plural":
      return "a number that changes the wording";
    case "selectordinal":
      return "a position like 1st or 2nd";
    case "select":
      return "a choice between wordings";
    default:
      return "plain text";
  }
};

/**
 * Parser errors are written for whoever is debugging the scanner: they name the token that was
 * expected and the offset it was wanted at. Neither means anything to somebody looking at a
 * sentence they just typed, and nearly all of them come down to the same two mistakes.
 *
 * Matched on the scanner's own strings, which this file is allowed to know because both are ports
 * of the same C# and the parity tests pin them.
 */
const UNSUPPORTED_ARGUMENT_KIND = /Unsupported argument kind '(.*)'/;

const readable = (error: string): string => {
  const kind = UNSUPPORTED_ARGUMENT_KIND.exec(error);
  if (kind) {
    return `Your text uses an unknown placeholder format, "${kind[1]}".`;
  }

  if (error.includes("requires an 'other' branch")) {
    return 'Your text has a placeholder with wording options but no "other" option, which is the one used when nothing else matches.';
  }

  if (error.includes("Argument name is required") || error.includes("requires a selector")) {
    return "Your text has an empty placeholder.";
  }

  // Everything left is a brace that does not pair up: unclosed, unopened, or trailing.
  return "Your text has a placeholder that is not closed properly. Check that every { has a matching }.";
};
