import { UMB_AUTH_CONTEXT } from "@umbraco-cms/backoffice/auth";
import type {
  UmbEntryPointOnInit,
  UmbEntryPointOnUnload,
} from "@umbraco-cms/backoffice/extension-api";
import { UMB_TRANSLATION_SECTION_PATH } from "@umbraco-cms/backoffice/translation";
import { configureApi } from "../api/generated/client.js";
import { resetQueryCache } from "../bridge/query-cache-reset.js";
import { editorUrlFor } from "../translation-section.js";

export const onInit: UmbEntryPointOnInit = (host) => {
  // Here rather than in the bundle: Umbraco evaluates the bundle while it is still deciding whether
  // to open the backoffice, and changing the address then cancels that and starts it over.
  const editorUrl = editorUrlFor(
    location.href,
    new URL(UMB_TRANSLATION_SECTION_PATH, document.baseURI).href
  );
  if (editorUrl) {
    history.replaceState(history.state, "", editorUrl);
  }
  host.consumeContext(UMB_AUTH_CONTEXT, (authContext) => {
    const config = authContext?.getOpenApiConfiguration();
    configureApi({
      token: config?.token,
      baseUrl: config?.base ?? "",
      credentials: config?.credentials ?? "same-origin",
    });
    // The query cache outlives the editor element, so it has to be dropped whenever the identity
    // behind those requests changes. Otherwise a second user would see the first user's data.
    resetQueryCache();
  });
};

export const onUnload: UmbEntryPointOnUnload = () => {
  configureApi({ baseUrl: "", credentials: "same-origin" });
  resetQueryCache();
};
