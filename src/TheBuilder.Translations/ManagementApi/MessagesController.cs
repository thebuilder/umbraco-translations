using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
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
    ITranslationEditorRepository editor,
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

    /// <summary>
    /// Writes are addressed by identity rather than by message id. A locale the application does
    /// not ship has no row until someone writes to it, so there is no id to address, and having a
    /// second id-based write path alongside this one only gave the two a way to disagree.
    /// </summary>
    [HttpPut("messages/override")]
    [Authorize(Policy = TranslationPolicies.Edit)]
    [ProducesResponseType(typeof(MessageDetailResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(MessageConflictResponse), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<MessageDetailResponse>> SaveOverride(
        OverrideRequest request,
        CancellationToken cancellationToken)
    {
        TranslationMessageView message;
        try
        {
            message = await editor.EnsureMessageAsync(request.ToIdentity(), cancellationToken);
        }
        catch (KeyNotFoundException exception)
        {
            return NotFound(exception.Message);
        }

        if (MessageOverrideValidation.Describe(request.Value, message.Message, validator) is { } error)
            return BadRequest(error);

        try
        {
            var saved = await store.SaveOverrideAsync(
                message.Message.Id, request.Value, request.ExpectedVersion, User.Identity?.Name ?? "backoffice", cancellationToken);
            return new TranslationMessageView(message.Message, saved).ToDetail();
        }
        catch (TranslationConcurrencyException exception)
        {
            return Conflict(MessageConflictResponse.From(
                exception, await store.GetMessageAsync(message.Message.Id, cancellationToken)));
        }
    }

    /// <summary>
    /// Removes an override, returning the message to its application default. Resetting a locale
    /// that has no row succeeds: there is nothing to remove, and creating a row in order to empty
    /// it would be perverse.
    /// </summary>
    [HttpPost("messages/override/reset")]
    [Authorize(Policy = TranslationPolicies.Edit)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(MessageConflictResponse), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> ResetOverride(ResetOverrideRequest request, CancellationToken cancellationToken)
    {
        var message = await editor.FindMessageAsync(request.ToIdentity(), cancellationToken);
        if (message is null) return NoContent();

        try
        {
            await store.DeleteOverrideAsync(message.Message.Id, request.ExpectedVersion, cancellationToken);
        }
        catch (TranslationConcurrencyException exception)
        {
            return Conflict(MessageConflictResponse.From(
                exception, await store.GetMessageAsync(message.Message.Id, cancellationToken)));
        }
        return NoContent();
    }

    [HttpGet("facets")]
    public async Task<FacetResponse> GetMessageFacets(CancellationToken cancellationToken)
    {
        var facets = TranslationOutputFormats.CreateFacets(await store.GetFacetDataAsync(cancellationToken));
        var configured = await locales.GetLocalesAsync(cancellationToken);
        var defaultLocale = ReferenceLocale.Resolve(
            requested: null,
            facets.Locales.Select(locale => locale.Locale).ToArray(),
            TranslationLocales.DefaultOf(configured));

        return new(
            DescribeLocales(facets, configured, defaultLocale),
            defaultLocale,
            facets.Namespaces,
            facets.TotalKeys,
            facets.OutputEndpoints.Select(endpoint => new OutputEndpointResponse(endpoint.Locale, endpoint.Namespace, endpoint.Format)).ToArray(),
            facets.OutputConflicts.Select(conflict => new OutputConflictResponse(conflict.Locale, conflict.Namespace, conflict.MessageFormats)).ToArray(),
            facets.StatusCounts.ToDictionary(item => item.Key.ToString(), item => item.Value));
    }

    /// <summary>
    /// Every locale an editor can work in: each site language, whether or not a source ships it,
    /// followed by any locale that still has messages but is no longer a site language.
    ///
    /// A source commonly covers one language while the site has several. The rest are legitimately
    /// empty until an editor fills them in, so omitting them would make them unreachable rather
    /// than merely untranslated.
    /// </summary>
    private static IReadOnlyList<LocaleFacetResponse> DescribeLocales(
        TranslationFacets facets,
        IReadOnlyList<TranslationLocale> configured,
        string? defaultLocale)
    {
        var usageByCode = facets.Locales.ToDictionary(usage => usage.Locale, StringComparer.OrdinalIgnoreCase);
        var configuredCodes = configured.Select(language => language.Code).ToHashSet(StringComparer.OrdinalIgnoreCase);

        LocaleFacetResponse Describe(string code, string? name, bool isConfigured)
        {
            var usage = usageByCode.GetValueOrDefault(code) ?? new TranslationLocaleUsage(code, 0, 0, 0);
            return new LocaleFacetResponse(
                code,
                name,
                string.Equals(code, defaultLocale, StringComparison.OrdinalIgnoreCase),
                isConfigured,
                usage.MessageCount,
                usage.OverriddenCount,
                usage.NeedsReviewCount,
                usage.AbsentKeyCount(facets.TotalKeys));
        }

        return
        [
            .. configured.Select(language => Describe(language.Code, language.Name, isConfigured: true)),
            // No name: it is not a site language any more, so there is no name to report.
            .. facets.Locales
                .Where(usage => !configuredCodes.Contains(usage.Locale))
                .Select(usage => Describe(usage.Locale, null, isConfigured: false)),
        ];
    }
}
