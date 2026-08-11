namespace TheBuilder.Translations.Core.Sources;

public static class TranslationSourceValidator
{
    private const int MaximumHeaderCount = 20;
    private const string HeaderNameSymbols = "!#$%&'*+-.^_`|~";
    public const int MinimumTimeoutSeconds = 1;
    public const int MaximumTimeoutSeconds = 120;
    public const int MinimumResponseBytes = 1_000_000;
    public const int MaximumResponseBytes = 50_000_000;

    public static string? Validate(TranslationSourceDefinition source)
    {
        var aliasError = ValidateAlias(source.Alias);
        if (aliasError is not null) return aliasError;
        if (source.DisplayName.Length is < 1 or > 200) return "Display name is required and cannot exceed 200 characters.";
        if (!source.Transport.EndpointTemplate.Contains("{locale}", StringComparison.Ordinal)) return "Endpoint must contain {locale}.";
        var endpoint = source.Transport.EndpointTemplate.Replace("{locale}", "en-US", StringComparison.Ordinal);
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var endpointUri) ||
            (endpointUri.Scheme != Uri.UriSchemeHttp && endpointUri.Scheme != Uri.UriSchemeHttps))
            return "Endpoint must be an absolute HTTP or HTTPS URL.";
        if (source.Transport.TimeoutSeconds is < MinimumTimeoutSeconds or > MaximumTimeoutSeconds) return $"Request timeout must be between {MinimumTimeoutSeconds} and {MaximumTimeoutSeconds} seconds.";
        if (source.Transport.MaximumResponseBytes is < MinimumResponseBytes or > MaximumResponseBytes) return "Largest accepted response must be between 1 and 50 MB.";
        var headers = source.Transport.Headers;
        if (headers.Count > MaximumHeaderCount) return $"No more than {MaximumHeaderCount} request headers are allowed.";
        var headerNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var header in headers)
        {
            if (header.Name.Length is < 1 or > 100 || !header.Name.All(IsHeaderNameCharacter)) return $"Request header name '{header.Name}' is invalid.";
            if (HttpTranslationRequestHeaderPolicy.IsTransportManaged(header.Name)) return $"Request header '{header.Name}' is managed by the translation transport and cannot be configured.";
            if (!HttpTranslationRequestHeaderPolicy.CanAddToRequest(header.Name)) return $"Request header '{header.Name}' is not supported for translation requests.";
            if (!headerNames.Add(header.Name)) return $"Request header '{header.Name}' is configured more than once.";
            if (string.IsNullOrWhiteSpace(header.ValueConfigurationKey) || header.ValueConfigurationKey.Length > 200) return $"Request header '{header.Name}' must reference a server configuration key.";
        }
        if (source.Transport.SecretName is not null && headerNames.Contains("Authorization")) return "Authorization cannot use both the Bearer token setting and a custom request header.";
        if (source.Parser.Locales.Count == 0) return "At least one locale is required.";
        if (source.Parser.NamespaceMode is NamespaceMode.Fixed && string.IsNullOrWhiteSpace(source.Parser.Namespace)) return "A namespace is required in fixed namespace mode.";
        return null;
    }

    public static string? ValidateAlias(string alias)
    {
        if (alias.Length is < 1 or > 100) return "Alias is required and cannot exceed 100 characters.";
        if (alias is "." or "..") return "Alias cannot be a relative path segment.";
        if (alias != alias.ToLowerInvariant()) return "Alias must use lowercase characters.";
        return alias.All(IsAliasCharacter)
            ? null
            : "Alias can contain only letters, numbers, hyphens, periods, underscores, and tildes.";
    }

    private static bool IsHeaderNameCharacter(char value) =>
        char.IsAsciiLetterOrDigit(value) || HeaderNameSymbols.Contains(value, StringComparison.Ordinal);

    private static bool IsAliasCharacter(char value) =>
        char.IsAsciiLetterOrDigit(value) || value is '-' or '.' or '_' or '~';

    public static void EnsureValid(TranslationSourceDefinition source)
    {
        var error = Validate(source);
        if (error is not null) throw new ArgumentException(error, nameof(source));
    }
}
