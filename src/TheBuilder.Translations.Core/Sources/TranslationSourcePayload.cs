namespace TheBuilder.Translations.Core.Sources;

public sealed record TranslationSourcePayload(
    Stream Content,
    string Locale,
    string? ContentType,
    string? ETag,
    DateTimeOffset? LastModified,
    string Revision) : IAsyncDisposable
{
    public ValueTask DisposeAsync() => Content.DisposeAsync();
}

public sealed record TranslationFetchContext(string Locale, string? ETag = null, DateTimeOffset? LastModified = null);
