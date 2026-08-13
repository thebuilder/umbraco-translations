import type React from "react";
import type {
  UUIBoxElement,
  UUIButtonElement,
  UUICheckboxElement,
  UUIIconElement,
  UUIInputElement,
  UUILoaderBarElement,
  UUISelectElement,
  UUITagElement,
  UUITextareaElement,
} from "@umbraco-cms/backoffice/external/uui";

/**
 * Props for a custom element rendered from React.
 *
 * React 19 assigns a non-event prop as a property when the name already exists on the element and
 * falls back to setAttribute otherwise. That fallback is why object and array props (a select's
 * `options`, for instance) only work once the element has been upgraded, which is what
 * `ReactHostElement.customElementTags` waits for.
 */
export type CustomElementProps<TElement extends HTMLElement> =
  Partial<Omit<TElement, keyof HTMLElement>> &
  Omit<React.HTMLAttributes<TElement>, "children" | "color"> & {
    ref?: React.Ref<TElement>;
    children?: React.ReactNode;
    class?: string;
  };

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "uui-box": CustomElementProps<UUIBoxElement>;
      "uui-button": CustomElementProps<UUIButtonElement>;
      "uui-checkbox": CustomElementProps<UUICheckboxElement>;
      "uui-icon": CustomElementProps<UUIIconElement>;
      "uui-input": CustomElementProps<UUIInputElement>;
      "uui-loader-bar": CustomElementProps<UUILoaderBarElement>;
      "uui-select": CustomElementProps<UUISelectElement>;
      "uui-tag": CustomElementProps<UUITagElement>;
      "uui-textarea": CustomElementProps<UUITextareaElement>;
    }
  }
}

/**
 * Every tag the React tree renders. The host waits for these to upgrade before mounting, so a
 * component can pass an object prop on first render without it silently becoming "[object Object]".
 */
export const UUI_TAGS = [
  "uui-box",
  "uui-button",
  "uui-checkbox",
  "uui-icon",
  "uui-input",
  "uui-loader-bar",
  "uui-select",
  "uui-tag",
  "uui-textarea",
] as const;
