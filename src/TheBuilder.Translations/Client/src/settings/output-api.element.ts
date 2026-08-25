import { LitElement, css, customElement, html, property, state } from "@umbraco-cms/backoffice/external/lit";
import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import type { UUISelectElement } from "@umbraco-cms/backoffice/external/uui";
import type { UmbLanguageDetailModel } from "@umbraco-cms/backoffice/language";
import { UMB_NOTIFICATION_CONTEXT } from "@umbraco-cms/backoffice/notification";
import { UmbTextStyles } from "@umbraco-cms/backoffice/style";
import type { OutputConflict, OutputEndpoint } from "../api/generated/models.js";
import { deliveryEndpoint, type DeliveryFormat, type DeliveryMode } from "./app/source-form.js";
import { deliveryFormatLabel, messageFormatLabel } from "./app/format-options.js";

@customElement("thebuilder-translations-output-api")
export class TranslationOutputApiElement extends UmbElementMixin(LitElement) {
  @property({ attribute: false }) endpoints: OutputEndpoint[] = [];
  @property({ attribute: false }) conflicts: OutputConflict[] = [];
  @property({ attribute: false }) languages: UmbLanguageDetailModel[] = [];

  @state() private _deliveryMode: DeliveryMode = "overrides";
  @state() private _selectedLocale?: string;
  @state() private _selectedNamespace?: string;
  @state() private _selectedFormat?: DeliveryFormat;

  #notification?: typeof UMB_NOTIFICATION_CONTEXT.TYPE;

  constructor() {
    super();
    this.consumeContext(UMB_NOTIFICATION_CONTEXT, context => { this.#notification = context; });
  }

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("endpoints")) this.#reconcileSelection();
  }

