import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import { UMB_NOTIFICATION_CONTEXT } from "@umbraco-cms/backoffice/notification";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { BackofficeBridge } from "./backoffice-bridge.js";
import styles from "../styles.css?inline";

/**
 * Shared across mounts on purpose. The backoffice destroys and recreates the host element on every
 * section-view switch, so a per-instance client would mean a cold cache and a full refetch every
 * time an editor tabs away and back. The entry point clears it on unload and on auth change.
 */
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } });

export const resetQueryCache = (): void => queryClient.clear();

// Parsed once for the lifetime of the bundle rather than on every remount.
const styleSheet = new CSSStyleSheet();
styleSheet.replaceSync(styles);

export abstract class ReactHostElement extends UmbElementMixin(HTMLElement) {
  readonly #bridge: BackofficeBridge = {
    notify: (type, headline, message) => this.#notification?.peek(type, { data: { headline, message: message ?? headline } }),
  };
  #notification?: typeof UMB_NOTIFICATION_CONTEXT.TYPE;
  #root?: Root;

  protected abstract component: ComponentType<{ bridge: BackofficeBridge }>;

  /** Custom elements React renders as props must be upgraded first, or object props become attributes. */
  protected customElementTags: readonly string[] = [];

  constructor() {
    super();
    this.consumeContext(UMB_NOTIFICATION_CONTEXT, (context) => { this.#notification = context; });
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.#root) return;
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    shadow.adoptedStyleSheets = [styleSheet];
    const mount = document.createElement("div");
    mount.className = "mount";
    shadow.append(mount);
    this.#root = createRoot(mount);
    void this.#render();
  }

  async #render(): Promise<void> {
    await this.#awaitCustomElements();
    // The element can be torn down while waiting for upgrades.
    if (!this.#root || !this.isConnected) return;
    this.#root.render(
      createElement(QueryClientProvider, { client: queryClient },
        createElement(this.component, { bridge: this.#bridge })));
  }

  /**
   * Waits for the custom elements React passes object props to, but never indefinitely.
   * `customElements.whenDefined` returns a promise that simply never settles for a tag nobody
   * registers, which would leave the editor as a blank panel with no error. Rendering slightly
   * early degrades one prop; not rendering at all degrades everything.
   */
  async #awaitCustomElements(): Promise<void> {
    if (this.customElementTags.length === 0) return;

    const upgraded = Promise.all(this.customElementTags.map((tag) => customElements.whenDefined(tag)));
    const timedOut = Symbol("timed-out");
    const deadline = new Promise<typeof timedOut>((resolve) =>
      setTimeout(() => resolve(timedOut), ReactHostElement.#upgradeTimeoutMs));

    if (await Promise.race([upgraded.then(() => undefined), deadline]) === timedOut) {
      const pending = this.customElementTags.filter((tag) => !customElements.get(tag));
      console.warn(`[TheBuilder.Translations] Rendering without: ${pending.join(", ")}`);
    }
  }

  static readonly #upgradeTimeoutMs = 3_000;

  override disconnectedCallback(): void {
    this.#root?.unmount();
    this.#root = undefined;
    super.disconnectedCallback();
  }
}
