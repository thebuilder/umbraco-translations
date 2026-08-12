using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Persistence;

namespace TheBuilder.Translations.ManagementApi;

/// <summary>
/// One locale's text for a key. Only returned for the target, reference and compare locales.
///
/// The values are previews, not the whole message. <paramref name="Truncated"/> says so explicitly
/// rather than leaving the client to sniff for a trailing ellipsis, because a message may end in
/// one legitimately, and editing a value the client only holds the first 177 characters of would
/// silently discard the rest.
/// </summary>
public sealed record MessageCellResponse(
    Guid Id,
    string Locale,
    string DefaultValue,
    string? OverrideValue,
    bool HasOverride,
    bool NeedsReview,
    bool Truncated,
    MessageLocaleState State,
    long? Version,
    DateTimeOffset? UpdatedAt,
    string? UpdatedBy);

/// <summary>
/// One translation key across locales.
///
/// <paramref name="Cells"/> carries text and is limited to the locales the caller asked to see.
/// <paramref name="Coverage"/> carries a state for every locale the key exists in, which is what
/// lets the editor show whole-locale coverage without paying the payload cost of every locale's
/// prose on every row.
/// </summary>
public sealed record MessageKeyResponse(
    Guid SourceId,
    string Namespace,
    string Key,
    MessageFormat Format,
    IReadOnlyDictionary<string, string> Arguments,
    IReadOnlyDictionary<string, MessageCellResponse> Cells,
    IReadOnlyDictionary<string, MessageLocaleState> Coverage);

public sealed record MessageKeyListResponse(
    IReadOnlyList<MessageKeyResponse> Items,
    int Page,
    int PageSize,
    int Total,
    string ReferenceLocale,
    string TargetLocale,
    IReadOnlyList<string> CompareLocales);

/// <summary>
/// Target-locale message ids for a filter, with no text. Backs "select all N matching".
/// <paramref name="Capped"/> is true when the filter matched more than the server will return, in
/// which case the caller must narrow rather than silently act on a subset.
/// </summary>
public sealed record MessageKeyReferenceResponse(
    IReadOnlyList<MessageKeyReference> Items,
    int Limit,
    bool Capped);

internal static class KeyApiMapping
{
    public static MessageKeyResponse ToResponse(this TranslationMessageKeyView view) => new(
        view.SourceId,
        view.Namespace,
        view.Key,
        view.Format,
        view.Arguments,
        view.Locales.ToDictionary(
            entry => entry.Key,
            entry => entry.Value.ToCell(view.StateOf(entry.Key)),
            StringComparer.OrdinalIgnoreCase),
        view.Coverage);

    private static MessageCellResponse ToCell(this TranslationMessageLocaleView locale, MessageLocaleState state)
    {
        var (defaultValue, defaultTruncated) = MessagePreview.Of(locale.DefaultValue);
        var (overrideValue, overrideTruncated) = locale.OverrideValue is null
            ? (null, false)
            : MessagePreview.Of(locale.OverrideValue);

        return new MessageCellResponse(
            locale.Id,
            locale.Locale,
            defaultValue,
            overrideValue,
            locale.HasOverride,
            locale.NeedsReview,
            // Either value being cut is enough to send the editor to the inspector, since both are
            // shown in the row and either could be the one being edited.
            defaultTruncated || overrideTruncated,
            state,
            locale.Version,
            locale.UpdatedAt,
            locale.UpdatedBy);
    }
}
