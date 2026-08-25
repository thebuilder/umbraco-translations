// biome-ignore-all lint/suspicious/noUnnecessaryConditions: Lit's @property and @state decorators assign these fields from outside the class, so the initializer is a default and not the only value they ever hold. The rule reads the initializer's literal type and calls every check on them constant.

import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import { css, customElement, html, LitElement, state } from "@umbraco-cms/backoffice/external/lit";
import type { UUISelectElement } from "@umbraco-cms/backoffice/external/uui";
import {
  UmbLanguageCollectionRepository,
  type UmbLanguageDetailModel,
} from "@umbraco-cms/backoffice/language";
import { umbConfirmModal } from "@umbraco-cms/backoffice/modal";
import { UMB_NOTIFICATION_CONTEXT } from "@umbraco-cms/backoffice/notification";
import { UmbTextStyles } from "@umbraco-cms/backoffice/style";
import { api } from "../api/generated/client.js";
import type {
  OutputConflict,
  OutputEndpoint,
  Source,
  SourceTestResult,
  SyncResult,
} from "../api/generated/models.js";
import { messageFormatLabel } from "./app/format-options.js";
import {
  createEmptySource,
  hasLocaleToken,
  headerIsComplete,
  type SourceDraft,
  sourceEndpoint,
  sourceRequest,
} from "./app/source-form.js";
import "./output-api.element.js";
import "./source-editor.element.js";

/** The characters an alias may use, so it can sit in a URL path without escaping. */
const SOURCE_ALIAS = /^[a-z0-9._~-]+$/;

type ActionName = "test" | "sync" | "history" | "delete";

/**
 * A test that could not reach every locale failed, and one that reached them all and found nothing
 * is a different problem with a different fix. Saying "no messages found" about an endpoint that
 * never answered sends somebody to look at their JSON instead of their URL.
 */
const describeTestOutcome = (result: SourceTestResult, expectedLocales: number) => {
  if (result.success) {
    return {
      tone: "positive",
      headline: "Endpoint responded",
      message: `Found ${result.messageCount} messages for ${result.locales.join(", ")}.`,
    } as const;
  }
  const detail = result.warnings.join(" ") || "The endpoint returned no messages.";
  if (result.locales.length === expectedLocales) {
    return { tone: "warning", headline: "No messages found", message: detail } as const;
  }
  return { tone: "danger", headline: "Could not reach the endpoint", message: detail } as const;
};

@customElement("thebuilder-translations-settings")
class TranslationsSettingsDashboardElement extends UmbElementMixin(LitElement) {
  @state() private _sources: Source[] = [];
  @state() private _languages: UmbLanguageDetailModel[] = [];
  @state() private _outputEndpoints: OutputEndpoint[] = [];
  @state() private _outputConflicts: OutputConflict[] = [];
  @state() private _draft?: SourceDraft;
  @state() private _editing?: Source;
  @state() private _loading = true;
  @state() private _saving = false;
  @state() private _loadError?: string;
  @state() private _formError?: string;
  @state() private _running?: { name: ActionName; sourceId: string };
  @state() private _histories: Record<string, SyncResult[]> = {};
  @state() private _openHistoryIds: string[] = [];
  @state() private _sourceApiLocales: Record<string, string> = {};

  #notification?: typeof UMB_NOTIFICATION_CONTEXT.TYPE;
  readonly #languageRepository = new UmbLanguageCollectionRepository(this);

  constructor() {
    super();
    this.consumeContext(UMB_NOTIFICATION_CONTEXT, (context) => {
      this.#notification = context;
    });
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.#load();
  }

