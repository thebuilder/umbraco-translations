import type { OutputEndpointResponse } from "../openapi/types.gen.js";

export type {
  HttpTranslationHeaderOptions as HttpHeaderOptions,
  HttpTranslationTransportOptions as HttpTransportOptions,
  MessageDetailResponse as MessageDetail,
  MessageFormat,
  MessageListItem,
  MessageListResponse,
  MessageStatusFilter as MessageStatus,
  NamespaceMode,
  NestedJsonParserOptions,
  OutputConflictResponse as OutputConflict,
  OutputEndpointResponse as OutputEndpoint,
  SourceRequest,
  SourceResponse as Source,
  TranslationSourceTestResult as SourceTestResult,
  TranslationSyncResult as SyncResult,
} from "../openapi/types.gen.js";

export type TranslationOutputFormat = OutputEndpointResponse["format"];
