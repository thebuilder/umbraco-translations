import { umbExtensionsRegistry } from "@umbraco-cms/backoffice/extension-registry";
import { manifests as entrypointManifests } from "./entrypoints/manifest.js";
import { extensionManifests } from "./manifests.js";
import { replacedExtensions } from "./translation-section.js";

// When Umbraco evaluates the bundle, before it registers what the bundle exports, so that the
// Translation section never sees the editor and the UI it replaces side by side.
for (const alias of replacedExtensions) {
  umbExtensionsRegistry.exclude(alias);
}

export const manifests: UmbExtensionManifest[] = [...entrypointManifests, ...extensionManifests];
