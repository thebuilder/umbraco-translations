import type { MessageKeysListMessageKeysData, OutputEndpointResponse } from "../openapi/types.gen.js";

export type {
  OverrideRequest,
  ResetOverrideRequest,
  MessageCellResponse as MessageCell,
  MessageKeyListResponse as MessageKeyList,
  MessageKeyReference,
  MessageKeyReferenceResponse as MessageKeyReferenceList,
  MessageKeyResponse as MessageKey,
  MessageKeySort,
  MessageKeyStatusFilter as MessageKeyStatus,
  MessageLocaleState,
  PermissionsResponse as Permissions,
  LocaleFacetResponse as LocaleFacet,
  SortDirection,
  // The writable shapes for anything the editor sends. `isLiteral` is the server's derived view of
  // whether a header carries its value or names a setting, so it comes back on a response and is
  // never something a client computes and submits.
  HttpTranslationHeaderOptionsWritable as HttpHeaderOptions,
  HttpTranslationTransportOptions as HttpTransportOptions,
  MessageDetailResponse as MessageDetail,
  MessageFormat,
  MessageListItem,
  MessageListResponse,
  MessageStatusFilter as MessageStatus,
  NamespaceMode,
  SourceFormat,
  TranslationParserOptions,
  OutputConflictResponse as OutputConflict,
  OutputEndpointResponse as OutputEndpoint,
  SourceRequestWritable as SourceRequest,
  SourceResponse as Source,
  TranslationSourceTestResult as SourceTestResult,
  TranslationSyncResult as SyncResult,
} from "../openapi/types.gen.js";

export type TranslationOutputFormat = OutputEndpointResponse["format"];

/** The query parameters of the key-centric list, taken from the generated request type. */
export type MessageKeyQuery = NonNullable<MessageKeysListMessageKeysData["query"]>;
