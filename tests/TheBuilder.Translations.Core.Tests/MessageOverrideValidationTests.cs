using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Validation;

namespace TheBuilder.Translations.Core.Tests;

public sealed class MessageOverrideValidationTests
{
    private readonly MessageFormatValidator _validator = new();

    [Fact]
    public void Accepts_an_override_with_the_same_arguments()
    {
        var message = Message("You have {count, plural, one {# item} other {# items}}", new() { ["count"] = "plural" });

        Assert.Null(Describe("Du har {count, plural, one {# vare} other {# varer}}", message));
    }

    // Ties the ICU apostrophe fix to the endpoint: before it, the scanner returned no arguments for
    // this value and the parity check rejected a perfectly good French translation.
    [Theory]
    [InlineData("Il n'y a {count} messages")]
    [InlineData("Aujourd'hui vous avez {count} messages")]
    public void Accepts_a_translation_containing_a_prose_apostrophe(string translation)
    {
        var message = Message("You have {count} messages", new() { ["count"] = "string" });

        Assert.Null(Describe(translation, message));
    }

    [Theory]
    [InlineData("You have {total} messages")]
    [InlineData("You have messages")]
    [InlineData("You have {count} of {total} messages")]
    public void Rejects_an_override_whose_arguments_differ(string translation)
    {
        var message = Message("You have {count} messages", new() { ["count"] = "string" });

        Assert.Equal(MessageOverrideValidation.ArgumentMismatchError, Describe(translation, message));
    }

    [Fact]
    public void Rejects_an_override_whose_argument_kind_differs()
    {
        var message = Message("You have {count, number} messages", new() { ["count"] = "number" });

        Assert.Equal(MessageOverrideValidation.ArgumentMismatchError, Describe("You have {count} messages", message));
    }

    [Fact]
    public void Reports_the_syntax_error_for_malformed_icu()
    {
        var message = Message("Hello {name}", new() { ["name"] = "string" });

        var error = Describe("Hej {name", message);

        Assert.NotNull(error);
        Assert.NotEqual(MessageOverrideValidation.ArgumentMismatchError, error);
    }

    [Fact]
    public void Rejects_an_override_beyond_the_length_limit()
    {
        var message = Message("Hello", []);

        var error = Describe(new string('a', MessageOverrideValidation.MaximumValueLength + 1), message);

        Assert.NotNull(error);
        Assert.Contains(MessageOverrideValidation.MaximumValueLength.ToString(), error, StringComparison.Ordinal);
    }

    [Fact]
    public void Accepts_an_override_at_exactly_the_length_limit()
    {
        var message = Message("Hello", []);

        Assert.Null(Describe(new string('a', MessageOverrideValidation.MaximumValueLength), message));
    }

    [Fact]
    public void Leaves_plain_text_unparsed()
    {
        var message = Message("100% {not an argument", [], MessageFormat.PlainText);

        Assert.Null(Describe("50% {still not an argument", message));
    }

    private string? Describe(string value, TranslationMessage message) =>
        MessageOverrideValidation.Describe(value, message, _validator);

    private static TranslationMessage Message(
        string defaultValue,
        Dictionary<string, string> arguments,
        MessageFormat format = MessageFormat.Icu) =>
        new(Guid.NewGuid(), new MessageIdentity(Guid.NewGuid(), "website", "greeting", "da"),
            defaultValue, format, arguments, null, "revision", "checksum", null,
            DateTimeOffset.UnixEpoch, DateTimeOffset.UnixEpoch, TranslationMessageState.Active);
}
