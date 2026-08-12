using System.Text.Json.Serialization;
using TheBuilder.Translations.Core.Messages;

namespace TheBuilder.Translations.Core.Persistence;

/// <summary>
/// What a single locale has to say about one key. Ordered from least to most attention required,
/// so the editor can rank a key by the worst state across the locales it shows.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<MessageLocaleState>))]
public enum MessageLocaleState
{
    /// <summary>The application ships a translation and nobody has overridden it.</summary>
    Default,

    /// <summary>An override exists and was made against the current source text.</summary>
    Overridden,

    /// <summary>An override exists but the application default changed underneath it.</summary>
    NeedsReview,

    /// <summary>The source removed the key; the row survives only because it has an override.</summary>
    Removed,

    /// <summary>No row at all. The application never shipped this key in this locale.</summary>
    Absent,
}

/// <summary>
/// Deliberately not <see cref="MessageStatusFilter"/>. That enum's <c>Missing</c> means "the source
/// removed it", which is a different question from "this locale never had it", and the key view
/// needs to express both. Its names are also already baked into the facet status counts.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<MessageKeyStatusFilter>))]
public enum MessageKeyStatusFilter
{
    All,
    Absent,
    Default,
    Overridden,
    NeedsReview,
    Removed,
}

[JsonConverter(typeof(JsonStringEnumConverter<MessageKeySort>))]
public enum MessageKeySort
{
    Key,
    UpdatedAt,
    Status,
}

[JsonConverter(typeof(JsonStringEnumConverter<SortDirection>))]
public enum SortDirection
{
    Ascending,
    Descending,
}

/// <summary>
/// A page of translation keys rather than of key-locale pairs, which is what lets the editor show a
/// reference locale beside the one being edited and lets "present in English, absent in Danish" be
/// asked for at all.
/// </summary>
public sealed record MessageKeyQuery(
    string ReferenceLocale,
    string TargetLocale,
    IReadOnlyList<string>? CompareLocales = null,
    Guid? SourceId = null,
    string? Namespace = null,
    string? KeyPrefix = null,
    string? Query = null,
    MessageKeyStatusFilter Status = MessageKeyStatusFilter.All,
    MessageKeySort Sort = MessageKeySort.Key,
    SortDirection Direction = SortDirection.Ascending,
    int Page = 1,
    int PageSize = 100)
{
    // Computed, not initialised auto-properties: a `with` expression copies backing fields without
    // re-running initialisers, so `query with { CompareLocales = [...] }` would silently keep the
    // original locale set.

    /// <summary>
    /// The key set is defined by the reference and target locales only. A compare locale adds a
    /// read-only column; it must not drag in keys that neither of the two main locales has.
    /// </summary>
    public IReadOnlyList<string> KeySetLocales => Distinct([ReferenceLocale, TargetLocale]);

    /// <summary>Locales whose text is actually returned. Everything else contributes only a state.</summary>
    public IReadOnlyList<string> DetailLocales =>
        Distinct([ReferenceLocale, TargetLocale, .. CompareLocales ?? []]);

    private static IReadOnlyList<string> Distinct(IEnumerable<string> locales) =>
        locales.Where(locale => !string.IsNullOrWhiteSpace(locale))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
}

/// <summary>One key, with the locales the caller asked to see and a state for every locale.</summary>
public sealed record TranslationMessageKeyView(
    Guid SourceId,
    string Namespace,
    string Key,
    MessageFormat Format,
    IReadOnlyDictionary<string, string> Arguments,
    IReadOnlyDictionary<string, TranslationMessageLocaleView> Locales,
    IReadOnlyDictionary<string, MessageLocaleState> Coverage)
{
    public MessageLocaleState StateOf(string locale) =>
        Coverage.TryGetValue(locale, out var state) ? state : MessageLocaleState.Absent;
}

public sealed record TranslationMessageLocaleView(
    Guid Id,
    string Locale,
    string DefaultValue,
    string? OverrideValue,
    bool NeedsReview,
    TranslationMessageState State,
    long? Version,
    DateTimeOffset? UpdatedAt,
    string? UpdatedBy)
{
    public bool HasOverride => OverrideValue is not null;

    public string EffectiveValue => OverrideValue ?? DefaultValue;
}

/// <summary>Identifies the target-locale message of a key, for selection and bulk operations.</summary>
public sealed record MessageKeyReference(Guid Id, long? Version);
