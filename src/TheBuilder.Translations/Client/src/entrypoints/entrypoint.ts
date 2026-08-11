import type { UmbEntryPointOnInit, UmbEntryPointOnUnload } from "@umbraco-cms/backoffice/extension-api";
import { UMB_AUTH_CONTEXT } from "@umbraco-cms/backoffice/auth";
import { umbExtensionsRegistry } from "@umbraco-cms/backoffice/extension-registry";
import { configureApi } from "../api/generated/client.js";

export const onInit: UmbEntryPointOnInit = (host) => {
  ["Umb.SidebarMenu.Translation", "Umb.Dashboard.Dictionary.Overview"]
    .forEach(alias => umbExtensionsRegistry.exclude(alias));
  host.consumeContext(UMB_AUTH_CONTEXT, (authContext) => {
    const config = authContext?.getOpenApiConfiguration();
    configureApi({ token: config?.token, baseUrl: config?.base ?? "", credentials: config?.credentials ?? "same-origin" });
  });
};

export const onUnload: UmbEntryPointOnUnload = () => configureApi({ baseUrl: "", credentials: "same-origin" });
