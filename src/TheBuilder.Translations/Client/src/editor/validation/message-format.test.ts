import { describe, expect, it } from "vitest";
import { validateMessage } from "./message-format.js";
import { describeOverride } from "./override.js";

/**
 * Mirrors the [InlineData] cases in MessageFormatValidatorTests.cs one for one. That xunit file is
 * the specification both scanners answer to: if this port ever drifts, the editor starts either
 * blocking saves the server would take or promising saves it will reject with a 400.
 */
describe("ICU, against the server's cases", () => {
  it.each([
    "Hello {name}",
    "{count, number} items",
    "{date, date, short}",
    "{gender, select, female {She} male {He} other {They}} replied",
    "{count, plural, =0 {None} one {One} other {{count, number} results}}",
    "This '{is}' quoted and this ''{name}'' is not",
  ])("accepts %j", (message) => {
    expect(validateMessage(message, "Icu").valid).toBe(true);
  });

  it.each([
    "Hello {name",
    "Hello name}",
    "{count, plural, one {One}}",
    "{value, magic}",
    // Rejected here and accepted by real ICU. The divergence is deliberate: the server rejects it,
    // so accepting it would promise a save that returns 400.
    "{value, number} {value, date}",
  ])("rejects %j", (message) => {
    expect(validateMessage(message, "Icu").valid).toBe(false);
  });

  // A bare apostrophe is prose, not the start of a quoted section. Getting this wrong silently
  // returns an empty argument set, which reads as "your text is missing every placeholder".
  it.each([
    ["Il n'y a {count} messages", "count"],
    ["Aujourd'hui il y a {count} messages", "count"],
    ["It's {name}'s turn", "name"],
    ["L'utente {name} ha risposto", "name"],
  ])("treats the apostrophe in %j as prose", (message, argument) => {
    const result = validateMessage(message, "Icu");

    expect(result).toEqual({ valid: true, arguments: { [argument]: "string" } });
  });

  it.each(["5 o'clock", "don't", "trailing apostrophe '"])("accepts %j with no arguments", (message) => {
    expect(validateMessage(message, "Icu")).toEqual({ valid: true, arguments: {} });
  });

  it.each([
    // '{ opens a quoted section, so the braces are literal and yield no argument.
    ["This '{is}' quoted", 0],
    // '' is an escaped apostrophe, so the braces that follow are a real argument.
    ["This ''{name}'' is not", 1],
    // An unterminated quoted section runs to the end of the message.
    ["Unterminated '{name}", 0],
  ])("quotes only before syntax characters: %j", (message, expected) => {
    const result = validateMessage(message, "Icu");

    expect(result.valid && Object.keys(result.arguments)).toHaveLength(expected);
  });
});

describe("i18next v4, against the server's cases", () => {
  it.each([
    ["Hello {{name}}", "name"],
    ["{{count}} items", "count"],
    ["Hello {{- name}}", "name"],
    ["Price: {{value, currency}}", "value"],
  ])("accepts %j", (message, argument) => {
    const result = validateMessage(message, "I18NextV4");

    expect(result.valid && result.arguments[argument]).toBe("string");
  });

  it.each(["Hello {{name", "Hello name}}", "Hello {{ }}"])("rejects %j", (message) => {
    expect(validateMessage(message, "I18NextV4").valid).toBe(false);
  });
});

describe("plain text", () => {
  it("takes anything, because there is no syntax to get wrong", () => {
    expect(validateMessage("{ not really a placeholder", "PlainText")).toEqual({ valid: true, arguments: {} });
  });
});

describe("describeOverride", () => {
  const icu = (args: Record<string, string>) => ({ format: "Icu" as const, arguments: args });

  it("accepts text using exactly the placeholders the application uses", () => {
    expect(describeOverride("Du har {count, number} beskeder", icu({ count: "number" }))).toBeNull();
  });

  it("names the placeholder that is missing rather than restating the rule", () => {
    const problem = describeOverride("Du har beskeder", icu({ count: "number" }));

    expect(problem?.missing).toEqual(["count"]);
    expect(problem?.message).toBe("Your text is missing {count}.");
  });

  it("names a placeholder the application does not provide", () => {
    const problem = describeOverride("Hej {navn}", icu({ name: "string" }));

    expect(problem?.missing).toEqual(["name"]);
    expect(problem?.unexpected).toEqual(["navn"]);
    expect(problem?.message)
      .toBe("Your text is missing {name} and uses {navn}, which the application does not provide.");
  });

  it("explains a placeholder used as the wrong kind in words, not in ICU vocabulary", () => {
    const problem = describeOverride("Du har {count} beskeder", icu({ count: "number" }));

    // Present in both, so neither list describes it; without this branch the message would be
    // "your text is missing {count}" about text that plainly contains {count}.
    expect(problem?.missing).toEqual([]);
    expect(problem?.message)
      .toBe("Your text uses {count} as plain text where the application uses it as a number.");
  });

  it("explains an unclosed placeholder instead of quoting the parser", () => {
    // The scanner says "Expected ',' at position 9", which is about its own state machine.
    const problem = describeOverride("Hej {name", icu({ name: "string" }));

    expect(problem?.message)
      .toBe("Your text has a placeholder that is not closed properly. Check that every { has a matching }.");
  });

  it("names an unknown placeholder format", () => {
    expect(describeOverride("{value, magic}", icu({ value: "string" }))?.message)
      .toBe('Your text uses an unknown placeholder format, "magic".');
  });

  it("explains a missing other branch in terms of what it is for", () => {
    expect(describeOverride("{count, plural, one {En}}", icu({ count: "plural" }))?.message)
      .toContain('no "other" option');
  });

  it("lists several missing placeholders in one sentence", () => {
    const problem = describeOverride("Intet", icu({ name: "string", count: "number" }));

    expect(problem?.message).toBe("Your text is missing {name} and {count}.");
  });

  it("allows blank text, which is how an override is removed", () => {
    // The empty draft means "go back to the application text", so it cannot be a validation failure
    // even when the application text has placeholders.
    expect(describeOverride("", icu({ count: "number" }))?.missing).toEqual(["count"]);
  });
});
