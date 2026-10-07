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

A site can also translate into languages the application does not ship. Umbraco serves text
written for such a language as the whole message, because the application has nothing to merge it
over.

The package requires Umbraco 17.

## Getting started

1. Install the package in your Umbraco site:

   ```sh
   dotnet add package TheBuilder.Translations
   ```

2. Make your application's translation files reachable over HTTP, one file per language. The
   package reads nested JSON, as next-intl and i18next write it, and next-intl's gettext PO files.

3. In Umbraco, go to **Settings > Translations** and add a source. A source holds the URL of the
   files, the languages to read, and the message syntax your application uses. **Test source** fetches it
   without saving anything; **Sync now** reads it in.

4. Open the **Translation** section and start editing.

5. Point your application at the delivery endpoint, as described in
   [Using the translations in your application](#using-the-translations-in-your-application).

## Adding a source

A source is one set of translation files. A placeholder in its URL names the language to fetch:

```
https://app.example.com/messages/{locale}.json     ->  .../messages/en-US.json
https://app.example.com/messages/{language}.json   ->  .../messages/en.json
https://app.example.com/{language}/{locale}.json   ->  .../en/en-US.json
```

Umbraco's language codes carry a region, such as `en-US`, but many applications name their files by
language alone, such as `en`. Use `{language}` when yours do. Umbraco still stores each message
under the full code, so `en-US` and `en-GB` stay separate.

A source has three more settings.

- **Message syntax.** ICU messages, as next-intl and FormatJS use them, i18next JSON v4, or plain
  text. The editor checks every change against the syntax, so an edit cannot break a placeholder or
  a plural.
- **Namespace handling.** Use the first key of the JSON as the namespace, or put every message in
  one namespace you name. The namespace is part of the delivery URL.
- **Advanced.** The source identifier for deployment-triggered sync, a request timeout, and the
  largest response the source accepts.

### Sources that need authentication

You can add request headers to a source, but Umbraco never stores their values. Each header names a
configuration setting instead, and your site's configuration supplies the value. This example gives
a header `X-Api-Key` the setting name `Translations:SourceApiKey`:

```json
{
  "Translations": {
    "SourceApiKey": "development-value-only"
  }
}
```

In a deployed environment, supply the value as the environment variable `Translations__SourceApiKey`
or through your secret store. For a bearer token, add an `Authorization` header and make the setting's
value the whole header, for example `Bearer your-token`.

### Sources on a private network

By default, sources connect only to public addresses, do not follow redirects and do not use the
host's proxy. That stops anyone from using a source URL to reach internal services. To read from a private
network or `localhost`, turn on `TheBuilder:Translations:SourceSecurity:AllowPrivateNetworkEndpoints`.
Only do that in development or a network you trust.

## Editing translations

The **Translation** section lists every message, one row per key. Choose the language you are
editing and, if you like, a language to compare against. The ⇄ button between them swaps the two.
The editor remembers the pair for the rest of the browser session.

- Search finds text in any language, and keys.
- Filters narrow the list by namespace and by status. The statuses are not written, custom text,
  default text, default changed, and no longer used.
- Click a row to edit it in place. The field highlights placeholders, and a message with plurals or
  choices shows an example of each case under the field.
- **Save** saves the row. **Save & next** saves it and opens the next one, for working down a list.
  The bottom of the open row lists the keyboard shortcuts.
- Opening another row or closing this one keeps your unsaved text. The row shows it, marked as
  unsaved, with its own **Save** and **Discard**. **Save all** at the top saves every unsaved row at
  once. Unsaved text survives a visit to another section or a reload.
- **Revert to default** removes the custom text and returns to what the application ships.
- **Default changed** marks custom text whose application default has changed since someone wrote
  it, so you can check it still fits.

Anyone with access to the Translation section can edit. Administrators manage sources and the AI
settings.

## AI suggestions

With [Umbraco.AI](https://docs.umbraco.com/umbraco-ai) set up, the editor can translate a message
from the language you are comparing against. It can also improve, simplify or shorten the text in
the field, or fix its spelling.

1. Install an Umbraco.AI provider package, for example `Umbraco.AI.OpenAI`. This package already
   installs Umbraco.AI itself.
2. In the **AI** section, add a connection and a chat profile. Put brand voice and tone on the
   profile as contexts. They apply to every suggestion.
3. In **Settings > Translations**, turn on **Offer in the editor** in the AI assistant card and
   choose the profile. You can also change the instructions sent with every request there.

The assistant is off until an administrator turns it on, because it sends the site's text to an AI
provider.

A suggestion only fills the field, and the site does not change until you save. The editor checks
every suggestion the same way it checks a save. If a reply drops or renames a placeholder, the
assistant sends it back once with the reason, and refuses it if the second reply is no better.

## Using the translations in your application

To use the custom text, fetch it for a language and namespace, then merge it over the messages your
application already bundles.

```http
GET /umbraco/delivery/api/v1/translations/overrides?locale=da-DK&namespace=website&format=next-intl
```

If your application does not bundle its own text, fetch the complete dictionary instead. It has the
custom text in place of the application's text wherever an editor wrote some.

```http
GET /umbraco/delivery/api/v1/translations/all?locale=da-DK&namespace=website&format=next-intl
```

Both endpoints answer with an ETag, so a client that sends `If-None-Match` gets `304 Not Modified`
until something changes. **Settings > Translations** lists the exact URL for each language and
namespace.

For i18next, use `format=i18next-v4` and set the source's message syntax to **i18next JSON v4**.
The output keeps nested keys, `{{variable}}` interpolation, context keys and plural suffixes such as
`_one`, `_other` and `_ordinal_one`. Umbraco never converts text between ICU and i18next syntax, so
keep each namespace to one syntax. Umbraco refuses to serve a namespace that mixes them until you
split it.

## Keeping things in sync

### Syncing a source

Umbraco reads a source when someone presses **Sync now** in **Settings > Translations**, which also
keeps the history of every sync. To sync as part of a deployment, use the endpoint below.

### Syncing from a deployment

A deployment can sync a source by its identifier, without a backoffice login. The endpoint is off
until you configure a secret. Use a long random value; anyone who has it can start a sync.

```sh
TheBuilder__Translations__DeploymentSync__ApiKey=replace-with-a-long-random-value
```

Give your deployment pipeline the same secret, and have it call the endpoint once the new translation
files are live.

```sh
curl --fail-with-body \
  --request POST \
  --header "Authorization: Bearer $UMBRACO_TRANSLATIONS_SYNC_KEY" \
  "$UMBRACO_URL/umbraco/translations/api/v1/sources/website/sync"
```

Replace `website` with the source identifier from the source's **Advanced** settings. The request
waits for the sync to finish and returns how many messages it added, changed and removed.

| Response | Meaning                                                  |
| -------- | -------------------------------------------------------- |
| `200`    | Synced.                                                  |
| `401`    | The secret is missing or wrong.                          |
| `404`    | No source has that identifier.                           |
| `409`    | The source is turned off, or already syncing.            |
| `502`    | Umbraco could not fetch or read the translation files.   |
| `503`    | No secret is configured, so the endpoint is off.         |

Use HTTPS, and keep the secret in the secret stores on both sides.

### Telling your application something changed

To drop a cached dictionary the moment it changes, add a webhook in **Settings > Webhooks** for the
**Translations updated** event (under **Other**). Umbraco handles the URL, headers, retries and the
request log as it does for any webhook.

The event fires once for every change that reaches the delivery endpoints.

| `change`          | When                                                     |
| ----------------- | -------------------------------------------------------- |
| `Synchronized`    | A sync added, changed or removed at least one message.   |
| `OverrideSaved`   | An editor saved custom text.                             |
| `OverrideRemoved` | An editor reverted custom text to the default.           |
| `SourceDeleted`   | Someone deleted a source, and everything it provided.    |

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

For a saved or reverted message, `message` names it. Its locale and namespace tell you exactly which
dictionary to purge. For a sync, `synchronization` holds the revision and the added, changed and
removed counts. Umbraco does not announce a sync that found nothing new.

Umbraco sends webhooks only when `Umbraco:CMS:Webhook:Enabled` is on, which it is by default. In a
load-balanced setup, Umbraco sends webhooks only from the Single or SchedulingPublisher server.

## Configuration

| Setting                                                         | Default | Purpose                                                  |
| --------------------------------------------------------------- | ------- | -------------------------------------------------------- |
| `TheBuilder:Translations:SourceSecurity:AllowPrivateNetworkEndpoints` | `false` | Let sources read from private networks and `localhost`.  |
| `TheBuilder:Translations:DeploymentSync:ApiKey`                 | none    | Turns on deployment-triggered sync. A long random value, without spaces. |

Source headers read their values from the setting names you give them.

## Development

The repository includes a sample site with English and Danish messages to sync against.

```sh
pnpm install
pnpm build
dotnet run --project samples/TheBuilder.Translations.Example
```

The sample runs at `https://localhost:44389` and installs itself. Its backoffice login is in
`samples/TheBuilder.Translations.Example/appsettings.json`. Add a source with
`https://localhost:44389/sample/messages/{locale}.json` for ICU messages, or
`https://localhost:44389/sample/i18next/{locale}.json` for i18next JSON v4. The sample already
allows private-network sources.

Run these before opening a pull request.

```sh
dotnet test TheBuilder.Translations.slnx
pnpm check   # type check, lint and dead-code check
pnpm test
pnpm build
```

`pnpm fix` applies formatting and the safe lint fixes. `src/TheBuilder.Translations/Client/CLAUDE.md`
describes the client's conventions.

Generate the backoffice API client from a running sample.

```sh
pnpm --dir src/TheBuilder.Translations/Client generate-client -- https://localhost:44389/umbraco/swagger/thebuildertranslations/swagger.json
```

The sample documents the deployment sync API at
`/umbraco/swagger/thebuildertranslationsautomation/swagger.json`.
