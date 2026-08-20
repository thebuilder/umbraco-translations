using Microsoft.Data.Sqlite;
using NPoco;
using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Persistence;
using TheBuilder.Translations.Persistence;

namespace TheBuilder.Translations.Tests;

/// <summary>
/// Exercises the key-centric query against a real database. Everything here runs through
/// <c>SkipTake</c>, which is the only way to catch a SELECT-list change that breaks NPoco's paging
/// splitter, and through the real GROUP BY, which is where the correctness risk lives.
/// </summary>
public sealed class TranslationKeyQueriesTests
{
    private static readonly Guid Source = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private const string English = "en-US";
    private const string Danish = "da-DK";
    private const string German = "de-DE";
    private const string Swedish = "sv-SE";

    [Fact]
    public void Total_counts_distinct_keys_not_key_locale_pairs()
    {
        using var database = Seeded();

        var page = Query(database);

        // Six English keys; Danish and German add rows but no new keys except da-only "checkout.only".
        Assert.Equal(7, page.Total);
        Assert.Equal(page.Total, page.Items.Count);
        Assert.Equal(page.Items.Select(item => item.Key).Distinct().Count(), page.Items.Count);
    }

    [Fact]
    public void A_key_the_target_locale_lacks_entirely_is_absent_rather_than_missing_from_the_page()
    {
        using var database = Seeded();

        var row = Query(database).Items.Single(item => item.Key == "cart.untranslated");

        Assert.Equal(MessageLocaleState.Absent, row.StateOf(Danish));
        Assert.False(row.Locales.ContainsKey(Danish));
        Assert.Equal(MessageLocaleState.Default, row.StateOf(English));
    }

    [Fact]
    public void Absent_is_selectable_as_a_filter()
    {
        using var database = Seeded();

        var keys = Query(database, query => query with { Status = MessageKeyStatusFilter.Absent })
            .Items.Select(item => item.Key).ToArray();

        Assert.Equal(["cart.untranslated"], keys);
    }

    [Fact]
    public void A_key_only_the_target_locale_has_still_appears()
    {
        using var database = Seeded();

        var row = Query(database).Items.Single(item => item.Key == "checkout.only");

        Assert.Equal(MessageLocaleState.Absent, row.StateOf(English));
        Assert.Equal(MessageLocaleState.Default, row.StateOf(Danish));
    }

    [Fact]
    public void Coverage_reports_every_locale_but_text_is_limited_to_the_requested_ones()
    {
        using var database = Seeded();

        var row = Query(database).Items.Single(item => item.Key == "cart.empty");

        // German is neither target, reference nor compare, so it contributes a state but no text.
        Assert.Equal(MessageLocaleState.Default, row.StateOf(German));
        Assert.False(row.Locales.ContainsKey(German));
        Assert.Equal([Danish, English], row.Locales.Keys.OrderBy(key => key).ToArray());
        Assert.Equal("Your cart is empty", row.Locales[English].DefaultValue);
    }

    [Fact]
    public void A_compare_locale_gains_text_without_widening_the_key_set()
    {
        using var database = Seeded();

        var page = Query(database, query => query with { CompareLocales = [German] });
        var row = page.Items.Single(item => item.Key == "cart.empty");

        Assert.True(row.Locales.ContainsKey(German));
        Assert.Equal("Ihr Warenkorb ist leer", row.Locales[German].DefaultValue);
        // "german.only" exists solely in German and must not join the key set.
        Assert.DoesNotContain(page.Items, item => item.Key == "german.only");
    }

    [Theory]
    [InlineData(MessageKeyStatusFilter.NeedsReview, "cart.stale")]
    [InlineData(MessageKeyStatusFilter.Removed, "cart.removed")]
    public void Status_filters_describe_the_target_locale(MessageKeyStatusFilter status, string expected)
    {
        using var database = Seeded();

        var keys = Query(database, query => query with { Status = status }).Items.Select(item => item.Key);

        Assert.Equal([expected], keys);
    }

    [Fact]
    public void Overridden_includes_keys_awaiting_review_but_not_removed_ones()
    {
        using var database = Seeded();

        var keys = Query(database, query => query with { Status = MessageKeyStatusFilter.Overridden })
            .Items.Select(item => item.Key).ToArray();

        // A key awaiting review is still overridden; this matches the flat message endpoint, where
        // NeedsReview is a strict subset of Overridden.
        Assert.Equal(["cart.overridden", "cart.stale"], keys.Order());
        Assert.DoesNotContain("cart.removed", keys);
    }

