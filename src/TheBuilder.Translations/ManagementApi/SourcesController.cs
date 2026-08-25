using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using TheBuilder.Translations.Authorization;
using TheBuilder.Translations.Core.Persistence;
using TheBuilder.Translations.Core.Sources;
using TheBuilder.Translations.Core.Synchronization;

namespace TheBuilder.Translations.ManagementApi;

[ApiVersion("1.0")]
[ApiExplorerSettings(GroupName = Constants.PackageName)]
public sealed class SourcesController(ITranslationSourceRepository store, TranslationSyncEngine syncEngine) : TranslationsApiControllerBase
{
    [HttpGet("sources")]
    public async Task<IReadOnlyList<SourceResponse>> ListSources(CancellationToken cancellationToken)
    {
        var sources = await store.GetSourcesAsync(cancellationToken);
        var statuses = (await store.GetSourceStatusesAsync(cancellationToken)).ToDictionary(status => status.SourceId);
        return sources.Select(source => SourceResponse.From(source, statuses.GetValueOrDefault(source.Id))).ToArray();
    }

    [HttpGet("sources/{id:guid}")]
    [ProducesResponseType(typeof(SourceResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<SourceResponse>> GetSource(Guid id, CancellationToken cancellationToken)
    {
        var source = await store.GetSourceAsync(id, cancellationToken);
        if (source is null) return NotFound();
        var status = (await store.GetSourceStatusesAsync(cancellationToken)).FirstOrDefault(item => item.SourceId == id);
        return SourceResponse.From(source, status);
    }

    [HttpPost("sources")]
    [Authorize(Policy = TranslationPolicies.ManageSources)]
    [ProducesResponseType(typeof(SourceResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<SourceResponse>> CreateSource(SourceRequest request, CancellationToken cancellationToken)
    {
        var source = request.ToDefinition(Guid.NewGuid());
        var error = TranslationSourceValidator.Validate(source);
        if (error is not null) return BadRequest(error);
        await store.SaveSourceAsync(source, cancellationToken);
        return CreatedAtAction(nameof(GetSource), new { id = source.Id }, SourceResponse.From(source));
    }

    [HttpPut("sources/{id:guid}")]
    [Authorize(Policy = TranslationPolicies.ManageSources)]
    [ProducesResponseType(typeof(SourceResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<SourceResponse>> UpdateSource(Guid id, SourceRequest request, CancellationToken cancellationToken)
    {
        var existing = await store.GetSourceAsync(id, cancellationToken);
        if (existing is null) return NotFound();
        var updated = request.ToDefinition(id) with
        {
            LastSuccessfulRevision = existing.LastSuccessfulRevision,
            LastSuccessfulSync = existing.LastSuccessfulSync,
        };
        var error = TranslationSourceValidator.Validate(updated);
        if (error is not null) return BadRequest(error);
        try
        {
            await store.SaveSourceAsync(updated, cancellationToken);
            return SourceResponse.From(updated);
        }
        catch (TranslationSynchronizationInProgressException exception)
        {
            return Conflict(exception.Message);
        }
    }

    [HttpDelete("sources/{id:guid}")]
    [Authorize(Policy = TranslationPolicies.ManageSources)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> DeleteSource(Guid id, CancellationToken cancellationToken)
    {
        await store.DeleteSourceAsync(id, cancellationToken);
        return NoContent();
    }

    [HttpPost("sources/{id:guid}/test")]
    [Authorize(Policy = TranslationPolicies.ManageSources)]
    [ProducesResponseType(typeof(TranslationSourceTestResult), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<TranslationSourceTestResult>> TestSource(Guid id, CancellationToken cancellationToken)
    {
        var source = await store.GetSourceAsync(id, cancellationToken);
        return source is null ? NotFound() : await syncEngine.TestAsync(source, cancellationToken);
    }

    [HttpPost("sources/test")]
    [Authorize(Policy = TranslationPolicies.ManageSources)]
    [ProducesResponseType(typeof(TranslationSourceTestResult), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<TranslationSourceTestResult>> TestSourceConfiguration(
        SourceRequest request,
        CancellationToken cancellationToken)
    {
        var source = request.ToDefinition(Guid.NewGuid());
        var error = TranslationSourceValidator.Validate(source);
        return error is not null
            ? BadRequest(error)
            : await syncEngine.TestAsync(source, cancellationToken);
    }

    [HttpPost("sources/{id:guid}/sync")]
    [Authorize(Policy = TranslationPolicies.Sync)]
    [ProducesResponseType(typeof(TranslationSyncResult), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status502BadGateway)]
    public async Task<ActionResult<TranslationSyncResult>> SyncSource(Guid id, CancellationToken cancellationToken)
    {
        var source = await store.GetSourceAsync(id, cancellationToken);
        if (source is null) return NotFound();
        try
        {
            return await syncEngine.SynchronizeAsync(source, cancellationToken);
        }
        catch (TranslationSynchronizationInProgressException exception)
        {
            return Conflict(exception.Message);
        }
        /*
         * The endpoint would not answer, or answered with something that is not a translation file.
         * That is a fact about somebody's configuration rather than a fault in this server, and it
         * carries a sentence naming the source and the locale, so it is reported as one. Unhandled,
         * it reached the editor as a five hundred and a page of middleware frames in a
         * notification, with the one useful line scrolled off the top.
         *
         * The engine has already recorded the failed run, so the sync history says the same thing
         * without the editor having to keep the notification open.
         */
        catch (Exception exception)
            when (exception is TranslationSourceFetchException or TranslationSourceFormatException)
        {
            return StatusCode(StatusCodes.Status502BadGateway, exception.Message);
        }
        // A source that is switched off, which is the one failure the fetch never gets far enough
        // to report.
        catch (InvalidOperationException exception)
        {
            return BadRequest(exception.Message);
        }
    }

    [HttpGet("sources/{id:guid}/syncs")]
    public async Task<IReadOnlyList<TranslationSyncResult>> ListSourceSyncs(Guid id, CancellationToken cancellationToken) =>
        await store.GetSyncHistoryAsync(id, cancellationToken);
}
