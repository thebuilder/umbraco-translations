using TheBuilder.Translations.Core.Messages;
using Umbraco.Cms.Infrastructure.Migrations;

namespace TheBuilder.Translations.Migrations;

internal sealed class DeleteUnoverriddenRemovedMessages(IMigrationContext context) : AsyncMigrationBase(context)
{
    protected override Task MigrateAsync()
    {
        Execute.Sql($"""
            DELETE FROM {Constants.Tables.Messages}
            WHERE State = '{TranslationMessageState.Missing}'
              AND NOT EXISTS (
                  SELECT 1
                  FROM {Constants.Tables.Overrides} o
                  WHERE o.MessageId = {Constants.Tables.Messages}.Id
              )
            """).Do();
        return Task.CompletedTask;
    }
}
