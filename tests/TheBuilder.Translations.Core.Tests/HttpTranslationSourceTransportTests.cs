using System.Net;
using System.Net.Http.Headers;
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

        // The header, not the setting it named: see the leak test below for why the message will not
        // repeat a field that so often turns out to hold the secret itself.
        Assert.Contains("X-Api-Key", exception.Message, StringComparison.Ordinal);
        Assert.DoesNotContain("Translations:MissingApiKey", exception.Message, StringComparison.Ordinal);
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

    /*
     * What an editor is shown when the endpoint answers with something that is not a translation
     * file. EnsureSuccessStatusCode said "Response status code does not indicate success: 429 (Too
     * Many Requests)", which names neither the address nor anything to do about it -- and this
     * message is the whole of what the synchronization history and the failure notification carry.
     */
    [Fact]
    public async Task Names_the_address_and_what_to_check_when_the_endpoint_refuses()
    {
        var transport = CreateTransport(new HttpResponseMessage(HttpStatusCode.NotFound));

        var failure = await Assert.ThrowsAsync<TranslationSourceResponseException>(() => transport.FetchAsync(
            Source(),
            new TranslationFetchContext("en"),
            CancellationToken.None));

        // The expanded address, not the template: the locale it expanded to is half of what makes a
        // 404 a 404, and it is not what the editor typed.
        Assert.Contains("https://translations.example/en.json", failure.Message);
        Assert.Contains("404", failure.Message);
        Assert.Contains("endpoint template", failure.Message);
        Assert.Equal(HttpStatusCode.NotFound, failure.Status);
    }

    [Fact]
    public async Task Passes_on_how_long_a_rate_limiter_asked_to_be_left_alone()
    {
        var response = new HttpResponseMessage(HttpStatusCode.TooManyRequests);
        response.Headers.RetryAfter = new RetryConditionHeaderValue(TimeSpan.FromSeconds(90));
        var transport = CreateTransport(response);

        var failure = await Assert.ThrowsAsync<TranslationSourceResponseException>(() => transport.FetchAsync(
            Source(),
            new TranslationFetchContext("en"),
            CancellationToken.None));

        // Pressing sync again immediately is what got them rate limited; the wait is the one piece
        // of advice the endpoint itself supplied.
        Assert.Contains("rate limiting", failure.Message);
        Assert.Contains("2 minutes", failure.Message);
    }

    /*
     * The case that sent me looking: sst.dk sits behind Vercel's bot protection, which answers every
     * request with an HTML challenge page under a 429. Read as a rate limit that is somebody waiting
     * for a window that never opens, so the content type wins over the status -- no working
     * translation source returns HTML.
     */
    [Fact]
    public async Task Calls_a_challenge_page_what_it_is_rather_than_a_rate_limit()
    {
        var response = new HttpResponseMessage(HttpStatusCode.TooManyRequests)
        {
            Content = new StringContent("<!DOCTYPE html><title>Vercel Security Checkpoint</title>", Encoding.UTF8, "text/html"),
        };
        var transport = CreateTransport(response);

        var failure = await Assert.ThrowsAsync<TranslationSourceResponseException>(() => transport.FetchAsync(
            Source(),
            new TranslationFetchContext("en"),
            CancellationToken.None));

        Assert.Contains("web page came back instead of a translation file", failure.Message);
        Assert.Contains("bot protection", failure.Message);
        Assert.DoesNotContain("rate limiting", failure.Message);
    }

    [Fact]
    public async Task Says_nothing_it_cannot_stand_behind_about_an_unremarkable_status()
    {
        var transport = CreateTransport(new HttpResponseMessage(HttpStatusCode.BadRequest));

        var failure = await Assert.ThrowsAsync<TranslationSourceResponseException>(() => transport.FetchAsync(
            Source(),
            new TranslationFetchContext("en"),
            CancellationToken.None));

        Assert.EndsWith("answered 400 (Bad Request).", failure.Message);
    }

    /*
     * Both header fields hold the *name* of an application setting, and somebody who pastes the
     * secret itself into one gets this failure. The message must not then repeat what they typed:
     * it is shown in a notification and written verbatim into the synchronization history, which is
     * a table that keeps it, so echoing the field turns one mistake into a stored plaintext secret.
     */
    [Fact]
    public async Task Never_repeats_a_configuration_key_that_might_be_the_secret_itself()
    {
        const string pasted = "kgTQidXpihPiVxxeswAqF3vTVcQEDaPP";
        var transport = CreateTransport(new HttpResponseMessage(HttpStatusCode.OK));

        var failure = await Assert.ThrowsAsync<InvalidOperationException>(() => transport.FetchAsync(
            Source(headers: [new HttpTranslationHeaderOptions("x-vercel-protection-bypass", pasted)]),
            new TranslationFetchContext("en"),
            CancellationToken.None));

        Assert.DoesNotContain(pasted, failure.Message);
        // The header names the row to go and fix, and is safe to say.
        Assert.Contains("x-vercel-protection-bypass", failure.Message);
        // And it names the misunderstanding, because a missing setting and a pasted secret fail
        // identically and the second is far the likelier of the two.
        Assert.Contains("names an application setting that does not exist", failure.Message);
        Assert.Contains("give the header its value directly", failure.Message);
    }

    [Fact]
    public async Task Says_nothing_about_a_bearer_token_setting_beyond_that_it_is_missing()
    {
        const string pasted = "sk-live-3f9a2b7c";
        var transport = CreateTransport(new HttpResponseMessage(HttpStatusCode.OK));

        var failure = await Assert.ThrowsAsync<InvalidOperationException>(() => transport.FetchAsync(
            Source(secretName: pasted),
            new TranslationFetchContext("en"),
            CancellationToken.None));

        Assert.DoesNotContain(pasted, failure.Message);
        Assert.Contains("takes a setting name", failure.Message);
    }

    /*
     * Not every header is a secret. An Accept header, a tenant id, a client name: making somebody
     * invent an appsettings key for those is friction that buys no safety, and it is what pushed
     * the value into the setting-name field in the first place.
     */
    [Fact]
    public async Task Sends_a_header_value_written_on_the_source_without_going_near_configuration()
    {
        var handler = new RecordingHandler(new HttpResponseMessage(HttpStatusCode.OK));
        var transport = new HttpTranslationSourceTransport(new HttpClient(handler), new ConfigurationBuilder().Build());

        await transport.FetchAsync(
            Source(headers: [new HttpTranslationHeaderOptions("X-Tenant", Value: "acme")]),
            new TranslationFetchContext("en"),
            CancellationToken.None);

        Assert.Equal("acme", handler.Headers["X-Tenant"]);
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
            new TranslationParserOptions(["en", "da"], "website", NamespaceMode.Fixed));

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
