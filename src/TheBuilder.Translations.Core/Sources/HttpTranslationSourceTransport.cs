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
         * Neither of the failures below repeats the setting name the source has stored. A field that
         * names a setting is exactly the field somebody pastes the secret into instead, and this
         * message is shown in a notification and written verbatim into the synchronization history,
         * which is a table that keeps it: echoing the field turns one mistake into a stored secret.
         *
         * So they name the header, which is safe and is the part that says which row to go and fix,
         * and spend the rest of themselves on the misunderstanding behind it. A setting that is
         * genuinely missing and a secret pasted into the wrong box fail identically, and the second
         * is much the likelier of the two.
         */
        if (source.Transport.SecretName is not null)
        {
            var secret = configuration[source.Transport.SecretName];
            if (string.IsNullOrWhiteSpace(secret))
                throw new InvalidOperationException(
                    "The bearer token setting named by this source was not found. That field holds the name of a " +
                    "setting in appsettings or user secrets, not the token itself.");
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
                        $"Request header '{header.Name}' reads its value from an application setting that was not " +
                        "found. Either add that setting to appsettings or user secrets, or give the header a value " +
                        "directly if it holds nothing secret.");
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
            // Only the delta form of Retry-After is read. The HTTP-date form would need a clock to
            // subtract from, and every rate limiter worth quoting back to an editor sends seconds.
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
/// indicate success: 404 (Not Found)", which names neither the address that returned it nor
/// anything to do about it. This message is what an editor reads in the synchronization history and
/// in the notification when a sync fails, so it has to be the sentence that sends them to the right
/// place: the address, because a template expanded per locale is not necessarily the one they
/// typed, and what the status actually means for this particular source.
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

    /// <summary>How long the endpoint asked to be left alone, when it said.</summary>
    public TimeSpan? RetryAfter { get; } = retryAfter;

    private static string Describe(
        string endpoint, HttpStatusCode status, string? reason, TimeSpan? retryAfter, string? mediaType)
    {
        var phrase = string.IsNullOrWhiteSpace(reason) ? status.ToString() : reason;
        return $"{endpoint} answered {(int)status} ({phrase}). {Advise(status, retryAfter, mediaType)}".TrimEnd();
    }

    /// <summary>
    /// What the status means for a translation source, in the words of somebody who has to fix it.
    /// The status classes an editor can act on differ in where the fix is -- the credentials, the
    /// address, or simply waiting -- and the number alone does not say which.
    /// </summary>
    private static string Advise(HttpStatusCode status, TimeSpan? retryAfter, string? mediaType)
    {
        /*
         * A web page where a translation file was asked for. Something in front of the source
         * answered on its behalf -- a firewall, a bot challenge, a sign-in redirect -- and the
         * status it picked describes that interception rather than the source itself, so reading
         * the number at face value sends somebody to fix the wrong thing. Vercel's bot protection
         * answers 429, which reads as a rate limit and sets people waiting for something that will
         * never clear on its own.
         *
         * The content type is the tell, and it is a better one than the status: no configuration of
         * a working translation source returns HTML.
         */
        if (mediaType?.Contains("html", StringComparison.OrdinalIgnoreCase) == true)
            return "The endpoint returned a web page rather than a translation file, which usually means " +
                   "a firewall, bot protection or a sign-in page answered instead of the source. Check that " +
                   "the address can be fetched without a browser.";

        return status switch
        {
            HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden or HttpStatusCode.ProxyAuthenticationRequired =>
                "The request was refused. Check the secret and the request headers this source sends.",
            HttpStatusCode.NotFound or HttpStatusCode.Gone =>
                "Nothing is published at that address. Check the endpoint template and the locale it expands to.",
            HttpStatusCode.TooManyRequests =>
                retryAfter is { } wait
                    ? $"The endpoint is rate limiting this site. It asked to be left alone for {Round(wait)}."
                    : "The endpoint is rate limiting this site. Wait before synchronizing again.",
            HttpStatusCode.RequestTimeout or >= HttpStatusCode.InternalServerError =>
                "The endpoint could not answer. This is usually temporary.",
            _ => "",
        };
    }

    private static string Round(TimeSpan wait) =>
        wait < TimeSpan.FromMinutes(1)
            ? $"{Math.Ceiling(wait.TotalSeconds)} seconds"
            : $"{Math.Ceiling(wait.TotalMinutes)} minutes";
}
