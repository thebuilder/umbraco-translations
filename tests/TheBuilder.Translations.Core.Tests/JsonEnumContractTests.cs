using System.Text.Json;
using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Sources;
using TheBuilder.Translations.Core.Synchronization;

namespace TheBuilder.Translations.Core.Tests;

public sealed class JsonEnumContractTests
{
    [Theory]
    [InlineData("\"Fixed\"", NamespaceMode.Fixed)]
    [InlineData("\"FirstSegment\"", NamespaceMode.FirstSegment)]
    public void Namespace_mode_uses_the_string_values_advertised_by_the_api(string json, NamespaceMode expected) =>
        Assert.Equal(expected, JsonSerializer.Deserialize<NamespaceMode>(json));

    [Theory]
    [InlineData("\"PlainText\"", MessageFormat.PlainText)]
    [InlineData("\"Icu\"", MessageFormat.Icu)]
    [InlineData("\"I18NextV4\"", MessageFormat.I18NextV4)]
    public void Message_format_uses_the_string_values_advertised_by_the_api(string json, MessageFormat expected) =>
        Assert.Equal(expected, JsonSerializer.Deserialize<MessageFormat>(json));

    [Theory]
    [InlineData("\"Running\"", TranslationSyncStatus.Running)]
    [InlineData("\"Succeeded\"", TranslationSyncStatus.Succeeded)]
    [InlineData("\"Failed\"", TranslationSyncStatus.Failed)]
    [InlineData("\"NotModified\"", TranslationSyncStatus.NotModified)]
    public void Synchronization_status_uses_the_string_values_advertised_by_the_api(string json, TranslationSyncStatus expected) =>
        Assert.Equal(expected, JsonSerializer.Deserialize<TranslationSyncStatus>(json));

    [Fact]
    public void Source_parser_serializes_enum_values_as_strings()
    {
        var parser = new NestedJsonParserOptions(["da", "en"], "website", NamespaceMode.FirstSegment, MessageFormat.Icu);

        var json = JsonSerializer.Serialize(parser);

        Assert.Contains("\"NamespaceMode\":\"FirstSegment\"", json, StringComparison.Ordinal);
        Assert.Contains("\"MessageFormat\":\"Icu\"", json, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("{\"EndpointTemplate\":\"https://translations.example/{locale}.json\",\"TimeoutSeconds\":10,\"MaximumResponseBytes\":10000000}")]
    [InlineData("{\"EndpointTemplate\":\"https://translations.example/{locale}.json\",\"TimeoutSeconds\":10,\"MaximumResponseBytes\":10000000,\"Headers\":null}")]
    public void Legacy_transport_configuration_without_a_header_collection_uses_an_empty_collection(string json)
    {
        var transport = JsonSerializer.Deserialize<HttpTranslationTransportOptions>(json);

        Assert.NotNull(transport);
        Assert.Empty(transport.Headers);
    }
}
