import { ReactHostElement } from "../bridge/react-host.element.js";
import { UUI_TAGS } from "../bridge/uui/index.js";
import { EditorApp } from "./app/EditorApp.js";

export class TranslationsEditorHostElement extends ReactHostElement {
  protected component = EditorApp;
  protected override customElementTags = UUI_TAGS;
}

export default TranslationsEditorHostElement;

customElements.define("thebuilder-translations-editor", TranslationsEditorHostElement);

declare global { interface HTMLElementTagNameMap { "thebuilder-translations-editor": TranslationsEditorHostElement } }
