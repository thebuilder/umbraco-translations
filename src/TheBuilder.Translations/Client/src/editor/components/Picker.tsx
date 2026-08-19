import type { ReactNode } from "react";
import type { SelectOption } from "../../bridge/uui/index.js";

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
export const Picker = ({ label, options, value, onChange, className, children }: {
  label: string;
  options: readonly SelectOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** The drawn face. */
  children: ReactNode;
}) => (
  <span className={["picker", className ?? ""].filter(Boolean).join(" ")}>
    <span className="picker__face" aria-hidden="true">{children}</span>
    <select
      className="picker__control"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.name}
        </option>
      ))}
    </select>
  </span>
);

/**
 * The caret, drawn rather than typed.
 *
 * `▾` is a text glyph, so its size and its vertical metrics come from whichever font in the stack
 * happens to carry it -- which is not the one the rest of the face is set in. It renders large in
 * some and tiny in others, and it sits on the text baseline rather than beside the words, so it
 * lands somewhere different in every theme. A path is the same shape everywhere and can be centred.
 */
export const Caret = () => (
  <svg className="picker__caret" viewBox="0 0 10 6" aria-hidden="true" focusable="false">
    <path
      d="M1 1.25 5 4.75 9 1.25"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
