using NPoco;

namespace TheBuilder.Translations.Persistence;

internal static class TranslationSourceConfiguration
{
    internal static bool TryUpdate(IDatabase database, SourceRow row, DateTime now) =>
        database.Execute($"""
            UPDATE {Constants.Tables.Sources}
            SET Alias = @0, DisplayName = @1, TransportKind = @2, TransportConfiguration = @3,
                ParserKind = @4, ParserConfiguration = @5, Enabled = @6, UpdatedAt = @7,
                SyncLeaseId = NULL, SyncLeaseExpiresAt = NULL
            WHERE Id = @8 AND (SyncLeaseId IS NULL OR SyncLeaseExpiresAt < @7)
            """,
            row.Alias, row.DisplayName, row.TransportKind, row.TransportConfiguration,
            row.ParserKind, row.ParserConfiguration, row.Enabled, now, row.Id) == 1;
}
