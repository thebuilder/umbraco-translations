namespace TheBuilder.Translations.Core.Sources;

/// <summary>
/// Expands the locale tokens in a source's endpoint template.
///
/// Umbraco languages carry a region (<c>en-US</c>, <c>pt-BR</c>) but applications routinely name
/// their message files by language alone (<c>en.json</c>). Rather than a per-source "ignore the
/// region" switch, the template says which it wants:
///
/// <code>
///   messages/{locale}.json     -> messages/en-US.json
///   messages/{language}.json   -> messages/en.json
///   {language}/{locale}.json   -> en/en-US.json
/// </code>
///
/// The template already describes how the remote names its files, so putting the choice there keeps
/// one mechanism instead of two that can contradict each other, and it composes in ways a boolean
/// cannot. Messages are still stored under the full Umbraco code whichever token is used, so
/// regional variants never collapse into one another and the delivery contract is unaffected.
/// </summary>
public static class LocaleEndpointTemplate
{
    public const string LocaleToken = "{locale}";
    public const string LanguageToken = "{language}";

    public static bool HasLocaleToken(string template) =>
        template.Contains(LocaleToken, StringComparison.Ordinal) ||
        template.Contains(LanguageToken, StringComparison.Ordinal);

    /// <summary>Values are always URL-escaped; a well-formed locale code is unaffected.</summary>
    public static string Expand(string template, string locale) =>
        template
            .Replace(LocaleToken, Uri.EscapeDataString(locale), StringComparison.Ordinal)
            .Replace(LanguageToken, Uri.EscapeDataString(LanguageOf(locale)), StringComparison.Ordinal);

    /// <summary>
    /// The language subtag of an IETF tag: the text before the first separator. Both '-' and '_'
    /// are accepted because message files are named with either.
    /// </summary>
    public static string LanguageOf(string locale)
    {
        var separator = locale.AsSpan().IndexOfAny('-', '_');
        return separator < 0 ? locale : locale[..separator];
    }
}
