namespace TheBuilder.Translations.Core.Messages;

public sealed record TranslationMessage(
    Guid Id,
    MessageIdentity Identity,
    string DefaultValue,
    MessageFormat Format,
    IReadOnlyDictionary<string, string> Arguments,
    string? Description,
    string SourceRevision,
    string DefaultChecksum,
    string? PreviousDefaultChecksum,
    DateTimeOffset FirstSeenAt,
    DateTimeOffset LastSeenAt,
    TranslationMessageState State);

public enum TranslationMessageState
{
    Active,
    Changed,
    Missing,
    Invalid,
}
