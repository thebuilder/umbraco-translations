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

    /// <summary>
    /// The row exists because an editor wrote a translation for a locale no source ships, not
    /// because a source shipped it. It has no application default, so its text lives entirely in
    /// the override, and synchronisation must leave it alone rather than treat it as removed.
    /// </summary>
    Authored,
}
