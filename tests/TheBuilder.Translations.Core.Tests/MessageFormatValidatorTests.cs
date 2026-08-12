using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Validation;

namespace TheBuilder.Translations.Core.Tests;

public sealed class MessageFormatValidatorTests
{
    private readonly MessageFormatValidator _validator = new();

    [Theory]
    [InlineData("Hello {name}")]
    [InlineData("{count, number} items")]
    [InlineData("{date, date, short}")]
    [InlineData("{gender, select, female {She} male {He} other {They}} replied")]
    [InlineData("{count, plural, =0 {None} one {One} other {{count, number} results}}")]
    [InlineData("This '{is}' quoted and this ''{name}'' is not")]
    public void Accepts_supported_icu(string message)
    {
        Assert.True(_validator.Validate(message, MessageFormat.Icu).IsValid);
    }

    [Theory]
    [InlineData("Hello {name")]
    [InlineData("Hello name}")]
    [InlineData("{count, plural, one {One}}")]
    [InlineData("{value, magic}")]
    [InlineData("{value, number} {value, date}")]
    public void Rejects_invalid_icu(string message)
    {
        Assert.False(_validator.Validate(message, MessageFormat.Icu).IsValid);
    }

    // A bare apostrophe is prose, not the start of a quoted section. Getting this wrong
    // silently returned an empty argument set, so every French or Italian override of a
    // message with an argument was rejected as an argument-signature mismatch.
    [Theory]
    [InlineData("Il n'y a {count} messages", "count")]
    [InlineData("Aujourd'hui il y a {count} messages", "count")]
    [InlineData("It's {name}'s turn", "name")]
    [InlineData("L'utente {name} ha risposto", "name")]
    public void Treats_prose_apostrophes_as_literal_text(string message, string argument)
    {
        var result = _validator.Validate(message, MessageFormat.Icu);

        Assert.True(result.IsValid, result.Error);
        Assert.Equal(["string"], result.Arguments.Values);
        Assert.True(result.Arguments.ContainsKey(argument));
    }

    [Theory]
    [InlineData("5 o'clock")]
    [InlineData("don't")]
    [InlineData("trailing apostrophe '")]
    public void Accepts_prose_apostrophes_without_arguments(string message)
    {
        var result = _validator.Validate(message, MessageFormat.Icu);

        Assert.True(result.IsValid, result.Error);
        Assert.Empty(result.Arguments);
    }

    [Theory]
    // '{ opens a quoted section, so the braces are literal and yield no argument.
    [InlineData("This '{is}' quoted", 0)]
    // '' is an escaped apostrophe, so the braces that follow are a real argument.
    [InlineData("This ''{name}'' is not", 1)]
    // An unterminated quoted section runs to the end of the message.
    [InlineData("Unterminated '{name}", 0)]
    public void Quotes_only_before_syntax_characters(string message, int expectedArguments)
    {
        var result = _validator.Validate(message, MessageFormat.Icu);

        Assert.True(result.IsValid, result.Error);
        Assert.Equal(expectedArguments, result.Arguments.Count);
    }

    [Theory]
    [InlineData("Hello {{name}}", "name")]
    [InlineData("{{count}} items", "count")]
    [InlineData("Hello {{- name}}", "name")]
    [InlineData("Price: {{value, currency}}", "value")]
    public void Accepts_i18next_v4_interpolation(string message, string argument)
    {
        var result = _validator.Validate(message, MessageFormat.I18NextV4);

        Assert.True(result.IsValid);
        Assert.Equal("string", result.Arguments[argument]);
    }

    [Theory]
    [InlineData("Hello {{name")]
    [InlineData("Hello name}}")]
    [InlineData("Hello {{ }}")]
    public void Rejects_invalid_i18next_v4_interpolation(string message)
    {
        Assert.False(_validator.Validate(message, MessageFormat.I18NextV4).IsValid);
    }
}
