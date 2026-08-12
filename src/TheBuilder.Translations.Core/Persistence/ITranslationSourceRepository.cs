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

    /// <summary>Live sync state for every source, so the editor can show it without polling each one.</summary>
    Task<IReadOnlyList<TranslationSourceStatus>> GetSourceStatusesAsync(CancellationToken cancellationToken);
}

/// <summary>
/// Kept separate from <see cref="TranslationSourceDefinition"/> because that record is the write
/// shape passed to <c>SaveSourceAsync</c>, which deliberately preserves lease columns from the
/// persisted row rather than accepting them from the caller.
/// </summary>
public sealed record TranslationSourceStatus(
    Guid SourceId,
    bool SyncInProgress,
    DateTimeOffset? SyncLeaseExpiresAt,
    TranslationSyncResult? LastSync);
