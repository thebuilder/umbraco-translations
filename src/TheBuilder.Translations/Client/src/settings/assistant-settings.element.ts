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
    const { settings, value } = this;
    const ready = settings.profiles.length > 0 || settings.hasDefaultProfile;
    // On or off is the card's one decision, so it sits in the card's header rather than taking a row.
    return html`<uui-box headline="AI assistant" headline-variant="h2">
      ${
        ready
          ? html`<uui-toggle
              slot="header-actions"
              label="Offer AI suggestions in the translation editor"
              ?checked=${value.enabled}
              @change=${(event: Event) => this.#patch({ enabled: (event.target as UUIToggleElement).checked })}>
              Offer in the editor
            </uui-toggle>`
          : null
      }
      ${this.#renderBody()}
    </uui-box>`;
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
      <div class="fields">
        <label class="field__label" for="assistant-profile">
          Profile
          <small>The connection, model and contexts suggestions use.</small>
        </label>
        <uui-select
          id="assistant-profile"
          class="field__profile"
          label="AI profile"
          .options=${profileOptions}
          @change=${(event: Event) => {
            const chosen = String((event.target as UUISelectElement).value);
            this.#patch({ profileId: chosen === DEFAULT_PROFILE ? null : chosen });
          }}>
        </uui-select>

        <label class="field__label" for="assistant-instructions">
          Instructions
          <small>How to translate, sent with every request. Empty uses the default shown.</small>
        </label>
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
      </div>
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
      uui-box { --uui-box-default-padding: var(--uui-size-space-4) var(--uui-size-space-5); }
      .intro { color: var(--uui-color-text-alt); margin: 0 0 var(--uui-size-space-4); max-inline-size: 70ch; }
      /* Labels beside their fields rather than over them: two fields do not need a column each. */
      .fields {
        display: grid;
        grid-template-columns: minmax(10rem, 15rem) minmax(0, 1fr);
        gap: var(--uui-size-space-4) var(--uui-size-space-5);
        align-items: start;
      }
      .field__label { display: grid; gap: 2px; padding-block-start: 8px; font-weight: 700; }
      .field__label small { font-weight: 400; color: var(--uui-color-text-alt); font-size: 12px; line-height: 1.4; }
      /* As wide as a profile name needs, not the width of the page. */
      .field__profile { inline-size: min(100%, 26rem); }
      uui-textarea { inline-size: 100%; --uui-textarea-min-height: 6rem; }
      .actions { display: flex; justify-content: flex-end; margin-block-start: var(--uui-size-space-4); }
      @media (max-width: 640px) {
        .fields { grid-template-columns: minmax(0, 1fr); gap: var(--uui-size-space-2); }
        .field__label { padding-block-start: var(--uui-size-space-3); }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "thebuilder-translations-assistant-settings": TranslationAssistantSettingsElement;
  }
}
