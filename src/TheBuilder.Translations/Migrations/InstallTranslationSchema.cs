using Umbraco.Cms.Infrastructure.Migrations;
using TheBuilder.Translations.Persistence;

namespace TheBuilder.Translations.Migrations;

internal sealed class InstallTranslationSchema(IMigrationContext context) : AsyncMigrationBase(context)
{
    protected override Task MigrateAsync()
    {
        CreateIfMissing<SourceRow>(Constants.Tables.Sources);
        CreateIfMissing<MessageRow>(Constants.Tables.Messages);
        CreateIfMissing<OverrideRow>(Constants.Tables.Overrides);
        CreateIfMissing<SyncRow>(Constants.Tables.Syncs);

        Execute.Sql($"CREATE UNIQUE INDEX IX_TranslationMessage_Identity ON {Constants.Tables.Messages} (SourceId, Namespace, [Key], Locale)").Do();
        Execute.Sql($"CREATE UNIQUE INDEX IX_TranslationSource_Alias ON {Constants.Tables.Sources} (Alias)").Do();
        return Task.CompletedTask;
    }

    private void CreateIfMissing<T>(string tableName)
    {
        if (!TableExists(tableName))
            Create.Table<T>().Do();
    }
}
