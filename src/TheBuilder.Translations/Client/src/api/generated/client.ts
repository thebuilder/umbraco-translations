import { client } from "../openapi/client.gen.js";
import { TranslationsService } from "../openapi/sdk.gen.js";
import type { MessageStatus, SourceRequest } from "./models.js";

interface ApiConfiguration {
  token?: string | (() => Promise<string | undefined>);
  baseUrl: string;
  credentials: RequestCredentials;
}

const requestOptions = { throwOnError: true } as const;

export const configureApi = (configuration: ApiConfiguration): void => {
  client.setConfig({
    auth: configuration.token,
    baseUrl: configuration.baseUrl,
    credentials: configuration.credentials,
  });
};

export const api = {
  health: () => TranslationsService.healthGetHealth(requestOptions).then(response => response.data),
  facets: () => TranslationsService.messagesGetMessageFacets(requestOptions).then(response => response.data),
  sources: () => TranslationsService.sourcesListSources(requestOptions).then(response => response.data),
  source: (id: string) => TranslationsService.sourcesGetSource({ ...requestOptions, path: { id } }).then(response => response.data),
  createSource: (source: SourceRequest) => TranslationsService.sourcesCreateSource({ ...requestOptions, body: source }).then(response => response.data),
  updateSource: (id: string, source: SourceRequest) => TranslationsService.sourcesUpdateSource({ ...requestOptions, body: source, path: { id } }).then(response => response.data),
  deleteSource: (id: string) => TranslationsService.sourcesDeleteSource({ ...requestOptions, path: { id } }).then(response => response.data),
  testSource: (id: string) => TranslationsService.sourcesTestSource({ ...requestOptions, path: { id } }).then(response => response.data),
  testSourceConfiguration: (source: SourceRequest) => TranslationsService.sourcesTestSourceConfiguration({ ...requestOptions, body: source }).then(response => response.data),
  syncSource: (id: string) => TranslationsService.sourcesSyncSource({ ...requestOptions, path: { id } }).then(response => response.data),
  syncHistory: (id: string) => TranslationsService.sourcesListSourceSyncs({ ...requestOptions, path: { id } }).then(response => response.data),
  messages: (filters: { locale?: string; namespace?: string; query?: string; status: MessageStatus; page: number; pageSize: number }) =>
    TranslationsService.messagesListMessages({ ...requestOptions, query: filters }).then(response => response.data),
  message: (id: string) => TranslationsService.messagesGetMessage({ ...requestOptions, path: { id } }).then(response => response.data),
  saveOverride: (id: string, value: string, expectedVersion?: number) =>
    TranslationsService.messagesSaveMessageOverride({ ...requestOptions, body: { value, expectedVersion }, path: { id } }).then(response => response.data),
  resetOverride: (id: string, expectedVersion?: number) =>
    TranslationsService.messagesResetMessageOverride({ ...requestOptions, path: { id }, query: { expectedVersion } }).then(response => response.data),
};
