// biome-ignore-all lint/suspicious/noUnnecessaryConditions: Lit's @property and @state decorators assign these fields from outside the class, so the initializer is a default and not the only value they ever hold. The rule reads the initializer's literal type and calls every check on them constant.

import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import {
  css,
  customElement,
  html,
  LitElement,
  property,
} from "@umbraco-cms/backoffice/external/lit";
import type {
  UUICheckboxElement,
  UUIInputElement,
  UUISelectElement,
  UUIToggleElement,
} from "@umbraco-cms/backoffice/external/uui";
import type { UmbLanguageDetailModel } from "@umbraco-cms/backoffice/language";
import { UmbTextStyles } from "@umbraco-cms/backoffice/style";
import type { HttpHeaderOptions } from "../api/generated/models.js";
import { messageFormatOptions } from "./app/format-options.js";
import {
  type HeaderValueSource,
  headerValueSource,
  parseMessageFormat,
  parseNamespaceMode,
  parseSourceFormat,
  type SourceDraft,
  sourceAlias,
  unavailableLocales,
  withHeaderValueSource,
} from "./app/source-form.js";

@customElement("thebuilder-translations-source-editor")
class TranslationsSourceEditorElement extends UmbElementMixin(LitElement) {
  @property({ attribute: false }) value!: SourceDraft;
  @property({ attribute: false }) languages: UmbLanguageDetailModel[] = [];
  @property({ type: Boolean }) saving = false;
  @property({ type: Boolean }) testing = false;
  @property({ type: Boolean }) deleting = false;
  @property({ type: Boolean }) creating = false;
  @property({ attribute: false }) error?: string;

