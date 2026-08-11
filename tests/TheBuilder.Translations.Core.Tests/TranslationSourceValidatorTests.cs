using TheBuilder.Translations.Core.Sources;

namespace TheBuilder.Translations.Core.Tests;

public sealed class TranslationSourceValidatorTests
{
    [Fact]
    public void Accepts_a_valid_source() =>
        Assert.Null(TranslationSourceValidator.Validate(Source()));

    [Theory]
    [InlineData("website/messages")]
    [InlineData("website messages")]
    [InlineData("website?draft=true")]
    [InlineData("website#draft")]
    [InlineData(".")]
    [InlineData("..")]
    [InlineData("Website")]
    public void Rejects_aliases_that_cannot_be_used_as_one_route_segment(string alias)
    {
        var source = Source() with { Alias = alias };

        Assert.Contains("Alias", TranslationSourceValidator.Validate(source), StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData(0, 10_000_000, "timeout")]
    [InlineData(121, 10_000_000, "timeout")]
    [InlineData(10, 999_999, "response")]
    [InlineData(10, 50_000_001, "response")]
    public void Rejects_transport_limits_outside_the_supported_range(int timeoutSeconds, int maximumResponseBytes, string expected)
    {
        var source = Source() with
        {
            Transport = new HttpTranslationTransportOptions(
                "https://translations.example/{locale}.json",
                TimeoutSeconds: timeoutSeconds,
                MaximumResponseBytes: maximumResponseBytes),
        };

        var error = TranslationSourceValidator.Validate(source);

        Assert.Contains(expected, error, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Requires_a_namespace_only_in_fixed_mode()
    {
        var fixedSource = Source() with { Parser = new NestedJsonParserOptions(["en-US"], "", NamespaceMode.Fixed) };
        var segmentedSource = Source() with { Parser = new NestedJsonParserOptions(["en-US"], "", NamespaceMode.FirstSegment) };

        Assert.NotNull(TranslationSourceValidator.Validate(fixedSource));
        Assert.Null(TranslationSourceValidator.Validate(segmentedSource));
    }

    [Theory]
    [InlineData("messages/{locale}.json")]
    [InlineData("ftp://translations.example/{locale}.json")]
    public void Rejects_endpoints_that_cannot_be_fetched_over_http(string endpoint)
    {
        var source = Source() with
        {
            Transport = new HttpTranslationTransportOptions(endpoint),
        };

        var error = TranslationSourceValidator.Validate(source);

        Assert.Contains("HTTP", error, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("Bad Header")]
    [InlineData("Host")]
    [InlineData("Content-Length")]
    [InlineData("Content-Type")]
    [InlineData("Content-Language")]
    [InlineData("If-None-Match")]
    public void Rejects_invalid_or_transport_owned_request_headers(string name)
    {
        var source = Source() with
        {
            Transport = Source().Transport with { Headers = [new(name, "Translations:ApiKey")] },
        };

        Assert.NotNull(TranslationSourceValidator.Validate(source));
    }

    [Fact]
    public void Rejects_duplicate_request_headers_case_insensitively()
    {
        var source = Source() with
        {
            Transport = Source().Transport with
            {
                Headers =
                [
                    new("X-Api-Key", "Translations:PrimaryKey"),
                    new("x-api-key", "Translations:SecondaryKey"),
                ],
            },
        };

        Assert.Contains("more than once", TranslationSourceValidator.Validate(source), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Rejects_competing_authorization_header_configuration()
    {
        var source = Source() with
        {
            Transport = Source().Transport with
            {
                SecretName = "Translations:BearerToken",
                Headers = [new("Authorization", "Translations:Authorization")],
            },
        };

        Assert.Contains("Authorization", TranslationSourceValidator.Validate(source), StringComparison.OrdinalIgnoreCase);
    }

    private static TranslationSourceDefinition Source() => new(
        Guid.NewGuid(),
        "website",
        "Website messages",
        true,
        new HttpTranslationTransportOptions("https://translations.example/{locale}.json"),
        new NestedJsonParserOptions(["en-US"], "website"));
}
