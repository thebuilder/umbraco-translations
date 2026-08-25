using System.Text.Json.Serialization;
using TheBuilder.Translations.Core.Messages;

namespace TheBuilder.Translations.Core.Sources;

public sealed record TranslationSourceDefinition(
    Guid Id,
    string Alias,
    string DisplayName,
    bool Enabled,
    HttpTranslationTransportOptions Transport,
    TranslationParserOptions Parser,
    string? LastSuccessfulRevision = null,
    DateTimeOffset? LastSuccessfulSync = null);

public sealed record HttpTranslationTransportOptions(
    string EndpointTemplate,
    string? SecretName = null,
    int TimeoutSeconds = 10,
    int MaximumResponseBytes = 10_000_000)
{
    private readonly IReadOnlyList<HttpTranslationHeaderOptions> _headers = [];

    public IReadOnlyList<HttpTranslationHeaderOptions> Headers
    {
        get => _headers;
        init => _headers = value ?? [];
    }
}

/// <summary>
/// One request header the source sends with every fetch.
///
/// The value either names a setting to read at request time or is written here directly, and which
/// of the two it is has to be stated rather than guessed from the shape of the string: a bypass
/// token and a configuration key are both just text, and guessing wrong either leaks the secret or
/// sends the key.
///
/// Secrets belong in configuration. Anything stored here is in the database in plaintext, and a
/// failure mentioning it is kept in the sync history. But plenty of headers carry nothing
/// worth protecting, and making somebody invent an appsettings key for a tenant id or an Accept
/// header is friction that buys no safety at all.
/// </summary>
public sealed record HttpTranslationHeaderOptions(
    string Name,
    string? ValueConfigurationKey = null,
    string? Value = null)
{
    /// <summary>Whether the value is written on the source rather than read from configuration.</summary>
    public bool IsLiteral => !string.IsNullOrWhiteSpace(Value);
}

public sealed record TranslationParserOptions(
    IReadOnlyList<string> Locales,
    string Namespace,
    NamespaceMode NamespaceMode = NamespaceMode.FirstSegment,
    MessageFormat MessageFormat = MessageFormat.Icu,
    SourceFormat SourceFormat = SourceFormat.NestedJson);

/// <summary>
/// How the catalogue the source publishes is written.
///
/// This is the shape of the file, not the shape of a message: a PO catalogue and a nested JSON one
/// can both hold ICU, and <see cref="MessageFormat"/> still decides what is inside a value.
///
/// Nested JSON is the default because it is what was here first, and because a source stored before
/// this existed has no format recorded and must keep behaving the way it did.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<SourceFormat>))]
public enum SourceFormat
{
    NestedJson,

    /// <summary>
    /// Gettext PO as next-intl writes it, where <c>msgid</c> is the message key rather than the
    /// source text. That is unusual for gettext and is exactly what makes it fit here: a catalogue
    /// is then a list of keys and values, which is what the nested JSON one flattens to anyway.
    /// </summary>
    Po,
}

[JsonConverter(typeof(JsonStringEnumConverter<NamespaceMode>))]
public enum NamespaceMode
{
    Fixed,
    FirstSegment,
}
