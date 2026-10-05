import type { ManifestDashboard } from "@umbraco-cms/backoffice/dashboard";
import type { ManifestSectionView } from "@umbraco-cms/backoffice/section";
import { UMB_TRANSLATION_SECTION_ALIAS } from "@umbraco-cms/backoffice/translation";
import { editorViewPathname } from "./translation-section.js";

const editorManifest: ManifestSectionView = {
  type: "sectionView",
  alias: "TheBuilder.Translations.SectionView",
  name: "Translations Editor",
  element: () => import("./editor/editor-host.element.js"),
  meta: { label: "Translations", pathname: editorViewPathname, icon: "icon-globe" },
  conditions: [{ alias: "Umb.Condition.SectionAlias", match: UMB_TRANSLATION_SECTION_ALIAS }],
};

const settingsManifest: ManifestDashboard = {
  type: "dashboard",
  alias: "TheBuilder.Translations.SettingsDashboard",
  name: "Translations Settings",
  element: () => import("./settings/settings-dashboard.element.js"),
  meta: { label: "Translations", pathname: "translations" },
  conditions: [
    { alias: "Umb.Condition.SectionAlias", match: "Umb.Section.Settings" },
    { alias: "Umb.Condition.CurrentUser.IsAdmin" },
  ],
};

export const extensionManifests: UmbExtensionManifest[] = [editorManifest, settingsManifest];
