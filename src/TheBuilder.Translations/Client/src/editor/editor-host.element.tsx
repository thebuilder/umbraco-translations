import { ReactHostElement } from "../bridge/react-host.element.js";
import { EditorApp } from "./app/EditorApp.js";

export class TranslationsEditorHostElement extends ReactHostElement {
  protected component = EditorApp;
}

export default TranslationsEditorHostElement;

customElements.define("thebuilder-translations-editor", TranslationsEditorHostElement);

declare global { interface HTMLElementTagNameMap { "thebuilder-translations-editor": TranslationsEditorHostElement } }
