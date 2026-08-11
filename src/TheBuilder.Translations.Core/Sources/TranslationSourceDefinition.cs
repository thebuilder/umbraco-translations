using System.Text.Json.Serialization;
using TheBuilder.Translations.Core.Messages;

namespace TheBuilder.Translations.Core.Sources;

public sealed record TranslationSourceDefinition(
    Guid Id,
    string Alias,
    string DisplayName,
    bool Enabled,
    HttpTranslationTransportOptions Transport,
    NestedJsonParserOptions Parser,
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

public sealed record HttpTranslationHeaderOptions(
    string Name,
    string ValueConfigurationKey);

public sealed record NestedJsonParserOptions(
    IReadOnlyList<string> Locales,
    string Namespace,
    NamespaceMode NamespaceMode = NamespaceMode.Fixed,
    MessageFormat MessageFormat = MessageFormat.Icu);

[JsonConverter(typeof(JsonStringEnumConverter<NamespaceMode>))]
public enum NamespaceMode
{
    Fixed,
    FirstSegment,
}
