using System.Text;
using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Sources;
using TheBuilder.Translations.Core.Validation;

namespace TheBuilder.Translations.Core.Tests;

public sealed class NestedJsonParserTests
{
    private readonly NestedJsonParser _parser = new(new MessageFormatValidator());

    [Fact]
    public async Task Flattens_nested_unicode_and_empty_messages()
    {
        await using var payload = Payload("""{"navigation":{"home":"Hjem","empty":""},"welcome":"Hej 👋 {name}"}""");
        var messages = await Parse(payload, new(["da"], "website"));

        Assert.Collection(messages,
            message => Assert.Equal(("website", "navigation.home", "Hjem"), (message.Namespace, message.Key, message.Value)),
            message => Assert.Equal(string.Empty, message.Value),
            message => Assert.Equal("string", message.Arguments["name"]));
    }

    [Fact]
    public async Task Uses_first_segment_as_namespace()
    {
        await using var payload = Payload("""{"navigation":{"home":"Home"},"search":{"results":"{count, plural, one {# result} other {# results}}"}}""");
        var messages = await Parse(payload, new(["en"], "unused", NamespaceMode.FirstSegment));

        Assert.Equal(["navigation", "search"], messages.Select(message => message.Namespace));
        Assert.All(messages, message => Assert.DoesNotContain('.', message.Key));
    }

    [Fact]
    public async Task Preserves_i18next_v4_plural_keys_and_extracts_interpolation()
    {
        await using var payload = Payload("""{"cart":{"items_one":"{{count}} item","items_other":"{{count}} items","place_ordinal_one":"{{position}}st"}}""");
        var messages = await Parse(payload, new(["en"], "website", MessageFormat: MessageFormat.I18NextV4));

        Assert.Equal(["cart.items_one", "cart.items_other", "cart.place_ordinal_one"], messages.Select(message => message.Key));
        Assert.All(messages, message => Assert.Equal(MessageFormat.I18NextV4, message.Format));
        Assert.Equal("string", messages[0].Arguments["count"]);
    }

    [Theory]
    [InlineData("{\"bad\":42}")]
    [InlineData("{\"bad\":null}")]
    [InlineData("{\"bad\":[\"value\"]}")]
    [InlineData("{\"bad\":\"{count, plural, one {One}}\"}")]
    public async Task Rejects_invalid_messages(string json)
    {
        await using var payload = Payload(json);
        await Assert.ThrowsAsync<TranslationSourceFormatException>(() => Parse(payload, new(["en"], "website")));
    }

    [Fact]
    public async Task Rejects_duplicate_json_properties_after_flattening()
    {
        await using var payload = Payload("""{"navigation":{"home":"Home","home":"Start"}}""");
        await Assert.ThrowsAsync<TranslationSourceFormatException>(() => Parse(payload, new(["en"], "website")));
    }

    [Fact]
    public async Task Parses_deterministic_ten_thousand_message_fixture()
    {
        await using var payload = new TranslationSourcePayload(LargeDictionaryFixture.Create(10_000), "en", "application/json", null, null, "large-fixture");
        var messages = await Parse(payload, new(["en"], "website"));

        Assert.Equal(10_000, messages.Count);
        Assert.Equal("generated.message-00000", messages[0].Key);
        Assert.Equal("generated.message-09999", messages[^1].Key);
        Assert.All(messages, message => Assert.Equal("string", message.Arguments["name"]));
    }

    private async Task<IReadOnlyList<TranslationSourceMessage>> Parse(TranslationSourcePayload payload, NestedJsonParserOptions options)
    {
        var result = new List<TranslationSourceMessage>();
        await foreach (var message in _parser.ParseAsync(payload, options, CancellationToken.None))
            result.Add(message);
        return result;
    }

    private static TranslationSourcePayload Payload(string json) =>
        new(new MemoryStream(Encoding.UTF8.GetBytes(json)), "en", "application/json", null, null, "fixture");
}
