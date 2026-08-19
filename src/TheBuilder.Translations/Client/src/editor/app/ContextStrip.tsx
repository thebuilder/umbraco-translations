import type { LocaleFacet } from "../../api/generated/models.js";
import { Caret, Picker } from "../components/Picker.js";
import { coverageOf, type EditingMode } from "../state/editing-mode.js";
import type { EditorFilters } from "../state/filters.js";

/** Setting the comparison to the language being edited is how "no comparison" is expressed. */
const NO_COMPARISON = "";

/**
 * What is being worked on, said as a sentence: editing Danish, compared with English.
 *
 * This is the context every row below is read in, so it sits above everything that narrows which
 * rows those are, and the language being edited carries the weight -- it is the one thing on this
 * screen that changes what all of it means.
 *
 * The right-hand end is one coverage line for that language, in the place the counters used to be.
 * Which numbers belong there depends on the job: a language the application ships text for is
 * measured by how much of it has been changed, and a language it ships nothing for by how much of
 * it exists at all.
 */
export const ContextStrip = ({ filters, locales, totalKeys, mode, update }: {
  filters: EditorFilters;
  locales: readonly LocaleFacet[];
  totalKeys: number | undefined;
  mode: EditingMode;
  update: (patch: Partial<EditorFilters>) => void;
}) => {
  const editing = filters.locale;
  const comparing = filters.referenceLocale !== null && filters.referenceLocale !== editing;
  const current = locales.find((locale) => locale.code === editing);

  const options = locales.map((locale) => ({ name: describe(locale), value: locale.code }));
  // A comparison is only useful against a language with something to compare, and never against
  // the language being edited -- that is the same column printed twice.
  const comparisons = [
    { name: "None", value: NO_COMPARISON },
    ...options.filter((option) =>
      option.value !== editing &&
      locales.find((locale) => locale.code === option.value)?.messageCount),
  ];

  const reference = comparing ? locales.find((locale) => locale.code === filters.referenceLocale) : undefined;

  return (
    <div className="context">
      <span className="context__lead">Editing</span>
      <Picker
        className="picker--lead"
        label="Language being edited"
        options={options}
        value={editing ?? ""}
        onChange={(locale) =>
          // Carrying "no comparison" across a language change means moving it with the new
          // language, or the old one silently becomes the thing being compared against.
          update({ locale, referenceLocale: comparing ? filters.referenceLocale : locale })}
      >
        <span className="picker__name">{current ? nameOf(current) : "Choose a language"}</span>
        {current && <span className="picker__code">{current.code}</span>}
        <Caret />
      </Picker>

      {/* Said once, where the language is chosen, rather than repeated down a column of rows. */}
      {mode === "queue" && (
        <span className="badge badge--info">No application text — written here</span>
      )}

      <span className="context__rule" />

      <span className="context__lead">{mode === "queue" ? "written from" : "compared with"}</span>
      <Picker
        className="picker--quiet"
        label="Language to compare against"
        options={comparisons}
        value={comparing ? filters.referenceLocale ?? "" : NO_COMPARISON}
        onChange={(value) => update({ referenceLocale: value || editing })}
      >
        <span className="picker__name">{reference ? nameOf(reference) : "None"}</span>
        {reference && <span className="picker__code">{reference.code}</span>}
        <Caret />
      </Picker>

      <span className="context__spacer" />

      {current && totalKeys !== undefined && (
        mode === "queue"
          ? <Progress locale={current} totalKeys={totalKeys} />
          : <Counts locale={current} />
      )}
    </div>
  );
};

/** How far through the language is, which in queue mode is the only number worth a glance. */
const Progress = ({ locale, totalKeys }: { locale: LocaleFacet; totalKeys: number }) => {
  const coverage = coverageOf(locale, totalKeys);
  return (
    <div className="coverage">
      <span
        className="coverage__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={coverage.total}
        aria-valuenow={coverage.written}
        aria-label={`Written in ${nameOf(locale)}`}
      >
        <span className="coverage__fill" style={{ inlineSize: `${coverage.fraction * 100}%` }} />
      </span>
      <span className="coverage__count">
        <strong>{coverage.written.toLocaleString()}</strong> of {coverage.total.toLocaleString()} written
      </span>
    </div>
  );
};

/** The two numbers that decide whether there is work here: what was changed, and what moved under it. */
const Counts = ({ locale }: { locale: LocaleFacet }) => (
  <div className="coverage">
    <span className="coverage__count">
      <strong>{locale.overriddenCount.toLocaleString()}</strong> with your own text
    </span>
    {locale.needsReviewCount > 0 && (
      <>
        <span className="context__rule context__rule--short" />
        <span className="coverage__count coverage__count--warning">
          <strong>{locale.needsReviewCount.toLocaleString()}</strong> changed upstream
        </span>
      </>
    )}
  </div>
);

/** The language an editor recognises. The code is the secondary detail and is drawn separately. */
const nameOf = (locale: LocaleFacet): string => locale.name || locale.code;

/** In the menu the two have to be one string, because an option is one run of text. */
const describe = (locale: LocaleFacet): string =>
  locale.name && locale.name !== locale.code ? `${locale.name} (${locale.code})` : locale.code;
