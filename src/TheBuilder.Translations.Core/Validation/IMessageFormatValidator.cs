using TheBuilder.Translations.Core.Messages;

namespace TheBuilder.Translations.Core.Validation;

public interface IMessageFormatValidator
{
    MessageValidationResult Validate(string message, MessageFormat format);
}

public sealed record MessageValidationResult(
    bool IsValid,
    IReadOnlyDictionary<string, string> Arguments,
    string? Error)
{
    public static MessageValidationResult Valid(IReadOnlyDictionary<string, string>? arguments = null) =>
        new(true, arguments ?? new Dictionary<string, string>(), null);

    public static MessageValidationResult Invalid(string error) =>
        new(false, new Dictionary<string, string>(), error);
}
