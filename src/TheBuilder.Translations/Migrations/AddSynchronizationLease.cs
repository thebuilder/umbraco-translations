using Umbraco.Cms.Infrastructure.Migrations;
using NPoco;

namespace TheBuilder.Translations.Migrations;

internal sealed class AddSynchronizationLease(IMigrationContext context) : AsyncMigrationBase(context)
{
    protected override Task MigrateAsync()
    {
        if (DatabaseType == NPoco.DatabaseType.SQLite)
        {
            MigrateSqlite(Database);
            return Task.CompletedTask;
        }

        if (!ColumnExists(Constants.Tables.Sources, "SyncLeaseId"))
            Alter.Table(Constants.Tables.Sources).AddColumn("SyncLeaseId").AsGuid().Nullable().Do();
        if (!ColumnExists(Constants.Tables.Sources, "SyncLeaseExpiresAt"))
            Alter.Table(Constants.Tables.Sources).AddColumn("SyncLeaseExpiresAt").AsDateTime().Nullable().Do();
        return Task.CompletedTask;
    }

    internal static void MigrateSqlite(IDatabase database)
    {
        var columns = database.Fetch<string>($"SELECT name FROM pragma_table_info('{Constants.Tables.Sources}')").ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (!columns.Contains("SyncLeaseId"))
            database.Execute($"ALTER TABLE {Constants.Tables.Sources} ADD COLUMN SyncLeaseId TEXT NULL");
        if (!columns.Contains("SyncLeaseExpiresAt"))
            database.Execute($"ALTER TABLE {Constants.Tables.Sources} ADD COLUMN SyncLeaseExpiresAt TEXT NULL");
    }
}
