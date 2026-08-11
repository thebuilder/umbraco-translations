using Microsoft.Data.Sqlite;
using NPoco;
using TheBuilder.Translations.Core.Persistence;
using TheBuilder.Translations.Migrations;
using TheBuilder.Translations.Persistence;

namespace TheBuilder.Translations.Tests;

public sealed class SynchronizationLeasePersistenceTests
{
    [Fact]
    public void SQLite_upgrade_adds_usable_lease_columns_to_the_old_schema()
    {
        using var connection = OpenConnection();
        using var database = new Database(connection, DatabaseType.SQLite);
        database.Execute($"CREATE TABLE {Constants.Tables.Sources} (Id TEXT PRIMARY KEY)");

        AddSynchronizationLease.MigrateSqlite(database);
        AddSynchronizationLease.MigrateSqlite(database);

        var columns = database.Fetch<string>($"SELECT name FROM pragma_table_info('{Constants.Tables.Sources}')");
        Assert.Contains("SyncLeaseId", columns);
        Assert.Contains("SyncLeaseExpiresAt", columns);
        var sourceId = Guid.NewGuid();
        database.Execute($"INSERT INTO {Constants.Tables.Sources} (Id) VALUES (@0)", sourceId);
        var lease = TranslationSynchronizationLeases.TryAcquire(database, sourceId, DateTimeOffset.UtcNow, TimeSpan.FromMinutes(5));
        Assert.NotNull(lease);
        Assert.True(TranslationSynchronizationLeases.Renew(database, lease, DateTimeOffset.UtcNow, TimeSpan.FromMinutes(5)));
    }

    [Fact]
    public void Configuration_update_is_rejected_while_a_sync_lease_is_active()
    {
        using var connection = OpenConnection();
        using var database = new Database(connection, DatabaseType.SQLite);
        CreateConfigurationTable(database);
        var sourceId = Guid.NewGuid();
        var staleLease = new TranslationSynchronizationLease(sourceId, Guid.NewGuid());
        var now = new DateTime(2026, 8, 11, 12, 0, 0, DateTimeKind.Utc);
        database.Execute($"INSERT INTO {Constants.Tables.Sources} (Id, Alias, DisplayName, SyncLeaseId, SyncLeaseExpiresAt) VALUES (@0, @1, @2, @3, @4)", sourceId, "source", "Original", staleLease.LeaseId, now.AddMinutes(1));
        var update = Row(sourceId, "Changed");

        Assert.False(TranslationSourceConfiguration.TryUpdate(database, update, now));
        Assert.Equal("Original", database.ExecuteScalar<string>($"SELECT DisplayName FROM {Constants.Tables.Sources} WHERE Id = @0", sourceId));

        Assert.True(TranslationSourceConfiguration.TryUpdate(database, update, now.AddMinutes(2)));
        Assert.Equal("Changed", database.ExecuteScalar<string>($"SELECT DisplayName FROM {Constants.Tables.Sources} WHERE Id = @0", sourceId));
        Assert.Null(database.ExecuteScalar<object?>($"SELECT SyncLeaseId FROM {Constants.Tables.Sources} WHERE Id = @0", sourceId));
        Assert.False(TranslationSynchronizationLeases.Renew(database, staleLease, now.AddMinutes(2), TimeSpan.FromMinutes(5)));
        Assert.False(TranslationSynchronizationFencing.TryComplete(database, sourceId, staleLease.LeaseId, "old-revision", now.AddMinutes(2)));
    }

    [Fact]
    public void A_stale_final_fence_rolls_back_prior_mutations()
    {
        var connectionString = $"Data Source=lease-fence-{Guid.NewGuid():N};Mode=Memory;Cache=Shared";
        using var anchor = new SqliteConnection(connectionString);
        anchor.Open();
        using var connection = new SqliteConnection(connectionString);
        connection.Open();
        using var database = new Database(connection, DatabaseType.SQLite);
        database.Execute($"CREATE TABLE {Constants.Tables.Sources} (Id TEXT PRIMARY KEY, DisplayName TEXT, LastSuccessfulRevision TEXT, LastSuccessfulSync TEXT, UpdatedAt TEXT, SyncLeaseId TEXT)");
        var sourceId = Guid.NewGuid();
        var activeLease = Guid.NewGuid();
        database.Execute($"INSERT INTO {Constants.Tables.Sources} (Id, DisplayName, SyncLeaseId) VALUES (@0, @1, @2)", sourceId, "Original", activeLease);

        Assert.Throws<InvalidOperationException>(() =>
        {
            using var transaction = database.GetTransaction();
            database.Execute($"UPDATE {Constants.Tables.Sources} SET DisplayName = @0 WHERE Id = @1", "Mutated", sourceId);
            if (!TranslationSynchronizationFencing.TryComplete(database, sourceId, Guid.NewGuid(), "revision", DateTime.UtcNow))
                throw new InvalidOperationException("Lease ownership was lost.");
            transaction.Complete();
        });

        using var command = anchor.CreateCommand();
        command.CommandText = $"SELECT DisplayName FROM {Constants.Tables.Sources}";
        Assert.Equal("Original", command.ExecuteScalar());
    }

    private static SqliteConnection OpenConnection()
    {
        var connection = new SqliteConnection("Data Source=:memory:");
        connection.Open();
        return connection;
    }

    private static void CreateConfigurationTable(IDatabase database) => database.Execute($"""
        CREATE TABLE {Constants.Tables.Sources} (
            Id TEXT PRIMARY KEY, Alias TEXT, DisplayName TEXT, TransportKind TEXT,
            TransportConfiguration TEXT, ParserKind TEXT, ParserConfiguration TEXT,
            Enabled INTEGER, UpdatedAt TEXT, LastSuccessfulRevision TEXT, LastSuccessfulSync TEXT,
            SyncLeaseId TEXT, SyncLeaseExpiresAt TEXT)
        """);

    private static SourceRow Row(Guid id, string displayName) => new()
    {
        Id = id,
        Alias = "source",
        DisplayName = displayName,
        TransportKind = "http",
        TransportConfiguration = "{}",
        ParserKind = "nested-json",
        ParserConfiguration = "{}",
        Enabled = true,
    };
}
