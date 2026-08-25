import type { LocaleFacet } from "../../api/generated/models.js";
import { Caret, Picker } from "../components/Picker.js";
import { coverageOf, type EditingMode } from "../state/editing-mode.js";
import { editingLocale, type EditorFilters } from "../state/filters.js";
import { facetFor } from "../state/locales.js";

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
  const current = facetFor(locales, editing);

  const options = locales.map((locale) => ({ name: describe(locale), value: locale.code }));
  // A comparison is only useful against a language with something to compare, and never against
  // the language being edited -- that is the same column printed twice.
  const comparisons = [
    { name: "None", value: NO_COMPARISON },
    ...options.filter((option) =>
      option.value !== editing &&
      facetFor(locales, option.value)?.messageCount),
  ];

  const reference = comparing ? facetFor(locales, filters.referenceLocale) : undefined;

  /*
   * A site with one language has made no decision for anybody to change, so the language is stated
   * rather than offered. A menu of one is not a choice: it costs a click to learn that, and the
   * caret beside it promises somewhere to go that does not exist.
   */
  const only = locales.length === 1 ? current : undefined;

  /*
   * The comparison goes when the language does, and only then.
   *
   * It was hidden whenever nothing qualified as a comparison, which sounded reasonable and was
   * not. The options are filtered to languages that already have messages, so a site part way
   * through its first sync has several languages and no eligible one, and the whole clause
   * disappeared with no way to bring it back or see why. An empty control says something true
   * about the site. An absent one says nothing.
   */
  const comparable = locales.length > 1;

  return (
    <div className="context">
      <span className="context__lead">Editing</span>
      {only ? (
        <span className="picker picker--lead picker--fixed">
          <span className="picker__face">
            <span className="picker__name">{nameOf(only)}</span>
            <span className="picker__code">{only.code}</span>
          </span>
        </span>
      ) : (
        <Picker
          className="picker--lead"
          label="Language being edited"
          placeholder="Choose a language"
          options={options}
          value={editing ?? ""}
          // Picking the language on the other side of the sentence swaps the two rather than
          // collapsing them into one. See editingLocale.
          onChange={(locale) => update(editingLocale(filters, locale))}
        >
          <span className="picker__name">{current ? nameOf(current) : "Choose a language"}</span>
          {current && <span className="picker__code">{current.code}</span>}
          <Caret />
        </Picker>
      )}

      {/* No badge for a language the application ships nothing for. The strip already says it in
          the words it uses, written from rather than compared with, and carries coverage in place
          of the counts. A pill would be the third telling of one fact. */}

      {comparable && (
        <>
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
        </>
      )}

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
