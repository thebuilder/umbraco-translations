using TheBuilder.Translations.Core.Messages;

namespace TheBuilder.Translations.Core.Sources;

public sealed record TranslationSourceMessage(
    string Namespace,
    string Key,
    string Locale,
    string Value,
    MessageFormat Format,
    IReadOnlyDictionary<string, string> Arguments,
    string Checksum);
