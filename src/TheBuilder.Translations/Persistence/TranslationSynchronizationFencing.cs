using NPoco;

namespace TheBuilder.Translations.Persistence;

internal static class TranslationSynchronizationFencing
{
    internal static bool TryComplete(
        IDatabase database,
        Guid sourceId,
        Guid leaseId,
        string revision,
        DateTime completedAt) =>
        database.Execute($"""
            UPDATE {Constants.Tables.Sources}
            SET LastSuccessfulRevision = @0, LastSuccessfulSync = @1, UpdatedAt = @1
            WHERE Id = @2 AND SyncLeaseId = @3
            """, revision, completedAt, sourceId, leaseId) == 1;
}
