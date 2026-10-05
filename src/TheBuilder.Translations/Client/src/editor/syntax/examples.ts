import { type MessageFormatElement, parse, TYPE } from "@formatjs/icu-messageformat-parser";

/** A value an example is rendered with: a number, a date, a branch to take, or a named gap. */
export type ExampleValue = number | Date | string | { placeholder: string };

export interface Example {
  /** What was varied to get here, as somebody would say it: `count = 1`. Empty when nothing was. */
  label: string;
  values: Record<string, ExampleValue>;
}

interface Branching {
  keys: string[];
  kind: "plural" | "select";
  /** Subtracted from the count before its category is chosen, though not before `=N` is matched. */
  offset: number;
  ordinal: boolean;
}

/** One date for every example, so the preview does not change from one minute to the next. */
const SAMPLE_DATE = new Date(2026, 9, 5, 14, 30);
const SAMPLE_NUMBER = 1234.5;
/** The counts tried for a plural category, in order. */
const COUNTS = Array.from({ length: 201 }, (_, count) => count);
/** The most branches of any one argument shown, so a twelve-way select does not fill the row. */
const MAXIMUM_CASES = 6;

/**
 * The cases worth seeing a message rendered in, for the preview under the field.
 *
 * A plural or a select is shown once per branch, with every other argument held at a default, so
 * each line differs from the one above it in exactly one thing. A message with no branches is shown
 * once if it formats a number or a date, and not at all if its placeholders are all plain: then the
 * preview would only be the field again. Anything else -- no
 * arguments, or text that does not parse yet -- has nothing to preview and gives nothing back:
 * saying what is wrong is the validator's job, not this one's.
 *
 * ICU only. i18next writes plurals as separate keys, so a single i18next message has no cases.
 */
export const examplesFor = (text: string, locale: string): Example[] => {
  let ast: MessageFormatElement[];
  try {
    ast = parse(text, { ignoreTag: true });
  } catch {
    return [];
  }

  const simple = new Map<string, ExampleValue>();
  const branching = new Map<string, Branching>();
  collect(ast, simple, branching);
  if (simple.size === 0 && branching.size === 0) {
    return [];
  }

  const defaults: Record<string, ExampleValue> = Object.fromEntries(simple);
  const samples = new Map(
    [...branching].map(([name, branch]) => [name, samplesFor(branch, locale)] as const)
  );
  for (const [name, cases] of samples) {
    defaults[name] = cases[0]?.value ?? 1;
  }

  if (branching.size === 0) {
    // Plain placeholders only and the preview is the field again, gaps and all. A number or a date
    // is worth one line, for how this language writes it.
    const formatted = [...simple.values()].some(
      (value) => typeof value !== "object" || value instanceof Date
    );
    return formatted ? [{ label: "", values: defaults }] : [];
  }

  return [...samples].flatMap(([name, cases]) =>
    cases.slice(0, MAXIMUM_CASES).map((sample) => ({
      label: `${name} = ${sample.label}`,
      values: { ...defaults, [name]: sample.value },
    }))
  );
};

const collect = (
  elements: readonly MessageFormatElement[],
  simple: Map<string, ExampleValue>,
  branching: Map<string, Branching>
) => {
  for (const element of elements) {
    switch (element.type) {
      case TYPE.argument:
        simple.set(element.value, { placeholder: element.value });
        break;
      case TYPE.number:
        simple.set(element.value, SAMPLE_NUMBER);
        break;
      case TYPE.date:
      case TYPE.time:
        simple.set(element.value, SAMPLE_DATE);
        break;
      case TYPE.plural:
      case TYPE.select: {
        const plural = element.type === TYPE.plural;
        branching.set(element.value, {
          kind: plural ? "plural" : "select",
          ordinal: plural && element.pluralType === "ordinal",
          offset: plural ? element.offset : 0,
          keys: Object.keys(element.options),
        });
        for (const option of Object.values(element.options)) {
          collect(option.value, simple, branching);
        }
        break;
      }
      case TYPE.tag:
        collect(element.children, simple, branching);
        break;
      default:
    }
  }
  // An argument that is also a branch takes the branch's value.
  for (const name of branching.keys()) {
    simple.delete(name);
  }
};

/**
 * A value that lands in each branch. An exact match (`=0`) is its own number. A category (`one`,
 * `few`) is the first count the language puts in it that no exact match has already claimed, which
 * is what makes `other` show 2 rather than 0 in English when `=0` has a branch of its own.
 */
const samplesFor = (
  branch: Branching,
  locale: string
): { label: string; value: ExampleValue }[] => {
  if (branch.kind === "select") {
    return branch.keys.map((key) => ({ label: key, value: key }));
  }

  const exact = branch.keys.filter((key) => key.startsWith("=")).map((key) => Number(key.slice(1)));
  let rules: Intl.PluralRules;
  try {
    rules = new Intl.PluralRules(locale, { type: branch.ordinal ? "ordinal" : "cardinal" });
  } catch {
    rules = new Intl.PluralRules("en", { type: branch.ordinal ? "ordinal" : "cardinal" });
  }

  return branch.keys.flatMap((key) => {
    if (key.startsWith("=")) {
      const value = Number(key.slice(1));
      return Number.isFinite(value) ? [{ label: String(value), value }] : [];
    }
    // Whole counts first. Some languages keep a category for fractions alone -- Polish `other` --
    // so one fraction is tried after them. The category is chosen from the count less the offset,
    // as the formatter will choose it, so the branch shown is the branch the label names.
    for (const count of [...COUNTS, 1.5]) {
      const counted = count - branch.offset;
      if (!exact.includes(count) && counted >= 0 && rules.select(counted) === key) {
        return [{ label: String(count), value: count }];
      }
    }
    return [];
  });
};
