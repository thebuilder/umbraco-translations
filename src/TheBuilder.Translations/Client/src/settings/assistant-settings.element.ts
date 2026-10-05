// biome-ignore-all lint/suspicious/noUnnecessaryConditions: Lit's @state decorator assigns these fields from outside the class, so the initializer is a default and not the only value they ever hold. The rule reads the initializer's literal type and calls every check on them constant.

import { UmbElementMixin } from "@umbraco-cms/backoffice/element-api";
import { css, customElement, html, LitElement, state } from "@umbraco-cms/backoffice/external/lit";
import type {
  UUISelectElement,
  UUITextareaElement,
  UUIToggleElement,
} from "@umbraco-cms/backoffice/external/uui";
import { UMB_NOTIFICATION_CONTEXT } from "@umbraco-cms/backoffice/notification";
import { UmbTextStyles } from "@umbraco-cms/backoffice/style";
import { api } from "../api/generated/client.js";
import type { AssistantSettings, AssistantSettingsRequest } from "../api/generated/models.js";

/** Where Umbraco.AI's connections and profiles are set up. */
const AI_SECTION = "/umbraco/section/ai";

/** The select's value for "use the site's default chat profile". */
const DEFAULT_PROFILE = "";

/**
 * The AI assistant's settings: whether editors are offered it, which Umbraco.AI chat profile it
 * uses, and the instructions it is given.
 *
 * Model, provider, brand voice and guardrails all belong to the profile and are set up in the AI
 * section; this only chooses one. The instructions are about translating and nothing else, so they
 * do not compete with the voice the profile carries.
 */
@customElement("thebuilder-translations-assistant-settings")
class TranslationAssistantSettingsElement extends UmbElementMixin(LitElement) {
  @state() private _settings?: AssistantSettings;
  @state() private _draft?: AssistantSettingsRequest;
  @state() private _loadError?: string;
  @state() private _saving = false;

  #notification?: typeof UMB_NOTIFICATION_CONTEXT.TYPE;

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
    try {
      this.#apply(await api.assistantSettings());
      this._loadError = undefined;
    } catch (error) {
      this._loadError = error instanceof Error ? error.message : String(error);
    }
  }

  #apply(settings: AssistantSettings): void {
    this._settings = settings;
    this._draft = {
      enabled: settings.enabled,
      profileId: settings.profileId ?? null,
      instructions: settings.instructions ?? null,
    };
  }

  #patch(patch: Partial<AssistantSettingsRequest>): void {
    if (this._draft) {
      this._draft = { ...this._draft, ...patch };
    }
  }

  async #save(): Promise<void> {
    if (!this._draft) {
      return;
    }
    this._saving = true;
    try {
      this.#apply(await api.saveAssistantSettings(this._draft));
      this.#notification?.peek("positive", { data: { message: "AI assistant settings saved." } });
    } catch (error) {
      this.#notification?.peek("danger", {
        data: {
          headline: "Could not save the AI assistant settings",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      this._saving = false;
    }
  }

  render() {
    return html`<uui-box headline="AI assistant" headline-variant="h2">${this.#renderBody()}</uui-box>`;
  }

  #renderBody() {
    if (this._loadError) {
      return html`<p class="error" role="alert">${this._loadError}</p>
        <uui-button look="secondary" label="Load the AI assistant settings again" @click=${() => this.#load()}>Try again</uui-button>`;
    }
    const settings = this._settings;
    const draft = this._draft;
    if (!(settings && draft)) {
      return html`<uui-loader></uui-loader>`;
    }

    // Nothing to choose from: the assistant needs a chat profile, and those are made in the AI section.
    if (settings.profiles.length === 0 && !settings.hasDefaultProfile) {
      return html`
        <p class="intro">
          The translation editor can suggest translations and rewrites with AI. It needs an AI
          connection and a chat profile, which are set up in the AI section.
        </p>
        <uui-button look="primary" label="Open the AI section" href=${AI_SECTION}>Set up AI</uui-button>
      `;
    }

    // Without a default to fall back on, nothing chosen means nothing to use: say so in the menu
    // rather than showing the first profile as though it were already the choice.
    const fallback = settings.hasDefaultProfile
      ? { name: "The default chat profile", value: DEFAULT_PROFILE, selected: !draft.profileId }
      : {
          name: "Choose a profile",
          value: DEFAULT_PROFILE,
          selected: !draft.profileId,
          disabled: true,
        };
    const profileOptions = [
      ...(settings.hasDefaultProfile || !draft.profileId ? [fallback] : []),
      ...settings.profiles.map((profile) => ({
        name: profile.name,
        value: profile.id,
        selected: draft.profileId === profile.id,
      })),
    ];

    return html`
      <p class="intro">
        Suggests translations and rewrites in the translation editor. Suggestions only fill the
        field; nothing is saved until the editor saves it. Tone of voice and brand come from the
        chosen profile's contexts in the AI section.
      </p>
      <uui-form-layout-item>
        <uui-label slot="label">Translation editor</uui-label>
        <uui-toggle
          label="Offer AI suggestions in the translation editor"
          ?checked=${draft.enabled}
          @change=${(event: Event) => this.#patch({ enabled: (event.target as UUIToggleElement).checked })}>
          Offer AI suggestions
        </uui-toggle>
      </uui-form-layout-item>
      <uui-form-layout-item>
        <uui-label slot="label" for="assistant-profile">Profile</uui-label>
        <span slot="description">The connection, model and contexts the suggestions use.</span>
        <uui-select
          id="assistant-profile"
          label="AI profile"
          .options=${profileOptions}
          @change=${(event: Event) => {
            const value = String((event.target as UUISelectElement).value);
            this.#patch({ profileId: value === DEFAULT_PROFILE ? null : value });
          }}>
        </uui-select>
      </uui-form-layout-item>
      <uui-form-layout-item>
        <uui-label slot="label" for="assistant-instructions">Instructions</uui-label>
        <span slot="description">
          How to translate, sent with every request. Leave empty to use the default shown.
        </span>
        <uui-textarea
          id="assistant-instructions"
          label="Instructions for the AI"
          auto-height
          placeholder=${settings.defaultInstructions}
          .value=${draft.instructions ?? ""}
          @input=${(event: Event) => {
            const value = String((event.target as UUITextareaElement).value);
            this.#patch({ instructions: value.trim() === "" ? null : value });
          }}>
        </uui-textarea>
      </uui-form-layout-item>
      <div class="actions">
        <uui-button
          look="primary"
          color="positive"
          label="Save the AI assistant settings"
          .state=${this._saving ? "waiting" : undefined}
          ?disabled=${this._saving}
          @click=${() => this.#save()}>
          Save
        </uui-button>
      </div>
    `;
  }

  static styles = [
    UmbTextStyles,
    css`
      :host { display: block; }
      .intro { color: var(--uui-color-text-alt); margin: 0 0 var(--uui-size-space-5); max-inline-size: 70ch; }
      .error { color: var(--uui-color-danger); }
      uui-form-layout-item { margin-bottom: var(--uui-size-space-5); }
      uui-select, uui-textarea { inline-size: 100%; }
      uui-textarea { --uui-textarea-min-height: 8rem; }
      .actions { display: flex; justify-content: flex-end; }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "thebuilder-translations-assistant-settings": TranslationAssistantSettingsElement;
  }
}
