import type { ReactNode } from "react";
import type { SelectOption } from "../../bridge/uui/index.js";
import { Chevron } from "./Glyphs.js";

/**
 * A menu that reads as the sentence it belongs to rather than as a form control.
 *
 * The face is drawn -- a language in the editor's own words with its code beside it in a quieter
 * voice, or a filter's name and its value on either side of a chip -- and a real `<select>` sits
 * over it, transparent and full size. A native select shows one run of text in one style and sizes
 * itself to its longest option, neither of which the design can live with; everything else about
 * it, from keyboard handling to how a screen reader announces it, is exactly what is wanted and
 * cannot be reproduced by hand for free.
 *
 * The select carries the label and the value, so it is the control by every measure that matters.
 * The face is `aria-hidden` because it is the same information said twice.
 */
export const Picker = ({ label, options, value, onChange, className, placeholder, children }: {
  label: string;
  options: readonly SelectOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** What the face says when nothing is chosen, so the control can say the same thing. */
  placeholder?: string;
  /** The drawn face. */
  children: ReactNode;
}) => {
  /*
   * A value naming none of the options is not "nothing chosen" to a native select: it shows the
   * first option instead, as though that one were already picked. Choosing it then fires no change
   * event, because to the select nothing changed -- so the face read "Choose a language" while the
   * menu claimed one was already chosen, and the only language on the list could not be picked at
   * all. An option the select can honestly be on makes every real one a change.
   */
  const unmatched = !options.some((option) => option.value === value);

  return (
    <span className={["picker", className ?? ""].filter(Boolean).join(" ")}>
      <span className="picker__face" aria-hidden="true">{children}</span>
      <select
        className="picker__control"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {/* Disabled rather than hidden: it is where the control currently is, and a menu that
            silently omits its own selected entry is harder to make sense of than one that shows
            it greyed. */}
        {unmatched && <option value={value} disabled>{placeholder ?? "Choose one"}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.name}
          </option>
        ))}
      </select>
    </span>
  );
};

/** The mark that says a menu is behind the words. Drawn, for the reasons in Glyphs. */
export const Caret = () => <Chevron direction="down" className="picker__caret" />;
