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
    /// <summary>
    /// The site's languages, each carrying whether it is the default. One call rather than two:
    /// this runs on every editor and settings page load, each one is a query against the same
    /// database Umbraco is authenticating the request on, and the answer is already in the list.
    /// </summary>
    Task<IReadOnlyList<TranslationLocale>> GetLocalesAsync(CancellationToken cancellationToken);
}

public static class TranslationLocales
{
    public static string? DefaultOf(IEnumerable<TranslationLocale> locales) =>
        locales.FirstOrDefault(locale => locale.IsDefault)?.Code;
}

/// <summary>
/// Chooses the locale an editor treats as authoritative. A pure function rather than a catalog
/// method, because it is a policy decision rather than a lookup: every input is already in hand at
/// the call site, and keeping it separate makes it testable without stubbing Umbraco.
/// </summary>
public static class ReferenceLocale
{
    /// <summary>
    /// An explicit request wins, then the site's default language, then whichever locale the
    /// messages actually use. Matching is case-insensitive but the stored casing is returned, so
    /// callers can compare the result against message rows directly.
    /// </summary>
    public static string? Resolve(
        string? requested,
        IReadOnlyCollection<string> availableLocales,
        string? defaultLocale) =>
        Match(requested, availableLocales)
        ?? Match(defaultLocale, availableLocales)
        ?? availableLocales.OrderBy(locale => locale, StringComparer.OrdinalIgnoreCase).FirstOrDefault();

    private static string? Match(string? candidate, IReadOnlyCollection<string> availableLocales) =>
        string.IsNullOrWhiteSpace(candidate)
            ? null
            : availableLocales.FirstOrDefault(locale =>
                string.Equals(locale, candidate.Trim(), StringComparison.OrdinalIgnoreCase));
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

}
