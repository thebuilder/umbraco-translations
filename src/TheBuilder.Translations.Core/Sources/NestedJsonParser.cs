using System.Text.Json;
using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Validation;

namespace TheBuilder.Translations.Core.Sources;

public sealed class NestedJsonParser(IMessageFormatValidator validator) : ITranslationSourceParser
{
    public async IAsyncEnumerable<TranslationSourceMessage> ParseAsync(
        TranslationSourcePayload payload,
        TranslationParserOptions options,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken)
    {
        using var document = await JsonDocument.ParseAsync(payload.Content, cancellationToken: cancellationToken);
        if (document.RootElement.ValueKind is not JsonValueKind.Object)
            throw new TranslationSourceFormatException("The translation source root must be a JSON object.");

        var messages = new List<(string Namespace, string Key, string Value)>();
        if (options.NamespaceMode is NamespaceMode.Fixed)
            Flatten(document.RootElement, options.Namespace, null, messages);
        else
            FlattenFirstSegments(document.RootElement, messages);

        var identities = new HashSet<string>(StringComparer.Ordinal);
        foreach (var message in messages)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var identity = $"{message.Namespace}\0{message.Key}";
            if (!identities.Add(identity))
                throw new TranslationSourceFormatException($"Duplicate flattened key '{message.Namespace}.{message.Key}'.");

            var validation = validator.Validate(message.Value, options.MessageFormat);
            if (!validation.IsValid)
                throw new TranslationSourceFormatException($"Invalid {FormatName(options.MessageFormat)} message '{message.Namespace}.{message.Key}': {validation.Error}");

            yield return new TranslationSourceMessage(
                message.Namespace,
                message.Key,
                payload.Locale,
                message.Value,
                options.MessageFormat,
                validation.Arguments,
                TranslationMessageFingerprint.Compute(message.Value, options.MessageFormat, validation.Arguments));
        }
    }

    private static void FlattenFirstSegments(JsonElement root, List<(string Namespace, string Key, string Value)> messages)
    {
        foreach (var property in root.EnumerateObject())
        {
            if (property.Value.ValueKind is not JsonValueKind.Object)
                throw new TranslationSourceFormatException($"Namespace '{property.Name}' must contain an object.");
            Flatten(property.Value, property.Name, null, messages);
        }
    }

    private static void Flatten(
        JsonElement element,
        string messageNamespace,
        string? prefix,
        List<(string Namespace, string Key, string Value)> messages)
    {
        foreach (var property in element.EnumerateObject())
        {
            var key = string.IsNullOrEmpty(prefix) ? property.Name : $"{prefix}.{property.Name}";
            switch (property.Value.ValueKind)
            {
                case JsonValueKind.Object:
                    Flatten(property.Value, messageNamespace, key, messages);
                    break;
                case JsonValueKind.String:
                    messages.Add((messageNamespace, key, property.Value.GetString() ?? string.Empty));
                    break;
                default:
                    throw new TranslationSourceFormatException($"Message '{messageNamespace}.{key}' must be a string.");
            }
        }
    }

    private static string FormatName(MessageFormat format) => format switch
    {
        MessageFormat.Icu => "ICU",
        MessageFormat.I18NextV4 => "i18next v4",
        MessageFormat.PlainText => "plain-text",
        _ => format.ToString(),
    };
}

public sealed class TranslationSourceFormatException(string message) : Exception(message);
