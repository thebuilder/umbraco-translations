using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using TheBuilder.Translations.Authorization;
using TheBuilder.Translations.Configuration;
using TheBuilder.Translations.Core.Persistence;
using TheBuilder.Translations.Core.Sources;
using TheBuilder.Translations.Core.Synchronization;

namespace TheBuilder.Translations.AutomationApi;

[ApiController]
[ApiVersion("1.0")]
[ApiExplorerSettings(GroupName = Constants.AutomationApiName)]
[Route(Constants.AutomationApiRoot)]
[AllowAnonymous]
[ResponseCache(Location = ResponseCacheLocation.None, NoStore = true)]
public sealed class DeploymentSyncController(
    ITranslationSourceRepository sources,
    TranslationSyncEngine syncEngine,
    DeploymentSyncApiKeyAuthenticator authenticator,
    ILogger<DeploymentSyncController> logger) : ControllerBase
{
    [HttpPost("sources/{alias}/sync")]
    [ProducesResponseType(typeof(TranslationSyncResult), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status502BadGateway)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<TranslationSyncResult>> SyncSource(string alias, CancellationToken cancellationToken)
    {
        switch (authenticator.Authenticate(Request.Headers.Authorization))
        {
            case DeploymentSyncAuthenticationResult.Disabled:
                return Problem(
                    statusCode: StatusCodes.Status503ServiceUnavailable,
                    title: "Deployment synchronization is not configured",
                    detail: $"Configure {DeploymentSyncOptions.ApiKeyConfigurationName} with a secret of at least 32 characters.");
            case DeploymentSyncAuthenticationResult.Unauthorized:
                Response.Headers.WWWAuthenticate = "Bearer";
                return Unauthorized();
            case DeploymentSyncAuthenticationResult.Authorized:
                break;
            default:
                throw new InvalidOperationException("Unsupported deployment synchronization authentication result.");
        }

        var aliasError = TranslationSourceValidator.ValidateAlias(alias);
        if (aliasError is not null)
            return BadRequest(aliasError);

        var source = await sources.GetSourceByAliasAsync(alias, cancellationToken);
        if (source is null)
            return NotFound();
        if (!source.Enabled)
            return Conflict($"Translation source '{source.Alias}' is disabled.");

        try
        {
            return Ok(await syncEngine.SynchronizeAsync(source, cancellationToken));
        }
        catch (TranslationSynchronizationInProgressException exception)
        {
            return Conflict(exception.Message);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogError(exception, "Deployment synchronization failed for source {SourceAlias}.", source.Alias);
            return Problem(
                statusCode: StatusCodes.Status502BadGateway,
                title: "Translation synchronization failed",
                detail: "The source could not be synchronized. Check the Umbraco server logs for details.");
        }
    }
}
