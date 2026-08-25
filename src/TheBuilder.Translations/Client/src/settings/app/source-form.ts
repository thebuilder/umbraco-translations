import type { HttpHeaderOptions, MessageFormat, NamespaceMode, Source, SourceFormat, SourceRequest, TranslationOutputFormat } from "../../api/generated/models.js";

export type SourceDraft = Omit<SourceRequest, "headers"> & { headers: HttpHeaderOptions[] };
export type DeliveryMode = "overrides" | "all";
export type DeliveryFormat = TranslationOutputFormat;

/**
 * Nesting the messages under their own first key is how translation files are almost always
 * written, so it is what a new source assumes and what anything unrecognised falls back to. One
 * namespace for every message is the deliberate choice, and it is the one that then needs a name.
 */
export const parseNamespaceMode = (value: string): NamespaceMode => value === "Fixed" ? "Fixed" : "FirstSegment";
export const parseMessageFormat = (value: string): MessageFormat =>
  value === "PlainText" || value === "I18NextV4" ? value : "Icu";

/**
 * How the catalogue itself is written, which is a different question from what is inside a message:
 * a PO file and a nested JSON file can both hold ICU. Nested JSON is the answer for anything
 * unrecognised because it is what every source saved before PO existed is.
 */
export const parseSourceFormat = (value: string): SourceFormat =>
  value === "Po" ? "Po" : "NestedJson";

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
  namespaceMode: "FirstSegment",
  messageFormat: "Icu",
  sourceFormat: "NestedJson",
});

/**
 * Where a request header gets its value.
 *
 * "setting" reads it from configuration when the source synchronizes, which is where a secret
 * belongs: anything stored on the source itself is in the database in plaintext, and a failure
 * mentioning it is kept in the synchronization history. "value" writes it on the source, which is
 * the right answer for the many headers that carry nothing worth protecting, and not making people
 * invent an appsettings key for a tenant id is what stops them pasting the secret into the key box.
 */
export type HeaderValueSource = "value" | "setting";

/*
 * Which field is present, not whether it has been filled in. A row switched to "value" starts
 * empty, and treating empty as "not a value row" flipped it straight back to the setting box the
 * moment it rendered. The server asks a different question of the same data, whether a value was
 * actually supplied, and an empty row is incomplete there too. That is what `headerIsComplete`
 * reports here, before anything can be saved.
 */
export const headerValueSource = (header: HttpHeaderOptions): HeaderValueSource =>
  header.value != null ? "value" : "setting";

/** Switching clears the other field, so exactly one of the two is ever set. */
export const withHeaderValueSource = (
  header: HttpHeaderOptions,
  source: HeaderValueSource,
): HttpHeaderOptions => source === "value"
  ? { name: header.name, value: header.value ?? "" }
  : { name: header.name, valueConfigurationKey: header.valueConfigurationKey ?? "" };

/** A row is complete with a name and one of the two value fields filled in. */
export const headerIsComplete = (header: HttpHeaderOptions): boolean =>
  header.name.trim() !== "" &&
  (headerValueSource(header) === "value"
    ? (header.value ?? "").trim() !== ""
    : (header.valueConfigurationKey ?? "").trim() !== "");

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
  headers: source.transport.headers.map(header => header.isLiteral
    ? { name: header.name, value: header.value ?? "" }
    : { name: header.name, valueConfigurationKey: header.valueConfigurationKey ?? "" }),
  locales: source.parser.locales,
  namespace: source.parser.namespace,
  namespaceMode: source.parser.namespaceMode,
  messageFormat: source.parser.messageFormat,
  sourceFormat: source.parser.sourceFormat,
});
