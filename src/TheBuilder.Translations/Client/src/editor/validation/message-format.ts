import type { MessageFormat } from "../../api/generated/models.js";

/**
 * A port of the server's message scanners, deliberately bug-for-bug.
 *
 * The obvious alternative is a real ICU library, and it is the wrong one. The server validates with
 * a hand-written scanner, and every place a library disagreed with it would produce the worst
 * possible outcome: the editor says the text is fine and the save returns 400, or the editor blocks
 * a save the server would have accepted. Known divergences from real ICU that this has to keep --
 * `{value, number} {value, date}` is rejected here and accepted by full implementations, and
 * `{x, number, ::badskeleton}` is accepted here and rejected by them.
 *
 * Parity is held by tests mirroring the [InlineData] cases in MessageFormatValidatorTests.cs, which
 * is the shared specification for both.
 *
 * Source: src/TheBuilder.Translations.Core/Validation/MessageFormatValidator.cs
 */
export type MessageArguments = Readonly<Record<string, string>>;

export type ValidationResult =
  | { valid: true; arguments: MessageArguments }
  | { valid: false; error: string };

export const validateMessage = (message: string, format: MessageFormat): ValidationResult => {
  if (format === "PlainText") return { valid: true, arguments: {} };
  if (format === "I18NextV4") return validateI18Next(message);

  try {
    return { valid: true, arguments: new IcuScanner(message).scan() };
  } catch (error) {
    if (error instanceof MessageFormatError) return { valid: false, error: error.message };
    throw error;
  }
};

class MessageFormatError extends Error {}

const validateI18Next = (message: string): ValidationResult => {
  const args: Record<string, string> = {};
  let position = 0;

  while (position < message.length) {
    const opening = message.indexOf("{{", position);
    const strayClosing = message.indexOf("}}", position);
    if (strayClosing >= 0 && (opening < 0 || strayClosing < opening))
      return { valid: false, error: `Unexpected closing interpolation delimiter at position ${strayClosing}.` };
    if (opening < 0) return { valid: true, arguments: args };

    const closing = message.indexOf("}}", opening + 2);
    if (closing < 0) return { valid: false, error: `Unclosed interpolation at position ${opening}.` };

    let expression = message.slice(opening + 2, closing).trim();
    // i18next's "unescape" prefix, which says how to render the value rather than which value.
    if (expression.startsWith("-")) expression = expression.slice(1).trimStart();

    const separator = expression.indexOf(",");
    const name = (separator < 0 ? expression : expression.slice(0, separator)).trim();
    if (name.length === 0 || name.includes("{") || name.includes("}"))
      return { valid: false, error: `Interpolation at position ${opening} requires a variable name.` };

    args[name] = "string";
    position = closing + 2;
  }

  return { valid: true, arguments: args };
};

const ARGUMENT_KINDS = ["number", "date", "time", "plural", "selectordinal", "select"];
const BRANCHING_KINDS = ["plural", "selectordinal", "select"];

class IcuScanner {
  private readonly args: Record<string, string> = {};
  private position = 0;

  constructor(private readonly input: string) {}

  scan(): MessageArguments {
    this.scanMessage(false);
    if (this.position !== this.input.length) throw this.error("Unexpected trailing content");
    return this.args;
  }

  private scanMessage(terminated: boolean): void {
    while (this.position < this.input.length) {
      const current = this.input[this.position];
      if (current === "'") {
        this.scanQuotedText();
        continue;
      }
      if (current === "{") {
        this.scanArgument();
        continue;
      }
      if (current === "}") {
        if (!terminated) throw this.error("Unmatched closing brace");
        return;
      }
      this.position++;
    }

    if (terminated) throw this.error("Unclosed argument branch");
  }

  /**
   * ICU only starts a quoted section when the apostrophe is followed by a syntax character; '' is
   * an escaped literal apostrophe, and every other apostrophe is ordinary prose ("Il n'y a {count}
   * messages", "Aujourd'hui").
   */
  private scanQuotedText(): void {
    this.position++;
    if (this.position === this.input.length) return;

    if (this.input[this.position] === "'") {
      this.position++;
      return;
    }

    const next = this.input[this.position];
    if (next !== "{" && next !== "}" && next !== "#") return;

    while (this.position < this.input.length) {
      if (this.input[this.position] !== "'") {
        this.position++;
        continue;
      }
      this.position++;
      if (this.position < this.input.length && this.input[this.position] === "'") {
        this.position++;
        continue;
      }
      return;
    }
  }

  private scanArgument(): void {
    this.position++;
    this.skipWhitespace();
    const name = this.readToken(",", "}");
    if (name.length === 0) throw this.error("Argument name is required");

    this.skipWhitespace();
    if (this.consume("}")) {
      this.addArgument(name, "string");
      return;
    }

    this.expect(",");
    this.skipWhitespace();
    const kind = this.readToken(",", "}").toLowerCase();
    if (!ARGUMENT_KINDS.includes(kind)) throw this.error(`Unsupported argument kind '${kind}'`);
    this.addArgument(name, kind);

    this.skipWhitespace();
    if (this.consume("}")) return;

    this.expect(",");
    if (BRANCHING_KINDS.includes(kind)) this.scanBranches(kind);
    else this.scanStyle();
  }

  private scanBranches(kind: string): void {
    let hasOther = false;
    for (;;) {
      this.skipWhitespace();
      if (this.consume("}")) break;
      if (this.input.startsWith("offset:", this.position)) {
        this.position += "offset:".length;
        this.readToken(" ", "\t", "\r", "\n", "}");
        continue;
      }

      const selector = this.readToken("{");
      if (selector.length === 0) throw this.error("A plural or select branch requires a selector");
      hasOther ||= selector === "other";
      this.skipWhitespace();
      this.expect("{");
      this.scanMessage(true);
      this.expect("}");
    }

    if (!hasOther) throw this.error(`The ${kind} argument requires an 'other' branch`);
  }

  private scanStyle(): void {
    while (this.position < this.input.length && this.input[this.position] !== "}") this.position++;
    this.expect("}");
  }

  private addArgument(name: string, kind: string): void {
    const existing = this.args[name];
    if (existing !== undefined && existing !== kind) {
      if (compatible(existing, kind)) return;
      throw this.error(`Argument '${name}' is used as both '${existing}' and '${kind}'`);
    }
    this.args[name] = kind;
  }

  private readToken(...terminators: string[]): string {
    const start = this.position;
    while (this.position < this.input.length && !terminators.includes(this.input[this.position]!))
      this.position++;
    return this.input.slice(start, this.position).trim();
  }

  private skipWhitespace(): void {
    while (this.position < this.input.length && /\s/.test(this.input[this.position]!)) this.position++;
  }

  private consume(expected: string): boolean {
    if (this.position >= this.input.length || this.input[this.position] !== expected) return false;
    this.position++;
    return true;
  }

  private expect(expected: string): void {
    if (!this.consume(expected)) throw this.error(`Expected '${expected}'`);
  }

  private error(message: string): MessageFormatError {
    return new MessageFormatError(`${message} at position ${this.position}.`);
  }
}

const numeric = (kind: string) => kind === "number" || kind === "plural" || kind === "selectordinal";
const textual = (kind: string) => kind === "string" || kind === "select";
const compatible = (left: string, right: string) =>
  (numeric(left) && numeric(right)) || (textual(left) && textual(right));
