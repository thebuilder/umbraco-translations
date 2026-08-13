using TheBuilder.Translations.Core.Messages;

namespace TheBuilder.Translations.Core.Validation;

/// <summary>
/// The single definition of what makes an override acceptable. Single saves, bulk saves and
/// find-and-replace previews all go through here, so a value a preview reports as valid cannot be
/// rejected when it is applied.
/// </summary>
public static class MessageOverrideValidation
{
    /// <summary>
    /// The override column is unbounded in the database, so the limit is enforced here instead.
    /// Generous enough for any real message, small enough that a bulk request cannot be used to
    /// write hundreds of megabytes in one call.
    /// </summary>
    public const int MaximumValueLength = 100_000;

    public const string ArgumentMismatchError =
        "The override must use the same argument names and kinds as the source message.";

    /// <summary>Returns a message describing why the override is unacceptable, or <c>null</c>.</summary>
    public static string? Describe(string value, TranslationMessage message, IMessageFormatValidator validator)
    {
        ArgumentNullException.ThrowIfNull(value);
        ArgumentNullException.ThrowIfNull(message);
        ArgumentNullException.ThrowIfNull(validator);

        if (value.Length > MaximumValueLength)
            return $"The override must be {MaximumValueLength} characters or fewer.";

        var validation = validator.Validate(value, message.Format);
        if (!validation.IsValid)
            return validation.Error;

        return ArgumentsMatch(message.Arguments, validation.Arguments) ? null : ArgumentMismatchError;
    }

    public static bool ArgumentsMatch(
        IReadOnlyDictionary<string, string> expected,
        IReadOnlyDictionary<string, string> actual) =>
        expected.Count == actual.Count &&
        expected.All(item => actual.TryGetValue(item.Key, out var kind) && kind == item.Value);
}
