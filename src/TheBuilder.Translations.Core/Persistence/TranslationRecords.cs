using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Output;

namespace TheBuilder.Translations.Core.Persistence;

public sealed record TranslationOverride(
    Guid MessageId,
    string Value,
    string SourceChecksumAtEdit,
    long Version,
    DateTimeOffset CreatedAt,
    string CreatedBy,
    DateTimeOffset UpdatedAt,
    string UpdatedBy);

public sealed record TranslationMessageView(TranslationMessage Message, TranslationOverride? Override)
{
    public bool NeedsReview => Override is not null && Override.SourceChecksumAtEdit != Message.DefaultChecksum;
}

public sealed record MessageQuery(
    string? Locale = null,
    string? Namespace = null,
    string? Query = null,
    MessageStatusFilter Status = MessageStatusFilter.All,
    int Page = 1,
    int PageSize = 100);

public enum MessageStatusFilter
{
    All,
    Default,
    Overridden,
    NeedsReview,
    Missing,
}

public sealed record Page<T>(IReadOnlyList<T> Items, int PageNumber, int PageSize, int Total);

public sealed record TranslationFacets(
    IReadOnlyList<TranslationLocaleUsage> Locales,
    IReadOnlyList<string> Namespaces,
    IReadOnlyList<TranslationOutputEndpoint> OutputEndpoints,
    IReadOnlyList<TranslationOutputConflict> OutputConflicts,
    IReadOnlyDictionary<MessageStatusFilter, int> StatusCounts,
    int TotalKeys);

public sealed record TranslationFacetData(
    IReadOnlyList<TranslationOutputGroup> OutputGroups,
    IReadOnlyDictionary<MessageStatusFilter, int> StatusCounts,
    IReadOnlyList<TranslationLocaleUsage> Locales,
    int TotalKeys);

/// <summary>
/// How much of the key set a locale actually covers. Because message identity is unique per
/// (source, namespace, key, locale), <paramref name="MessageCount"/> is also the number of distinct
/// keys present in the locale, so <see cref="AbsentKeyCount"/> is a subtraction rather than a query.
/// </summary>
public sealed record TranslationLocaleUsage(
    string Locale,
    int MessageCount,
    int OverriddenCount,
    int NeedsReviewCount)
{
    public int AbsentKeyCount(int totalKeys) => Math.Max(0, totalKeys - MessageCount);
}

public sealed record TranslationOutputGroup(
    string Locale,
    string Namespace,
    IReadOnlyList<MessageFormat> MessageFormats);

public sealed record TranslationOutputEndpoint(string Locale, string Namespace, TranslationOutputFormat Format);
public sealed record TranslationOutputConflict(string Locale, string Namespace, IReadOnlyList<MessageFormat> MessageFormats);
