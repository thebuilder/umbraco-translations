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
    ITranslationMessageRepository messages,
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
        if (Validate(page, pageSize, keyPrefix) is { } error) return BadRequest(error);

        var resolved = await ResolveLocalesAsync(locale, referenceLocale, cancellationToken);
        if (resolved is null)
            // No messages have been synchronised yet, so there is no locale to be authoritative.
            return new MessageKeyListResponse([], page, pageSize, 0, string.Empty, string.Empty, []);

        var (reference, target) = resolved.Value;
        var keyQuery = new MessageKeyQuery(
            reference, target, compareLocales ?? [], sourceId, @namespace, keyPrefix, query,
            status, sort, direction, page, pageSize);
        var result = await editor.QueryKeysAsync(keyQuery, cancellationToken);

        return new MessageKeyListResponse(
            result.Items.Select(item => item.ToResponse()).ToArray(),
            result.PageNumber,
            result.PageSize,
            result.Total,
            reference,
            target,
            keyQuery.DetailLocales.Where(item =>
                !string.Equals(item, reference, StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(item, target, StringComparison.OrdinalIgnoreCase)).ToArray());
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
        if (Validate(1, TranslationKeyPageSize, keyPrefix) is { } error) return BadRequest(error);
        if (limit is < 1 or > MaximumReferences)
            return BadRequest($"Limit must be between 1 and {MaximumReferences}.");

        var resolved = await ResolveLocalesAsync(locale, referenceLocale, cancellationToken);
        if (resolved is null) return new MessageKeyReferenceResponse([], limit, false);

        var (reference, target) = resolved.Value;
        var keyQuery = new MessageKeyQuery(
            reference, target, [], sourceId, @namespace, keyPrefix, query, status);
        // One more than asked for, so a caller can tell "exactly at the limit" from "truncated".
        var references = await editor.QueryKeyReferencesAsync(keyQuery, limit + 1, cancellationToken);

        return references.Count > limit
            ? new MessageKeyReferenceResponse(references.Take(limit).ToArray(), limit, true)
            : new MessageKeyReferenceResponse(references, limit, false);
    }

    private const int TranslationKeyPageSize = 100;

    private static string? Validate(int page, int pageSize, string? keyPrefix)
    {
        if (MessageQueryValidation.Describe(page, pageSize) is { } error) return error;
        if (keyPrefix is not null && keyPrefix.Length > MaximumKeyPrefixLength)
            return $"Key prefix must be {MaximumKeyPrefixLength} characters or fewer.";
        return null;
    }

    /// <summary>
    /// Resolves the pair of locales the view is built from. The reference locale defaults to
    /// Umbraco's default language; the target defaults to the reference, which renders a single
    /// column rather than guessing which locale the editor meant to work in.
    /// </summary>
    private async Task<(string Reference, string Target)?> ResolveLocalesAsync(
        string? locale,
        string? referenceLocale,
        CancellationToken cancellationToken)
    {
        var facets = await messages.GetFacetDataAsync(cancellationToken);
        var available = facets.Locales.Select(usage => usage.Locale).ToArray();
        if (available.Length == 0) return null;

        var reference = await locales.ResolveReferenceLocaleAsync(referenceLocale, available, cancellationToken);
        if (reference is null) return null;

        var target = available.FirstOrDefault(item => string.Equals(item, locale?.Trim(), StringComparison.OrdinalIgnoreCase))
            ?? reference;
        return (reference, target);
    }
}
