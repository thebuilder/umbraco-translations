using System.Text;
using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Validation;

namespace TheBuilder.Translations.Core.Sources;

/// <summary>
/// Gettext PO, in the dialect next-intl writes.
///
/// The dialect holds the message *key* where ordinary gettext holds the source text, and it splits
/// that key across two fields: everything before the last dot goes in <c>msgctxt</c> and only the
/// final segment stays in <c>msgid</c>. So <c>cart.items.count</c> is written as a context of
/// <c>cart.items</c> and an id of <c>count</c>, and the two are joined back here. next-intl's own
/// decoder refuses a catalogue without a context for exactly this reason: without it the key cannot
/// be rebuilt.
///
/// A catalogue is therefore a flat list of keys and values, which is what the nested JSON parser
/// produces after flattening. Both namespace modes mean the same thing here as they do there, and
/// plural forms never come into it, because next-intl keeps plurals as ICU inside the value.
///
/// What the format adds beyond a key and a value is metadata: <c>#.</c> descriptions and <c>#:</c>
/// file references. There is nowhere to keep those, so they are read and dropped rather than
/// mistaken for content.
/// </summary>
public sealed class PoParser(IMessageFormatValidator validator) : ITranslationSourceParser
{
    public async IAsyncEnumerable<TranslationSourceMessage> ParseAsync(
        TranslationSourcePayload payload,
        TranslationParserOptions options,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var identities = new HashSet<string>(StringComparer.Ordinal);

        foreach (var entry in await ReadEntriesAsync(payload.Content, cancellationToken))
        {
            cancellationToken.ThrowIfCancellationRequested();

            /*
             * Three kinds of entry carry no translation, and none of them is broken. The header
             * has an empty msgid and holds the file's own metadata. An empty msgstr is gettext for
             * "not translated yet", which is the absence this already models as a key with no row
             * for the locale. Fuzzy is a guess, and gettext tools decline to use one until somebody
             * confirms it.
             */
            if (entry.Id.Length == 0 || entry.Value.Length == 0 || entry.Fuzzy) continue;

            var (messageNamespace, key) = Split(entry.Key, options);
            var identity = $"{messageNamespace}\0{key}";
            if (!identities.Add(identity))
                throw new TranslationSourceFormatException($"Duplicate key '{messageNamespace}.{key}'.");

            var validation = validator.Validate(entry.Value, options.MessageFormat);
            if (!validation.IsValid)
                throw new TranslationSourceFormatException(
                    $"Invalid {FormatName(options.MessageFormat)} message '{messageNamespace}.{key}': {validation.Error}");

            yield return new TranslationSourceMessage(
                messageNamespace,
                key,
                payload.Locale,
                entry.Value,
                options.MessageFormat,
                validation.Arguments,
                TranslationMessageFingerprint.Compute(entry.Value, options.MessageFormat, validation.Arguments));
        }
    }

    /// <summary>
    /// The same two modes the nested JSON parser offers, applied to a key that arrives already
    /// flattened. In first-segment mode a key with no dot has no namespace to take, and saying so
    /// beats inventing one and filing the messages where nobody will look.
    /// </summary>
    private static (string Namespace, string Key) Split(string id, TranslationParserOptions options)
    {
        if (options.NamespaceMode is NamespaceMode.Fixed) return (options.Namespace, id);

        var separator = id.IndexOf('.');
        if (separator <= 0 || separator == id.Length - 1)
            throw new TranslationSourceFormatException(
                $"Message key '{id}' has no dot to split on. Either every key reads as namespace.key, or " +
                "the source uses one fixed namespace.");

        return (id[..separator], id[(separator + 1)..]);
    }

