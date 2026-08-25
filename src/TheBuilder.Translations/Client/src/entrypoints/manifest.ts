export const manifests: UmbExtensionManifest[] = [
  {
    type: "backofficeEntryPoint",
    alias: "TheBuilder.Translations.EntryPoint",
    name: "Translations API Entry Point",
    js: () => import("./entrypoint.js"),
  },
];
