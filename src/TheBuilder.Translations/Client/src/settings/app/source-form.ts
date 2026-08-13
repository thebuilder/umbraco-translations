import type { HttpHeaderOptions, MessageFormat, NamespaceMode, Source, SourceRequest, TranslationOutputFormat } from "../../api/generated/models.js";

export type SourceDraft = Omit<SourceRequest, "headers"> & { headers: HttpHeaderOptions[] };
export type DeliveryMode = "overrides" | "all";
export type DeliveryFormat = TranslationOutputFormat;

export const parseNamespaceMode = (value: string): NamespaceMode => value === "FirstSegment" ? "FirstSegment" : "Fixed";
export const parseMessageFormat = (value: string): MessageFormat =>
  value === "PlainText" || value === "I18NextV4" ? value : "Icu";

export const createEmptySource = (locales: string[]): SourceDraft => ({
  alias: "",
  displayName: "",
  enabled: true,
  endpointTemplate: "",
  timeoutSeconds: 10,
  maximumResponseBytes: 10_000_000,
  headers: [],
  locales: [...locales],
  namespace: "website",
  namespaceMode: "Fixed",
  messageFormat: "Icu",
});

export const sourceAlias = (displayName: string): string => displayName
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .slice(0, 100);

export const unavailableLocales = (configuredLocales: string[], selectedLocales: string[]): string[] => {
  const configured = new Set(configuredLocales);
  return selectedLocales.filter(locale => !configured.has(locale));
};

export const sourceEndpoint = (endpointTemplate: string, locale: string): string =>
  endpointTemplate
    .replaceAll("{locale}", encodeURIComponent(locale))
    .replaceAll("{language}", encodeURIComponent(languageOf(locale)));

/**
 * The language subtag of an IETF tag. Umbraco languages carry a region (en-US) but applications
 * often name message files by language alone (en.json), so a template can ask for either.
 * Mirrors LocaleEndpointTemplate in the Core project.
 */
export const languageOf = (locale: string): string => locale.split(/[-_]/, 1)[0] ?? locale;

export const hasLocaleToken = (template: string): boolean =>
  template.includes("{locale}") || template.includes("{language}");

export const deliveryEndpoint = (backofficeUrl: string, locale: string, namespace: string, mode: DeliveryMode = "overrides", format: DeliveryFormat = "next-intl"): string => {
  const endpoint = new URL(backofficeUrl);
  const umbracoPath = endpoint.pathname.toLowerCase().indexOf("/umbraco/");
  const pathBase = umbracoPath >= 0 ? endpoint.pathname.slice(0, umbracoPath) : "";
  endpoint.pathname = `${pathBase}/umbraco/delivery/api/v1/translations/${mode}`;
  endpoint.search = "";
  endpoint.hash = "";
  endpoint.searchParams.set("locale", locale);
  endpoint.searchParams.set("namespace", namespace);
  endpoint.searchParams.set("format", format);
  return endpoint.toString();
};

export const sourceRequest = (source: Source): SourceDraft => ({
  alias: source.alias,
  displayName: source.displayName,
  enabled: source.enabled,
  endpointTemplate: source.transport.endpointTemplate,
  secretName: source.transport.secretName,
  timeoutSeconds: source.transport.timeoutSeconds,
  maximumResponseBytes: source.transport.maximumResponseBytes,
  headers: source.transport.headers,
  locales: source.parser.locales,
  namespace: source.parser.namespace,
  namespaceMode: source.parser.namespaceMode,
  messageFormat: source.parser.messageFormat,
});
