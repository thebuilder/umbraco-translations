/**
 * Umbraco's own dictionary UI in the Translation section, which the editor replaces. Excluded when
 * the bundle is evaluated rather than from the entry point, which Umbraco loads later still.
 */
export const replacedExtensions = [
  "Umb.SidebarMenu.Translation",
  "Umb.Dashboard.Dictionary.Overview",
];

/** The editor's segment under the section, which Umbraco routes as `view/<pathname>`. */
export const editorViewPathname = "overview";

const trailingSlash = /\/$/;

/**
 * The editor's own address when `href` is the bare Translation section, otherwise undefined.
 *
 * A section shows its first view at its bare path, but it decides what that is the first time it
 * routes, and routing the same path again later does nothing. The backoffice does not wait for
 * this package before routing, so a cold load straight into the section can settle on Umbraco's
 * dictionary dashboard and keep showing it after this package has excluded it. Naming the editor's
 * view in the path makes the section route to it whenever it registers, early or late.
 */
export const editorUrlFor = (href: string, sectionUrl: string): string | undefined => {
  const url = new URL(href);
  const section = new URL(sectionUrl).pathname.replace(trailingSlash, "");
  if (url.pathname.replace(trailingSlash, "") !== section) {
    return;
  }
  url.pathname = `${section}/view/${editorViewPathname}`;
  return url.href;
};