  #patch(patch: Partial<SourceDraft>): void {
    this.dispatchEvent(
      new CustomEvent<SourceDraft>("source-change", {
        detail: { ...this.value, ...patch },
        bubbles: true,
        composed: true,
      })
    );
  }

  #text(field: "displayName" | "alias" | "endpointTemplate" | "namespace", event: Event): void {
    const next = String((event.target as UUIInputElement).value ?? "");
    const patch: Partial<SourceDraft> = { [field]: next };
    if (
      field === "displayName" &&
      this.creating &&
      (!this.value.alias || this.value.alias === sourceAlias(this.value.displayName))
    ) {
      patch.alias = sourceAlias(next);
    }
    this.#patch(patch);
  }

  #toggleLocale(locale: string, event: Event): void {
    const { checked } = event.target as UUICheckboxElement;
    const locales = checked
      ? [...new Set([...this.value.locales, locale])]
      : this.value.locales.filter((item) => item !== locale);
    this.#patch({ locales });
  }

  #headerText(index: number, field: keyof HttpHeaderOptions, event: Event): void {
    const headers = [...this.value.headers];
    headers[index] = {
      ...headers[index],
      [field]: String((event.target as UUIInputElement).value ?? ""),
    };
    this.#patch({ headers });
  }

  /** Switching where a header's value comes from clears the field it is moving away from. */
  #headerSource(index: number, source: HeaderValueSource): void {
    const headers = [...this.value.headers];
    headers[index] = withHeaderValueSource(headers[index], source);
    this.#patch({ headers });
  }

  #addHeader(): void {
    // A plain value is the common case and the one that cannot go wrong: somebody with a secret
    // switches deliberately, rather than everybody meeting a settings-key box first and a few of
    // them pasting the secret straight into it.
    this.#patch({ headers: [...this.value.headers, { name: "", value: "" }] });
  }

  #removeHeader(index: number): void {
    this.#patch({ headers: this.value.headers.filter((_, itemIndex) => itemIndex !== index) });
  }

  #submit(event: Event): void {
    event.preventDefault();
    this.dispatchEvent(new CustomEvent("source-submit", { bubbles: true, composed: true }));
  }

  #cancel(): void {
    this.dispatchEvent(new CustomEvent("source-cancel", { bubbles: true, composed: true }));
  }

  #test(): void {
    this.dispatchEvent(new CustomEvent("source-test", { bubbles: true, composed: true }));
  }

  #delete(): void {
    this.dispatchEvent(new CustomEvent("source-delete", { bubbles: true, composed: true }));
  }

  render() {
    const removedLocales = unavailableLocales(
      this.languages.map((language) => language.unique),
      this.value.locales
    );
    const namespaceOptions = [
      {
        name: "Use the first JSON key as the namespace",
        value: "FirstSegment",
        selected: this.value.namespaceMode === "FirstSegment",
      },
      {
        name: "Use one namespace for every message",
        value: "Fixed",
        selected: this.value.namespaceMode === "Fixed",
      },
    ];
    const formatOptions = messageFormatOptions(this.value.messageFormat);
    // What the file is, as opposed to what a message inside it is: both can hold ICU.
    const catalogOptions = [
      {
        name: "Nested JSON",
        value: "NestedJson",
        selected: this.value.sourceFormat === "NestedJson",
      },
      { name: "Gettext PO", value: "Po", selected: this.value.sourceFormat === "Po" },
    ];
    const { headers } = this.value;

    return html`
      <form @submit=${(event: Event) => this.#submit(event)} novalidate>
        <fieldset class="form-fields" ?disabled=${this.saving || this.testing || this.deleting}>
          <uui-box headline="Translation source" headline-variant="h2">
          <p class="intro">Connect a JSON message endpoint and choose which Umbraco languages it supplies.</p>

          <div class="primary-grid">
            <uui-form-layout-item>
              <uui-label slot="label" for="display-name" required>Name</uui-label>
              <div class="field-control">
                <uui-input id="display-name" label="Source name" required maxlength="200" .value=${this.value.displayName} @input=${(event: Event) => this.#text("displayName", event)}></uui-input>
                <span class="help">Shown to backoffice users.</span>
              </div>
            </uui-form-layout-item>

            <uui-form-layout-item class="enabled-field">
              <uui-label slot="label">Sync</uui-label>
              <div class="field-control">
                <uui-toggle label="Enable this translation source" ?checked=${this.value.enabled} @change=${(event: Event) => this.#patch({ enabled: (event.target as UUIToggleElement).checked })}>Enabled</uui-toggle>
                <span class="help">You can still edit and test a disabled source. It just will not sync.</span>
              </div>
            </uui-form-layout-item>
          </div>

          <uui-form-layout-item>
            <uui-label slot="label" for="endpoint" required>Messages endpoint</uui-label>
            <div class="field-control">
              <uui-input id="endpoint" label="Messages endpoint" required .value=${this.value.endpointTemplate} @input=${(event: Event) => this.#text("endpointTemplate", event)}></uui-input>
              <span class="help">Use <code>{locale}</code> for the full Umbraco code (<code>messages/en-US.json</code>), or <code>{language}</code> when the app drops the region (<code>messages/en.json</code>).</span>
            </div>
          </uui-form-layout-item>

          <section class="headers-section" aria-labelledby="request-headers-heading">
            <div>
              <h3 id="request-headers-heading">Request headers</h3>
              <p class="help">Optional headers sent to the messages endpoint. Each one holds its value, or names a server setting to read it from.</p>
            </div>

            ${
              this.value.secretName
                ? html`
              <div class="legacy-auth" role="status">
                <div>
                  <strong>Legacy bearer authentication</strong>
                  <p>This source still reads its bearer token from <code>${this.value.secretName}</code>. Remove it before you add an Authorization header.</p>
                </div>
                <uui-button type="button" look="secondary" label="Remove legacy bearer authentication" @click=${() => this.#patch({ secretName: undefined })}>Remove</uui-button>
              </div>
            `
                : ""
            }

            ${
              headers.length > 0
                ? html`
              <div class="headers-list" role="group" aria-label="Custom request headers">
                <div class="header-row headers-heading" aria-hidden="true">
                  <strong>Name</strong><strong>Value</strong><span></span>
                </div>
                ${headers.map((header, index) => {
                  const source = headerValueSource(header);
                  const secret = source === "setting";
                  return html`
                  <div class="header-row">
                    <div class="header-field">
                      <span class="row-label">Name</span>
                      <uui-input
                        label=${`Header name ${index + 1}`}
                        placeholder="X-Api-Key"
                        maxlength="100"
                        .value=${header.name}
                        @input=${(event: Event) => this.#headerText(index, "name", event)}>
                      </uui-input>
                    </div>
                    <div class="header-field">
                      <span class="row-label">${secret ? "Setting name" : "Value"}</span>
                      ${
                        secret
                          ? html`
                        <uui-input
                          label=${`Value setting name ${index + 1}`}
                          placeholder="Translations:SourceApiKey"
                          maxlength="200"
                          .value=${header.valueConfigurationKey ?? ""}
                          @input=${(event: Event) => this.#headerText(index, "valueConfigurationKey", event)}>
                        </uui-input>
                      `
                          : html`
                        <uui-input
                          label=${`Header value ${index + 1}`}
                          placeholder="application/json"
                          maxlength="1000"
                          .value=${header.value ?? ""}
                          @input=${(event: Event) => this.#headerText(index, "value", event)}>
                        </uui-input>
                      `
                      }
                      <!-- The switch sits under the field it changes, so what it does is visible
                           before it is pressed rather than after. -->
                      <button
                        class="header-source"
                        type="button"
                        @click=${() => this.#headerSource(index, secret ? "value" : "setting")}>
                        ${secret ? "Enter a value directly" : "Read it from a setting instead"}
                      </button>
                    </div>
                    <uui-button type="button" look="default" color="default" label=${`Remove request header ${index + 1}`} @click=${() => this.#removeHeader(index)}>Remove</uui-button>
                  </div>
                `;
                })}
              </div>
              <p class="help">Keep secrets in a setting: a value typed here is stored in the database in plain text. For example, use <code>X-Api-Key</code> with <code>Translations:SourceApiKey</code>. For bearer authentication, use <code>Authorization</code> and set its value to <code>Bearer your-token</code>.</p>
            `
                : ""
            }

            <uui-button id="add" type="button" look="placeholder" color="default" label="Add request header" @click=${() => this.#addHeader()}>Add</uui-button>
          </section>

          <fieldset>
            <legend>Site languages</legend>
            <p class="help language-help">A new source starts with every Umbraco language ticked. Untick the ones this endpoint does not supply.</p>
            ${
              this.languages.length === 0
                ? html`<p class="empty">Umbraco has no languages set up.</p>`
                : html`<div class="language-list">${this.languages.map(
                    (language) => html`
                  <uui-checkbox
                    label=${language.name}
                    ?checked=${this.value.locales.includes(language.unique)}
                    @change=${(event: Event) => this.#toggleLocale(language.unique, event)}>
                    <span>${language.name}</span><small>${language.unique}${language.isDefault ? " · Default" : ""}</small>
                  </uui-checkbox>
                `
                  )}</div>`
            }
            ${
              removedLocales.length > 0
                ? html`
              <div class="unavailable-locales" role="status">
                <p><strong>Languages no longer configured in Umbraco</strong></p>
                <p class="help">Saved on this source before someone removed them from Umbraco. Untick them if the endpoint no longer supplies them.</p>
                <div class="language-list">${removedLocales.map(
                  (locale) => html`
                  <uui-checkbox label=${locale} checked @change=${(event: Event) => this.#toggleLocale(locale, event)}>
                    <span>${locale}</span><small>Not available on this site</small>
                  </uui-checkbox>
                `
                )}</div>
              </div>
            `
                : ""
            }
          </fieldset>

          <div class="two-column">
            <uui-form-layout-item>
              <uui-label slot="label" for="catalog-format">Catalogue format</uui-label>
              <div class="field-control">
                <uui-select id="catalog-format" label="Catalogue format" .options=${catalogOptions} @change=${(event: Event) => this.#patch({ sourceFormat: parseSourceFormat(String((event.target as UUISelectElement).value)) })}></uui-select>
                <span class="help">How the endpoint writes its catalogue. In a PO file the <code>msgid</code> is the message key, the way next-intl writes them, and <code>#.</code> descriptions and <code>#:</code> references are read and discarded.</span>
              </div>
            </uui-form-layout-item>

            <uui-form-layout-item>
              <uui-label slot="label" for="namespace-mode">Namespace handling</uui-label>
              <div class="field-control">
                <uui-select id="namespace-mode" label="Namespace handling" .options=${namespaceOptions} @change=${(event: Event) => this.#patch({ namespaceMode: parseNamespaceMode(String((event.target as UUISelectElement).value)) })}></uui-select>
                <span class="help">The namespace becomes part of the output API URL.</span>
              </div>
            </uui-form-layout-item>

            ${
              this.value.namespaceMode === "Fixed"
                ? html`
              <uui-form-layout-item>
                <uui-label slot="label" for="namespace" required>Namespace</uui-label>
                <div class="field-control">
                  <uui-input id="namespace" label="Namespace" required .value=${this.value.namespace} @input=${(event: Event) => this.#text("namespace", event)}></uui-input>
                  <span class="help">Every message from this source gets this namespace.</span>
                </div>
              </uui-form-layout-item>
            `
                : ""
            }

            <uui-form-layout-item>
              <uui-label slot="label" for="message-format">Message syntax</uui-label>
              <div class="field-control">
                <uui-select id="message-format" label="Message syntax" .options=${formatOptions} @change=${(event: Event) => this.#patch({ messageFormat: parseMessageFormat(String((event.target as UUISelectElement).value)) })}></uui-select>
                <span class="help">ICU reads <code>{name}</code> placeholders. i18next v4 reads <code>{{name}}</code> plus CLDR plural keys such as <code>item_one</code> and <code>item_other</code>.</span>
              </div>
            </uui-form-layout-item>
          </div>

          <details>
            <summary><span>Advanced settings</span><small>Identifier, timeout, and response size</small></summary>
            <div class="advanced-grid">
              <uui-form-layout-item>
                <uui-label slot="label" for="alias" required>Source identifier</uui-label>
                <div class="field-control">
                  <uui-input id="alias" label="Source identifier" required maxlength="100" .value=${this.value.alias} @input=${(event: Event) => this.#text("alias", event)}></uui-input>
                  <span class="help">A stable name the package uses in URLs and configuration. New sources fill it in from the name above.</span>
                </div>
              </uui-form-layout-item>

              <uui-form-layout-item>
                <uui-label slot="label" for="timeout">Request timeout</uui-label>
                <div class="field-control inline-unit">
                  <uui-input id="timeout" type="number" min="1" max="120" label="Request timeout in seconds" .value=${String(this.value.timeoutSeconds)} @input=${(event: Event) => this.#patch({ timeoutSeconds: Number((event.target as UUIInputElement).value) })}></uui-input>
                  <span>seconds</span>
                </div>
              </uui-form-layout-item>

              <uui-form-layout-item>
                <uui-label slot="label" for="response-size">Largest accepted response</uui-label>
                <div class="field-control inline-unit">
                  <uui-input id="response-size" type="number" min="1" max="50" label="Largest accepted response in megabytes" .value=${String(this.value.maximumResponseBytes / 1_000_000)} @input=${(event: Event) => this.#patch({ maximumResponseBytes: Number((event.target as UUIInputElement).value) * 1_000_000 })}></uui-input>
                  <span>MB</span>
                </div>
              </uui-form-layout-item>
            </div>

          </details>

          ${this.error ? html`<p class="error" role="alert"><uui-icon name="icon-alert" aria-hidden="true"></uui-icon>${this.error}</p>` : ""}

          <div class="actions">
            <uui-button type="submit" look="primary" color="positive" label="Save translation source" ?disabled=${this.saving}>${this.saving ? "Saving…" : "Save source"}</uui-button>
            <uui-button type="button" look="secondary" label="Test current source settings" @click=${() => this.#test()}>${this.testing ? "Testing…" : "Test source"}</uui-button>
            <uui-button type="button" look="secondary" label="Cancel editing" @click=${() => this.#cancel()}>Cancel</uui-button>
            ${this.creating ? "" : html`<uui-button class="delete-action" type="button" look="secondary" color="danger" label="Delete translation source" @click=${() => this.#delete()}>${this.deleting ? "Deleting…" : "Delete source"}</uui-button>`}
          </div>
          </uui-box>
        </fieldset>
      </form>
    `;
  }

  static styles = [
    UmbTextStyles,
    css`
    :host { display: block; }
    form { margin: 0; }
    fieldset.form-fields { border: 0; margin: 0; min-inline-size: 0; padding: 0; }
    fieldset.form-fields[disabled] { cursor: wait; }
    .intro { color: var(--uui-color-text-alt); margin: 0 0 var(--uui-size-space-5); }
    .primary-grid, .two-column, .advanced-grid { display: grid; gap: var(--uui-size-space-5); grid-template-columns: repeat(2, minmax(0, 1fr)); }
    uui-form-layout-item { margin-bottom: var(--uui-size-space-5); }
    uui-input, uui-select { inline-size: 100%; }
    .field-control { display: grid; gap: var(--uui-size-space-2); }
    .help { color: var(--uui-color-text-alt); font-size: var(--uui-type-small-size); line-height: 1.45; }
    code { background: var(--uui-color-surface-alt); border-radius: var(--uui-border-radius); padding: 0.1rem 0.25rem; }
    fieldset { border: 0; border-block: 1px solid var(--uui-color-divider); margin: 0 0 var(--uui-size-space-5); padding: var(--uui-size-space-5) 0; }
    legend { font-weight: 700; padding: 0; }
    .language-help { display: block; margin: var(--uui-size-space-2) 0 var(--uui-size-space-4); }
    .language-list { display: grid; gap: var(--uui-size-space-3); grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); }
    .language-list uui-checkbox { background: var(--uui-color-surface-alt); border-radius: var(--uui-border-radius); padding: var(--uui-size-space-3); }
    .language-list span, .language-list small { display: block; }
    .language-list small { color: var(--uui-color-text-alt); }
    .unavailable-locales { background: var(--uui-color-warning-standalone); border-radius: var(--uui-border-radius); margin-block-start: var(--uui-size-space-4); padding: var(--uui-size-space-4); }
    .unavailable-locales p { margin: 0 0 var(--uui-size-space-2); }
    details { border-block-start: 1px solid var(--uui-color-divider); margin-block-start: var(--uui-size-space-1); padding-block-start: var(--uui-size-space-4); }
    summary { align-items: baseline; cursor: pointer; display: flex; font-weight: 700; gap: var(--uui-size-space-3); }
    summary small { color: var(--uui-color-text-alt); font-weight: 400; }
    .advanced-grid { margin-block-start: var(--uui-size-space-5); }
    .headers-section { display: grid; gap: var(--uui-size-space-3); margin-block: calc(-1 * var(--uui-size-space-2)) var(--uui-size-space-5); }
    .headers-section h3 { font-size: var(--uui-type-default-size); margin: 0 0 var(--uui-size-space-1); }
    .headers-section p { margin-block: 0; }
    .legacy-auth { align-items: center; background: var(--uui-color-warning-standalone); border-radius: var(--uui-border-radius); display: flex; gap: var(--uui-size-space-4); justify-content: space-between; padding: var(--uui-size-space-4); }
    .legacy-auth p { margin-block-start: var(--uui-size-space-1); }
    .headers-list { border: 1px solid var(--uui-color-divider); border-radius: var(--uui-border-radius); overflow: hidden; }
    /* Aligned to the top, not the middle. The value column is two rows tall -- the field and the
       switch under it -- so centring hung the name input half a line below the value it sits beside.
       The value column is the wider of the two: a header name is a word, a value can be a token. */
    .header-row { align-items: start; display: grid; gap: var(--uui-size-space-3); grid-template-columns: minmax(10rem, 0.8fr) minmax(16rem, 1.2fr) auto; padding: var(--uui-size-space-3); }
    .header-row + .header-row { border-block-start: 1px solid var(--uui-color-divider); }
    .headers-heading { align-items: center; background: var(--uui-color-surface-alt); }
    /* The field and the switch under it are one column: what a row is currently asking for, and the
       one press that changes what it asks for. */
    .header-field { min-inline-size: 0; display: grid; gap: var(--uui-size-space-1); }
    .header-source {
      justify-self: start; padding: 0; border: 0; background: none;
      color: var(--uui-color-interactive); cursor: pointer;
      font: inherit; font-size: var(--uui-type-small-size);
      text-decoration: underline; text-underline-offset: 2px;
    }
    .header-source:hover { color: var(--uui-color-interactive-emphasis); }
    .header-source:focus-visible { border-radius: 2px; outline: 2px solid var(--uui-color-focus); outline-offset: 2px; }
    .row-label { display: none; font-weight: 700; }
    #add { inline-size: 100%; }
    .inline-unit { align-items: center; grid-template-columns: minmax(7rem, 1fr) auto; }
    .actions { display: flex; flex-wrap: wrap; gap: var(--uui-size-space-3); margin-block-start: var(--uui-size-space-5); }
    .delete-action { margin-inline-start: auto; }
    .error { align-items: center; color: var(--uui-color-danger); display: flex; gap: var(--uui-size-space-2); margin: var(--uui-size-space-4) 0 0; }
    .empty { color: var(--uui-color-danger); }
    @media (max-width: 800px) { .primary-grid, .two-column, .advanced-grid { grid-template-columns: 1fr; } .legacy-auth { align-items: stretch; flex-direction: column; } .header-row { align-items: stretch; grid-template-columns: 1fr; } .headers-heading { display: none; } .row-label { display: inline; } .delete-action { margin-inline-start: 0; } }
  `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "thebuilder-translations-source-editor": TranslationsSourceEditorElement;
  }
}
