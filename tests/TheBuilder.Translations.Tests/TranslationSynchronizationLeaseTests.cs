using Microsoft.Data.Sqlite;
using NPoco;
using TheBuilder.Translations.Persistence;

namespace TheBuilder.Translations.Tests;

public sealed class TranslationSynchronizationLeaseTests
{
    [Fact]
    public void Allows_one_active_lease_and_allows_takeover_after_expiry()
    {
        using var connection = new SqliteConnection("Data Source=:memory:");
        connection.Open();
        using var database = new Database(connection, DatabaseType.SQLite);
        database.Execute($"CREATE TABLE {Constants.Tables.Sources} (Id TEXT PRIMARY KEY, SyncLeaseId TEXT NULL, SyncLeaseExpiresAt TEXT NULL)");
        var sourceId = Guid.NewGuid();
        database.Execute($"INSERT INTO {Constants.Tables.Sources} (Id) VALUES (@0)", sourceId);
        var now = new DateTimeOffset(2026, 8, 11, 12, 0, 0, TimeSpan.Zero);

        var first = TranslationSynchronizationLeases.TryAcquire(database, sourceId, now, TimeSpan.FromMinutes(5));
        var overlapping = TranslationSynchronizationLeases.TryAcquire(database, sourceId, now.AddMinutes(1), TimeSpan.FromMinutes(5));
        var afterExpiry = TranslationSynchronizationLeases.TryAcquire(database, sourceId, now.AddMinutes(6), TimeSpan.FromMinutes(5));

        Assert.NotNull(first);
        Assert.Null(overlapping);
        Assert.NotNull(afterExpiry);
        TranslationSynchronizationLeases.Release(database, first);
        Assert.Null(TranslationSynchronizationLeases.TryAcquire(database, sourceId, now.AddMinutes(6), TimeSpan.FromMinutes(5)));
        TranslationSynchronizationLeases.Release(database, afterExpiry);
        Assert.NotNull(TranslationSynchronizationLeases.TryAcquire(database, sourceId, now.AddMinutes(6), TimeSpan.FromMinutes(5)));
    }

    [Fact]
    public void Renewal_extends_only_the_current_lease()
    {
        using var connection = new SqliteConnection("Data Source=:memory:");
        connection.Open();
        using var database = new Database(connection, DatabaseType.SQLite);
        database.Execute($"CREATE TABLE {Constants.Tables.Sources} (Id TEXT PRIMARY KEY, SyncLeaseId TEXT NULL, SyncLeaseExpiresAt TEXT NULL)");
        var sourceId = Guid.NewGuid();
        database.Execute($"INSERT INTO {Constants.Tables.Sources} (Id) VALUES (@0)", sourceId);
        var now = new DateTimeOffset(2026, 8, 11, 12, 0, 0, TimeSpan.Zero);
        var lease = Assert.IsType<TheBuilder.Translations.Core.Persistence.TranslationSynchronizationLease>(
            TranslationSynchronizationLeases.TryAcquire(database, sourceId, now, TimeSpan.FromMinutes(5)));

        Assert.True(TranslationSynchronizationLeases.Renew(database, lease, now.AddMinutes(4), TimeSpan.FromMinutes(5)));
        Assert.Null(TranslationSynchronizationLeases.TryAcquire(database, sourceId, now.AddMinutes(6), TimeSpan.FromMinutes(5)));
        Assert.False(TranslationSynchronizationLeases.Renew(database, lease with { LeaseId = Guid.NewGuid() }, now.AddMinutes(7), TimeSpan.FromMinutes(5)));
        Assert.NotNull(TranslationSynchronizationLeases.TryAcquire(database, sourceId, now.AddMinutes(10), TimeSpan.FromMinutes(5)));
    }
}
