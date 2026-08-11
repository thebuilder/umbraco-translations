using Microsoft.Data.Sqlite;
using NPoco;
using TheBuilder.Translations.Persistence;

namespace TheBuilder.Translations.Tests;

public sealed class TranslationSourceDeletionTests
{
    [Fact]
    public void Deletes_the_source_and_all_dependents_without_touching_another_source()
    {
        using var connection = new SqliteConnection("Data Source=:memory:");
        connection.Open();
        using var database = new Database(connection, DatabaseType.SQLite);
        CreateSchema(database);
        var deletedSourceId = Guid.NewGuid();
        var retainedSourceId = Guid.NewGuid();
        var deletedMessageId = Guid.NewGuid();
        var retainedMessageId = Guid.NewGuid();
        InsertSourceGraph(database, deletedSourceId, deletedMessageId);
        InsertSourceGraph(database, retainedSourceId, retainedMessageId);

        TranslationSourceDeletion.Delete(database, deletedSourceId);
        var lateFailure = new SyncRow
        {
            Id = Guid.NewGuid(), SourceId = deletedSourceId, Revision = "revision", StartedAt = DateTime.UtcNow,
            CompletedAt = DateTime.UtcNow, Status = "Failed", Error = "Deleted while fetching",
        };

        Assert.Equal(0, database.ExecuteScalar<int>($"SELECT COUNT(*) FROM {Constants.Tables.Sources} WHERE Id = @0", deletedSourceId));
        Assert.Equal(0, database.ExecuteScalar<int>($"SELECT COUNT(*) FROM {Constants.Tables.Messages} WHERE SourceId = @0", deletedSourceId));
        Assert.Equal(0, database.ExecuteScalar<int>($"SELECT COUNT(*) FROM {Constants.Tables.Overrides} WHERE MessageId = @0", deletedMessageId));
        Assert.Equal(0, database.ExecuteScalar<int>($"SELECT COUNT(*) FROM {Constants.Tables.Syncs} WHERE SourceId = @0", deletedSourceId));
        Assert.Equal(1, database.ExecuteScalar<int>($"SELECT COUNT(*) FROM {Constants.Tables.Sources} WHERE Id = @0", retainedSourceId));
        Assert.Equal(1, database.ExecuteScalar<int>($"SELECT COUNT(*) FROM {Constants.Tables.Messages} WHERE SourceId = @0", retainedSourceId));
        Assert.Equal(1, database.ExecuteScalar<int>($"SELECT COUNT(*) FROM {Constants.Tables.Overrides} WHERE MessageId = @0", retainedMessageId));
        Assert.Equal(1, database.ExecuteScalar<int>($"SELECT COUNT(*) FROM {Constants.Tables.Syncs} WHERE SourceId = @0", retainedSourceId));
        Assert.False(TranslationSynchronizationHistory.TryInsertFailure(database, lateFailure));
        Assert.Equal(0, database.ExecuteScalar<int>($"SELECT COUNT(*) FROM {Constants.Tables.Syncs} WHERE SourceId = @0", deletedSourceId));
    }

    private static void CreateSchema(IDatabase database)
    {
        database.Execute($"CREATE TABLE {Constants.Tables.Sources} (Id TEXT PRIMARY KEY)");
        database.Execute($"CREATE TABLE {Constants.Tables.Messages} (Id TEXT PRIMARY KEY, SourceId TEXT NOT NULL)");
        database.Execute($"CREATE TABLE {Constants.Tables.Overrides} (MessageId TEXT PRIMARY KEY)");
        database.Execute($"CREATE TABLE {Constants.Tables.Syncs} (Id TEXT PRIMARY KEY, SourceId TEXT NOT NULL, Revision TEXT NULL, StartedAt TEXT NULL, CompletedAt TEXT NULL, Status TEXT NULL, AddedCount INTEGER NULL, ChangedCount INTEGER NULL, MissingCount INTEGER NULL, InvalidCount INTEGER NULL, Error TEXT NULL)");
    }

    private static void InsertSourceGraph(IDatabase database, Guid sourceId, Guid messageId)
    {
        database.Execute($"INSERT INTO {Constants.Tables.Sources} (Id) VALUES (@0)", sourceId);
        database.Execute($"INSERT INTO {Constants.Tables.Messages} (Id, SourceId) VALUES (@0, @1)", messageId, sourceId);
        database.Execute($"INSERT INTO {Constants.Tables.Overrides} (MessageId) VALUES (@0)", messageId);
        database.Execute($"INSERT INTO {Constants.Tables.Syncs} (Id, SourceId) VALUES (@0, @1)", Guid.NewGuid(), sourceId);
    }
}
