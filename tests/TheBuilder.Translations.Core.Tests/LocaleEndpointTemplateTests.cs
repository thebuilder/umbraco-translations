using TheBuilder.Translations.Core.Sources;

namespace TheBuilder.Translations.Core.Tests;

public sealed class LocaleEndpointTemplateTests
{
    [Theory]
    [InlineData("en-US", "en")]
    [InlineData("pt-BR", "pt")]
    [InlineData("en_GB", "en")]
    [InlineData("en", "en")]
    [InlineData("zh-Hant-TW", "zh")]
    public void Takes_the_language_subtag(string locale, string expected)
    {
        Assert.Equal(expected, LocaleEndpointTemplate.LanguageOf(locale));
    }

    [Fact]
    public void Expands_the_locale_token_to_the_full_umbraco_code()
    {
        Assert.Equal(
            "https://app/messages/en-US.json",
            LocaleEndpointTemplate.Expand("https://app/messages/{locale}.json", "en-US"));
    }

    [Fact]
    public void Expands_the_language_token_for_sources_that_drop_the_region()
    {
        Assert.Equal(
            "https://app/messages/en.json",
            LocaleEndpointTemplate.Expand("https://app/messages/{language}.json", "en-US"));
    }

    [Fact]
    public void Expands_both_tokens_in_one_template()
    {
        Assert.Equal(
            "https://app/en/en-US.json",
            LocaleEndpointTemplate.Expand("https://app/{language}/{locale}.json", "en-US"));
    }

    [Fact]
    public void Escapes_each_token()
    {
        Assert.Equal(
            "https://app/pt%2FBR.json",
            LocaleEndpointTemplate.Expand("https://app/{locale}.json", "pt/BR"));
    }

    [Theory]
    [InlineData("https://app/{locale}.json", true)]
    [InlineData("https://app/{language}.json", true)]
    [InlineData("https://app/{language}/{locale}.json", true)]
    [InlineData("https://app/messages.json", false)]
    [InlineData("https://app/{lang}.json", false)]
    public void Recognises_a_template_that_names_a_locale(string template, bool expected)
    {
        Assert.Equal(expected, LocaleEndpointTemplate.HasLocaleToken(template));
    }
}
