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
