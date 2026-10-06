import type { LocaleFacet } from "../../api/generated/models.js";
import { Swap } from "../components/glyphs.js";
import { Caret, Picker } from "../components/picker.js";
import type { EditingMode } from "../state/editing-mode.js";
import { type EditorFilters, editingLocale } from "../state/filters.js";
import { facetFor, facetName } from "../state/locales.js";

/** Setting the comparison to the language being edited is how "no comparison" is expressed. */
const NO_COMPARISON = "";

/**
 * Which language is being edited, and which one it is read against.
 *
 * One compact control at the end of the search row rather than a sentence of its own above it: it
 * is the context every row is read in, but it changes rarely and the search beside it is what gets
 * used. The language being edited carries the weight, because it is the one thing on this screen
 * that changes what all of the rest means.
 */
export const ContextStrip = ({
  filters,
  locales,
  mode,
  update,
}: {
  filters: EditorFilters;
  locales: readonly LocaleFacet[];
  mode: EditingMode;
  update: (patch: Partial<EditorFilters>) => void;
}) => {
  const editing = filters.locale;
  const comparing = filters.referenceLocale !== null && filters.referenceLocale !== editing;
  const current = facetFor(locales, editing);

  const options = locales.map((locale) => ({ name: facetName(locale), value: locale.code }));
  // A comparison is only useful against a language with something to compare, and never against
  // the language being edited -- that is the same column printed twice.
  const comparisons = [
    { name: "None", value: NO_COMPARISON },
    ...options.filter(
      (option) => option.value !== editing && facetFor(locales, option.value)?.messageCount
    ),
  ];

  const reference = comparing ? facetFor(locales, filters.referenceLocale) : undefined;
  // Only when the language being edited could itself be compared against, or the swap would land
  // on a comparison the menu does not offer.
  const swappable = reference !== undefined && Boolean(current?.messageCount);

  /*
   * A site with one language has made no decision for anybody to change, so the language is stated
   * rather than offered, and there is nothing to compare it with. A menu of one is not a choice.
   *
   * With several, the comparison stays even when nothing qualifies for it: a site part way through
   * its first sync has several languages and none with messages yet, and an empty control says
   * something true about that where an absent one says nothing.
   */
  const only = locales.length === 1 ? current : undefined;

  return (
    <div className="langs">
      {only ? (
        <span className="picker picker--lang picker--fixed">
          <span className="picker__face">
            <span className="picker__label">Editing</span>
            <span className="picker__name">{facetName(only)}</span>
          </span>
        </span>
      ) : (
        <Picker
          className="picker--lang picker--lead"
          label="Language being edited"
          // Picking the language on the other side swaps the two rather than collapsing them into
          // one. See editingLocale.
          onChange={(locale) => update(editingLocale(filters, locale))}
          options={options}
          placeholder="Choose a language"
          value={editing ?? ""}
        >
          <span className="picker__label">Editing</span>
          <span className="picker__name">{current ? facetName(current) : "Choose a language"}</span>
          <Caret />
        </Picker>
      )}

      {swappable && reference ? (
        <button
          aria-label={`Edit ${facetName(reference)} and compare against ${current ? facetName(current) : "this language"}`}
          className="langs__swap"
          onClick={() => update(editingLocale(filters, reference.code))}
          title="Swap the languages"
          type="button"
        >
          <Swap className="langs__swap-mark" />
        </button>
      ) : null}

      {only ? null : (
        <Picker
          className="picker--lang"
          label="Language to compare against"
          /*
           * The language being edited is pinned along with the comparison, even though it has not
           * been asked to change.
           *
           * Until somebody picks one it is only implied: the URL names no language, and the server
           * answers with the pair it chose. Its rule for the language being edited is "whatever was
           * asked for, otherwise the reference" -- so naming a reference and nothing else asks it to
           * edit that reference, and the comparison an editor had just chosen came back as the
           * language they were already on with the second column gone. Saying both makes the
           * request the pair the strip is showing.
           */
          onChange={(value) => update({ locale: editing, referenceLocale: value || editing })}
          options={comparisons}
          value={comparing ? (filters.referenceLocale ?? "") : NO_COMPARISON}
        >
          <span className="picker__label">{mode === "queue" ? "From" : "Compare"}</span>
          <span className="picker__name">{reference ? facetName(reference) : "None"}</span>
          <Caret />
        </Picker>
      )}
    </div>
  );
};
