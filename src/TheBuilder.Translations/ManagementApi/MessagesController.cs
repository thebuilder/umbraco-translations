using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TheBuilder.Translations.Authorization;
using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Persistence;
using TheBuilder.Translations.Core.Output;
using TheBuilder.Translations.Core.Validation;

namespace TheBuilder.Translations.ManagementApi;

[ApiVersion("1.0")]
[ApiExplorerSettings(GroupName = Constants.PackageName)]
public sealed class MessagesController(ITranslationMessageRepository store, IMessageFormatValidator validator) : TranslationsApiControllerBase
{
    [HttpGet("messages")]
    public async Task<MessageListResponse> ListMessages(
        string? locale, string? @namespace, string? query, MessageStatusFilter status = MessageStatusFilter.All,
        int page = 1, int pageSize = 100, CancellationToken cancellationToken = default)
    {
        var result = await store.QueryMessagesAsync(new(locale, @namespace, query, status, page, pageSize), cancellationToken);
        return new(result.Items.Select(item => item.ToListItem()).ToArray(), result.PageNumber, result.PageSize, result.Total);
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
        var validation = validator.Validate(request.Value, message.Message.Format);
        if (!validation.IsValid) return BadRequest(validation.Error);
        if (!SameArguments(message.Message.Arguments, validation.Arguments))
            return BadRequest("The override must use the same argument names and kinds as the source message.");

        try
        {
            var saved = await store.SaveOverrideAsync(id, request.Value, request.ExpectedVersion, User.Identity?.Name ?? "backoffice", cancellationToken);
            return new TranslationMessageView(message.Message, saved).ToDetail();
        }
        catch (TranslationConcurrencyException exception)
        {
            return Conflict(exception.Message);
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
            return Conflict(exception.Message);
        }
        return NoContent();
    }

    [HttpGet("facets")]
    public async Task<FacetResponse> GetMessageFacets(CancellationToken cancellationToken)
    {
        var facets = TranslationOutputFormats.CreateFacets(await store.GetFacetDataAsync(cancellationToken));
        return new(
            facets.Locales,
            facets.Namespaces,
            facets.OutputEndpoints.Select(endpoint => new OutputEndpointResponse(endpoint.Locale, endpoint.Namespace, endpoint.Format)).ToArray(),
            facets.OutputConflicts.Select(conflict => new OutputConflictResponse(conflict.Locale, conflict.Namespace, conflict.MessageFormats)).ToArray(),
            facets.StatusCounts.ToDictionary(item => item.Key.ToString(), item => item.Value));
    }

    private static bool SameArguments(IReadOnlyDictionary<string, string> expected, IReadOnlyDictionary<string, string> actual) =>
        expected.Count == actual.Count && expected.All(item => actual.TryGetValue(item.Key, out var kind) && kind == item.Value);

}
