# TheBuilder.Translations

Let editors change the text in your application from the Umbraco backoffice, without a code change
or a deploy.

Your application keeps its own translation files. Umbraco reads them, editors change the messages
that need changing, and your application fetches those changes and lays them over its own text.

- **The application owns the messages.** Keys, the default text, the message syntax and the
  placeholders all come from the application's files, and stay there.
- **Umbraco owns the edits.** Editors write custom text for any message in any language, with a
  history of who changed what.
- **The application decides what to show.** It merges the custom text over its own, or asks
  Umbraco for the complete dictionary.

A site can also translate into languages the application does not ship. Text written for such a
language has nothing to merge over, so it is served as the whole message.

Built for Umbraco 17.

## Getting started

1. Install the package in your Umbraco site:

   ```sh
   dotnet add package TheBuilder.Translations
   ```

2. Make your application's translation files reachable over HTTP, one file per language. Nested
   JSON (as next-intl and i18next use it) and next-intl's gettext PO files are supported.

3. In Umbraco, go to **Settings > Translations** and add a source: the URL of the files, the
   languages to read, and the message syntax your application uses. **Test source** fetches it
   without saving anything; **Sync now** reads it in.

4. Open the **Translation** section and start editing.

5. Point your application at the delivery endpoint (see
   [Using the translations in your application](#using-the-translations-in-your-application)).

## Adding a source

A source is one set of translation files. Its URL names the language it is fetching with a
placeholder:

```
https://app.example.com/messages/{locale}.json     ->  .../messages/en-US.json
https://app.example.com/messages/{language}.json   ->  .../messages/en.json
https://app.example.com/{language}/{locale}.json   ->  .../en/en-US.json
```

Umbraco's language codes carry a region (`en-US`), but many applications name their files by
language alone (`en`). Use `{language}` when yours do. Each message is still stored under the full
Umbraco code, so `en-US` and `en-GB` never collapse into one.

The other settings:

- **Message syntax**: ICU messages (next-intl, FormatJS), i18next JSON v4, or plain text. The
  editor checks every change against it, so an edit cannot break a placeholder or a plural.
- **Namespace handling**: use the first key of the JSON as the namespace, or put every message in
  one namespace you name. The namespace is part of the delivery URL.
- **Advanced**: the source identifier used by deployment-triggered sync, a request timeout, and the
  largest response accepted.

### Sources that need authentication

Request headers can be added to a source, but their values are never stored in Umbraco. A header
names a configuration setting instead, and the value comes from your site's configuration. For
example, a header `X-Api-Key` with the setting name `Translations:SourceApiKey`:

```json
{
  "Translations": {
    "SourceApiKey": "development-value-only"
  }
}
```

In a deployed environment, supply it as an environment variable (`Translations__SourceApiKey`) or
through your secret store. For a bearer token, add an `Authorization` header and make the setting's
value the whole header, for example `Bearer your-token`.

### Sources on a private network

Sources connect only to public addresses by default, do not follow redirects and do not use the
host's proxy, so a source URL cannot be used to reach internal services. To read from a private
network or `localhost`, turn on `TheBuilder:Translations:SourceSecurity:AllowPrivateNetworkEndpoints`.
Only do that in development or a network you trust.

## Editing translations

The **Translation** section lists every message, one row per key. Choose the language you are
editing and, optionally, a language to compare against; the ⇄ button between them swaps the two.
The pair is remembered for the rest of the browser session.

- **Search** finds text in any language, and keys.
- **Filters** narrow the list by namespace and by status: not written, custom text, default text,
  default changed, or no longer used.
- **Click a row** to edit it in place. Placeholders are highlighted, and messages with plurals or
  choices show an example of each case under the field.
- **Save**, or **Save & next** to work down a list. Keyboard shortcuts are shown at the bottom of
  the open row.
- **Moving on keeps your work.** Opening another row or closing this one keeps unsaved text, marks
  the row as unsaved, and gives it its own **Save** and **Discard**. **Save all** at the top saves
  every unsaved row at once. Unsaved text survives a visit to another section or a reload.
- **Revert to default** removes the custom text and goes back to what the application ships.
- **Default changed** marks custom text whose application default has changed since it was written,
  so it can be checked.

Anyone with access to the Translation section can edit. Sources and the AI settings are managed by
administrators.

## AI suggestions

With [Umbraco.AI](https://docs.umbraco.com/umbraco-ai) set up, the editor can translate a message
from the language you are comparing against, and rewrite the text in the field: improve, simplify,
shorten or fix spelling.

1. Install an Umbraco.AI provider package, for example `Umbraco.AI.OpenAI`. Umbraco.AI itself comes
   with this package.
2. In the **AI** section, add a connection and a chat profile. Brand voice and tone belong on the
   profile, as contexts, and apply to every suggestion.
3. In **Settings > Translations**, turn on **Offer in the editor** in the AI assistant card, and
   choose the profile. The instructions sent with every request can be changed there too.

The assistant is off until an administrator turns it on, because it sends the site's text to an AI
provider.

A suggestion only fills the field. Nothing is saved until you save it, and every suggestion is
checked the same way a save is: a reply that drops or renames a placeholder is sent back once with
the reason, and refused if the second reply is no better.

## Using the translations in your application

Fetch the custom text for a language and namespace, and merge it over the messages your application
already bundles:

```http
GET /umbraco/delivery/api/v1/translations/overrides?locale=da-DK&namespace=website&format=next-intl
```

Or fetch the complete dictionary, with custom text in place of the application's wherever there is
some. Use this when your application does not bundle its own text:

```http
GET /umbraco/delivery/api/v1/translations/all?locale=da-DK&namespace=website&format=next-intl
```

Both answer with ETags, so a client that sends `If-None-Match` gets `304 Not Modified` until
something changes. The exact URLs for each language and namespace are listed under **Settings >
Translations**.

For i18next, use `format=i18next-v4` and set the source's message syntax to **i18next JSON v4**.
Nested keys, `{{variable}}` interpolation, context keys and plural suffixes (`_one`, `_other`,
`_ordinal_one`) are kept as they are. Text is never converted between ICU and i18next syntax, so
keep each namespace to one syntax; a namespace that mixes them is not served until they are split.

## Keeping things in sync

### Syncing a source

Sources are read when someone presses **Sync now** in **Settings > Translations**, where the
history of every sync is kept. To sync as part of a deployment, use the endpoint below.

### Syncing from a deployment

A deployment can sync a source by its identifier, without a backoffice login. The endpoint is off
until you configure a secret of at least 32 characters:

```sh
TheBuilder__Translations__DeploymentSync__ApiKey=replace-with-at-least-32-random-characters
```

Give your deployment pipeline the same secret, and call the endpoint once the new translation files
are live:

```sh
curl --fail-with-body \
  --request POST \
  --header "Authorization: Bearer $UMBRACO_TRANSLATIONS_SYNC_KEY" \
  "$UMBRACO_URL/umbraco/translations/api/v1/sources/website/sync"
```

Replace `website` with the source identifier from the source's **Advanced** settings. The request
waits for the sync to finish and returns how many messages were added, changed and removed.

| Response | Meaning                                                  |
| -------- | -------------------------------------------------------- |
| `200`    | Synced.                                                  |
| `401`    | The secret is missing or wrong.                          |
| `404`    | No source has that identifier.                           |
| `409`    | The source is turned off, or already syncing.            |
| `502`    | The translation files could not be fetched or read.      |
| `503`    | No secret is configured, so the endpoint is off.         |

Use HTTPS, and keep the secret in the secret stores on both sides.

### Telling your application something changed

To drop a cached dictionary the moment it changes, add a webhook in **Settings > Webhooks** for the
**Translations updated** event (under **Other**). Umbraco handles the URL, headers, retries and the
request log as it does for any webhook.

It fires once for every change that reaches the delivery endpoints:

| `change`          | When                                                     |
| ----------------- | -------------------------------------------------------- |
| `Synchronized`    | A sync added, changed or removed at least one message.   |
| `OverrideSaved`   | An editor saved custom text.                             |
| `OverrideRemoved` | An editor reverted custom text to the default.           |
| `SourceDeleted`   | A source was deleted, along with everything it provided. |

```json
{
  "sourceId": "6f2f5d3e-1f4a-4a1e-9a5b-2c7d8e9f0a1b",
  "sourceAlias": "website",
  "change": "OverrideSaved",
  "occurredAt": "2026-08-26T09:30:00+00:00",
  "message": { "namespace": "website", "key": "cart.title", "locale": "da-DK" },
  "synchronization": null
}
```

For a saved or reverted message, `message` names it, and its locale and namespace are enough to
purge exactly the dictionary that changed. For a sync, `synchronization` holds the revision and the
added, changed and removed counts. A sync that found nothing new is not announced.

Webhooks need to be enabled in Umbraco (`Umbraco:CMS:Webhook:Enabled`, on by default). In a
load-balanced setup, Umbraco sends webhooks only from the Single or SchedulingPublisher server.

## Configuration

| Setting                                                         | Default | Purpose                                                  |
| --------------------------------------------------------------- | ------- | -------------------------------------------------------- |
| `TheBuilder:Translations:SourceSecurity:AllowPrivateNetworkEndpoints` | `false` | Let sources read from private networks and `localhost`.  |
| `TheBuilder:Translations:DeploymentSync:ApiKey`                 | none    | Turns on deployment-triggered sync. 32 characters or more. |

Source header values are read from whatever setting names you give them.

## Development

The repository includes a sample site with English and Danish messages to sync against.

```sh
pnpm install
pnpm build
dotnet run --project samples/TheBuilder.Translations.Example
```

It runs at `https://localhost:44389` and installs itself, with the backoffice login in
`samples/TheBuilder.Translations.Example/appsettings.json`. Add a source with
`https://localhost:44389/sample/messages/{locale}.json` (ICU) or
`https://localhost:44389/sample/i18next/{locale}.json` (i18next JSON v4). The sample already allows
private-network sources.

Before opening a pull request:

```sh
dotnet test TheBuilder.Translations.slnx
pnpm check   # type check, lint and dead-code check
pnpm test
pnpm build
```

`pnpm fix` applies formatting and the safe lint fixes. The client's conventions are in
`src/TheBuilder.Translations/Client/CLAUDE.md`.

The backoffice API client is generated from a running sample:

```sh
pnpm --dir src/TheBuilder.Translations/Client generate-client -- https://localhost:44389/umbraco/swagger/thebuildertranslations/swagger.json
```

The deployment sync API is documented at `/umbraco/swagger/thebuildertranslationsautomation/swagger.json`.