  #reconcileSelection(): void {
    const selected = this.endpoints.find(endpoint =>
      endpoint.locale === this._selectedLocale &&
      endpoint.namespace === this._selectedNamespace &&
      endpoint.format === this._selectedFormat) ??
      this.endpoints.find(endpoint => endpoint.locale === this._selectedLocale) ??
      this.endpoints[0];
    this.#selectEndpoint(selected);
  }

  #selectEndpoint(endpoint?: OutputEndpoint): void {
    this._selectedLocale = endpoint?.locale;
    this._selectedNamespace = endpoint?.namespace;
    this._selectedFormat = endpoint?.format;
  }

  #selectLocale(locale: string): void {
    this.#selectEndpoint(this.endpoints.find(endpoint => endpoint.locale === locale));
  }

  #selectNamespace(messageNamespace: string): void {
    this.#selectEndpoint(this.endpoints.find(endpoint =>
      endpoint.locale === this._selectedLocale && endpoint.namespace === messageNamespace));
  }

  #selectFormat(format: string): void {
    this.#selectEndpoint(this.endpoints.find(endpoint =>
      endpoint.locale === this._selectedLocale &&
      endpoint.namespace === this._selectedNamespace &&
      endpoint.format === format));
  }

  #selectedEndpoint(): OutputEndpoint | undefined {
    return this.endpoints.find(endpoint =>
      endpoint.locale === this._selectedLocale &&
      endpoint.namespace === this._selectedNamespace &&
      endpoint.format === this._selectedFormat);
  }

  async #copy(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.#notification?.peek("positive", { data: { headline: "Endpoint copied", message: "The translation output URL is on your clipboard." } });
    } catch {
      this.#notification?.peek("danger", { data: { headline: "Could not copy endpoint", message: "Select and copy the URL manually." } });
    }
  }

  render() {
    const selected = this.#selectedEndpoint();
    const outputUrl = selected
      ? deliveryEndpoint(location.href, selected.locale, selected.namespace, this._deliveryMode, selected.format)
      : undefined;
    const localeOptions = [...new Set(this.endpoints.map(endpoint => endpoint.locale))]
      .map(locale => ({ name: locale, value: locale, selected: locale === this._selectedLocale }));
    const namespaceOptions = [...new Set(this.endpoints
      .filter(endpoint => endpoint.locale === this._selectedLocale)
      .map(endpoint => endpoint.namespace))]
      .map(messageNamespace => ({ name: messageNamespace, value: messageNamespace, selected: messageNamespace === this._selectedNamespace }));
    const formatOptions = this.endpoints
      .filter(endpoint => endpoint.locale === this._selectedLocale && endpoint.namespace === this._selectedNamespace)
      .map(endpoint => ({ name: deliveryFormatLabel(endpoint.format), value: endpoint.format, selected: endpoint.format === this._selectedFormat }));
    const contentOptions = [
      { name: "Overrides", value: "overrides", selected: this._deliveryMode === "overrides" },
      { name: "All translations", value: "all", selected: this._deliveryMode === "all" },
    ];

    return html`
      <uui-box headline="Translation output API" headline-variant="h2">
        <p class="intro">Pick a language and namespace, then copy or open the URL.</p>
        ${this.conflicts.map(conflict => html`
          <div class="conflict" role="status">
            <uui-icon name="icon-alert" aria-hidden="true"></uui-icon>
            <span><strong>${conflict.locale} · ${conflict.namespace}</strong> mixes ${conflict.messageFormats.map(messageFormatLabel).join(" and ")}. Move the sources to separate namespaces before using an output API.</span>
          </div>
        `)}
        ${this.endpoints.length === 0 && this.conflicts.length === 0
          ? html`<p class="empty">Sync a source to create output endpoints.</p>`
          : outputUrl ? html`
            <div class="builder">
              <uui-form-layout-item><uui-label slot="label" for="output-content">Contents</uui-label><uui-select id="output-content" label="Output contents" .options=${contentOptions} @change=${(event: Event) => {
                const value = String((event.currentTarget as UUISelectElement).value);
                if (value === "overrides" || value === "all") this._deliveryMode = value;
              }}></uui-select></uui-form-layout-item>
              <uui-form-layout-item><uui-label slot="label" for="output-language">Language</uui-label><uui-select id="output-language" label="Output language" .options=${localeOptions} @change=${(event: Event) => this.#selectLocale(String((event.currentTarget as UUISelectElement).value))}></uui-select></uui-form-layout-item>
              <uui-form-layout-item><uui-label slot="label" for="output-namespace">Namespace</uui-label><uui-select id="output-namespace" label="Output namespace" .options=${namespaceOptions} @change=${(event: Event) => this.#selectNamespace(String((event.currentTarget as UUISelectElement).value))}></uui-select></uui-form-layout-item>
              <uui-form-layout-item><uui-label slot="label" for="output-format">Format</uui-label><uui-select id="output-format" label="Output format" .options=${formatOptions} @change=${(event: Event) => this.#selectFormat(String((event.currentTarget as UUISelectElement).value))}></uui-select></uui-form-layout-item>
            </div>
            <p class="summary">${this._deliveryMode === "overrides"
              ? "Only the editorial overrides. Merge these over the defaults your app already ships."
              : "Every synced message, with editorial overrides applied."}</p>
            <div class="result">
              <code>${outputUrl}</code>
              <div class="actions">
                <uui-button type="button" look="secondary" label="Copy translation output URL" @click=${() => void this.#copy(outputUrl)}>Copy URL</uui-button>
                <uui-button look="primary" label="Open translation output URL" href=${outputUrl} target="_blank" rel="noopener noreferrer">Open<uui-icon name="icon-out" aria-hidden="true"></uui-icon></uui-button>
              </div>
            </div>
            ${this.languages.some(language => language.unique === selected?.locale) ? "" : html`<p class="language-warning"><uui-icon name="icon-alert" aria-hidden="true"></uui-icon> Umbraco no longer lists ${selected?.locale} as a language.</p>`}
          ` : ""}
      </uui-box>
    `;
  }

  static styles = [UmbTextStyles, css`
    .intro { color: var(--uui-color-text-alt); margin-block: 0 var(--uui-size-space-4); }
    .builder { display: grid; gap: var(--uui-size-space-4); grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .builder uui-form-layout-item { margin: 0; }
    .builder uui-select { inline-size: 100%; }
    .summary { color: var(--uui-color-text-alt); font-size: var(--uui-type-small-size); margin: var(--uui-size-space-3) 0; }
    .result { align-items: center; background: var(--uui-color-surface-alt); border: 1px solid var(--uui-color-divider); border-radius: var(--uui-border-radius); display: grid; gap: var(--uui-size-space-4); grid-template-columns: minmax(0, 1fr) auto; padding: var(--uui-size-space-3); }
    .result code { overflow: hidden; padding-inline: var(--uui-size-space-2); text-overflow: ellipsis; white-space: nowrap; }
    .actions { display: flex; gap: var(--uui-size-space-2); }
    .actions uui-icon { margin-inline-start: var(--uui-size-space-1); }
    .language-warning { align-items: center; color: var(--uui-color-text-alt); display: flex; font-size: var(--uui-type-small-size); gap: var(--uui-size-space-2); margin-block: var(--uui-size-space-3) 0; }
    .empty { color: var(--uui-color-text-alt); margin: 0; }
    .conflict { align-items: flex-start; background: var(--uui-color-warning-standalone); border-radius: var(--uui-border-radius); color: var(--uui-color-warning-standalone-contrast); display: flex; gap: var(--uui-size-space-3); margin-block: var(--uui-size-space-4); padding: var(--uui-size-space-4); }
    @media (max-width: 1000px) { .builder { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 800px) { .builder, .result { grid-template-columns: 1fr; } .actions { justify-content: flex-end; } }
  `];
}

declare global {
  interface HTMLElementTagNameMap {
    "thebuilder-translations-output-api": TranslationOutputApiElement;
  }
}
