import type { ChangeEvent, KeyboardEvent, ReactNode, Ref } from "react";

type Look = "default" | "primary" | "secondary" | "danger";
type Color = "default" | "positive" | "warning" | "danger";

/**
 * The editor's controls: plain elements on the backoffice's own design tokens.
 *
 * UUI's *form* elements are not rendered from React here, deliberately. Creating one through React
 * throws `NotSupportedError: The result must not have attributes` -- a custom element constructor
 * may not set attributes on itself, and those of them do. The browser then leaves the element as an
 * HTMLUnknownElement, which is why these first appeared as controls with zero height and no error,
 * and later as a blank panel when the throw reached the render. The backoffice's own instances are
 * fine; it is construction through this path that fails, and waiting on `customElements.whenDefined`
 * does not help because the definition exists.
 *
 * This is not true of every UUI element, and reading it that way was costing more than it saved.
 * `uui-icon` has no such constructor and builds through React exactly as it does anywhere else, so
 * the editor may use the backoffice's icons where a real icon is what is wanted. Small chrome marks
 * -- a chevron on a menu, the mark on a close button -- stay drawn, because those are sized and
 * centred to the box they sit in rather than to an icon's own metrics. See Glyphs.
 *
 * Styling with the same tokens keeps the editor looking native to the backoffice without depending
 * on that. Native controls also bring correct keyboard and screen-reader behaviour with them, and
 * need no shim to pass an array of options.
 */

export const Button = ({ children, look = "default", color = "default", type = "button", onClick, className, disabled, icon, label, title, keyShortcuts, ref }: {
  children: ReactNode;
  look?: Look;
  color?: Color;
  disabled?: boolean;
  /** A single glyph rather than a word: square, and sized to the glyph. */
  icon?: boolean;
  label?: string;
  /**
   * What a pointer sees on hover. Kept separate from `label` so a keyboard shortcut can be written
   * out for somebody looking at the button without also being read aloud, character by character,
   * to somebody who is not.
   */
  title?: string;
  /** The shortcut that does the same thing, in the form assistive technology expects. */
  keyShortcuts?: string;
  type?: "button" | "submit";
  onClick?: () => void;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}) => (
  <button
    ref={ref}
    type={type}
    disabled={disabled}
    aria-label={label}
    title={title}
    aria-keyshortcuts={keyShortcuts}
    onClick={onClick}
    className={[
      "button",
      // Only the non-default variants add a class, or a plain button carries "button--default"
      // twice -- once for its look and once for its colour.
      look === "default" ? "" : `button--${look}`,
      color === "default" ? "" : `button--${color}`,
      icon ? "button--icon" : "",
      className ?? "",
    ].filter(Boolean).join(" ")}
  >
    {children}
  </button>
);

export const Input = ({ value, onValueChange, onEnter, className, label, placeholder, disabled, type = "text", ref }: {
  value: string;
  onValueChange: (value: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  type?: string;
  className?: string;
  ref?: React.Ref<HTMLInputElement>;
}) => (
  <input
    ref={ref}
    className={["control", className ?? ""].filter(Boolean).join(" ")}
    type={type}
    value={value}
    aria-label={label}
    placeholder={placeholder}
    disabled={disabled}
    onChange={(event: ChangeEvent<HTMLInputElement>) => onValueChange(event.target.value)}
    onKeyDown={(event) => {
      if (event.key === "Enter") onEnter?.();
    }}
  />
);

export const Textarea = ({ value, onValueChange, className, label, placeholder, disabled, rows = 5, onKeyDown, onBlur }: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  rows?: number;
  className?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onBlur?: () => void;
}) => (
  <textarea
    className={["control", className ?? ""].filter(Boolean).join(" ")}
    value={value}
    rows={rows}
    aria-label={label}
    placeholder={placeholder}
    disabled={disabled}
    onChange={(event) => onValueChange(event.target.value)}
    onKeyDown={onKeyDown}
    onBlur={onBlur}
  />
);

export interface SelectOption {
  name: string;
  value: string;
  disabled?: boolean;
}

export const Select = ({ options, value, onValueChange, className, label, disabled }: {
  options: readonly SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) => (
  <select
    className={["control", className ?? ""].filter(Boolean).join(" ")}
    value={value}
    aria-label={label}
    disabled={disabled}
    onChange={(event) => onValueChange(event.target.value)}
  >
    {options.map((option) => (
      <option key={option.value} value={option.value} disabled={option.disabled}>
        {option.name}
      </option>
    ))}
  </select>
);

export const Checkbox = ({ checked, onCheckedChange, label, disabled, className }: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) => (
  <label className={["checkbox", className ?? ""].filter(Boolean).join(" ")}>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onCheckedChange(event.target.checked)}
    />
    <span>{label}</span>
  </label>
);

export const Tag = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span className={["tag", className ?? ""].filter(Boolean).join(" ")}>{children}</span>
);



