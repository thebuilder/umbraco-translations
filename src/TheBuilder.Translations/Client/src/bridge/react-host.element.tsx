import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import { UMB_NOTIFICATION_CONTEXT } from "@umbraco-cms/backoffice/notification";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { BackofficeBridge } from "./backoffice-bridge.js";
import styles from "../styles.css?inline";

export abstract class ReactHostElement extends UmbElementMixin(HTMLElement) {
  readonly #queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } });
  readonly #bridge: BackofficeBridge = {
    notify: (type, headline, message) => this.#notification?.peek(type, { data: { headline, message: message ?? headline } }),
  };
  #notification?: typeof UMB_NOTIFICATION_CONTEXT.TYPE;
  #root?: Root;

  protected abstract component: ComponentType<{ bridge: BackofficeBridge }>;

  constructor() {
    super();
    this.consumeContext(UMB_NOTIFICATION_CONTEXT, (context) => { this.#notification = context; });
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.#root) return;
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = styles;
    const mount = document.createElement("div");
    shadow.append(style, mount);
    this.#root = createRoot(mount);
    this.#root.render(createElement(QueryClientProvider, { client: this.#queryClient }, createElement(this.component, { bridge: this.#bridge })));
  }

  override disconnectedCallback(): void {
    this.#root?.unmount();
    this.#root = undefined;
    this.#queryClient.clear();
    super.disconnectedCallback();
  }
}
