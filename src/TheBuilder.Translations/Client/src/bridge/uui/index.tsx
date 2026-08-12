import type { ChangeEvent, KeyboardEvent, ReactNode, Ref } from "react";
import "./types.js";

export { UUI_TAGS } from "./types.js";
export { useCustomEvent, valueOf } from "./use-custom-event.js";

type Look = "default" | "primary" | "secondary" | "outline" | "placeholder";
type Color = "default" | "positive" | "warning" | "danger" | "invalid";

/**
 * The editor's controls.
 *
 * Presentational UUI elements (tag, icon, box, loader) are used directly, so the editor looks like
 * the rest of the backoffice. Form controls are native elements styled with the same tokens, and
 * that is deliberate.
 *
 * UUI's form controls are form-associated custom elements, and inside this React-managed shadow
 * root they do not upgrade: `customElements.get("uui-select")` returns the class, but
 * `document.createElement("uui-select")` returns an HTMLUnknownElement, so the control renders at
 * zero height with no error anywhere. The backoffice's own instances of the same elements upgrade
 * normally, and `uui-tag`, which is not form-associated, upgrades here too -- the failure tracks
 * form association exactly. Waiting on `customElements.whenDefined` does not help, because the
 * definition exists; it is construction that fails.
 *
 * Rather than depend on behaviour that is this fragile for the controls an editor uses constantly,
 * these are plain elements. They also need no property-assignment shim, since a native select takes
 * its options as children, and they bring correct keyboard and screen-reader behaviour for free.
 */

export const Button = ({ children, look = "default", color = "default", type = "button", onClick, className, disabled, compact, label, ref }: {
  children: ReactNode;
  look?: Look;
  color?: Color;
  disabled?: boolean;
  compact?: boolean;
  label?: string;
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
    onClick={onClick}
    className={["button", `button--${look}`, `button--${color}`, compact ? "button--compact" : "", className ?? ""]
      .filter(Boolean).join(" ")}
  >
    {children}
  </button>
);

export const Input = ({ value, onValueChange, onEnter, className, label, placeholder, disabled, type = "text" }: {
  value: string;
  onValueChange: (value: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  type?: string;
  className?: string;
}) => (
  <input
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

// Presentational and not form-associated, so these upgrade here and are used as-is.

export const Tag = ({ children, look = "secondary", color = "default", className }: {
  children: ReactNode;
  look?: Look;
  color?: Color;
  className?: string;
}) => (
  <uui-tag look={look} color={color} class={className}>
    {children}
  </uui-tag>
);

export const Icon = ({ name, label, className }: { name: string; label?: string; className?: string }) => (
  <uui-icon name={name} label={label} class={className} />
);

export const LoaderBar = ({ progress, className }: { progress?: number; className?: string }) => (
  <uui-loader-bar progress={progress} class={className} />
);

export const Box = ({ children, headline, className }: {
  children: ReactNode;
  headline?: string;
  className?: string;
}) => (
  <uui-box headline={headline} class={className}>
    {children}
  </uui-box>
);
