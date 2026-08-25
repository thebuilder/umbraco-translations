import type { LocaleFacet, MessageKey } from "../../api/generated/models.js";
import { Highlight } from "../search/highlight.js";
import type { EditingMode } from "../state/editing-mode.js";
import { localeIn, sameLocale } from "../state/locales.js";
import { textOf } from "./key-columns.js";

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
 * Working down a queue it answers a different question, so it says less. Nobody authoring
 * Norwegian from English wonders which languages still need this key, because every one of them
 * does. They want to know how the others worded it. So the languages with nothing to read are left
 * out, along with the two already on screen, and there is nowhere to click. Leaving the queue to
 * correct German is not the job, and offering it is offering to lose your place.
 */
export const KeyLocales = ({
  row,
  locales,
  editing,
  reference,
  mode,
  term,
  loading,
  onEdit,
}: {
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
  if (loading) {
    return <p className="pane__note">Looking up the other languages…</p>;
  }
  if (!row) {
    return null;
  }

  if (mode === "queue") {
    const elsewhere = locales
      .filter(
        (locale) =>
          !(sameLocale(locale.code, editing) || sameLocale(locale.code, reference ?? editing))
      )
      .map((locale) => ({ locale, text: textOf(localeIn(row.cells, locale.code)) }))
      .filter(
        (entry): entry is { locale: LocaleFacet; text: string } =>
          entry.text !== null && entry.text !== ""
      );

    // Nothing anybody has worded yet, so there is no reading to offer and a heading over an empty
    // box would only say so twice.
    if (elsewhere.length === 0) {
      return null;
    }

    return (
      <section className="pane__block pane__block--apart">
        <h3>Same key elsewhere</h3>
        <dl className="elsewhere">
          {elsewhere.map(({ locale, text }) => (
            <div className="elsewhere__row" key={locale.code}>
              <dt>{locale.name || locale.code}</dt>
              <dd title={text}>
                <Highlight term={term} text={text} />
              </dd>
            </div>
          ))}
        </dl>
      </section>
    );
  }

  const unwritten = locales.filter(
    (locale) => localeIn(row.cells, locale.code) === undefined
  ).length;

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
          const text = textOf(localeIn(row.cells, locale.code));
          return (
            <li
              className={current ? "locales__row locales__row--current" : "locales__row"}
              key={locale.code}
            >
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
                  <Highlight term={term} text={text} />
                </span>
              )}
              {current ? (
                // Already the language being edited: the field above is where it is changed. The
                // dot carries that visually; a plain span takes no accessible name, so the same
                // thing has to be said in text for anyone who is not looking at it.
                <span className="locales__here">
                  <span aria-hidden="true" className="row__dot" />
                  <span className="visually-hidden">Being edited</span>
                </span>
              ) : (
                <button
                  aria-label={`Edit this key in ${locale.name || locale.code}`}
                  className="locales__edit"
                  onClick={() => onEdit(locale.code)}
                  type="button"
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
