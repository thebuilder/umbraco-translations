import type { LocaleFacet, MessageKey } from "../../api/generated/models.js";
import { Highlight } from "../search/Highlight.js";
import type { EditingMode } from "../state/editing-mode.js";
import { localeIn, sameLocale } from "../state/locales.js";
import { valueOf } from "./key-columns.js";

/**
 * The same key in every language the site has.
 *
 * The list holds two languages because a list is for scanning and a third column is too narrow for
 * a sentence. This is where the question that leaves out gets answered: is the wording wrong
 * everywhere, or only in the one being edited. For the job that brings an editor here most often --
 * somebody reported a string -- that is usually the actual question.
 *
 * Every configured language is listed, including the ones this key has never been written in. Those
 * are half the answer: "which languages still need this" is not something a list of the languages
 * that already have it can be read backwards to give.
 *
 * Switching to one is switching the whole view to it, not a second editor inside the first. Two
 * fields for two languages open at once is a way to save text into the wrong one.
 *
 * Working down a queue it is a different section for a different question, so it says less. Nobody
 * authoring Norwegian from English is asking which languages still need this key -- every one of
 * them does, that is what the queue is -- they are asking how the other languages worded it, which
 * is a reading and not a list of places to go. So the ones with nothing to read are left out, along
 * with the two already on screen, and there is nowhere to click: leaving the queue to correct
 * German is not the job, and an offer to do it is an offer to lose your place.
 */
export const KeyLocales = ({ row, locales, editing, reference, mode, term, loading, onEdit }: {
  /** The key with a cell per language, or undefined while that is still being fetched. */
  row: MessageKey | null | undefined;
  locales: readonly LocaleFacet[];
  editing: string;
  /** The language being written from, which the pane already shows above and need not repeat. */
  reference?: string;
  mode: EditingMode;
  term: string;
  loading: boolean;
  onEdit: (locale: string) => void;
}) => {
  if (loading) return <p className="pane__note">Looking up the other languages…</p>;
  if (!row) return null;

  if (mode === "queue") {
    const elsewhere = locales
      .filter((locale) =>
        !sameLocale(locale.code, editing) &&
        !sameLocale(locale.code, reference ?? editing))
      .map((locale) => ({ locale, text: valueOf(localeIn(row.cells, locale.code)) }))
      .filter((entry): entry is { locale: LocaleFacet; text: string } =>
        entry.text !== null && entry.text !== "");

    // Nothing anybody has worded yet, so there is no reading to offer and a heading over an empty
    // box would only say so twice.
    if (elsewhere.length === 0) return null;

    return (
      <section className="pane__block pane__block--apart">
        <h3>Same key elsewhere</h3>
        <dl className="elsewhere">
          {elsewhere.map(({ locale, text }) => (
            <div key={locale.code} className="elsewhere__row">
              <dt>{locale.name || locale.code}</dt>
              <dd title={text}><Highlight text={text} term={term} /></dd>
            </div>
          ))}
        </dl>
      </section>
    );
  }

  const unwritten = locales.filter((locale) => localeIn(row.cells, locale.code) === undefined).length;

  return (
    <section className="pane__block">
      <div className="pane__blockhead">
        <h3>This key in every language</h3>
        <span className="pane__aside">
          {locales.length} {locales.length === 1 ? "language" : "languages"}
          {unwritten > 0 && ` · ${unwritten} not written`}
        </span>
      </div>

      <ul className="locales">
        {locales.map((locale) => {
          const current = sameLocale(locale.code, editing);
          const text = valueOf(localeIn(row.cells, locale.code));
          return (
            <li key={locale.code} className={current ? "locales__row locales__row--current" : "locales__row"}>
              <span className="locales__name">
                {locale.name || locale.code}
                <span className="locales__code">{locale.code}</span>
              </span>
              {text === null || text === "" ? (
                <span className="locales__text locales__text--absent">
                  {text === "" ? "Deliberately empty" : "Not written"}
                </span>
              ) : (
                <span className="locales__text" title={text}>
                  <Highlight text={text} term={term} />
                </span>
              )}
              {current ? (
                // Already the language being edited: the field above is where it is changed.
                <span className="locales__here" aria-label="Being edited">
                  <span className="row__dot" aria-hidden="true" />
                </span>
              ) : (
                <button
                  type="button"
                  className="locales__edit"
                  aria-label={`Edit this key in ${locale.name || locale.code}`}
                  onClick={() => onEdit(locale.code)}
                >
                  <span aria-hidden="true">✎</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};
