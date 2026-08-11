using System.Net;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;
using TheBuilder.Translations.Core.Sources;

namespace TheBuilder.Translations.Core.Tests;

public sealed class HttpTranslationSourceTransportTests
{
    [Fact]
    public async Task Sends_conditional_headers_and_resolves_server_side_secret()
    {
        var response = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("{\"hello\":\"Hello\"}", Encoding.UTF8, "application/json"),
        };
        response.Headers.ETag = new System.Net.Http.Headers.EntityTagHeaderValue("\"revision-7\"");
        var handler = new RecordingHandler(response);
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Translations:Token"] = "secret-value" })
            .Build();
        var transport = new HttpTranslationSourceTransport(new HttpClient(handler), configuration);
        var lastModified = new DateTimeOffset(2026, 8, 10, 12, 0, 0, TimeSpan.Zero);

        TranslationSourcePayload payload = await transport.FetchAsync(
            Source(secretName: "Translations:Token"),
            new TranslationFetchContext("da-DK", "\"previous\"", lastModified),
            CancellationToken.None);

        Assert.Equal("https://translations.example/da-DK.json", handler.RequestUri?.ToString());
        Assert.Equal("Bearer", handler.AuthorizationScheme);
        Assert.Equal("secret-value", handler.AuthorizationParameter);
        Assert.Equal("\"previous\"", handler.IfNoneMatch);
        Assert.Equal(lastModified, handler.IfModifiedSince);
        Assert.Equal("revision-7", payload.Revision);
        Assert.Equal("\"revision-7\"", payload.ETag);
    }

    [Fact]
    public async Task Uses_content_hash_when_response_has_no_etag()
    {
        const string json = "{\"hello\":\"Hej\"}";
        var transport = CreateTransport(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json"),
        });

        TranslationSourcePayload payload = await transport.FetchAsync(
            Source(),
            new TranslationFetchContext("da"),
            CancellationToken.None);

        string expected = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(json))).ToLowerInvariant();
        Assert.Equal(expected, payload.Revision);
    }

    [Fact]
    public async Task Sends_custom_header_value_from_server_configuration()
    {
        var response = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("{\"hello\":\"Hello\"}", Encoding.UTF8, "application/json"),
        };
        var handler = new RecordingHandler(response);
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Translations:SourceApiKey"] = "api-key-value" })
            .Build();
        var transport = new HttpTranslationSourceTransport(new HttpClient(handler), configuration);

        await transport.FetchAsync(
            Source(headers: [new("X-Api-Key", "Translations:SourceApiKey")]),
            new TranslationFetchContext("da"),
            CancellationToken.None);

        Assert.Equal("api-key-value", handler.Headers["X-Api-Key"]);
    }

    [Fact]
    public async Task Rejects_missing_custom_header_configuration_before_sending()
    {
        var handler = new RecordingHandler(new HttpResponseMessage(HttpStatusCode.OK));
        var transport = new HttpTranslationSourceTransport(new HttpClient(handler), new ConfigurationBuilder().Build());

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() => transport.FetchAsync(
            Source(headers: [new("X-Api-Key", "Translations:MissingApiKey")]),
            new TranslationFetchContext("da"),
            CancellationToken.None));

        Assert.Contains("Translations:MissingApiKey", exception.Message, StringComparison.Ordinal);
        Assert.Null(handler.RequestUri);
    }

    [Fact]
    public async Task Reports_not_modified_without_replacing_content()
    {
        var transport = CreateTransport(new HttpResponseMessage(HttpStatusCode.NotModified));

        await Assert.ThrowsAsync<TranslationSourceNotModifiedException>(() => transport.FetchAsync(
            Source(),
            new TranslationFetchContext("en", "\"current\""),
            CancellationToken.None));
    }

    [Fact]
    public async Task Rejects_responses_larger_than_the_configured_limit()
    {
        var transport = CreateTransport(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(new string('x', 1_000_001), Encoding.UTF8, "application/json"),
        });

        await Assert.ThrowsAsync<TranslationSourceTooLargeException>(() => transport.FetchAsync(
            Source(maximumResponseBytes: 1_000_000),
            new TranslationFetchContext("en"),
            CancellationToken.None));
    }

    private static HttpTranslationSourceTransport CreateTransport(HttpResponseMessage response) =>
        new(new HttpClient(new RecordingHandler(response)), new ConfigurationBuilder().Build());

    private static TranslationSourceDefinition Source(
        string? secretName = null,
        int maximumResponseBytes = 10_000_000,
        IReadOnlyList<HttpTranslationHeaderOptions>? headers = null) =>
        new(
            Guid.NewGuid(),
            "sample",
            "Sample",
            true,
            new HttpTranslationTransportOptions("https://translations.example/{locale}.json", secretName, MaximumResponseBytes: maximumResponseBytes)
            {
                Headers = headers ?? [],
            },
            new NestedJsonParserOptions(["en", "da"], "website"));

    private sealed class RecordingHandler(HttpResponseMessage response) : HttpMessageHandler
    {
        public Uri? RequestUri { get; private set; }
        public string? AuthorizationScheme { get; private set; }
        public string? AuthorizationParameter { get; private set; }
        public string? IfNoneMatch { get; private set; }
        public DateTimeOffset? IfModifiedSince { get; private set; }
        public IReadOnlyDictionary<string, string> Headers { get; private set; } = new Dictionary<string, string>();

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            RequestUri = request.RequestUri;
            AuthorizationScheme = request.Headers.Authorization?.Scheme;
            AuthorizationParameter = request.Headers.Authorization?.Parameter;
            IfNoneMatch = request.Headers.IfNoneMatch.SingleOrDefault()?.ToString();
            IfModifiedSince = request.Headers.IfModifiedSince;
            Headers = request.Headers.ToDictionary(header => header.Key, header => string.Join(",", header.Value), StringComparer.OrdinalIgnoreCase);
            return Task.FromResult(response);
        }
    }
}
