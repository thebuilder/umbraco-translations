using NPoco;

namespace TheBuilder.Translations.Persistence;

internal static class TranslationSynchronizationHistory
{
    internal static bool TryInsertFailure(IDatabase database, SyncRow row)
    {
        var inserted = database.Execute($"""
            INSERT INTO {Constants.Tables.Syncs}
                (Id, SourceId, Revision, StartedAt, CompletedAt, Status, AddedCount, ChangedCount, MissingCount, InvalidCount, Error)
            SELECT @0, @1, @2, @3, @4, @5, @6, @7, @8, @9, @10
            WHERE EXISTS (SELECT 1 FROM {Constants.Tables.Sources} WHERE Id = @1)
            """,
            row.Id, row.SourceId, row.Revision, row.StartedAt, row.CompletedAt, row.Status,
            row.AddedCount, row.ChangedCount, row.MissingCount, row.InvalidCount,
            row.Error is null ? DBNull.Value : row.Error);
        return inserted == 1;
    }
}
