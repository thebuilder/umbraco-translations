using Asp.Versioning;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using TheBuilder.Translations.Authorization;
using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Persistence;
using TheBuilder.Translations.Core.Validation;
using TheBuilder.Translations.Localization;

namespace TheBuilder.Translations.ManagementApi;

[ApiVersion("1.0")]
[ApiExplorerSettings(GroupName = Constants.PackageName)]
public sealed class MessageKeysController(
    ITranslationEditorRepository editor,
    ITranslationMessageRepository messages,
    IMessageFormatValidator validator,
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

    /// <summary>
    /// Saves an override by identity rather than by message id, which is what lets an editor write
    /// a locale no source ships: there is no id to address until the row exists.
    /// </summary>
    [HttpPut("messages/keys/override")]
    [Authorize(Policy = TranslationPolicies.Edit)]
    [ProducesResponseType(typeof(MessageDetailResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(MessageConflictResponse), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<MessageDetailResponse>> SaveKeyOverride(
        KeyOverrideRequest request,
        CancellationToken cancellationToken)
    {
        TranslationMessageView message;
        try
        {
            message = await editor.EnsureMessageAsync(
                new MessageIdentity(request.SourceId, request.Namespace, request.Key, request.Locale),
                cancellationToken);
        }
        catch (KeyNotFoundException exception)
        {
            return NotFound(exception.Message);
        }

        if (MessageOverrideValidation.Describe(request.Value, message.Message, validator) is { } error)
            return BadRequest(error);

        try
        {
            var saved = await messages.SaveOverrideAsync(
                message.Message.Id, request.Value, request.ExpectedVersion, User.Identity?.Name ?? "backoffice", cancellationToken);
            return new TranslationMessageView(message.Message, saved).ToDetail();
        }
        catch (TranslationConcurrencyException exception)
        {
            var current = await messages.GetMessageAsync(message.Message.Id, cancellationToken);
            return Conflict(new MessageConflictResponse(
                MessageConflictResponse.VersionConflict, exception.Message,
                current?.Override?.Version, current?.Override?.Value,
                current?.Override?.UpdatedAt, current?.Override?.UpdatedBy));
        }
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

        var reference = await locales.ResolveReferenceLocaleAsync(referenceLocale, translated, cancellationToken);
        if (reference is null) return null;

        var configured = await locales.GetLocalesAsync(cancellationToken);
        var selectable = translated
            .Concat(configured.Select(language => language.Code))
            .Distinct(StringComparer.OrdinalIgnoreCase);
        var target = selectable.FirstOrDefault(item =>
            string.Equals(item, locale?.Trim(), StringComparison.OrdinalIgnoreCase)) ?? reference;
        return new MessageKeyQuery(reference, target);
    }
}
