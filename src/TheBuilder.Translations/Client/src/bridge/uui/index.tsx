import { useRef, type KeyboardEvent, type ReactNode, type Ref } from "react";
import type {
  UUIButtonElement,
  UUICheckboxElement,
  UUIInputElement,
  UUISelectElement,
  UUITextareaElement,
} from "@umbraco-cms/backoffice/external/uui";
import { useCustomEvent, valueOf } from "./use-custom-event.js";
import "./types.js";

export { UUI_TAGS } from "./types.js";
export { useCustomEvent, valueOf } from "./use-custom-event.js";

type Look = "default" | "primary" | "secondary" | "outline" | "placeholder";
type Color = "default" | "positive" | "warning" | "danger" | "invalid";

/**
 * Thin wrappers over the backoffice's own components.
 *
 * Only the elements the editor actually uses are wrapped; anything else stays plain HTML styled
 * with the same tokens. Beyond consistency with the rest of the backoffice, this module is the seam
 * component tests mock: jsdom cannot upgrade a real custom element, so tests swap this for plain
 * HTML rather than trying to render Lit.
 */

// React 19 accepts `ref` as an ordinary prop on function components, so no forwardRef is needed.
export const Button = ({ children, look = "default", color = "default", type = "button", onClick, className, ref, ...rest }: {
  children: ReactNode;
  look?: Look;
  color?: Color;
  disabled?: boolean;
  compact?: boolean;
  label?: string;
  type?: UUIButtonElement["type"];
  onClick?: () => void;
  className?: string;
  ref?: Ref<UUIButtonElement>;
}) => (
  <uui-button ref={ref} look={look} color={color} type={type} onClick={onClick} class={className} {...rest}>
    {children}
  </uui-button>
);

export const Input = ({ value, onValueChange, onEnter, ...rest }: {
  value: string;
  onValueChange: (value: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  type?: UUIInputElement["type"];
  className?: string;
}) => {
  const ref = useRef<UUIInputElement>(null);
  // `input` rather than `change`: the editor filters as you type, and `change` only fires on blur.
  useCustomEvent(ref, "input", (event: Event) => onValueChange(valueOf(event)));

  return (
    <uui-input
      ref={ref}
      value={value}
      class={rest.className}
      onKeyDown={(event) => {
        if (event.key === "Enter") onEnter?.();
      }}
      {...withoutClassName(rest)}
    />
  );
};

export const Textarea = ({ value, onValueChange, ...rest }: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  rows?: number;
  className?: string;
  onKeyDown?: (event: KeyboardEvent) => void;
  onBlur?: () => void;
}) => {
  const ref = useRef<UUITextareaElement>(null);
  useCustomEvent(ref, "input", (event: Event) => onValueChange(valueOf(event)));

  return <uui-textarea ref={ref} value={value} class={rest.className} {...withoutClassName(rest)} />;
};

export interface SelectOption {
  name: string;
  value: string;
  selected?: boolean;
  disabled?: boolean;
}

export const Select = ({ options, value, onValueChange, ...rest }: {
  options: readonly SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) => {
  const ref = useRef<UUISelectElement>(null);
  useCustomEvent(ref, "change", (event: Event) => onValueChange(valueOf(event)));

  // `options` is an array prop, so it is assigned as a property only once the element has upgraded.
  // ReactHostElement waits for that before mounting.
  return (
    <uui-select
      ref={ref}
      options={options.map((option) => ({ ...option, selected: option.value === value }))}
      class={rest.className}
      {...withoutClassName(rest)}
    />
  );
};

export const Checkbox = ({ checked, onCheckedChange, label, disabled, className }: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) => {
  const ref = useRef<UUICheckboxElement>(null);
  useCustomEvent(ref, "change", () => onCheckedChange(ref.current?.checked ?? false));

  return <uui-checkbox ref={ref} checked={checked} label={label} disabled={disabled} class={className} />;
};

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

// `className` is React's name; custom elements want `class`. Passing both sets the attribute twice.
const withoutClassName = <T extends { className?: string }>(props: T): Omit<T, "className"> => {
  const { className: _ignored, ...rest } = props;
  return rest;
};