  async #load(): Promise<void> {
    this._loading = true;
    this._loadError = undefined;
    try {
      const [sources, languageResponse, facets] = await Promise.all([
        api.sources(),
        this.#loadLanguages(),
        api.facets(),
      ]);
      this._sources = sources;
      this._languages = languageResponse;
      this._outputEndpoints = facets.outputEndpoints;
      this._outputConflicts = facets.outputConflicts ?? [];
    } catch (error) {
      this._loadError = this.#message(error, "Could not load translation settings.");
    } finally {
      this._loading = false;
    }
  }

  async #loadLanguages(): Promise<UmbLanguageDetailModel[]> {
    const languages: UmbLanguageDetailModel[] = [];
    const take = 100;
    let more = true;
    while (more) {
      // biome-ignore lint/performance/noAwaitInLoops: the next page's offset is however many languages have already arrived, so there is nothing to request in parallel
      const response = await this.#languageRepository.requestCollection({
        skip: languages.length,
        take,
      });
      if (response.error) {
        throw response.error;
      }
      const page = response.data;
      if (!page) {
        return languages;
      }
      languages.push(...page.items);
      more = languages.length < page.total && page.items.length > 0;
    }
    return languages;
  }

  #newSource(): void {
    const locales = this._languages.map((language) => language.unique);
    this._editing = undefined;
    this._draft = createEmptySource(locales);
    this._formError = undefined;
  }

  #editSource(source: Source): void {
    this._editing = source;
    this._draft = sourceRequest(source);
    this._formError = undefined;
  }

  #cancelEdit(): void {
    this._editing = undefined;
    this._draft = undefined;
    this._formError = undefined;
  }

  #validationMessage(source: SourceDraft): string | undefined {
    if (!source.displayName.trim()) {
      return "Enter a source name.";
    }
    if (!source.alias.trim()) {
      return "Enter a source identifier.";
    }
    if (source.alias === "." || source.alias === ".." || !SOURCE_ALIAS.test(source.alias)) {
      return "Use only lowercase letters, numbers, hyphens, periods, underscores, or tildes in the source identifier.";
    }
    if (!hasLocaleToken(source.endpointTemplate)) {
      return "The messages endpoint must contain {locale} or {language}.";
    }
    if (source.locales.length === 0) {
      return "Choose at least one site language.";
    }
    if (source.namespaceMode === "Fixed" && !source.namespace.trim()) {
      return "Enter a namespace.";
    }
    if (
      !Number.isFinite(source.timeoutSeconds) ||
      source.timeoutSeconds < 1 ||
      source.timeoutSeconds > 120
    ) {
      return "Request timeout must be between 1 and 120 seconds.";
    }
    if (
      !Number.isFinite(source.maximumResponseBytes) ||
      source.maximumResponseBytes < 1_000_000 ||
      source.maximumResponseBytes > 50_000_000
    ) {
      return "Largest accepted response must be between 1 and 50 MB.";
    }
    if (source.headers.some((header) => !headerIsComplete(header))) {
      return "Complete or remove every request header row.";
    }
    return undefined;
  }

  async #save(): Promise<void> {
    if (!this._draft || this._saving) {
      return;
    }
    const validation = this.#validationMessage(this._draft);
    if (validation) {
      this._formError = validation;
      return;
    }
    this._saving = true;
    this._formError = undefined;
    try {
      const saved = this._editing
        ? await api.updateSource(this._editing.id, this._draft)
        : await api.createSource(this._draft);
      this._sources = this._editing
        ? this._sources.map((source) => (source.id === saved.id ? saved : source))
        : [...this._sources, saved];
      this.#notification?.peek("positive", { data: { message: "Source saved." } });
      this.#cancelEdit();
    } catch (error) {
      this._formError = this.#message(error, "Could not save the source.");
    } finally {
      this._saving = false;
    }
  }

  async #testDraft(): Promise<void> {
    if (this._running || !this._draft) {
      return;
    }
    const validation = this.#validationMessage(this._draft);
    if (validation) {
      this._formError = validation;
      return;
    }
    this._formError = undefined;
    this._running = { name: "test", sourceId: this._editing?.id ?? "draft" };
    try {
      const result = await api.testSourceConfiguration(this._draft);
      const outcome = describeTestOutcome(result, this._draft.locales.length);
      this.#notification?.peek(outcome.tone, {
        data: { headline: outcome.headline, message: outcome.message },
      });
    } catch (error) {
      this.#notification?.peek("danger", {
        data: {
          headline: "Could not reach the endpoint",
          message: this.#message(error, "Could not test the source."),
        },
      });
    } finally {
      this._running = undefined;
    }
  }

  async #sync(source: Source): Promise<void> {
    if (this._running || !source.enabled) {
      return;
    }
    this._running = { name: "sync", sourceId: source.id };
    try {
      const result = await api.syncSource(source.id);
      this.#notification?.peek("positive", {
        data: {
          headline: "Sync complete",
          message: `${result.addedCount} added, ${result.changedCount} changed, ${result.missingCount} removed.`,
        },
      });
      try {
        const [updated, history, facets] = await Promise.all([
          api.source(source.id),
          this._openHistoryIds.includes(source.id)
            ? api.syncHistory(source.id)
            : Promise.resolve(undefined),
          api.facets(),
        ]);
        this._sources = this._sources.map((item) => (item.id === updated.id ? updated : item));
        if (history) {
          this._histories = { ...this._histories, [source.id]: history };
        }
        this._outputEndpoints = facets.outputEndpoints;
        this._outputConflicts = facets.outputConflicts ?? [];
      } catch (error) {
        this.#notification?.peek("warning", {
          data: {
            headline: "Sync complete",
            message: this.#message(error, "Refresh the page to see the latest source status."),
          },
        });
      }
    } catch (error) {
      this.#notification?.peek("danger", {
        data: {
          headline: "Sync failed",
          message: this.#message(error, "Could not sync the source."),
        },
      });
    } finally {
      this._running = undefined;
    }
  }

  async #deleteSource(source: Source): Promise<void> {
    if (this._running) {
      return;
    }
    this._running = { name: "delete", sourceId: source.id };
    try {
      await api.deleteSource(source.id);
      this._sources = this._sources.filter((item) => item.id !== source.id);
      if (this._editing?.id === source.id) {
        this.#cancelEdit();
      }
      this._openHistoryIds = this._openHistoryIds.filter((id) => id !== source.id);
      const { [source.id]: _removedHistory, ...histories } = this._histories;
      const { [source.id]: _removedLocale, ...sourceApiLocales } = this._sourceApiLocales;
      this._histories = histories;
      this._sourceApiLocales = sourceApiLocales;
      this.#notification?.peek("positive", {
        data: {
          headline: "Source deleted",
          message: `Removed ${source.displayName} and every message it had synced.`,
        },
      });

      try {
        const facets = await api.facets();
        this._outputEndpoints = facets.outputEndpoints;
        this._outputConflicts = facets.outputConflicts ?? [];
      } catch (error) {
        this.#notification?.peek("warning", {
          data: {
            headline: "Could not refresh the output APIs",
            message: this.#message(error, "Reload Settings to refresh them."),
          },
        });
      }
    } catch (error) {
      this.#notification?.peek("danger", {
        data: {
          headline: "Could not delete the source",
          message: this.#message(error, "Try again."),
        },
      });
    } finally {
      this._running = undefined;
    }
  }

  async #confirmDeleteSource(source: Source): Promise<void> {
    if (this._running) {
      return;
    }
    try {
      await umbConfirmModal(this, {
        headline: `Delete ${source.displayName}?`,
        content:
          "This permanently removes the source, every message it synced, the editorial overrides on those messages, and the sync history.",
        color: "danger",
        confirmLabel: "Delete source",
        cancelLabel: "Cancel",
      });
    } catch {
      return;
    }
    await this.#deleteSource(source);
  }

  async #toggleHistory(sourceId: string): Promise<void> {
    if (this._running) {
      return;
    }
    if (this._openHistoryIds.includes(sourceId)) {
      this._openHistoryIds = this._openHistoryIds.filter((id) => id !== sourceId);
      return;
    }
    this._openHistoryIds = [...this._openHistoryIds, sourceId];
    if (!this._histories[sourceId]) {
      await this.#loadHistory(sourceId);
    }
  }

  async #loadHistory(sourceId: string): Promise<void> {
    this._running = { name: "history", sourceId };
    try {
      const history = await api.syncHistory(sourceId);
      this._histories = { ...this._histories, [sourceId]: history };
    } catch (error) {
      this.#notification?.peek("danger", {
        data: {
          headline: "Could not load the history",
          message: this.#message(error, "Try again."),
        },
      });
    } finally {
      this._running = undefined;
    }
  }

  #message(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
  }

  #isRunning(name: ActionName, sourceId: string): boolean {
    return this._running?.name === name && this._running.sourceId === sourceId;
  }

  #sourceApiLocale(source: Source): string {
    const selected = this._sourceApiLocales[source.id];
    return selected && source.parser.locales.includes(selected)
      ? selected
      : (source.parser.locales[0] ?? "");
  }

  #selectSourceApiLocale(sourceId: string, locale: string): void {
    this._sourceApiLocales = { ...this._sourceApiLocales, [sourceId]: locale };
  }

  #renderSource(source: Source) {
    const historyOpen = this._openHistoryIds.includes(source.id);
    const history = this._histories[source.id];
    const namespace =
      source.parser.namespaceMode === "Fixed" ? source.parser.namespace : "From first JSON key";
    const localeCount = source.parser.locales.length;
    const apiLocale = this.#sourceApiLocale(source);
    const apiLocaleOptions = source.parser.locales.map((locale) => ({
      name: locale,
      value: locale,
      selected: locale === apiLocale,
    }));
    return html`
      <article class="source-card">
        <div class="source-heading">
          <div>
            <div class="source-title"><strong>${source.displayName}</strong><uui-tag color=${source.enabled ? "positive" : "default"}>${source.enabled ? "Enabled" : "Disabled"}</uui-tag></div>
            <p>${localeCount} ${localeCount === 1 ? "locale" : "locales"} · ${namespace} · ${messageFormatLabel(source.parser.messageFormat)}</p>
          </div>
          <div class="actions">
            <uui-button type="button" look="secondary" label=${`Edit ${source.displayName}`} ?disabled=${Boolean(this._running)} @click=${() => this.#editSource(source)}>Edit</uui-button>
            <uui-button type="button" look="secondary" color="positive" label=${`Sync ${source.displayName} now`} ?disabled=${Boolean(this._running) || !source.enabled} @click=${() => this.#sync(source)}>${this.#isRunning("sync", source.id) ? "Syncing…" : "Sync now"}</uui-button>
            <uui-button type="button" look="secondary" label=${`${historyOpen ? "Hide" : "Show"} sync history for ${source.displayName}`} ?disabled=${Boolean(this._running)} @click=${() => this.#toggleHistory(source.id)}>${historyOpen ? "Hide history" : "History"}</uui-button>
          </div>
        </div>
        ${source.lastSuccessfulSync ? html`<p class="last-sync">Last synced ${new Date(source.lastSuccessfulSync).toLocaleString()} · revision ${source.lastSuccessfulRevision?.slice(0, 10)}</p>` : ""}
        <div class="source-apis">
          <strong>Messages endpoint</strong>
          <uui-select
            class="source-api-locale"
            label=${`Locale for the ${source.displayName} messages endpoint`}
            .options=${apiLocaleOptions}
            @change=${(event: Event) => this.#selectSourceApiLocale(source.id, String((event.currentTarget as UUISelectElement).value))}>
          </uui-select>
          <uui-button
            look="secondary"
            label=${`Open the ${source.displayName} messages endpoint for ${apiLocale}`}
            href=${sourceEndpoint(source.transport.endpointTemplate, apiLocale)}
            target="_blank"
            rel="noopener noreferrer">
            Open<uui-icon name="icon-out" aria-hidden="true"></uui-icon>
          </uui-button>
          ${
            source.transport.headers.length > 0 || source.transport.secretName
              ? html`<small>Your browser will not send the headers that sync uses, so this may come back unauthorized.</small>`
              : ""
          }
        </div>
        ${historyOpen ? this.#renderHistory(source.id, history) : ""}
      </article>
    `;
  }

  #renderHistory(sourceId: string, history?: SyncResult[]) {
    if (this.#isRunning("history", sourceId)) {
      return html`<p>Loading history…</p>`;
    }
    if (!history?.length) {
      return html`<p>No syncs yet.</p>`;
    }
    return html`
      <div class="table-frame">
        <uui-table>
          <uui-table-head><uui-table-head-cell>Started</uui-table-head-cell><uui-table-head-cell>Status</uui-table-head-cell><uui-table-head-cell>Result</uui-table-head-cell></uui-table-head>
          ${history.map((item) => html`<uui-table-row><uui-table-cell>${new Date(item.startedAt).toLocaleString()}</uui-table-cell><uui-table-cell>${item.status}</uui-table-cell><uui-table-cell>${item.error ?? `${item.addedCount} added · ${item.changedCount} changed · ${item.missingCount} removed`}</uui-table-cell></uui-table-row>`)}
        </uui-table>
      </div>
    `;
  }

  render() {
    return html`
      <main>
        <h1 class="visually-hidden">Translation settings</h1>
        ${this.#renderBody()}
      </main>
    `;
  }

  /** Loading, failed to load, editing one source, or the list: exactly one of the four. */
  #renderBody() {
    if (this._loading) {
      return html`<div class="loading"><uui-loader></uui-loader><span>Loading translation settings…</span></div>`;
    }
    if (this._loadError) {
      return html`<uui-box headline="Could not load translation settings" headline-variant="h2"><p class="error" role="alert">${this._loadError}</p><uui-button look="primary" label="Load translation settings again" @click=${() => this.#load()}>Try again</uui-button></uui-box>`;
    }
    if (this._draft) {
      return html`
          <thebuilder-translations-source-editor
            .value=${this._draft}
            .languages=${this._languages}
            .saving=${this._saving}
            .testing=${this.#isRunning("test", this._editing?.id ?? "draft")}
            .deleting=${Boolean(this._editing && this.#isRunning("delete", this._editing.id))}
            .creating=${!this._editing}
            .error=${this._formError}
            @source-change=${(event: CustomEvent<SourceDraft>) => {
              this._draft = event.detail;
              this._formError = undefined;
            }}
            @source-submit=${() => this.#save()}
            @source-test=${() => {
              this.#testDraft();
            }}
            @source-delete=${() => {
              if (this._editing) {
                this.#confirmDeleteSource(this._editing);
              }
            }}
            @source-cancel=${() => this.#cancelEdit()}>
          </thebuilder-translations-source-editor>
        `;
    }
    return html`
          <uui-box class="sources-box" headline="Sources" headline-variant="h2">
            <div class="sources-content">
              ${
                this._sources.length === 0
                  ? html`<div class="empty-state"><uui-icon name="icon-globe" aria-hidden="true"></uui-icon><h3>No translation sources yet</h3><p>Add a source to pull JSON messages into the languages this site is set up for.</p></div>`
                  : html`<div class="source-list">${this._sources.map((source) => this.#renderSource(source))}</div>`
              }
            </div>
            <div class="sources-footer">
              <uui-button look="primary" color="positive" label="Add translation source" @click=${() => this.#newSource()}>Add source</uui-button>
            </div>
          </uui-box>
          <thebuilder-translations-output-api
            .endpoints=${this._outputEndpoints}
            .conflicts=${this._outputConflicts}
            .languages=${this._languages}>
          </thebuilder-translations-output-api>
        `;
  }

  static styles = [
    UmbTextStyles,
    css`
    :host { display: block; padding: var(--uui-size-layout-1); }
    main { display: grid; gap: var(--uui-size-space-5); margin: 0 auto; max-inline-size: 1450px; }
    .visually-hidden { block-size: 1px; clip: rect(0 0 0 0); clip-path: inset(50%); inline-size: 1px; margin: -1px; overflow: hidden; padding: 0; position: absolute; white-space: nowrap; }
    .source-heading p, .last-sync { color: var(--uui-color-text-alt); margin: 0; }
    .loading { align-items: center; display: flex; gap: var(--uui-size-space-3); justify-content: center; min-block-size: 12rem; }
    .source-list { display: grid; gap: var(--uui-size-space-4); }
    .sources-box { --uui-box-default-padding: 0; }
    .sources-content { padding: var(--uui-size-space-5); }
    .sources-footer { border-block-start: 1px solid var(--uui-color-divider); display: flex; justify-content: flex-end; padding: var(--uui-size-space-4) var(--uui-size-space-5); }
    .source-card { border: 1px solid var(--uui-color-divider); border-radius: var(--uui-border-radius); padding: var(--uui-size-space-4); }
    .source-heading { align-items: flex-start; display: flex; flex-wrap: wrap; gap: var(--uui-size-space-4); justify-content: space-between; }
    .source-title { align-items: center; display: flex; gap: var(--uui-size-space-2); margin-block-end: var(--uui-size-space-1); }
    .actions { display: flex; flex-wrap: wrap; gap: var(--uui-size-space-2); }
    .last-sync { font-size: var(--uui-type-small-size); margin-block-start: var(--uui-size-space-3); }
    .source-apis { align-items: center; border-block-start: 1px solid var(--uui-color-divider); display: flex; flex-wrap: wrap; gap: var(--uui-size-space-2) var(--uui-size-space-4); margin-block-start: var(--uui-size-space-4); padding-block-start: var(--uui-size-space-4); }
    .source-api-locale { inline-size: 10rem; }
    .source-apis uui-button uui-icon { margin-inline-start: var(--uui-size-space-1); }
    .source-apis small { color: var(--uui-color-text-alt); flex-basis: 100%; }
    .table-frame { margin-block-start: var(--uui-size-space-4); overflow-x: auto; }
    .empty-state { align-items: center; display: flex; flex-direction: column; padding: var(--uui-size-layout-1); text-align: center; }
    .empty-state uui-icon { color: var(--uui-color-text-alt); font-size: 2.5rem; }
    .empty-state h3 { margin: var(--uui-size-space-3) 0 var(--uui-size-space-1); }
    .empty-state p { color: var(--uui-color-text-alt); margin: 0 0 var(--uui-size-space-4); }
    .error { color: var(--uui-color-danger); }
    @media (max-width: 800px) { :host { padding: var(--uui-size-space-4); } }
  `,
  ];
}

export default TranslationsSettingsDashboardElement;

declare global {
  interface HTMLElementTagNameMap {
    "thebuilder-translations-settings": TranslationsSettingsDashboardElement;
  }
}