    [Fact]
    public void A_removed_key_is_not_reported_as_awaiting_review()
    {
        using var database = Seeded();

        // The tombstone's override predates its removal, so its checksum is stale, but it is
        // removed rather than waiting for anyone to re-check it.
        Assert.DoesNotContain(
            Query(database, query => query with { Status = MessageKeyStatusFilter.NeedsReview }).Items,
            item => item.Key == "cart.removed");
    }

    [Fact]
    public void Default_status_excludes_overridden_and_removed_keys()
    {
        using var database = Seeded();

        var keys = Query(database, query => query with { Status = MessageKeyStatusFilter.Default })
            .Items.Select(item => item.Key).ToArray();

        Assert.Contains("cart.empty", keys);
        Assert.DoesNotContain("cart.overridden", keys);
        Assert.DoesNotContain("cart.stale", keys);
        Assert.DoesNotContain("cart.removed", keys);
        Assert.DoesNotContain("cart.untranslated", keys); // absent, so not "using the default"
    }

    [Fact]
    public void A_tombstoned_key_is_hidden_from_the_default_view()
    {
        using var database = Seeded();

        Assert.DoesNotContain(Query(database).Items, item => item.Key == "cart.removed");
    }

    [Fact]
    public void Search_matches_keys_default_text_and_override_text()
    {
        using var database = Seeded();

        Assert.Contains(Query(database, q => q with { Query = "untranslated" }).Items, item => item.Key == "cart.untranslated");
        Assert.Contains(Query(database, q => q with { Query = "Your cart is empty" }).Items, item => item.Key == "cart.empty");
        Assert.Contains(Query(database, q => q with { Query = "Din tilpassede" }).Items, item => item.Key == "cart.overridden");
    }

    [Fact]
    public void Search_matches_text_from_a_locale_outside_the_view()
    {
        using var database = Seeded();

        // "Warenkorb" only appears in German, which is neither target nor reference here. Somebody
        // handed a German sentence still has to be able to find the key and fix the Danish.
        var row = Assert.Single(Query(database, query => query with { Query = "Warenkorb" }).Items);

        Assert.Equal("cart.empty", row.Key);
    }

    [Fact]
    public void Search_names_the_locales_it_matched_in()
    {
        using var database = Seeded();

        var row = Query(database, query => query with { Query = "Warenkorb" }).Items.Single();

        // German carries no text in this view at all, so naming it is the only thing that explains
        // why a row whose two visible columns say nothing about carts is a result.
        Assert.Equal([German], row.MatchedLocales);
        Assert.False(row.Locales.ContainsKey(German));
    }

    [Fact]
    public void Search_names_every_locale_that_matched()
    {
        using var database = Seeded();
        Insert(database, Source, "website", "cart.empty", Swedish, "Din varukorg ar tom");

        var row = Query(database, query => query with { Query = "Din " }).Items
            .Single(item => item.Key == "cart.empty");

        Assert.Equal([Danish, Swedish], row.MatchedLocales.Order());
    }

    [Fact]
    public void Search_matches_an_override_written_in_a_locale_outside_the_view()
    {
        using var database = Seeded();
        var german = Insert(database, Source, "website", "cart.stale", German, "Alter Standard");
        Override(database, german, "Von Hand geschrieben", checksumAtEdit: "checksum", version: 1);

        var row = Assert.Single(Query(database, query => query with { Query = "Von Hand" }).Items);

        Assert.Equal("cart.stale", row.Key);
        Assert.Equal([German], row.MatchedLocales);
    }

    [Fact]
    public void Search_finds_keys_in_a_third_language_without_adding_any()
    {
        using var database = Seeded();

        // "german.only" matches, and is still not in the key set. Widening it here would put a row
        // on screen with nothing in either column and no message for the editor to open.
        Assert.Empty(Query(database, query => query with { Query = "Nur Deutsch" }).Items);
    }

    [Fact]
    public void A_key_matched_by_its_name_names_no_locale()
    {
        using var database = Seeded();

        var row = Assert.Single(Query(database, query => query with { Query = "cart.untranslated" }).Items);

        // The key reads the same on every row, so reporting it as a hit in every locale would
        // answer "which language" with "all of them".
        Assert.Equal("cart.untranslated", row.Key);
        Assert.Empty(row.MatchedLocales);
    }

    [Fact]
    public void No_search_names_no_locales()
    {
        using var database = Seeded();

        Assert.All(Query(database).Items, item => Assert.Empty(item.MatchedLocales));
    }

    [Fact]
    public void Search_escapes_wildcards()
    {
        using var database = Seeded();

        Assert.Empty(Query(database, query => query with { Query = "%" }).Items);
    }

