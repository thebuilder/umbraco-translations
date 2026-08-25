using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using Microsoft.Extensions.Configuration;

namespace TheBuilder.Translations.Core.Sources;

public sealed class HttpTranslationSourceTransport(HttpClient httpClient, IConfiguration configuration)
    : ITranslationSourceTransport
{
    public string Kind => "http";

    public async Task<TranslationSourcePayload> FetchAsync(
        TranslationSourceDefinition source,
        TranslationFetchContext context,
        CancellationToken cancellationToken)
    {
        TranslationSourceValidator.EnsureValid(source);
        var endpoint = LocaleEndpointTemplate.Expand(source.Transport.EndpointTemplate, context.Locale);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(source.Transport.TimeoutSeconds));
        using var request = new HttpRequestMessage(HttpMethod.Get, endpoint);
        if (context.ETag is not null)
            request.Headers.IfNoneMatch.Add(new EntityTagHeaderValue(context.ETag));
        if (context.LastModified is not null)
            request.Headers.IfModifiedSince = context.LastModified;
        /*
         * Neither failure below repeats the setting name the source stored. A field that names a
         * setting is the field people paste the secret into by mistake, and these messages go into
         * a notification and into the sync history, which keeps them. Echoing the field would turn
         * one mistake into a stored secret.
         *
         * They name the header instead, which is safe and says which row to fix. A missing setting
         * and a pasted secret fail identically, so the rest of the message explains the difference.
         */
        if (source.Transport.SecretName is not null)
        {
            var secret = configuration[source.Transport.SecretName];
            if (string.IsNullOrWhiteSpace(secret))
                throw new InvalidOperationException(
                    "The bearer token setting this source names does not exist. That field takes a setting " +
                    "name, not the token itself.");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", secret);
        }
        foreach (var header in source.Transport.Headers)
        {
            string value;
            if (header.IsLiteral)
                value = header.Value!;
            else
            {
                value = configuration[header.ValueConfigurationKey ?? string.Empty] ?? string.Empty;
                if (string.IsNullOrWhiteSpace(value))
                    throw new InvalidOperationException(
                        $"Request header '{header.Name}' names an application setting that does not exist. Add " +
                        "the setting, or give the header its value directly if it holds nothing secret.");
            }

            // The literal is checked when the source is saved, so reaching here means configuration
            // supplied it: a setting nobody validated is exactly where a stray newline comes from.
            if (value.IndexOfAny(['\r', '\n']) >= 0)
                throw new InvalidOperationException(
                    $"The setting behind request header '{header.Name}' contains line breaks, which cannot be sent.");
            if (!request.Headers.TryAddWithoutValidation(header.Name, value))
                throw new InvalidOperationException($"Request header '{header.Name}' is not supported.");
        }

        using var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
        if (response.StatusCode is HttpStatusCode.NotModified)
            throw new TranslationSourceNotModifiedException();
        if (!response.IsSuccessStatusCode)
            // Only the delta form of Retry-After is read. The HTTP-date form needs a clock to
            // subtract from, and rate limiters send seconds.
            throw new TranslationSourceResponseException(
                endpoint, response.StatusCode, response.ReasonPhrase,
                response.Headers.RetryAfter?.Delta, response.Content.Headers.ContentType?.MediaType);

        var contentLength = response.Content.Headers.ContentLength;
        if (contentLength > source.Transport.MaximumResponseBytes)
            throw new TranslationSourceTooLargeException(source.Transport.MaximumResponseBytes);

        await using var responseStream = await response.Content.ReadAsStreamAsync(timeout.Token);
        var content = new MemoryStream(contentLength is > 0 and <= int.MaxValue ? (int)contentLength.Value : 0);
        await CopyWithLimitAsync(responseStream, content, source.Transport.MaximumResponseBytes, timeout.Token);
        content.Position = 0;
        var revision = response.Headers.ETag?.Tag?.Trim('"') ?? Convert.ToHexString(SHA256.HashData(content)).ToLowerInvariant();
        content.Position = 0;

        return new TranslationSourcePayload(
            content,
            context.Locale,
            response.Content.Headers.ContentType?.MediaType,
            response.Headers.ETag?.ToString(),
            response.Content.Headers.LastModified,
            revision);
    }

    private static async Task CopyWithLimitAsync(Stream source, Stream destination, int maximumBytes, CancellationToken cancellationToken)
    {
        var buffer = new byte[81920];
        var total = 0;
        int read;
        while ((read = await source.ReadAsync(buffer, cancellationToken)) > 0)
        {
            total += read;
            if (total > maximumBytes)
                throw new TranslationSourceTooLargeException(maximumBytes);
            await destination.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
        }
    }
}

