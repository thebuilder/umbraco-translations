import { client } from "../openapi/client.gen.js";
import { TranslationsService } from "../openapi/sdk.gen.js";
import { unwrap } from "../errors.js";
import type { MessageKeyQuery, MessageStatus, SourceRequest } from "./models.js";

interface ApiConfiguration {
  token?: string | (() => Promise<string | undefined>);
  baseUrl: string;
  credentials: RequestCredentials;
}

// Deliberately not `throwOnError: true`: that discards the status code, and unwrap() needs it to
// distinguish a version conflict from a validation failure. See ../errors.ts.
const requestOptions = { throwOnError: false } as const;

export const configureApi = (configuration: ApiConfiguration): void => {
  client.setConfig({
    auth: configuration.token,
    baseUrl: configuration.baseUrl,
    credentials: configuration.credentials,
  });
};

export const api = {
  health: () => unwrap(TranslationsService.healthGetHealth(requestOptions)),
  facets: () => unwrap(TranslationsService.messagesGetMessageFacets(requestOptions)),
  permissions: () => unwrap(TranslationsService.permissionsGetPermissions(requestOptions)),
  sources: () => unwrap(TranslationsService.sourcesListSources(requestOptions)),
  source: (id: string) => unwrap(TranslationsService.sourcesGetSource({ ...requestOptions, path: { id } })),
  createSource: (source: SourceRequest) => unwrap(TranslationsService.sourcesCreateSource({ ...requestOptions, body: source })),
  updateSource: (id: string, source: SourceRequest) => unwrap(TranslationsService.sourcesUpdateSource({ ...requestOptions, body: source, path: { id } })),
  deleteSource: (id: string) => unwrap(TranslationsService.sourcesDeleteSource({ ...requestOptions, path: { id } })),
  testSource: (id: string) => unwrap(TranslationsService.sourcesTestSource({ ...requestOptions, path: { id } })),
  testSourceConfiguration: (source: SourceRequest) => unwrap(TranslationsService.sourcesTestSourceConfiguration({ ...requestOptions, body: source })),
  syncSource: (id: string) => unwrap(TranslationsService.sourcesSyncSource({ ...requestOptions, path: { id } })),
  syncHistory: (id: string) => unwrap(TranslationsService.sourcesListSourceSyncs({ ...requestOptions, path: { id } })),
  messages: (filters: { locale?: string; namespace?: string; query?: string; status: MessageStatus; page: number; pageSize: number }) =>
    unwrap(TranslationsService.messagesListMessages({ ...requestOptions, query: filters })),
  message: (id: string) => unwrap(TranslationsService.messagesGetMessage({ ...requestOptions, path: { id } })),
  /** The editor's list: one row per key, with a cell per requested locale. */
  messageKeys: (query: MessageKeyQuery) =>
    unwrap(TranslationsService.messageKeysListMessageKeys({ ...requestOptions, query })),
  /** Target-locale ids for a filter, so "select all matching" can be materialised for a bulk write. */
  messageKeyIds: (query: Omit<MessageKeyQuery, "compare" | "sort" | "direction" | "page" | "pageSize">) =>
    unwrap(TranslationsService.messageKeysListMessageKeyIds({ ...requestOptions, query })),
  saveOverride: (id: string, value: string, expectedVersion?: number) =>
    unwrap(TranslationsService.messagesSaveMessageOverride({ ...requestOptions, body: { value, expectedVersion }, path: { id } })),
  resetOverride: (id: string, expectedVersion?: number) =>
    unwrap(TranslationsService.messagesResetMessageOverride({ ...requestOptions, path: { id }, query: { expectedVersion } })),
};
