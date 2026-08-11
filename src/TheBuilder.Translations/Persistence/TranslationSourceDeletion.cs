using NPoco;

namespace TheBuilder.Translations.Persistence;

internal static class TranslationSourceDeletion
{
    internal static void Delete(IDatabase database, Guid sourceId)
    {
        database.Execute($"DELETE FROM {Constants.Tables.Overrides} WHERE MessageId IN (SELECT Id FROM {Constants.Tables.Messages} WHERE SourceId = @0)", sourceId);
        database.Execute($"DELETE FROM {Constants.Tables.Messages} WHERE SourceId = @0", sourceId);
        database.Execute($"DELETE FROM {Constants.Tables.Syncs} WHERE SourceId = @0", sourceId);
        database.Execute($"DELETE FROM {Constants.Tables.Sources} WHERE Id = @0", sourceId);
    }
}
