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
        if (source.Transport.SecretName is not null)
        {
            var secret = configuration[source.Transport.SecretName]
                ?? throw new InvalidOperationException($"Configuration secret '{source.Transport.SecretName}' was not found.");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", secret);
        }
        foreach (var header in source.Transport.Headers)
        {
            var value = configuration[header.ValueConfigurationKey];
            if (string.IsNullOrWhiteSpace(value))
                throw new InvalidOperationException($"Configuration value '{header.ValueConfigurationKey}' for request header '{header.Name}' was not found.");
            if (value.IndexOfAny(['\r', '\n']) >= 0)
                throw new InvalidOperationException($"Configuration value '{header.ValueConfigurationKey}' contains invalid line breaks.");
            if (!request.Headers.TryAddWithoutValidation(header.Name, value))
                throw new InvalidOperationException($"Request header '{header.Name}' is not supported.");
        }

        using var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
        if (response.StatusCode is HttpStatusCode.NotModified)
            throw new TranslationSourceNotModifiedException();
        response.EnsureSuccessStatusCode();

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
