using TheBuilder.Translations.Core.Sources;
using TheBuilder.Translations.Core.Synchronization;

namespace TheBuilder.Translations.Core.Persistence;

public interface ITranslationSourceRepository
{
    Task<IReadOnlyList<TranslationSourceDefinition>> GetSourcesAsync(CancellationToken cancellationToken);
    Task<TranslationSourceDefinition?> GetSourceAsync(Guid sourceId, CancellationToken cancellationToken);
    Task<TranslationSourceDefinition?> GetSourceByAliasAsync(string alias, CancellationToken cancellationToken);
    Task SaveSourceAsync(TranslationSourceDefinition source, CancellationToken cancellationToken);
    Task DeleteSourceAsync(Guid sourceId, CancellationToken cancellationToken);
    Task<IReadOnlyList<TranslationSyncResult>> GetSyncHistoryAsync(Guid sourceId, CancellationToken cancellationToken);
}
