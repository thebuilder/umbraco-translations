using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TheBuilder.Translations.Authorization;
using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Persistence;
using TheBuilder.Translations.Core.Output;
using TheBuilder.Translations.Core.Validation;
using TheBuilder.Translations.Localization;

namespace TheBuilder.Translations.ManagementApi;

[ApiVersion("1.0")]
[ApiExplorerSettings(GroupName = Constants.PackageName)]
public sealed class MessagesController(
    ITranslationMessageRepository store,
    IMessageFormatValidator validator,
    ITranslationLocaleCatalog locales) : TranslationsApiControllerBase
{
    [HttpGet("messages")]
    public async Task<ActionResult<MessageListResponse>> ListMessages(
        string? locale, string? @namespace, string? query, MessageStatusFilter status = MessageStatusFilter.All,
        int page = 1, int pageSize = 100, CancellationToken cancellationToken = default)
    {
        if (MessageQueryValidation.Describe(page, pageSize) is { } error)
            return BadRequest(error);

        var result = await store.QueryMessagesAsync(new(locale, @namespace, query, status, page, pageSize), cancellationToken);
        return new MessageListResponse(result.Items.Select(item => item.ToListItem()).ToArray(), result.PageNumber, result.PageSize, result.Total);
    }

    [HttpGet("messages/{id:guid}")]
    public async Task<ActionResult<MessageDetailResponse>> GetMessage(Guid id, CancellationToken cancellationToken)
    {
        var message = await store.GetMessageAsync(id, cancellationToken);
        return message is null ? NotFound() : message.ToDetail();
    }

    [HttpPut("messages/{id:guid}/override")]
    [Authorize(Policy = TranslationPolicies.Edit)]
    public async Task<ActionResult<MessageDetailResponse>> SaveMessageOverride(Guid id, OverrideRequest request, CancellationToken cancellationToken)
    {
        var message = await store.GetMessageAsync(id, cancellationToken);
        if (message is null) return NotFound();
        if (MessageOverrideValidation.Describe(request.Value, message.Message, validator) is { } error)
            return BadRequest(error);

        try
        {
            var saved = await store.SaveOverrideAsync(id, request.Value, request.ExpectedVersion, User.Identity?.Name ?? "backoffice", cancellationToken);
            return new TranslationMessageView(message.Message, saved).ToDetail();
        }
        catch (TranslationConcurrencyException exception)
        {
            return Conflict(await DescribeConflictAsync(id, exception, cancellationToken));
        }
    }

    [HttpDelete("messages/{id:guid}/override")]
    [Authorize(Policy = TranslationPolicies.Edit)]
    public async Task<IActionResult> ResetMessageOverride(Guid id, long? expectedVersion, CancellationToken cancellationToken)
    {
        try
        {
            await store.DeleteOverrideAsync(id, expectedVersion, cancellationToken);
        }
        catch (TranslationConcurrencyException exception)
        {
            return Conflict(await DescribeConflictAsync(id, exception, cancellationToken));
        }
        return NoContent();
    }

    [HttpGet("facets")]
    public async Task<FacetResponse> GetMessageFacets(CancellationToken cancellationToken)
    {
        var facets = TranslationOutputFormats.CreateFacets(await store.GetFacetDataAsync(cancellationToken));
        var configured = await locales.GetLocalesAsync(cancellationToken);
        var byCode = configured.ToDictionary(locale => locale.Code, StringComparer.OrdinalIgnoreCase);
        var defaultLocale = await locales.ResolveReferenceLocaleAsync(
            null, facets.Locales.Select(locale => locale.Locale).ToArray(), cancellationToken);

        return new(
            facets.Locales.Select(usage =>
            {
                var language = byCode.GetValueOrDefault(usage.Locale);
                return new LocaleFacetResponse(
                    usage.Locale,
                    language?.Name,
                    string.Equals(usage.Locale, defaultLocale, StringComparison.OrdinalIgnoreCase),
                    language is not null,
                    usage.MessageCount,
                    usage.OverriddenCount,
                    usage.NeedsReviewCount,
                    usage.AbsentKeyCount(facets.TotalKeys));
            }).ToArray(),
            defaultLocale,
            facets.Namespaces,
            facets.TotalKeys,
            facets.OutputEndpoints.Select(endpoint => new OutputEndpointResponse(endpoint.Locale, endpoint.Namespace, endpoint.Format)).ToArray(),
            facets.OutputConflicts.Select(conflict => new OutputConflictResponse(conflict.Locale, conflict.Namespace, conflict.MessageFormats)).ToArray(),
            facets.StatusCounts.ToDictionary(item => item.Key.ToString(), item => item.Value));
    }

    // Re-reads the message so the client can reconcile without a second round trip. A conflict is
    // rare, so the extra read costs nothing on the happy path.
    private async Task<MessageConflictResponse> DescribeConflictAsync(
        Guid id, TranslationConcurrencyException exception, CancellationToken cancellationToken)
    {
        var current = await store.GetMessageAsync(id, cancellationToken);
        return new MessageConflictResponse(
            MessageConflictResponse.VersionConflict,
            exception.Message,
            current?.Override?.Version,
            current?.Override?.Value,
            current?.Override?.UpdatedAt,
            current?.Override?.UpdatedBy);
    }
}
