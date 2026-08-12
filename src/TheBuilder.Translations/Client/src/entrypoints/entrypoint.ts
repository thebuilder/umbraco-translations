import type { UmbEntryPointOnInit, UmbEntryPointOnUnload } from "@umbraco-cms/backoffice/extension-api";
import { UMB_AUTH_CONTEXT } from "@umbraco-cms/backoffice/auth";
import { umbExtensionsRegistry } from "@umbraco-cms/backoffice/extension-registry";
import { configureApi } from "../api/generated/client.js";
import { resetQueryCache } from "../bridge/react-host.element.js";

export const onInit: UmbEntryPointOnInit = (host) => {
  ["Umb.SidebarMenu.Translation", "Umb.Dashboard.Dictionary.Overview"]
    .forEach(alias => umbExtensionsRegistry.exclude(alias));
  host.consumeContext(UMB_AUTH_CONTEXT, (authContext) => {
    const config = authContext?.getOpenApiConfiguration();
    configureApi({ token: config?.token, baseUrl: config?.base ?? "", credentials: config?.credentials ?? "same-origin" });
    // The query cache outlives the editor element, so it has to be dropped whenever the identity
    // behind those requests changes. Otherwise a second user would see the first user's data.
    resetQueryCache();
  });
};

export const onUnload: UmbEntryPointOnUnload = () => {
  configureApi({ baseUrl: "", credentials: "same-origin" });
  resetQueryCache();
};