public sealed class TranslationSourceNotModifiedException : Exception;
public sealed class TranslationSourceTooLargeException(int maximumBytes)
    : Exception($"The translation source exceeded the {maximumBytes} byte limit.");

/// <summary>
/// The endpoint answered, but not with a translation file.
///
/// <see cref="HttpResponseMessage.EnsureSuccessStatusCode"/> says "Response status code does not
/// indicate success: 404 (Not Found)". That names neither the address that returned it nor anything
/// to do about it, and this message is the whole of what the sync history and the failure
/// notification carry.
///
/// So it names the expanded address rather than the template, since the locale substituted into a
/// path is half of what makes a 404 a 404. Then it says what the status means for a translation
/// source, which the number alone does not.
/// </summary>
public sealed class TranslationSourceResponseException(
    string endpoint,
    HttpStatusCode status,
    string? reason,
    TimeSpan? retryAfter = null,
    string? mediaType = null)
    : Exception(Describe(endpoint, status, reason, retryAfter, mediaType))
{
    public string Endpoint { get; } = endpoint;

    public HttpStatusCode Status { get; } = status;

    /// <summary>How long the endpoint asked the caller to wait, when it said.</summary>
    public TimeSpan? RetryAfter { get; } = retryAfter;

    private static string Describe(
        string endpoint, HttpStatusCode status, string? reason, TimeSpan? retryAfter, string? mediaType)
    {
        var phrase = string.IsNullOrWhiteSpace(reason) ? status.ToString() : reason;
        return $"{endpoint} answered {(int)status} ({phrase}). {Advise(status, retryAfter, mediaType)}".TrimEnd();
    }

    /// <summary>
    /// What the status means for a translation source, in the words of somebody who has to fix it.
    /// The fix lives somewhere different for each class of status. It is the credentials, or the
    /// address, or waiting, and the number alone does not say which.
    /// </summary>
    private static string Advise(HttpStatusCode status, TimeSpan? retryAfter, string? mediaType)
    {
        /*
         * A web page where a translation file was asked for. Something in front of the source
         * answered for it, and the status it picked describes that interception rather than the
         * source, so the number at face value sends people to fix the wrong thing. Vercel's bot
         * protection answers 429, which reads as a rate limit and sets people waiting for a window
         * that never opens.
         *
         * The content type is the better tell. No working translation source returns HTML.
         */
        if (mediaType?.Contains("html", StringComparison.OrdinalIgnoreCase) == true)
            return "A web page came back instead of a translation file, so something in front of the source " +
                   "answered for it: a firewall, bot protection, or a sign-in page. Check the address works " +
                   "without a browser.";

        return status switch
        {
            HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden or HttpStatusCode.ProxyAuthenticationRequired =>
                "The request was refused. Check the secret and the request headers this source sends.",
            HttpStatusCode.NotFound or HttpStatusCode.Gone =>
                "Nothing is published at that address. Check the endpoint template and the locale it expands to.",
            HttpStatusCode.TooManyRequests =>
                retryAfter is { } wait
                    ? $"The endpoint is rate limiting this site. Try again in {Round(wait)}."
                    : "The endpoint is rate limiting this site. Wait before syncing again.",
            HttpStatusCode.RequestTimeout or >= HttpStatusCode.InternalServerError =>
                "The endpoint failed to answer. This is usually temporary.",
            _ => "",
        };
    }

    private static string Round(TimeSpan wait) =>
        wait < TimeSpan.FromMinutes(1)
            ? $"{Math.Ceiling(wait.TotalSeconds)} seconds"
            : $"{Math.Ceiling(wait.TotalMinutes)} minutes";
}
