import { manifests as entrypointManifests } from "./entrypoints/manifest.js";
import { extensionManifests } from "./manifests.js";

export const manifests: Array<UmbExtensionManifest> = [...entrypointManifests, ...extensionManifests];