    private static async Task<List<PoEntry>> ReadEntriesAsync(Stream content, CancellationToken cancellationToken)
    {
        var entries = new List<PoEntry>();
        using var reader = new StreamReader(content, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, leaveOpen: true);

        // What has been seen since the last blank line. `field` is where an unprefixed quoted line
        // belongs, because a value may be split over as many lines as it likes.
        var id = new StringBuilder();
        var value = new StringBuilder();
        // A context is read so its continuation lines have somewhere to go, and never read back.
        var context = new StringBuilder();
        var fuzzy = false;
        StringBuilder? field = null;
        var started = false;

        /*
         * Flags belong to the entry after them, not the one before. Held apart from the entry being
         * built and claimed by the msgid that starts the next one, because a catalogue written
         * without blank lines between entries puts "#, fuzzy" directly after a finished msgstr.
         * Read as part of that entry it marked the wrong one, so a confirmed translation was
         * dropped and the guess below it was imported in its place.
         */
        var fuzzyNext = false;

        void Flush()
        {
            if (started) entries.Add(new PoEntry(id.ToString(), context.ToString(), value.ToString(), fuzzy));
            id.Clear();
            value.Clear();
            context.Clear();
            fuzzy = false;
            field = null;
            started = false;
        }

        while (await reader.ReadLineAsync(cancellationToken) is { } raw)
        {
            var line = raw.Trim();
            if (line.Length == 0)
            {
                Flush();
                continue;
            }

            if (line[0] == '#')
            {
                // Flags are the only comment that changes what an entry means. Obsolete entries are
                // commented out with "#~" and fall in here too, which is where they belong.
                if (line.StartsWith("#,", StringComparison.Ordinal) &&
                    line[2..].Split(',').Any(flag => flag.Trim().Equals("fuzzy", StringComparison.Ordinal)))
                    fuzzyNext = true;
                continue;
            }

            if (line.StartsWith("msgid_plural", StringComparison.Ordinal) ||
                line.StartsWith("msgstr[", StringComparison.Ordinal))
                throw new TranslationSourceFormatException(
                    "This catalogue uses gettext plural entries. next-intl writes plurals as ICU inside the " +
                    "message, not as msgid_plural and msgstr[n].");

            if (Keyword(line, "msgctxt", out var contextText))
            {
                // The leading segments of the key, which is what next-intl puts here. Like any PO
                // string it may be split over lines, so it needs a field of its own to collect in.
                context.Clear();
                field = context;
                started = true;
                field.Append(contextText);
                continue;
            }

            if (Keyword(line, "msgid", out var idText))
            {
                // A second msgid without a blank line between is still a new entry.
                if (id.Length > 0 || value.Length > 0) Flush();
                fuzzy = fuzzyNext;
                fuzzyNext = false;
                field = id;
                started = true;
                field.Append(idText);
                continue;
            }

            if (Keyword(line, "msgstr", out var valueText))
            {
                field = value;
                started = true;
                field.Append(valueText);
                continue;
            }

            if (line[0] == '"')
            {
                if (field is null)
                    throw new TranslationSourceFormatException($"Unexpected text in the catalogue: {Excerpt(raw)}");
                field.Append(Unquote(line));
                continue;
            }

            throw new TranslationSourceFormatException($"Unexpected text in the catalogue: {Excerpt(raw)}");
        }

        Flush();
        return entries;
    }

    /// <summary>Matches a keyword and returns the quoted string that follows it on the same line.</summary>
    private static bool Keyword(string line, string keyword, out string text)
    {
        text = string.Empty;
        if (!line.StartsWith(keyword, StringComparison.Ordinal)) return false;

        var rest = line[keyword.Length..];
        // "msgid" must not match "msgid_plural", and the keyword is always followed by whitespace.
        if (rest.Length > 0 && rest[0] is not (' ' or '\t')) return false;

        rest = rest.TrimStart();
        text = rest.Length == 0 ? string.Empty : Unquote(rest);
        return true;
    }

    /// <summary>
    /// The contents of a quoted PO string. Everything a PO writer escapes on the way out is undone
    /// here; anything else is left as the two characters it was, because a backslash in a message is
    /// far likelier than an escape nobody has ever emitted.
    /// </summary>
    private static string Unquote(string text)
    {
        var opening = text.IndexOf('"');
        var closing = text.LastIndexOf('"');
        if (opening < 0 || closing <= opening)
            throw new TranslationSourceFormatException($"Expected a quoted string in the catalogue: {Excerpt(text)}");

        var body = text.AsSpan(opening + 1, closing - opening - 1);
        var result = new StringBuilder(body.Length);
        for (var index = 0; index < body.Length; index++)
        {
            if (body[index] != '\\' || index == body.Length - 1)
            {
                result.Append(body[index]);
                continue;
            }

            var escaped = body[++index];
            result.Append(escaped switch
            {
                'n' => '\n',
                't' => '\t',
                'r' => '\r',
                '"' => '"',
                '\\' => '\\',
                _ => escaped,
            });
            if (escaped is not ('n' or 't' or 'r' or '"' or '\\')) result.Insert(result.Length - 1, '\\');
        }

        return result.ToString();
    }

    /// <summary>Enough of the offending line to find it, and not enough to fill a notification.</summary>
    private static string Excerpt(string line) =>
        line.Length <= 60 ? line : $"{line[..59]}…";

    private static string FormatName(MessageFormat format) => format switch
    {
        MessageFormat.Icu => "ICU",
        MessageFormat.I18NextV4 => "i18next v4",
        MessageFormat.PlainText => "plain-text",
        _ => format.ToString(),
    };

    private sealed record PoEntry(string Id, string Context, string Value, bool Fuzzy)
    {
        /// <summary>
        /// The key, rebuilt from the two fields next-intl splits it across. A context with no id is
        /// not half a key, so the id alone decides whether there is a message here at all.
        /// </summary>
        public string Key => Id.Length == 0 || Context.Length == 0 ? Id : $"{Context}.{Id}";
    }
}
