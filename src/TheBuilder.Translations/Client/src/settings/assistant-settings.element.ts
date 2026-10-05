// biome-ignore-all lint/suspicious/noUnnecessaryConditions: Lit's @property decorator assigns these fields from outside the class, so the initializer is a default and not the only value they ever hold. The rule reads the initializer's literal type and calls every check on them constant.

import {
  css,
  customElement,
  html,
  LitElement,
  property,
} from "@umbraco-cms/backoffice/external/lit";
import type {
  UUISelectElement,
  UUITextareaElement,
  UUIToggleElement,
} from "@umbraco-cms/backoffice/external/uui";
import { UmbTextStyles } from "@umbraco-cms/backoffice/style";
import type { AssistantSettings, AssistantSettingsRequest } from "../api/generated/models.js";

/** Where Umbraco.AI's connections and profiles are set up. */
const AI_SECTION = "/umbraco/section/ai";

/** The select's value for "use the site's default chat profile". */
const DEFAULT_PROFILE = "";

/** The settings as they would be saved: the request shape, read off what the server sent. */
export const assistantDraft = (settings: AssistantSettings): AssistantSettingsRequest => ({
  enabled: settings.enabled,
  profileId: settings.profileId ?? null,
  instructions: settings.instructions ?? null,
});

/**
 * The AI assistant's settings: whether editors are offered it, which Umbraco.AI chat profile it
 * uses, and the instructions it is given.
 *
 * Model, provider, brand voice and guardrails all belong to the profile and are set up in the AI
 * section; this only chooses one. The instructions are about translating and nothing else, so they
 * do not compete with the voice the profile carries.
 *
 * Holds no state of its own, like the source editor: the dashboard keeps the draft, so opening a
 * source and coming back does not lose an unsaved change here.
 */
@customElement("thebuilder-translations-assistant-settings")
class TranslationAssistantSettingsElement extends LitElement {
  /** What the server has. */
  @property({ attribute: false }) settings!: AssistantSettings;
  /** What the form shows. */
  @property({ attribute: false }) value!: AssistantSettingsRequest;
  @property({ type: Boolean }) saving = false;

  #patch(patch: Partial<AssistantSettingsRequest>): void {
    this.dispatchEvent(
      new CustomEvent<AssistantSettingsRequest>("assistant-change", {
        detail: { ...this.value, ...patch },
        bubbles: true,
        composed: true,
      })
    );
  }

  #save(): void {
    this.dispatchEvent(new CustomEvent("assistant-submit", { bubbles: true, composed: true }));
  }

  render() {
    return html`<uui-box headline="AI assistant" headline-variant="h2">${this.#renderBody()}</uui-box>`;
  }

  #renderBody() {
    const { settings, value } = this;

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
    const profileOptions = [
      {
        name: settings.hasDefaultProfile ? "The default chat profile" : "Choose a profile",
        value: DEFAULT_PROFILE,
        selected: !value.profileId,
        disabled: !settings.hasDefaultProfile,
      },
      ...settings.profiles.map((profile) => ({
        name: profile.name,
        value: profile.id,
        selected: value.profileId === profile.id,
      })),
    ];
    const unchanged = JSON.stringify(value) === JSON.stringify(assistantDraft(settings));

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
          ?checked=${value.enabled}
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
            const chosen = String((event.target as UUISelectElement).value);
            this.#patch({ profileId: chosen === DEFAULT_PROFILE ? null : chosen });
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
          .value=${value.instructions ?? ""}
          @input=${(event: Event) => {
            const typed = String((event.target as UUITextareaElement).value);
            this.#patch({ instructions: typed.trim() === "" ? null : typed });
          }}>
        </uui-textarea>
      </uui-form-layout-item>
      <div class="actions">
        <uui-button
          look="primary"
          color="positive"
          label="Save the AI assistant settings"
          .state=${this.saving ? "waiting" : undefined}
          ?disabled=${this.saving || unchanged}
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
