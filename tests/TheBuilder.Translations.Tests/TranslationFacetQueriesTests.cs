using Microsoft.Data.Sqlite;
using NPoco;
using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Persistence;
using TheBuilder.Translations.Persistence;

namespace TheBuilder.Translations.Tests;

public sealed class TranslationFacetQueriesTests
{
    [Fact]
    public void Projects_output_groups_and_all_status_counts()
    {
        using var database = CreateDatabase();
        _ = InsertMessage(database, "da", "website", "one", MessageFormat.Icu, TranslationMessageState.Active, "a");
        var overridden = InsertMessage(database, "da", "website", "two", MessageFormat.PlainText, TranslationMessageState.Active, "b");
        var review = InsertMessage(database, "en", "app", "three", MessageFormat.I18NextV4, TranslationMessageState.Active, "new");
        var missing = InsertMessage(database, "en", "removed", "four", MessageFormat.I18NextV4, TranslationMessageState.Missing, "d");
        InsertOverride(database, overridden, "b");
        InsertOverride(database, review, "old");
        InsertOverride(database, missing, "d");

        var data = TranslationFacetQueries.Read(database);

        Assert.Equal(1, data.StatusCounts[MessageStatusFilter.Default]);
        Assert.Equal(2, data.StatusCounts[MessageStatusFilter.Overridden]);
        Assert.Equal(1, data.StatusCounts[MessageStatusFilter.NeedsReview]);
        Assert.Equal(1, data.StatusCounts[MessageStatusFilter.Missing]);
        Assert.Equal(2, data.OutputGroups.Count);
        Assert.Contains(data.OutputGroups, group => group.Locale == "da" && group.Namespace == "website" && group.MessageFormats.Count == 2);
        Assert.DoesNotContain(data.OutputGroups, group => group.Namespace == "removed");
    }

    [Fact]
    public void Counts_coverage_per_locale_and_ignores_removed_messages()
    {
        using var database = CreateDatabase();
        var source = Guid.NewGuid();
        InsertMessage(database, "en", "website", "greeting", MessageFormat.Icu, TranslationMessageState.Active, "a", source);
        InsertMessage(database, "en", "website", "farewell", MessageFormat.Icu, TranslationMessageState.Active, "b", source);
        // "farewell" has no Danish row at all, so Danish covers one of the two keys.
        var danish = InsertMessage(database, "da", "website", "greeting", MessageFormat.Icu, TranslationMessageState.Active, "a", source);
        // Removed messages must not inflate the key set or any locale's coverage.
        InsertMessage(database, "en", "website", "gone", MessageFormat.Icu, TranslationMessageState.Missing, "c", source);
        InsertOverride(database, danish, "stale");

        var data = TranslationFacetQueries.Read(database);
        var english = data.Locales.Single(locale => locale.Locale == "en");
        var dansk = data.Locales.Single(locale => locale.Locale == "da");

        Assert.Equal(2, data.TotalKeys);
        Assert.Equal(2, english.MessageCount);
        Assert.Equal(0, english.AbsentKeyCount(data.TotalKeys));
        Assert.Equal(1, dansk.MessageCount);
        Assert.Equal(1, dansk.AbsentKeyCount(data.TotalKeys));
        Assert.Equal(1, dansk.OverriddenCount);
        Assert.Equal(1, dansk.NeedsReviewCount);
    }

    [Fact]
    public void The_same_key_in_several_locales_counts_once_toward_the_key_set()
    {
        using var database = CreateDatabase();
        var source = Guid.NewGuid();
        foreach (var locale in new[] { "en", "da", "de" })
            InsertMessage(database, locale, "website", "greeting", MessageFormat.Icu, TranslationMessageState.Active, "a", source);

        var data = TranslationFacetQueries.Read(database);

        Assert.Equal(1, data.TotalKeys);
        Assert.All(data.Locales, locale => Assert.Equal(0, locale.AbsentKeyCount(data.TotalKeys)));
    }

    [Fact]
    public void The_same_key_in_two_sources_counts_twice()
    {
        using var database = CreateDatabase();
        InsertMessage(database, "en", "website", "greeting", MessageFormat.Icu, TranslationMessageState.Active, "a", Guid.NewGuid());
        InsertMessage(database, "en", "website", "greeting", MessageFormat.Icu, TranslationMessageState.Active, "a", Guid.NewGuid());

        Assert.Equal(2, TranslationFacetQueries.Read(database).TotalKeys);
    }

    private static Database CreateDatabase()
    {
        var connection = new SqliteConnection("Data Source=:memory:");
        connection.Open();
        var database = new Database(connection, DatabaseType.SQLite);
        database.Execute($"CREATE TABLE {Constants.Tables.Messages} (Id TEXT PRIMARY KEY, SourceId TEXT, Locale TEXT, Namespace TEXT, [Key] TEXT, Format TEXT, State TEXT, DefaultChecksum TEXT)");
        database.Execute($"CREATE TABLE {Constants.Tables.Overrides} (MessageId TEXT PRIMARY KEY, SourceChecksumAtEdit TEXT)");
        return database;
    }

    private static Guid InsertMessage(
        IDatabase database, string locale, string messageNamespace, string key,
        MessageFormat format, TranslationMessageState state, string checksum, Guid? sourceId = null)
    {
        var id = Guid.NewGuid();
        database.Execute(
            $"INSERT INTO {Constants.Tables.Messages} (Id, SourceId, Locale, Namespace, [Key], Format, State, DefaultChecksum) VALUES (@0, @1, @2, @3, @4, @5, @6, @7)",
            id, sourceId ?? Guid.NewGuid(), locale, messageNamespace, key, format.ToString(), state.ToString(), checksum);
        return id;
    }

    private static void InsertOverride(IDatabase database, Guid messageId, string sourceChecksum) =>
        database.Execute($"INSERT INTO {Constants.Tables.Overrides} (MessageId, SourceChecksumAtEdit) VALUES (@0, @1)", messageId, sourceChecksum);
}