    [Fact]
    public void A_key_prefix_selects_the_node_and_its_descendants_but_not_a_similar_sibling()
    {
        using var database = Seeded();

        var keys = Query(database, query => query with { KeyPrefix = "cart" }).Items
            .Select(item => item.Key).ToArray();

        Assert.All(keys, key => Assert.StartsWith("cart.", key, StringComparison.Ordinal));
        // "cartography.title" starts with the same characters but is a different subtree.
        Assert.DoesNotContain("cartography.title", keys);
    }

    [Theory]
    [InlineData(MessageKeySort.Key)]
    [InlineData(MessageKeySort.UpdatedAt)]
    [InlineData(MessageKeySort.Status)]
    public void Paging_is_stable_across_pages_for_every_sort(MessageKeySort sort)
    {
        using var database = Seeded();

        var all = new List<string>();
        for (var page = 1; ; page++)
        {
            var result = Query(database, query => query with { Sort = sort, Page = page, PageSize = 50 });
            if (result.Items.Count == 0) break;
            all.AddRange(result.Items.Select(item => item.Key));
            if (page * 50 >= result.Total) break;
        }

        // No key repeated across pages and none dropped: the sort has a total order.
        Assert.Equal(all.Count, all.Distinct().Count());
        Assert.Equal(Query(database).Total, all.Count);
    }

    [Fact]
    public void Sorting_by_key_honours_the_requested_direction()
    {
        using var database = Seeded();

        var ascending = Query(database).Items.Select(item => item.Key).ToArray();
        var descending = Query(database, query => query with { Direction = SortDirection.Descending })
            .Items.Select(item => item.Key).ToArray();

        Assert.Equal(ascending, descending.Reverse());
    }

    [Fact]
    public void Sorting_by_status_surfaces_untranslated_keys_first()
    {
        using var database = Seeded();

        var keys = Query(database, query => query with { Sort = MessageKeySort.Status }).Items
            .Select(item => item.Key).ToArray();

        Assert.Equal("cart.untranslated", keys[0]);
    }

    [Fact]
    public void The_same_key_in_two_sources_stays_two_keys()
    {
        using var database = Seeded();
        var other = Guid.Parse("22222222-2222-2222-2222-222222222222");
        Insert(database, other, "website", "cart.empty", English, "Your cart is empty");

        var rows = Query(database).Items.Where(item => item.Key == "cart.empty").ToArray();

        Assert.Equal(2, rows.Length);
        Assert.Equal([Source, other], rows.Select(row => row.SourceId).OrderBy(id => id).ToArray());
    }

    [Fact]
    public void A_source_filter_narrows_to_that_source()
    {
        using var database = Seeded();
        var other = Guid.Parse("22222222-2222-2222-2222-222222222222");
        Insert(database, other, "website", "other.key", English, "Other");

        var page = Query(database, query => query with { SourceId = other });

        Assert.Equal(["other.key"], page.Items.Select(item => item.Key));
    }

    [Fact]
    public void Arguments_and_format_come_from_the_reference_locale()
    {
        using var database = Seeded();

        var row = Query(database).Items.Single(item => item.Key == "cart.count");

        Assert.Equal(MessageFormat.Icu, row.Format);
        Assert.Equal("plural", row.Arguments["count"]);
    }

    [Fact]
    public void Key_references_return_target_locale_ids_for_the_same_filter()
    {
        using var database = Seeded();
        var query = KeyQuery() with { Status = MessageKeyStatusFilter.Overridden };

        var references = TranslationKeyQueries.QueryKeyReferences(database, query, limit: 100);
        var expected = TranslationKeyQueries.QueryKeys(database, query).Items
            .Select(item => item.Locales[Danish].Id).ToArray();

        Assert.Equal(expected, references.Select(reference => reference.Id));
        Assert.All(references, reference => Assert.NotNull(reference.Version));
    }

    [Fact]
    public void Key_references_stop_at_the_limit()
    {
        using var database = Seeded();

        Assert.Equal(2, TranslationKeyQueries.QueryKeyReferences(database, KeyQuery(), limit: 2).Count);
    }

    [Fact]
    public void Key_references_skip_keys_the_target_locale_lacks()
    {
        using var database = Seeded();

        var references = TranslationKeyQueries.QueryKeyReferences(database, KeyQuery(), limit: 100);
        var absent = Query(database).Items.Count(item => item.StateOf(Danish) is MessageLocaleState.Absent);

        Assert.Equal(Query(database).Total - absent, references.Count);
    }

    [Fact]
    public void An_empty_database_reports_no_keys()
    {
        using var database = CreateDatabase();

        var page = TranslationKeyQueries.QueryKeys(database, KeyQuery());

        Assert.Equal(0, page.Total);
        Assert.Empty(page.Items);
    }

    private static MessageKeyQuery KeyQuery() => new(English, Danish);

