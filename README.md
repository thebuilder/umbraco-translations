# TheBuilder.Translations

An Umbraco 17 extension for synchronizing application-owned translation messages and managing editorial overrides.

The ownership rule is intentionally simple:

- Applications own keys, defaults, message syntax, and required arguments.
- Umbraco stores optional overrides and their edit history.
- Runtime consumers bundle their defaults and merge the overrides returned by Umbraco.

One deliberate exception: a site may have more Umbraco languages than its applications ship. An
editor can write a translation for such a locale, and because no application default exists to merge
it over, that text is the whole message and is served from both delivery endpoints.

## What is implemented

Phases 1–5 are represented by one vertical slice:

- HTTP sources with `{locale}` and `{language}` expansion, conditional request support, response limits, and server-side secret references.
- Nested next-intl and i18next JSON v4 string-resource parsing with fixed or first-segment namespaces.
- ICU and i18next interpolation validation with argument-signature enforcement.
- Transactional Umbraco persistence for sources, messages, overrides, and synchronization history.
- Server-paged Management APIs, optimistic concurrency, and an ETag-enabled next-intl Delivery API.
- A key-centric editor API that pages over translation keys rather than key-locale pairs, so a
  reference locale can be shown beside the one being edited and "present in English, absent in
  Danish" is an ordinary filter.
- A React/TanStack editor hosted behind an Umbraco custom element.
- An administrator Settings dashboard for source setup, testing, synchronization, history, limits, and output guidance.
- A runnable sample that exposes English and Danish source messages at `/sample/messages/{locale}.json`.
- The sample also exposes i18next JSON v4 string resources at `/sample/i18next/{locale}.json`.

## Endpoint templates

A source's endpoint template names the locale it is fetching:

```
messages/{locale}.json     ->  messages/en-US.json
messages/{language}.json   ->  messages/en.json
{language}/{locale}.json   ->  en/en-US.json
```

Umbraco language codes carry a region, but applications often name their message files by language
alone. Use `{language}` when they do. Messages are stored under the full Umbraco code either way, so
regional variants never collapse into one another and the delivery contract is unaffected.

## Editing translations

Overrides are addressed by identity — source, namespace, key, and locale — rather than by message
id:

```
PUT  /umbraco/management/api/v1/translations/messages/override
POST /umbraco/management/api/v1/translations/messages/override/reset
```

Both take `{ sourceId, namespace, key, locale, ... }` with an optional `expectedVersion` for
optimistic concurrency. Identity rather than id is what allows writing a locale no source ships:
until someone writes to it, no row exists and there is no id to address. Saving one creates the row,
inheriting the key's message format and argument signature from a shipped locale so that argument
validation accepts the placeholders the message requires. Resetting the override removes that row
again.

## Run the sample

```sh
pnpm install
pnpm build
dotnet run --project samples/TheBuilder.Translations.Example
```

To validate the source workflow, add a source with `https://localhost:44389/sample/messages/{locale}.json`. The sample serves both `en-US` and `da-DK` (and their neutral culture codes). The unattended sample backoffice uses `admin@example.test` and the development-only password in its `appsettings.json`.

To validate i18next v4, use `https://localhost:44389/sample/i18next/{locale}.json` and select **i18next JSON v4** as the message syntax.

For SSRF protection, translation sources resolve and connect only to public network addresses by default, do not follow redirects, and do not use the host proxy. The sample opts into private-network endpoints in `appsettings.Development.json` so its localhost fixtures work. Only enable `TheBuilder:Translations:SourceSecurity:AllowPrivateNetworkEndpoints` in a trusted development or private-network environment; production installations should keep the default.

### Authenticated source APIs

Source request headers reference server configuration rather than storing secret values in Umbraco. The configuration key is an arbitrary name chosen by the application owner; it is not generated from the source. For example, add a request header named `X-Api-Key` with the value configuration key `Translations:SourceApiKey`, then supply the value outside the source definition:

```json
{
  "Translations": {
    "SourceApiKey": "development-value-only"
  }
}
```

For deployed environments, use an environment variable such as `Translations__SourceApiKey` or your configured secret provider. For bearer authentication, configure a request header named `Authorization` and make the referenced configuration value the complete header value, for example `Bearer development-value-only`. Existing sources that used the earlier bearer-token convenience setting remain compatible and can remove it when editing the source.

### Deployment-triggered synchronization

An external deployment can synchronize an enabled source by its alias without using a backoffice user token. The automation endpoint is disabled until a dedicated server-side secret of at least 32 characters is configured:

```sh
TheBuilder__Translations__DeploymentSync__ApiKey=replace-with-at-least-32-random-characters
```

Keep the same secret in the deployment provider and call the source-specific endpoint after the application translation API is available:

```sh
curl --fail-with-body \
  --request POST \
  --header "Authorization: Bearer $UMBRACO_TRANSLATIONS_SYNC_KEY" \
  "$UMBRACO_URL/umbraco/translations/api/v1/sources/translations/sync"
```

Replace the final `translations` segment with the alias configured under the source’s Advanced settings. A successful request waits for synchronization to complete and returns the revision and added, changed, and removed counts. Missing or invalid credentials return `401`; an unconfigured endpoint returns `503`; disabled or already-synchronizing sources return `409`. Overlapping backoffice and deployment requests share the same database-backed source lease. Use HTTPS and keep both the Umbraco and deployment-provider values in their secret stores.

The sample exposes this API at `/umbraco/swagger/thebuildertranslationsautomation/swagger.json`. It intentionally uses a separate bearer secret from Umbraco backoffice authentication.

The backoffice client remains generated from the separate management document:

```sh
pnpm --dir src/TheBuilder.Translations/Client generate-client -- https://localhost:44389/umbraco/swagger/thebuildertranslations/swagger.json
```

## Delivery contract

```http
GET /umbraco/delivery/api/v1/translations/overrides?locale=da&namespace=website&format=next-intl
```

The response contains only overrides. A consumer merges it over its application-bundled defaults.

Consumers that do not bundle their own defaults can request the complete effective dictionary:

```http
GET /umbraco/delivery/api/v1/translations/all?locale=da&namespace=website&format=next-intl
```

This response contains every synchronized source message for the locale and namespace, with an editorial override used in place of its source value when one exists. Removed source messages are excluded.

For i18next JSON v4 consumers, select **i18next JSON v4** as the source message syntax. Umbraco then exposes the compatible output link with `format=i18next-v4`:

```http
GET /umbraco/delivery/api/v1/translations/all?locale=da&namespace=website&format=i18next-v4
```

The resource preserves nested string keys, `{{variable}}` interpolation, context keys, and CLDR plural/ordinal suffixes such as `_one`, `_other`, and `_ordinal_one`. Message values are not converted between ICU and i18next syntax; configure each source with the syntax its application uses. A locale/namespace containing mixed ICU and i18next messages is not advertised as an output endpoint and direct requests return a conflict until the syntaxes are separated into namespaces. i18next object/array return values are outside the editorial string-message model and are rejected during source validation.

## Verification

```sh
dotnet test TheBuilder.Translations.slnx
pnpm check
pnpm build
dotnet pack src/TheBuilder.Translations/TheBuilder.Translations.csproj
```
