import type { MessageFormat } from "../../api/generated/models.js";

/**
 * The parts of a message worth telling apart at a glance: the words, the placeholders the
 * application fills in, and the punctuation and keywords of the syntax around them.
 *
 * - `name`: a placeholder's name, the part that has to survive translation untouched.
 * - `type`: what kind of placeholder it is (`plural`, `select`, `number`).
 * - `option`: a branch selector or a style (`one`, `=0`, `other`, `::currency/EUR`).
 * - `hash`: the count inside a plural branch.
 * - `punct`: braces and commas.
 */
export type TokenKind = "text" | "name" | "type" | "option" | "hash" | "punct";

export interface Token {
  kind: TokenKind;
  text: string;
}

/**
 * Splits a message into tokens for display.
 *
 * Lossless by contract: the tokens joined back together are the input, character for character,
 * whatever the input is. The field marks the text by position, adding up token lengths, so a
 * dropped or reordered character would put every mark after it on the wrong letters. That is also
 * why this is forgiving rather than strict: half-typed syntax is the normal state of a field
 * being edited, and saying whether it is valid is the validator's job, not this one's.
 *
 * Hand-written rather than the formatjs parser the previews use, for the same reason: that parser
 * rejects a message with an unclosed brace outright, and the field still has to colour it.
 */
export const tokenize = (text: string, format: MessageFormat): Token[] => {
  if (format === "PlainText") {
    return text === "" ? [] : [{ kind: "text", text }];
  }
  return format === "I18NextV4" ? tokenizeI18Next(text) : new IcuLexer(text).run();
};

const I18NEXT = /(\{\{)(.*?)(\}\})|(\$t\([^)]*\))/g;

const tokenizeI18Next = (text: string): Token[] => {
  const tokens: Token[] = [];
  let last = 0;
  for (const match of text.matchAll(I18NEXT)) {
    if (match.index > last) {
      tokens.push({ kind: "text", text: text.slice(last, match.index) });
    }
    if (match[4] === undefined) {
      tokens.push(
        { kind: "punct", text: match[1] },
        { kind: "name", text: match[2] },
        { kind: "punct", text: match[3] }
      );
    } else {
      // A nested translation: the whole reference is the thing to leave alone.
      tokens.push({ kind: "name", text: match[4] });
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    tokens.push({ kind: "text", text: text.slice(last) });
  }
  return tokens.filter((token) => token.text !== "");
};

/** Placeholder types whose remainder is a list of branches, each holding a message of its own. */
const BRANCHING = new Set(["plural", "selectordinal", "select"]);

/** The characters an ICU apostrophe can quote. Any other apostrophe is ordinary prose. */
const QUOTABLE = new Set(["{", "}", "#", "|"]);

class IcuLexer {
  readonly #text: string;
  readonly #tokens: Token[] = [];
  #at = 0;

  constructor(text: string) {
    this.#text = text;
  }

  run(): Token[] {
    this.#message(0, false);
    // A `}` with nothing open is a typo in progress, kept as text so nothing is lost.
    while (this.#at < this.#text.length) {
      this.#emit("text", 1);
      this.#message(0, false);
    }
    return this.#tokens;
  }

  /** Text up to the `}` that closes this message, which is left for the caller to consume. */
  #message(depth: number, plural: boolean) {
    while (this.#at < this.#text.length) {
      const character = this.#text[this.#at];
      if (character === "}") {
        return;
      }
      if (character === "{") {
        this.#argument(depth, plural);
      } else if (character === "#" && plural) {
        this.#emit("hash", 1);
      } else if (character === "'") {
        this.#emit("text", this.#quoted());
      } else {
        this.#emit("text", 1);
      }
    }
  }

  /** How many characters an apostrophe at the cursor covers. */
  #quoted(): number {
    const next = this.#text[this.#at + 1];
    if (next === "'") {
      return 2;
    }
    if (next === undefined || !QUOTABLE.has(next)) {
      return 1;
    }
    const closing = this.#text.indexOf("'", this.#at + 1);
    return closing < 0 ? this.#text.length - this.#at : closing - this.#at + 1;
  }

  #argument(depth: number, plural: boolean) {
    this.#emit("punct", 1);
    this.#emit("name", this.#until(",}"));
    if (!this.#closeOrComma()) {
      return;
    }

    const type = this.#text.slice(this.#at, this.#at + this.#until(",}"));
    this.#emit("type", type.length);
    if (!this.#closeOrComma()) {
      return;
    }

    if (!BRANCHING.has(type.trim())) {
      this.#emit("option", this.#until("}"));
      this.#close();
      return;
    }

    const counts = plural || type.trim() !== "select";
    while (this.#at < this.#text.length && this.#text[this.#at] !== "}") {
      if (this.#text[this.#at] === "{") {
        this.#emit("punct", 1);
        this.#message(depth + 1, counts);
        this.#close();
      } else {
        this.#emit("option", Math.max(1, this.#until("{}")));
      }
    }
    this.#close();
  }

  /** Consumes a `,` or a `}` at the cursor. True when it was a comma and the argument goes on. */
  #closeOrComma(): boolean {
    const character = this.#text[this.#at];
    if (character === ",") {
      this.#emit("punct", 1);
      return true;
    }
    this.#close();
    return false;
  }

  #close() {
    if (this.#text[this.#at] === "}") {
      this.#emit("punct", 1);
    }
  }

  /** Characters from the cursor up to, not including, the first of `stops` or the end. */
  #until(stops: string): number {
    let end = this.#at;
    while (end < this.#text.length && !stops.includes(this.#text[end])) {
      end += 1;
    }
    return end - this.#at;
  }

  #emit(kind: TokenKind, length: number) {
    if (length <= 0) {
      return;
    }
    const text = this.#text.slice(this.#at, this.#at + length);
    this.#at += length;
    const previous = this.#tokens.at(-1);
    if (previous?.kind === kind && kind === "text") {
      previous.text += text;
    } else {
      this.#tokens.push({ kind, text });
    }
  }
}
