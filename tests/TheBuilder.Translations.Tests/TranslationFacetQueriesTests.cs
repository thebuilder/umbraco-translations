using Microsoft.Data.Sqlite;
using NPoco;
using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Persistence;
using TheBuilder.Translations.Persistence;

namespace TheBuilder.Translations.Tests;

public sealed class TranslationFacetQueriesTests
{
    [Fact]
    public void Projects_output_groups_and_all_status_counts_in_two_queries()
    {
        using var connection = new SqliteConnection("Data Source=:memory:");
        connection.Open();
        using var database = new Database(connection, DatabaseType.SQLite);
        database.Execute($"CREATE TABLE {Constants.Tables.Messages} (Id TEXT PRIMARY KEY, Locale TEXT, Namespace TEXT, Format TEXT, State TEXT, DefaultChecksum TEXT)");
        database.Execute($"CREATE TABLE {Constants.Tables.Overrides} (MessageId TEXT PRIMARY KEY, SourceChecksumAtEdit TEXT)");
        _ = InsertMessage(database, "da", "website", MessageFormat.Icu, TranslationMessageState.Active, "a");
        var overridden = InsertMessage(database, "da", "website", MessageFormat.PlainText, TranslationMessageState.Active, "b");
        var review = InsertMessage(database, "en", "app", MessageFormat.I18NextV4, TranslationMessageState.Active, "new");
        var missing = InsertMessage(database, "en", "removed", MessageFormat.I18NextV4, TranslationMessageState.Missing, "d");
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

    private static Guid InsertMessage(IDatabase database, string locale, string messageNamespace, MessageFormat format, TranslationMessageState state, string checksum)
    {
        var id = Guid.NewGuid();
        database.Execute($"INSERT INTO {Constants.Tables.Messages} (Id, Locale, Namespace, Format, State, DefaultChecksum) VALUES (@0, @1, @2, @3, @4, @5)",
            id, locale, messageNamespace, format.ToString(), state.ToString(), checksum);
        return id;
    }

    private static void InsertOverride(IDatabase database, Guid messageId, string sourceChecksum) =>
        database.Execute($"INSERT INTO {Constants.Tables.Overrides} (MessageId, SourceChecksumAtEdit) VALUES (@0, @1)", messageId, sourceChecksum);
}
