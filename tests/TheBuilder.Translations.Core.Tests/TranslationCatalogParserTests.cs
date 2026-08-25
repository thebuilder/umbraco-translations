using System.Text;
using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Sources;
using TheBuilder.Translations.Core.Validation;

namespace TheBuilder.Translations.Core.Tests;

/// <summary>
/// The seam that makes a second catalogue format reach the synchronization engine at all. Both
/// parsers are covered on their own; what this asks is whether the source's stated format is what
/// decides between them, and whether a source stored before formats existed still reads as JSON.
/// </summary>
public sealed class TranslationCatalogParserTests
{
    private readonly TranslationCatalogParser _parser = new(
        new NestedJsonParser(new MessageFormatValidator()),
        new PoParser(new MessageFormatValidator()));

    [Fact]
    public async Task Reads_a_po_catalogue_when_the_source_says_po()
    {
        var messages = await Parse("msgid \"cart.empty\"\nmsgstr \"Kurven er tom\"", SourceFormat.Po);

        Assert.Equal(("cart", "empty", "Kurven er tom"),
            (messages[0].Namespace, messages[0].Key, messages[0].Value));
    }

    [Fact]
    public async Task Reads_nested_json_when_nothing_says_otherwise()
    {
        // The default, and what every source saved before this existed carries: an unset format has
        // to keep meaning what it always meant.
        var options = new TranslationParserOptions(["da"], "website");
        Assert.Equal(SourceFormat.NestedJson, options.SourceFormat);

        var messages = await Parse("""{"cart":{"empty":"Kurven er tom"}}""", options.SourceFormat);

        Assert.Equal(("cart", "empty", "Kurven er tom"),
            (messages[0].Namespace, messages[0].Key, messages[0].Value));
    }

    private async Task<IReadOnlyList<TranslationSourceMessage>> Parse(string content, SourceFormat format)
    {
        await using var payload = new TranslationSourcePayload(
            new MemoryStream(Encoding.UTF8.GetBytes(content)), "da", null, null, null, "fixture");
        var options = new TranslationParserOptions(["da"], "website", NamespaceMode.FirstSegment, MessageFormat.Icu, format);

        var messages = new List<TranslationSourceMessage>();
        await foreach (var message in _parser.ParseAsync(payload, options, CancellationToken.None))
            messages.Add(message);
        return messages;
    }
}
