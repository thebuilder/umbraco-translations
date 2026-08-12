using Umbraco.Cms.Core.Services;

namespace TheBuilder.Translations.Localization;

/// <summary>A language configured in Umbraco, which is where translation locales come from.</summary>
public sealed record TranslationLocale(
    string Code,
    string Name,
    bool IsDefault,
    bool IsMandatory,
    string? FallbackCode);

/// <summary>
/// The site's locales and which one is the default. Translation locales are Umbraco language ISO
/// codes (the source editor picks them from the language list), so Umbraco stays the single source
/// of truth rather than the package growing its own configuration.
/// </summary>
public interface ITranslationLocaleCatalog
{
    Task<IReadOnlyList<TranslationLocale>> GetLocalesAsync(CancellationToken cancellationToken);

    Task<string?> GetDefaultLocaleAsync(CancellationToken cancellationToken);

    /// <summary>
    /// Resolves the locale an editor should see as authoritative: an explicit request wins, then
    /// Umbraco's default language, then whichever locale the messages actually use. Matching is
    /// case-insensitive but the stored casing is returned, so callers can compare against message
    /// rows directly.
    /// </summary>
    Task<string?> ResolveReferenceLocaleAsync(
        string? requested,
        IReadOnlyCollection<string> availableLocales,
        CancellationToken cancellationToken);
}

internal sealed class UmbracoTranslationLocaleCatalog(ILanguageService languages) : ITranslationLocaleCatalog
{
    public async Task<IReadOnlyList<TranslationLocale>> GetLocalesAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var all = await languages.GetAllAsync();
        return all
            .Select(language => new TranslationLocale(
                language.IsoCode,
                language.CultureName,
                language.IsDefault,
                language.IsMandatory,
                language.FallbackIsoCode))
            .ToArray();
    }

    public async Task<string?> GetDefaultLocaleAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return await languages.GetDefaultIsoCodeAsync();
    }

    public async Task<string?> ResolveReferenceLocaleAsync(
        string? requested,
        IReadOnlyCollection<string> availableLocales,
        CancellationToken cancellationToken)
    {
        if (Match(requested, availableLocales) is { } explicitLocale)
            return explicitLocale;
        if (Match(await GetDefaultLocaleAsync(cancellationToken), availableLocales) is { } defaultLocale)
            return defaultLocale;
        return availableLocales.OrderBy(locale => locale, StringComparer.OrdinalIgnoreCase).FirstOrDefault();
    }

    private static string? Match(string? candidate, IReadOnlyCollection<string> availableLocales) =>
        string.IsNullOrWhiteSpace(candidate)
            ? null
            : availableLocales.FirstOrDefault(locale => string.Equals(locale, candidate.Trim(), StringComparison.OrdinalIgnoreCase));
}
