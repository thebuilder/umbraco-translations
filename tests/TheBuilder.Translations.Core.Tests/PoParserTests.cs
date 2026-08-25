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

    /*
     * What next-intl's own e2e catalogues look like. Message extraction generates a hash for each
     * id, so the keys carry no namespace and no dots, and every one of them is refused by first-key
     * mode. That is the default mode, which makes this the shape a PO source most likely arrives in
     * and the failure most likely to meet somebody first, so the message names the cause.
     */
    [Fact]
    public async Task Names_extraction_when_a_generated_key_has_no_namespace_in_it()
    {
        var failure = await Assert.ThrowsAsync<TranslationSourceFormatException>(() => Parse("""
            #: src/app/page.tsx
            msgid "NhX4DJ"
            msgstr "Hello"
            """));

        Assert.Contains("NhX4DJ", failure.Message);
        Assert.Contains("extraction", failure.Message);
        Assert.Contains("fixed namespace", failure.Message);
    }

    [Fact]
    public async Task Reads_a_generated_catalogue_under_one_fixed_namespace()
    {
        var messages = await Parse("""
            msgid ""
            msgstr ""
            "Language: en\n"
            "X-Generator: next-intl\n"

            #: src/app/page.tsx
            msgid "NhX4DJ"
            msgstr "Hello"

            #: src/components/Footer.tsx
            #: src/components/Greeting.tsx
            msgid "-YJVTi"
            msgstr "Hey!"
            """, NamespaceMode.Fixed);

        Assert.Equal(
            [("website", "NhX4DJ", "Hello"), ("website", "-YJVTi", "Hey!")],
            messages.Select(message => (message.Namespace, message.Key, message.Value)));
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

    /*
     * A flag belongs to the entry after it. Catalogues are normally written with a blank line
     * between entries, and without one the flag was read as part of the entry above: the confirmed
     * translation was dropped as a guess and the actual guess was imported in its place. Silent
     * both ways, which is what makes it worth a test.
     */
    [Fact]
    public async Task Marks_the_entry_a_fuzzy_flag_precedes_rather_than_the_one_above_it()
    {
        var messages = await Parse("""
            msgid "cart.total"
            msgstr "I alt"
            #, fuzzy
            msgid "cart.checkout"
            msgstr "Til kassen"
            """);

        Assert.Equal(["total"], messages.Select(message => message.Key));
    }

    /*
     * How next-intl actually writes a catalogue, as opposed to the shortened form in its docs. The
     * key is split across two fields: everything before the last dot in msgctxt, the final segment
     * in msgid. Dropping the context lost the namespace, so every key arrived as a bare word that
     * first-key mode then refused for having no dot, and any two namespaces sharing a final segment
     * collided as duplicates. Its own decoder throws without a context, for the same reason.
     */
    [Fact]
    public async Task Rebuilds_a_key_that_next_intl_split_across_msgctxt_and_msgid()
    {
        var messages = await Parse("""
            msgctxt "cart"
            msgid "empty"
            msgstr "Kurven er tom"

            msgctxt "checkout"
            msgid "empty"
            msgstr "Intet at betale"
            """);

        Assert.Equal(
            [("cart", "empty"), ("checkout", "empty")],
            messages.Select(message => (message.Namespace, message.Key)));
    }

    [Fact]
    public async Task Keeps_the_inner_segments_of_a_key_with_more_than_one_dot()
    {
        // next-intl moves everything before the *last* dot into the context, so the middle segments
        // arrive there and belong back on the key.
        var messages = await Parse("""
            msgctxt "cart.items"
            msgid "count"
            msgstr "{count} varer"
            """);

        var message = Assert.Single(messages);
        Assert.Equal(("cart", "items.count"), (message.Namespace, message.Key));
    }

    [Fact]
    public async Task Reads_a_context_that_wraps_over_lines()
    {
        // Like any PO string a context may be split, and sending the continuations nowhere failed a
        // perfectly valid catalogue as unexpected text.
        var messages = await Parse("""
            msgctxt ""
            "cart"
            msgid "empty"
            msgstr "Kurven er tom"
            """);

        var message = Assert.Single(messages);
        Assert.Equal(("cart", "empty"), (message.Namespace, message.Key));
    }

    [Fact]
    public async Task Still_reads_a_whole_key_left_in_msgid_alone()
    {
        // The form next-intl's documentation shows, and what a hand-written catalogue looks like.
        var messages = await Parse("""
            msgid "cart.empty"
            msgstr "Kurven er tom"
            """);

        var message = Assert.Single(messages);
        Assert.Equal(("cart", "empty"), (message.Namespace, message.Key));
    }

    [Fact]
    public async Task Leaves_entries_the_catalogue_has_commented_out_where_they_are()
    {
        // gettext keeps removed entries as "#~" rather than deleting them. They are history, not
        // content, and importing them would resurrect keys the application stopped shipping.
        var messages = await Parse("""
            #~ msgid "cart.gone"
            #~ msgstr "Fjernet"

            msgid "cart.empty"
            msgstr "Kurven er tom"
            """);

        Assert.Equal(["empty"], messages.Select(message => message.Key));
    }

    [Fact]
    public async Task Reads_a_catalogue_written_on_windows()
    {
        var messages = await Parse("msgid \"cart.empty\"\r\nmsgstr \"Kurven er tom\"\r\n");

        Assert.Equal("Kurven er tom", Assert.Single(messages).Value);
    }

    [Fact]
    public async Task Reads_the_last_entry_when_the_file_does_not_end_in_a_newline()
    {
        var messages = await Parse("msgid \"cart.empty\"\nmsgstr \"Kurven er tom\"");

        Assert.Single(messages);
    }

    /*
     * An excerpt of a real catalogue, and the shape it has to land in.
     *
     * The whole of that file, 859 entries, was run through this parser and nested the way the
     * delivery API nests, and came out byte-identical to the en.json next-intl writes for the same
     * app. This keeps the parts of it that were nearly wrong: contexts several segments deep, a
     * context that returns after a deeper one has interrupted it, an escaped quote, and an ICU
     * plural living inside the value where next-intl puts it.
     */
    [Fact]
    public async Task Reads_a_catalogue_the_way_next_intl_wrote_it()
    {
        var messages = await Parse(""""
            msgid ""
            msgstr ""
            "Language: en\n"
            "X-Generator: next-intl\n"

            msgctxt "HomePage"
            msgid "title"
            msgstr "Hello world!"

            msgctxt "Component.CampaignLibrary"
            msgid "ItemCount"
            msgstr "{count, plural, one {# entry} other {# entries}}"

            msgctxt "Component.CampaignLibrary.Errors"
            msgid "CATEGORY_NOT_EMPTY"
            msgstr "Move or delete this category's entries before deleting it."

            msgctxt "Component.CampaignSystem"
            msgid "EmptyAddCustom"
            msgstr "Add \"{value}\" as a custom system"

            msgctxt "Component.CampaignSystem.CustomOption"
            msgid "Label"
            msgstr "Homebrew / Custom"

            msgctxt "Component.CampaignSystem"
            msgid "FrameFieldLabel"
            msgstr "Game setting"
            """", NamespaceMode.Fixed);

        Assert.Equal(
            [
                "HomePage.title",
                "Component.CampaignLibrary.ItemCount",
                "Component.CampaignLibrary.Errors.CATEGORY_NOT_EMPTY",
                "Component.CampaignSystem.EmptyAddCustom",
                "Component.CampaignSystem.CustomOption.Label",
                "Component.CampaignSystem.FrameFieldLabel",
            ],
            messages.Select(message => message.Key));

        // The escaped quotes survive, and so does the placeholder between them.
        var custom = messages.Single(message => message.Key.EndsWith("EmptyAddCustom", StringComparison.Ordinal));
        Assert.Equal("Add \"{value}\" as a custom system", custom.Value);
        Assert.Equal("string", custom.Arguments["value"]);
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
