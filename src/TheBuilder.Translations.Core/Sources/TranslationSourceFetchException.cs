namespace TheBuilder.Translations.Core.Sources;

/// <summary>
/// A single locale failed to fetch or parse. Locales are fetched in parallel, so the underlying
/// exception on its own says nothing about which one broke; this names the source and the locale so
/// the failure is actionable from the sync history without reading server logs.
/// </summary>
public sealed class TranslationSourceFetchException(string alias, string locale, Exception inner)
    : Exception($"Source '{alias}' failed for locale '{locale}': {inner.Message}", inner)
{
    public string Alias { get; } = alias;

    public string Locale { get; } = locale;
}