    private static Core.Persistence.Page<TranslationMessageKeyView> Query(
        IDatabase database,
        Func<MessageKeyQuery, MessageKeyQuery>? adjust = null) =>
        TranslationKeyQueries.QueryKeys(database, (adjust ?? (query => query))(KeyQuery()));

    private static Database Seeded()
    {
        var database = CreateDatabase();

        Insert(database, Source, "website", "cart.empty", English, "Your cart is empty");
        Insert(database, Source, "website", "cart.empty", Danish, "Din kurv er tom");
        Insert(database, Source, "website", "cart.empty", German, "Ihr Warenkorb ist leer");

        Insert(database, Source, "website", "cart.count", English,
            "{count, plural, one {# item} other {# items}}", arguments: """{"count":"plural"}""");
        Insert(database, Source, "website", "cart.count", Danish,
            "{count, plural, one {# vare} other {# varer}}", arguments: """{"count":"plural"}""");

        // English only: the Danish editor has nothing to work from yet.
        Insert(database, Source, "website", "cart.untranslated", English, "Not yet translated");

        // Danish only: exists in the target but never shipped in the reference.
        Insert(database, Source, "website", "checkout.only", Danish, "Kun dansk");

        // German only: must never widen the key set for an English/Danish view.
        Insert(database, Source, "website", "german.only", German, "Nur Deutsch");

        var overridden = Insert(database, Source, "website", "cart.overridden", Danish, "Standard", checksum: "fresh");
        Insert(database, Source, "website", "cart.overridden", English, "Default");
        Override(database, overridden, "Din tilpassede tekst", checksumAtEdit: "fresh", version: 3);

        var stale = Insert(database, Source, "website", "cart.stale", Danish, "Ny standard", checksum: "new");
        Insert(database, Source, "website", "cart.stale", English, "New default");
        Override(database, stale, "Gammel oversaettelse", checksumAtEdit: "old", version: 1);

        var removed = Insert(database, Source, "website", "cart.removed", Danish, "Fjernet",
            state: TranslationMessageState.Missing);
        Override(database, removed, "Beholdt", checksumAtEdit: "gone", version: 1);

        Insert(database, Source, "website", "cartography.title", English, "Maps");
        Insert(database, Source, "website", "cartography.title", Danish, "Kort");

        return database;
    }

    private static Database CreateDatabase()
    {
        var connection = new SqliteConnection("Data Source=:memory:");
        connection.Open();
        var database = new Database(connection, DatabaseType.SQLite);
        database.Execute($"""
            CREATE TABLE {Constants.Tables.Messages} (
                Id TEXT PRIMARY KEY, SourceId TEXT, Namespace TEXT, [Key] TEXT, Locale TEXT,
                DefaultValue TEXT, Format TEXT, ArgumentSignature TEXT, Description TEXT,
                SourceRevision TEXT, DefaultChecksum TEXT, PreviousDefaultChecksum TEXT,
                FirstSeenAt TEXT, LastSeenAt TEXT, State TEXT)
            """);
        database.Execute($"""
            CREATE TABLE {Constants.Tables.Overrides} (
                MessageId TEXT PRIMARY KEY, Value TEXT, SourceChecksumAtEdit TEXT, Version INTEGER,
                CreatedAt TEXT, CreatedBy TEXT, UpdatedAt TEXT, UpdatedBy TEXT)
            """);
        return database;
    }

    private static Guid Insert(
        IDatabase database,
        Guid sourceId,
        string messageNamespace,
        string key,
        string locale,
        string defaultValue,
        string arguments = "{}",
        string checksum = "checksum",
        TranslationMessageState state = TranslationMessageState.Active)
    {
        var id = Guid.NewGuid();
        database.Execute($"""
            INSERT INTO {Constants.Tables.Messages}
                (Id, SourceId, Namespace, [Key], Locale, DefaultValue, Format, ArgumentSignature,
                 SourceRevision, DefaultChecksum, FirstSeenAt, LastSeenAt, State)
            VALUES (@0, @1, @2, @3, @4, @5, @6, @7, @8, @9, @10, @10, @11)
            """,
            id, sourceId, messageNamespace, key, locale, defaultValue, MessageFormat.Icu.ToString(),
            arguments, "revision", checksum, DateTime.UnixEpoch, state.ToString());
        return id;
    }

    private static void Override(IDatabase database, Guid messageId, string value, string checksumAtEdit, long version) =>
        database.Execute($"""
            INSERT INTO {Constants.Tables.Overrides}
                (MessageId, Value, SourceChecksumAtEdit, Version, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy)
            VALUES (@0, @1, @2, @3, @4, @5, @4, @5)
            """,
            messageId, value, checksumAtEdit, version, DateTime.UnixEpoch.AddDays(version), "editor");
}
