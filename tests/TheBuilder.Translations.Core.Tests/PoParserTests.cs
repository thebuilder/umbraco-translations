using System.Text;
using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Sources;
using TheBuilder.Translations.Core.Validation;

namespace TheBuilder.Translations.Core.Tests;

/// <summary>
/// PO as next-intl writes it, where msgid is the message key rather than the source text. That is
/// what makes a catalogue a flat list of keys and values, and therefore the same material the
/// nested JSON parser produces once it has flattened.
/// </summary>
public sealed class PoParserTests
{
    private readonly PoParser _parser = new(new MessageFormatValidator());

    [Fact]
    public async Task Reads_the_key_from_msgid_and_the_text_from_msgstr()
    {
        var messages = await Parse("""
            #. Advance to the next slide
            #: src/components/Carousel.tsx
            msgid "carousel.next"
            msgstr "Right"
            """);

        var message = Assert.Single(messages);
        Assert.Equal(("carousel", "next", "Right"), (message.Namespace, message.Key, message.Value));
    }

    [Fact]
    public async Task Puts_every_message_under_one_namespace_when_that_is_what_the_source_says()
    {
        var messages = await Parse("""
            msgid "carousel.next"
            msgstr "Right"
            """, NamespaceMode.Fixed);

        var message = Assert.Single(messages);
        // The key keeps its dots: in fixed mode the whole msgid is the key, exactly as the whole
        // flattened path is in JSON.
        Assert.Equal(("website", "carousel.next"), (message.Namespace, message.Key));
    }

    [Fact]
    public async Task Joins_a_value_split_over_several_lines()
    {
        // The one piece of PO syntax that cannot be skipped: any writer wraps a long message, and a
        // parser that reads only the first line silently truncates every one of them.
        var messages = await Parse("""
            msgid "cart.empty"
            msgstr ""
            "Your basket is empty. "
            "Browse the catalogue to add something to it."
            """);

        Assert.Equal(
            "Your basket is empty. Browse the catalogue to add something to it.",
            Assert.Single(messages).Value);
    }

    [Fact]
    public async Task Unescapes_what_a_writer_escaped_on_the_way_out()
    {
        var messages = await Parse("""
            msgid "cart.notice"
            msgstr "She said \"go\",\nthen left.\\"
            """);

        Assert.Equal("She said \"go\",\nthen left.\\", Assert.Single(messages).Value);
    }

    /*
     * Three kinds of entry carry no translation and all three are ordinary. Treating any of them as
     * content puts rows into the editor that the catalogue does not claim to have translated.
     */
    [Fact]
    public async Task Passes_over_the_header_the_untranslated_and_the_merely_guessed_at()
    {
        var messages = await Parse("""
            msgid ""
            msgstr "Content-Type: text/plain; charset=UTF-8\n"

            msgid "cart.empty"
            msgstr ""

            #, fuzzy
            msgid "cart.checkout"
            msgstr "Til kassen"

            msgid "cart.total"
            msgstr "I alt"
            """);

        Assert.Equal(["total"], messages.Select(message => message.Key));
    }

    [Fact]
    public async Task Refuses_gettext_plural_entries_rather_than_taking_the_first_one()
    {
        // Silently reading msgstr[0] would ship the singular as the whole message in every language.
        // next-intl keeps plurals as ICU inside the value, so this catalogue was written for
        // something else and saying so beats importing it wrong.
        var failure = await Assert.ThrowsAsync<TranslationSourceFormatException>(() => Parse("""
            msgid "cart.items"
            msgid_plural "cart.items"
            msgstr[0] "{count} item"
            msgstr[1] "{count} items"
            """));

        Assert.Contains("ICU", failure.Message);
    }

    [Fact]
    public async Task Says_which_key_has_no_namespace_to_take()
    {
        var failure = await Assert.ThrowsAsync<TranslationSourceFormatException>(() => Parse("""
            msgid "greeting"
            msgstr "Hej"
            """));

        Assert.Contains("greeting", failure.Message);
    }

    [Fact]
    public async Task Refuses_a_catalogue_holding_the_same_key_twice()
    {
        var failure = await Assert.ThrowsAsync<TranslationSourceFormatException>(() => Parse("""
            msgid "cart.empty"
            msgstr "Kurven er tom"

            msgid "cart.empty"
            msgstr "Din kurv er tom"
            """));

        Assert.Contains("cart.empty", failure.Message);
    }

    [Fact]
    public async Task Refuses_a_message_the_format_cannot_hold()
    {
        // The same gate the JSON parser applies: a broken ICU message fails at synchronization
        // rather than at the moment somebody's page renders it.
        await Assert.ThrowsAsync<TranslationSourceFormatException>(() => Parse("""
            msgid "cart.items"
            msgstr "{count, plural, one {One}}"
            """));
    }

    [Fact]
    public async Task Reads_the_arguments_a_message_expects()
    {
        var messages = await Parse("""
            msgid "account.greeting"
            msgstr "Velkommen tilbage, {name}!"
            """);

        Assert.Equal("string", Assert.Single(messages).Arguments["name"]);
    }

    private async Task<IReadOnlyList<TranslationSourceMessage>> Parse(
        string po,
        NamespaceMode namespaceMode = NamespaceMode.FirstSegment)
    {
        await using var payload = new TranslationSourcePayload(
            new MemoryStream(Encoding.UTF8.GetBytes(po)), "da", "text/x-gettext-translation", null, null, "fixture");
        var options = new TranslationParserOptions(["da"], "website", namespaceMode, MessageFormat.Icu, SourceFormat.Po);

        var messages = new List<TranslationSourceMessage>();
        await foreach (var message in _parser.ParseAsync(payload, options, CancellationToken.None))
            messages.Add(message);
        return messages;
    }
}
