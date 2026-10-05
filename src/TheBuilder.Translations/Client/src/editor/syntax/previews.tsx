import { type MessageFormatElement, TYPE } from "@formatjs/icu-messageformat-parser";
import { IntlMessageFormat } from "intl-messageformat";

/** A plain placeholder, which has no value to show and stays a named gap in the preview. */
interface Gap {
  gap: string;
}

/** A value a preview is rendered with: a number, a date, a branch to take, or a named gap. */
type SampleValue = number | Date | string | Gap;

export type PreviewPart = string | Gap;

export interface Preview {
  /** What was varied to get here, as somebody would say it: `count = 1`. Empty when nothing was. */
  label: string;
  parts: PreviewPart[];
}

interface Branching {
  keys: string[];
  kind: "plural" | "select";
  /** Subtracted from the count before its category is chosen, though not before `=N` is matched. */
  offset: number;
  ordinal: boolean;
}

/** One date for every preview, so it does not change from one minute to the next. */
const SAMPLE_DATE = new Date(2026, 9, 5, 14, 30);
const SAMPLE_NUMBER = 1234.5;
/** The counts tried for a plural category, in order. */
const COUNTS = Array.from({ length: 201 }, (_, count) => count);
/** The most branches of any one argument shown, so a twelve-way select does not fill the row. */
const MAXIMUM_CASES = 6;

/**
 * The message as the site will show it, in the cases worth seeing, for the preview under the field.
 *
 * A plural or a select is shown once per branch, with every other argument held at a default, so
 * each line differs from the one above it in exactly one thing. A message with no branches is shown
 * once if it formats a number or a date, and not at all if its placeholders are all plain: then the
 * preview would only be the field again. Anything else -- no arguments, or text that does not parse
 * yet -- has nothing to preview and gives nothing back: saying what is wrong is the validator's
 * job, not this one's.
 *
 * Parsed once, by the formatter that renders it, which also hands back its syntax tree to find the
 * cases in. ICU only: i18next writes plurals as separate keys, so one message has no cases.
 */
export const previewsFor = (text: string, locale: string): Preview[] => {
  let format: IntlMessageFormat;
  try {
    format = new IntlMessageFormat(text, locale, undefined, { ignoreTag: true });
  } catch {
    return [];
  }

  const { simple, branching } = argumentsOf(format.getAst());
  const samples = new Map(
    [...branching].map(([name, branch]) => [name, samplesFor(branch, locale)] as const)
  );
  const defaults: Record<string, SampleValue> = Object.fromEntries(simple);
  for (const [name, cases] of samples) {
    defaults[name] = cases[0]?.value ?? 1;
  }

  const cases = [...samples].flatMap(([name, options]) =>
    options.slice(0, MAXIMUM_CASES).map((sample) => ({
      label: `${name} = ${sample.label}`,
      values: { ...defaults, [name]: sample.value },
    }))
  );
  // Nothing branches: a number or a date is worth one line, for how this language writes it, and
  // plain gaps are not.
  if (cases.length === 0 && [...simple.values()].some(isFormatted)) {
    cases.push({ label: "", values: defaults });
  }

  return cases.flatMap(({ label, values }) => {
    try {
      return [{ label, parts: render(format, values) }];
    } catch {
      // The formatter can still refuse text the scanner accepted; that case simply goes unshown.
      return [];
    }
  });
};

const isFormatted = (value: SampleValue): boolean =>
  typeof value !== "object" || value instanceof Date;

/** A gap goes in as an object and comes back out as the same object, between the strings. */
const render = (format: IntlMessageFormat, values: Record<string, SampleValue>): PreviewPart[] =>
  format.formatToParts<Gap>(values).map((part) => part.value);

/**
 * Every argument the message uses: the plain ones with the value they are shown with, and the ones
 * that branch with the branches they have.
 */
const argumentsOf = (ast: readonly MessageFormatElement[]) => {
  const simple = new Map<string, SampleValue>();
  const branching = new Map<string, Branching>();

  const walk = (elements: readonly MessageFormatElement[]) => {
    for (const element of elements) {
      switch (element.type) {
        case TYPE.argument:
          simple.set(element.value, { gap: element.value });
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
            walk(option.value);
          }
          break;
        }
        case TYPE.tag:
          walk(element.children);
          break;
        default:
      }
    }
  };
  walk(ast);

  // An argument that is also a branch takes the branch's value.
  for (const name of branching.keys()) {
    simple.delete(name);
  }
  return { simple, branching };
};

/**
 * A value that lands in each branch. An exact match (`=0`) is its own number. A category (`one`,
 * `few`) is the first count the language puts in it that no exact match has already claimed, which
 * is what makes `other` show 2 rather than 0 in English when `=0` has a branch of its own.
 */
const samplesFor = (branch: Branching, locale: string): { label: string; value: SampleValue }[] => {
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

/**
 * The previews, read under the field while typing, so a branch that reads wrongly is seen here
 * rather than on the site.
 */
export const Previews = ({ text, locale }: { text: string; locale: string }) => {
  const previews = previewsFor(text, locale);
  if (previews.length === 0) {
    return null;
  }

  return (
    <dl className="examples">
      {previews.map((preview) => (
        <div className="examples__row" key={preview.label}>
          <dt>{preview.label || "Preview"}</dt>
          <dd>
            {preview.parts.map((part, index) =>
              typeof part === "string" ? (
                part
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one rendered string, in order; position is their identity and they never reorder.
                <span className="examples__gap" key={index}>
                  {part.gap}
                </span>
              )
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
};
