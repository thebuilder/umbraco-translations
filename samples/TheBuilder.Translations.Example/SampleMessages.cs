namespace TheBuilder.Translations.Example;

public static class SampleMessages
{
    private static readonly IReadOnlyDictionary<string, object> English = new Dictionary<string, object>
    {
        ["navigation"] = new Dictionary<string, string> { ["home"] = "Home", ["contact"] = "Contact", ["account"] = "My account" },
        ["search"] = new Dictionary<string, string>
        {
            ["placeholder"] = "Search",
            ["results"] = "{count, plural, =0 {No results} one {# result} other {# results}}",
        },
        ["greeting"] = "Welcome, {name}!",
        ["invitation"] = "{gender, select, female {She invited you} male {He invited you} other {They invited you}}",
    };

    private static readonly IReadOnlyDictionary<string, object> Danish = new Dictionary<string, object>
    {
        ["navigation"] = new Dictionary<string, string> { ["home"] = "Forside", ["contact"] = "Kontakt", ["account"] = "Min konto" },
        ["search"] = new Dictionary<string, string>
        {
            ["placeholder"] = "Søg",
            ["results"] = "{count, plural, =0 {Ingen resultater} one {# resultat} other {# resultater}}",
        },
        ["greeting"] = "Velkommen, {name}!",
        ["invitation"] = "{gender, select, female {Hun inviterede dig} male {Han inviterede dig} other {De inviterede dig}}",
    };

    private static readonly IReadOnlyDictionary<string, object> I18NextEnglish = new Dictionary<string, object>
    {
        ["navigation"] = new Dictionary<string, string> { ["home"] = "Home", ["contact"] = "Contact" },
        ["greeting"] = "Welcome, {{name}}!",
        ["search"] = new Dictionary<string, string>
        {
            ["results_one"] = "{{count}} result",
            ["results_other"] = "{{count}} results",
        },
    };

    private static readonly IReadOnlyDictionary<string, object> I18NextDanish = new Dictionary<string, object>
    {
        ["navigation"] = new Dictionary<string, string> { ["home"] = "Forside", ["contact"] = "Kontakt" },
        ["greeting"] = "Velkommen, {{name}}!",
        ["search"] = new Dictionary<string, string>
        {
            ["results_one"] = "{{count}} resultat",
            ["results_other"] = "{{count}} resultater",
        },
    };

    public static bool TryGet(string locale, out IReadOnlyDictionary<string, object>? messages)
        => TryGet(locale, false, out messages);

    public static bool TryGet(string locale, bool i18NextV4, out IReadOnlyDictionary<string, object>? messages)
    {
        string language = locale.Split('-', '_')[0].ToLowerInvariant();
        messages = (language, i18NextV4) switch
        {
            ("en", false) => English,
            ("da", false) => Danish,
            ("en", true) => I18NextEnglish,
            ("da", true) => I18NextDanish,
            _ => null,
        };

        return messages is not null;
    }
}
