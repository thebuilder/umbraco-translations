import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import { UMB_NOTIFICATION_CONTEXT } from "@umbraco-cms/backoffice/notification";
import { type ComponentType, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import styles from "../styles.css?inline";
import type { BackofficeBridge } from "./backoffice-bridge.js";

/**
 * Shared across mounts on purpose. The backoffice destroys and recreates the host element on every
 * section-view switch, so a per-instance client would mean a cold cache and a full refetch every
 * time an editor tabs away and back. The entry point clears it on unload and on auth change.
 */
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
});

export const resetQueryCache = (): void => queryClient.clear();

// Parsed once for the lifetime of the bundle rather than on every remount.
const styleSheet = new CSSStyleSheet();
styleSheet.replaceSync(styles);

export abstract class ReactHostElement extends UmbElementMixin(HTMLElement) {
  readonly #bridge: BackofficeBridge = {
    // Umbraco requires a message and treats the headline as an optional bold line above it, so a
    // single-argument call becomes the message alone. Defaulting the message to the headline
    // printed the same sentence twice.
    notify: (type, headline, message) =>
      this.#notification?.peek(type, {
        data: message ? { headline, message } : { message: headline },
      }),
  };
  #notification?: typeof UMB_NOTIFICATION_CONTEXT.TYPE;
  #root?: Root;

  protected abstract component: ComponentType<{ bridge: BackofficeBridge }>;

  constructor() {
    super();
    this.consumeContext(UMB_NOTIFICATION_CONTEXT, (context) => {
      this.#notification = context;
    });
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.#root) {
      return;
    }
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    shadow.adoptedStyleSheets = [styleSheet];
    const mount = document.createElement("div");
    mount.className = "mount";
    shadow.append(mount);
    this.#root = createRoot(mount);
    this.#render();
  }

  #render(): void {
    if (!this.#root) {
      return;
    }
    this.#root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(this.component, { bridge: this.#bridge })
      )
    );
  }

  override disconnectedCallback(): void {
    this.#root?.unmount();
    this.#root = undefined;
    super.disconnectedCallback();
  }
}
