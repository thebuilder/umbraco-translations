import type React from "react";
import type {
  UUIBoxElement,
  UUIIconElement,
  UUILoaderBarElement,
  UUITagElement,
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
      "uui-icon": CustomElementProps<UUIIconElement>;
      "uui-loader-bar": CustomElementProps<UUILoaderBarElement>;
      "uui-tag": CustomElementProps<UUITagElement>;
    }
  }
}

/**
 * The tags the React tree renders, all presentational. The host waits for these before mounting so
 * a prop is never set on an element that has not upgraded.
 *
 * Form controls are deliberately absent: UUI's are form-associated custom elements, which do not
 * upgrade inside this shadow root, so the editor uses native elements for those instead.
 */
export const UUI_TAGS = [
  "uui-box",
  "uui-icon",
  "uui-loader-bar",
  "uui-tag",
] as const;
