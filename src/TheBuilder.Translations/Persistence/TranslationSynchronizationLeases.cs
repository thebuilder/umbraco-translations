using NPoco;
using TheBuilder.Translations.Core.Persistence;

namespace TheBuilder.Translations.Persistence;

internal static class TranslationSynchronizationLeases
{
    internal static TranslationSynchronizationLease? TryAcquire(IDatabase database, Guid sourceId, DateTimeOffset now, TimeSpan duration)
    {
        var lease = new TranslationSynchronizationLease(sourceId, Guid.NewGuid());
        var updated = database.Execute($"""
            UPDATE {Constants.Tables.Sources}
            SET SyncLeaseId = @0, SyncLeaseExpiresAt = @1
            WHERE Id = @2
              AND (SyncLeaseId IS NULL OR SyncLeaseExpiresAt < @3)
            """, lease.LeaseId, now.Add(duration).UtcDateTime, sourceId, now.UtcDateTime);
        return updated == 1 ? lease : null;
    }

    internal static void Release(IDatabase database, TranslationSynchronizationLease lease) =>
        database.Execute($"""
            UPDATE {Constants.Tables.Sources}
            SET SyncLeaseId = NULL, SyncLeaseExpiresAt = NULL
            WHERE Id = @0 AND SyncLeaseId = @1
            """, lease.SourceId, lease.LeaseId);

    internal static bool Renew(IDatabase database, TranslationSynchronizationLease lease, DateTimeOffset now, TimeSpan duration) =>
        database.Execute($"""
            UPDATE {Constants.Tables.Sources}
            SET SyncLeaseExpiresAt = @0
            WHERE Id = @1 AND SyncLeaseId = @2 AND SyncLeaseExpiresAt >= @3
            """, now.Add(duration).UtcDateTime, lease.SourceId, lease.LeaseId, now.UtcDateTime) == 1;
}
