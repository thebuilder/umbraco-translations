using Asp.Versioning;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using TheBuilder.Translations.Core.Persistence;
using TheBuilder.Translations.Localization;

namespace TheBuilder.Translations.ManagementApi;

[ApiVersion("1.0")]
[ApiExplorerSettings(GroupName = Constants.PackageName)]
public sealed class MessageKeysController(
    ITranslationEditorRepository editor,
    ITranslationLocaleCatalog locales) : TranslationsApiControllerBase
{
    /// <summary>Ids only, so "select all matching" cannot be used to pull the whole table.</summary>
    public const int MaximumReferences = 5_000;

    private const int MaximumKeyPrefixLength = 500;

    [HttpGet("messages/keys")]
    [ProducesResponseType(typeof(MessageKeyListResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<MessageKeyListResponse>> ListMessageKeys(
        string? locale,
        string? referenceLocale,
        [FromQuery(Name = "compare")] string[]? compareLocales,
        Guid? sourceId,
        string? @namespace,
        string? keyPrefix,
        string? query,
        MessageKeyStatusFilter status = MessageKeyStatusFilter.All,
        MessageKeySort sort = MessageKeySort.Key,
        SortDirection direction = SortDirection.Ascending,
        int page = 1,
        int pageSize = 100,
        CancellationToken cancellationToken = default)
    {
        if (MessageQueryValidation.Describe(page, pageSize) is { } paging) return BadRequest(paging);
        if (DescribeKeyPrefix(keyPrefix) is { } prefix) return BadRequest(prefix);

        var resolved = await ResolveLocalesAsync(locale, referenceLocale, cancellationToken);
        if (resolved is null)
            // Nothing has been synchronised, so there is no locale to be authoritative.
            return MessageKeyListResponse.Empty(page, pageSize);

        var keyQuery = resolved with
        {
            CompareLocales = compareLocales ?? [],
            SourceId = sourceId,
            Namespace = @namespace,
            KeyPrefix = keyPrefix,
            Query = query,
            Status = status,
            Sort = sort,
            Direction = direction,
            Page = page,
            PageSize = pageSize,
        };
        var result = await editor.QueryKeysAsync(keyQuery, cancellationToken);

        return new MessageKeyListResponse(
            result.Items.Select(item => item.ToResponse()).ToArray(),
            result.PageNumber,
            result.PageSize,
            result.Total,
            keyQuery.ReferenceLocale,
            keyQuery.TargetLocale,
            keyQuery.AdditionalCompareLocales);
    }

    [HttpGet("messages/keys/ids")]
    [ProducesResponseType(typeof(MessageKeyReferenceResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<MessageKeyReferenceResponse>> ListMessageKeyIds(
        string? locale,
        string? referenceLocale,
        Guid? sourceId,
        string? @namespace,
        string? keyPrefix,
        string? query,
        MessageKeyStatusFilter status = MessageKeyStatusFilter.All,
        int limit = MaximumReferences,
        CancellationToken cancellationToken = default)
    {
        if (DescribeKeyPrefix(keyPrefix) is { } prefix) return BadRequest(prefix);
        if (limit is < 1 or > MaximumReferences)
            return BadRequest($"Limit must be between 1 and {MaximumReferences}.");

        var resolved = await ResolveLocalesAsync(locale, referenceLocale, cancellationToken);
        if (resolved is null) return new MessageKeyReferenceResponse([], limit, false);

        var keyQuery = resolved with
        {
            SourceId = sourceId,
            Namespace = @namespace,
            KeyPrefix = keyPrefix,
            Query = query,
            Status = status,
        };
        // One more than asked for, so a caller can tell "exactly at the limit" from "truncated".
        var references = await editor.QueryKeyReferencesAsync(keyQuery, limit + 1, cancellationToken);

        return references.Count > limit
            ? new MessageKeyReferenceResponse(references.Take(limit).ToArray(), limit, true)
            : new MessageKeyReferenceResponse(references, limit, false);
    }


    private static string? DescribeKeyPrefix(string? keyPrefix) =>
        keyPrefix is not null && keyPrefix.Length > MaximumKeyPrefixLength
            ? $"Key prefix must be {MaximumKeyPrefixLength} characters or fewer."
            : null;

    /// <summary>
    /// Builds the query already carrying the pair of locales the view is based on, or null when
    /// nothing has been synchronised.
    ///
    /// The two locales are eligible on different grounds. A reference locale must actually have
    /// messages, because it is what an editor translates *from*; an empty reference would show a
    /// page of blanks. A target may be any site language, including one no source ships: that is
    /// precisely the case where the site has more languages than the application does, and those
    /// locales are legitimately empty until an editor fills them in. Restricting the target to
    /// locales that already have messages would make them permanently unreachable.
    /// </summary>
    private async Task<MessageKeyQuery?> ResolveLocalesAsync(
        string? locale,
        string? referenceLocale,
        CancellationToken cancellationToken)
    {
        var translated = await editor.GetLocalesAsync(cancellationToken);
        if (translated.Count == 0) return null;

        // One catalog call serves both the default and the selectable set.
        var configured = await locales.GetLocalesAsync(cancellationToken);
        var reference = ReferenceLocale.Resolve(referenceLocale, translated, TranslationLocales.DefaultOf(configured));
        if (reference is null) return null;

        var selectable = translated
            .Concat(configured.Select(language => language.Code))
            .Distinct(StringComparer.OrdinalIgnoreCase);
        var target = selectable.FirstOrDefault(item =>
            string.Equals(item, locale?.Trim(), StringComparison.OrdinalIgnoreCase)) ?? reference;
        return new MessageKeyQuery(reference, target);
    }
}
