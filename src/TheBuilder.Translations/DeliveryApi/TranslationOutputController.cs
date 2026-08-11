using System.Security.Cryptography;
using System.Text;
using System.ComponentModel.DataAnnotations;
using Asp.Versioning;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using TheBuilder.Translations.Core.Output;
using TheBuilder.Translations.Core.Persistence;

namespace TheBuilder.Translations.DeliveryApi;

[ApiController]
[ApiVersion("1.0")]
[Route("umbraco/delivery/api/v{version:apiVersion}/translations")]
public sealed class TranslationOutputController(ITranslationMessageRepository store, ITranslationOutputSerializer serializer) : ControllerBase
{
    [HttpGet("overrides")]
    public Task<IActionResult> GetOverrides(
        [FromQuery, Required] string? locale,
        [FromQuery(Name = "namespace"), Required] string? messageNamespace,
        string format = "next-intl",
        CancellationToken cancellationToken = default) =>
        GetOutput(locale, messageNamespace, format, TranslationOutputMode.Overrides, cancellationToken);

    [HttpGet("all")]
    public Task<IActionResult> GetAll(
        [FromQuery, Required] string? locale,
        [FromQuery(Name = "namespace"), Required] string? messageNamespace,
        string format = "next-intl",
        CancellationToken cancellationToken = default) =>
        GetOutput(locale, messageNamespace, format, TranslationOutputMode.All, cancellationToken);

    private async Task<IActionResult> GetOutput(
        string? locale,
        string? messageNamespace,
        string format,
        TranslationOutputMode mode,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(locale))
            return BadRequest("The locale query parameter is required.");
        if (string.IsNullOrWhiteSpace(messageNamespace))
            return BadRequest("The namespace query parameter is required.");
        if (!TranslationOutputFormats.TryParse(format, out var outputFormat))
            return BadRequest($"Unsupported translation output format '{format}'.");

        var namespaceMessages = await store.GetOutputMessagesAsync(locale, messageNamespace, cancellationToken);
        var incompatible = namespaceMessages.FirstOrDefault(message => !TranslationOutputFormats.Supports(outputFormat, message.Message.Format));
        if (incompatible is not null)
            return Conflict($"Namespace '{messageNamespace}' contains {incompatible.Message.Format} messages that are incompatible with output format '{format}'. Use a separate namespace for each message syntax.");
        string json;
        try
        {
            json = serializer.Serialize(namespaceMessages, mode);
        }
        catch (TranslationOutputCollisionException exception)
        {
            return Conflict(exception.Message);
        }
        var etag = $"\"{Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(json))).ToLowerInvariant()}\"";
        if (Request.Headers.IfNoneMatch.Contains(etag)) return StatusCode(StatusCodes.Status304NotModified);
        Response.Headers.ETag = etag;
        Response.Headers.CacheControl = "public,max-age=60";
        return Content(json, "application/json", Encoding.UTF8);
    }
}
