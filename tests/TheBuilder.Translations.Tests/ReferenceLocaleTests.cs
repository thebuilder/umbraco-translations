using TheBuilder.Translations.Localization;

namespace TheBuilder.Translations.Tests;

public sealed class ReferenceLocaleTests
{
    private static readonly string[] Available = ["da-DK", "en-US"];

    [Fact]
    public void An_explicit_request_wins()
    {
        Assert.Equal("da-DK", ReferenceLocale.Resolve("da-DK", Available, "en-US"));
    }

    [Fact]
    public void Falls_back_to_the_site_default_when_nothing_was_requested()
    {
        Assert.Equal("en-US", ReferenceLocale.Resolve(null, Available, "en-US"));
    }

    [Fact]
    public void Falls_back_again_when_the_default_has_no_messages()
    {
        // A site whose default language no source ships still needs a reference to translate from.
        Assert.Equal("da-DK", ReferenceLocale.Resolve(null, ["da-DK"], "en-US"));
    }

    [Theory]
    [InlineData("EN-US")]
    [InlineData("  en-US  ")]
    public void Matches_case_and_whitespace_insensitively_but_returns_the_stored_casing(string requested)
    {
        // The result is compared against message rows, so it has to be spelled the way they are.
        Assert.Equal("en-US", ReferenceLocale.Resolve(requested, Available, null));
    }

    [Fact]
    public void Ignores_a_request_for_a_locale_with_no_messages()
    {
        Assert.Equal("en-US", ReferenceLocale.Resolve("de-DE", Available, "en-US"));
    }

    [Fact]
    public void Has_nothing_to_resolve_when_no_locale_has_messages()
    {
        Assert.Null(ReferenceLocale.Resolve("en-US", [], "en-US"));
    }
}
