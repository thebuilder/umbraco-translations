using System.Text.Json.Serialization;

namespace TheBuilder.Translations.Core.Synchronization;

public sealed record TranslationSyncResult(
    Guid SyncId,
    Guid SourceId,
    string Revision,
    DateTimeOffset StartedAt,
    DateTimeOffset CompletedAt,
    TranslationSyncStatus Status,
    int AddedCount,
    int ChangedCount,
    int MissingCount,
    int InvalidCount,
    string? Error = null);

[JsonConverter(typeof(JsonStringEnumConverter<TranslationSyncStatus>))]
public enum TranslationSyncStatus
{
    Running,
    Succeeded,
    Failed,
    NotModified,
}
