using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Output;
using TheBuilder.Translations.Core.Persistence;
using TheBuilder.Translations.Core.Sources;
using TheBuilder.Translations.Core.Synchronization;

namespace TheBuilder.Translations.ManagementApi;

public sealed record SourceRequest(
    string Alias,
    string DisplayName,
    bool Enabled,
    string EndpointTemplate,
    string? SecretName,
    int TimeoutSeconds,
    int MaximumResponseBytes,
    IReadOnlyList<string> Locales,
    string Namespace,
    NamespaceMode NamespaceMode,
    MessageFormat MessageFormat,
    IReadOnlyList<HttpTranslationHeaderOptions>? Headers = null)
{
    public TranslationSourceDefinition ToDefinition(Guid id) => new(
        id, Alias.Trim(), DisplayName.Trim(), Enabled,
        new HttpTranslationTransportOptions(EndpointTemplate.Trim(), NullIfEmpty(SecretName), TimeoutSeconds, MaximumResponseBytes)
        {
            Headers = Headers?.Select(header => new HttpTranslationHeaderOptions(header.Name.Trim(), header.ValueConfigurationKey.Trim())).ToArray() ?? [],
        },
        new(Locales.Select(locale => locale.Trim()).Where(locale => locale.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToArray(), Namespace.Trim(), NamespaceMode, MessageFormat));

    private static string? NullIfEmpty(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public sealed record SourceResponse(
    Guid Id, string Alias, string DisplayName, bool Enabled,
    HttpTranslationTransportOptions Transport, NestedJsonParserOptions Parser,
    string? LastSuccessfulRevision, DateTimeOffset? LastSuccessfulSync,
    bool SyncInProgress, DateTimeOffset? SyncLeaseExpiresAt, TranslationSyncResult? LastSync)
{
    public static SourceResponse From(TranslationSourceDefinition source, TranslationSourceStatus? status = null) => new(
        source.Id, source.Alias, source.DisplayName, source.Enabled, source.Transport, source.Parser,
        source.LastSuccessfulRevision, source.LastSuccessfulSync,
        status?.SyncInProgress ?? false, status?.SyncLeaseExpiresAt, status?.LastSync);
}

public sealed record MessageListItem(
    Guid Id, Guid SourceId, string Namespace, string Key, string Locale, string DefaultPreview,
    string? OverridePreview, bool HasOverride, bool NeedsReview, string State, long? Version);

public sealed record MessageListResponse(IReadOnlyList<MessageListItem> Items, int Page, int PageSize, int Total);

public sealed record MessageDetailResponse(
    Guid Id, Guid SourceId, string Namespace, string Key, string Locale, string DefaultValue, string? OverrideValue,
    MessageFormat Format, IReadOnlyDictionary<string, string> Arguments, bool NeedsReview,
    string State, string SourceRevision, string DefaultChecksum, long? Version, DateTimeOffset? UpdatedAt, string? UpdatedBy);

/// <summary>
/// Addresses a translation by identity rather than by message id, which is what lets a locale the
/// application never shipped be written to: it has no row, and therefore no id, until it is.
/// </summary>
public sealed record OverrideRequest(
    Guid SourceId,
    string Namespace,
    string Key,
    string Locale,
    string Value,
    long? ExpectedVersion)
{
    public MessageIdentity ToIdentity() => new(SourceId, Namespace, Key, Locale);
}

public sealed record ResetOverrideRequest(
    Guid SourceId,
    string Namespace,
    string Key,
    string Locale,
    long? ExpectedVersion)
{
    public MessageIdentity ToIdentity() => new(SourceId, Namespace, Key, Locale);
}

/// <summary>
/// The body of a 409. Carries the value that actually landed so the editor can show "yours" beside
/// "theirs" without a follow-up request.
/// </summary>
public sealed record MessageConflictResponse(
    string Code,
    string Message,
    long? CurrentVersion,
    string? CurrentValue,
    DateTimeOffset? UpdatedAt,
    string? UpdatedBy)
{
    public const string VersionConflict = "version_conflict";

    /// <summary>
    /// Built from the message as it now stands, so the client can show "yours" beside "theirs"
    /// without a follow-up request. <paramref name="current"/> is null when the row was deleted
    /// between the failed write and this read.
    /// </summary>
    public static MessageConflictResponse From(
        TranslationConcurrencyException exception,
        TranslationMessageView? current) => new(
        VersionConflict,
        exception.Message,
        current?.Override?.Version,
        current?.Override?.Value,
        current?.Override?.UpdatedAt,
        current?.Override?.UpdatedBy);
}

public sealed record OutputEndpointResponse(string Locale, string Namespace, TranslationOutputFormat Format);
public sealed record OutputConflictResponse(string Locale, string Namespace, IReadOnlyList<MessageFormat> MessageFormats);

/// <summary>
/// A locale the editor can work in, joined from the message data and Umbraco's languages.
/// <paramref name="IsConfigured"/> is false when messages still exist for a locale that is no
/// longer an Umbraco language, which is otherwise invisible and produces unreachable translations.
/// </summary>
public sealed record LocaleFacetResponse(
    string Code,
    string? Name,
    bool IsDefault,
    bool IsConfigured,
    int MessageCount,
    int OverriddenCount,
    int NeedsReviewCount,
    int AbsentKeyCount);

public sealed record FacetResponse(
    IReadOnlyList<LocaleFacetResponse> Locales,
    string? DefaultLocale,
    IReadOnlyList<string> Namespaces,
    int TotalKeys,
    IReadOnlyList<OutputEndpointResponse> OutputEndpoints,
    IReadOnlyList<OutputConflictResponse> OutputConflicts,
    IReadOnlyDictionary<string, int> StatusCounts);
internal static class ApiModelMapping
{
    public static MessageListItem ToListItem(this TranslationMessageView view) => new(
        view.Message.Id,
        view.Message.Identity.SourceId,
        view.Message.Identity.Namespace,
        view.Message.Identity.Key,
        view.Message.Identity.Locale,
        Preview(view.Message.DefaultValue),
        view.Override is null ? null : Preview(view.Override.Value),
        view.Override is not null,
        view.NeedsReview,
        view.Message.State.ToString(),
        view.Override?.Version);

    public static MessageDetailResponse ToDetail(this TranslationMessageView view) => new(
        view.Message.Id, view.Message.Identity.SourceId, view.Message.Identity.Namespace,
        view.Message.Identity.Key, view.Message.Identity.Locale,
        view.Message.DefaultValue, view.Override?.Value, view.Message.Format, view.Message.Arguments, view.NeedsReview,
        view.Message.State.ToString(), view.Message.SourceRevision, view.Message.DefaultChecksum,
        view.Override?.Version, view.Override?.UpdatedAt, view.Override?.UpdatedBy);

    private static string Preview(string value) => MessagePreview.Of(value).Text;
}

/// <summary>
/// List endpoints return a preview rather than the whole message. A grid cell shows a line or two,
/// and an unbounded value multiplied by a page of keys and several locales is the difference
/// between a few kilobytes and a few megabytes. The full text comes from the detail endpoint.
/// </summary>
internal static class MessagePreview
{
    public const int MaximumLength = 180;

    public static (string Text, bool Truncated) Of(string value) =>
        value.Length <= MaximumLength ? (value, false) : ($"{value[..(MaximumLength - 3)]}...", true);
}
