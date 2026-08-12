using System.Text.Json;
using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Persistence;
using TheBuilder.Translations.Core.Sources;
using TheBuilder.Translations.Core.Synchronization;

namespace TheBuilder.Translations.Persistence;

internal static class TranslationRowMapper
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static string SerializeArguments(IReadOnlyDictionary<string, string> arguments) =>
        JsonSerializer.Serialize(arguments, JsonOptions);

    public static IReadOnlyDictionary<string, string> DeserializeArguments(string json) =>
        Deserialize<Dictionary<string, string>>(json, "message argument signature");

    public static SourceRow ToRow(TranslationSourceDefinition source, DateTime createdAt, DateTime updatedAt) => new()
    {
        Id = source.Id,
        Alias = source.Alias,
        DisplayName = source.DisplayName,
        TransportKind = "http",
        TransportConfiguration = JsonSerializer.Serialize(source.Transport, JsonOptions),
        ParserKind = "nested-json",
        ParserConfiguration = JsonSerializer.Serialize(source.Parser, JsonOptions),
        Enabled = source.Enabled,
        LastSuccessfulRevision = source.LastSuccessfulRevision,
        LastSuccessfulSync = source.LastSuccessfulSync?.UtcDateTime,
        CreatedAt = createdAt,
        UpdatedAt = updatedAt,
    };

    public static TranslationSourceDefinition ToDomain(SourceRow row)
    {
        EnsureSupportedParserKind(row.ParserKind);
        return new(
            row.Id,
            row.Alias,
            row.DisplayName,
            row.Enabled,
            Deserialize<HttpTranslationTransportOptions>(row.TransportConfiguration, "transport configuration"),
            Deserialize<NestedJsonParserOptions>(row.ParserConfiguration, "parser configuration"),
            row.LastSuccessfulRevision,
            row.LastSuccessfulSync is null ? null : AsOffset(row.LastSuccessfulSync.Value));
    }

    private static void EnsureSupportedParserKind(string parserKind)
    {
        if (parserKind is not ("nested-json" or "next-intl" or "i18next-v4"))
            throw new InvalidOperationException($"Unsupported source parser kind '{parserKind}'.");
    }

    public static MessageRow ToRow(Guid sourceId, TranslationSourceMessage message, string revision, DateTime now) => new()
    {
        Id = Guid.NewGuid(),
        SourceId = sourceId,
        Namespace = message.Namespace,
        Key = message.Key,
        Locale = message.Locale,
        DefaultValue = message.Value,
        Format = message.Format.ToString(),
        ArgumentSignature = SerializeArguments(message.Arguments),
        SourceRevision = revision,
        DefaultChecksum = message.Checksum,
        FirstSeenAt = now,
        LastSeenAt = now,
        State = TranslationMessageState.Active.ToString(),
    };

    public static TranslationMessage ToDomain(MessageRow row) => new(
        row.Id,
        new(row.SourceId, row.Namespace, row.Key, row.Locale),
        row.DefaultValue,
        Enum.Parse<MessageFormat>(row.Format),
        Deserialize<Dictionary<string, string>>(row.ArgumentSignature, "message argument signature"),
        row.Description,
        row.SourceRevision,
        row.DefaultChecksum,
        row.PreviousDefaultChecksum,
        AsOffset(row.FirstSeenAt),
        AsOffset(row.LastSeenAt),
        Enum.Parse<TranslationMessageState>(row.State));

    public static TranslationOverride ToDomain(OverrideRow row) => new(
        row.MessageId,
        row.Value,
        row.SourceChecksumAtEdit,
        row.Version,
        AsOffset(row.CreatedAt),
        row.CreatedBy,
        AsOffset(row.UpdatedAt),
        row.UpdatedBy);

    public static TranslationMessageView ToDomain(MessageViewRow row)
    {
        var message = ToDomain((MessageRow)row);
        if (row.OverrideVersion is null)
            return new(message, null);

        var translationOverride = new TranslationOverride(
            row.Id,
            Required(row.OverrideValue, nameof(row.OverrideValue)),
            Required(row.SourceChecksumAtEdit, nameof(row.SourceChecksumAtEdit)),
            row.OverrideVersion.Value,
            AsOffset(Required(row.OverrideCreatedAt, nameof(row.OverrideCreatedAt))),
            Required(row.OverrideCreatedBy, nameof(row.OverrideCreatedBy)),
            AsOffset(Required(row.OverrideUpdatedAt, nameof(row.OverrideUpdatedAt))),
            Required(row.OverrideUpdatedBy, nameof(row.OverrideUpdatedBy)));
        return new(message, translationOverride);
    }

    public static SyncRow ToRow(TranslationSyncResult result) => new()
    {
        Id = result.SyncId,
        SourceId = result.SourceId,
        Revision = result.Revision,
        StartedAt = result.StartedAt.UtcDateTime,
        CompletedAt = result.CompletedAt.UtcDateTime,
        Status = result.Status.ToString(),
        AddedCount = result.AddedCount,
        ChangedCount = result.ChangedCount,
        MissingCount = result.MissingCount,
        InvalidCount = result.InvalidCount,
        Error = result.Error,
    };

    public static TranslationSyncResult ToDomain(SyncRow row) => new(
        row.Id,
        row.SourceId,
        row.Revision,
        AsOffset(row.StartedAt),
        AsOffset(row.CompletedAt),
        Enum.Parse<TranslationSyncStatus>(row.Status),
        row.AddedCount,
        row.ChangedCount,
        row.MissingCount,
        row.InvalidCount,
        row.Error);

    private static T Deserialize<T>(string json, string label) =>
        JsonSerializer.Deserialize<T>(json, JsonOptions)
        ?? throw new InvalidDataException($"Stored translation {label} was empty or invalid.");

    private static T Required<T>(T? value, string column) where T : struct =>
        value ?? throw new InvalidDataException($"Stored translation override column '{column}' was unexpectedly null.");

    private static string Required(string? value, string column) =>
        value ?? throw new InvalidDataException($"Stored translation override column '{column}' was unexpectedly null.");

    private static DateTimeOffset AsOffset(DateTime value) => new(DateTime.SpecifyKind(value, DateTimeKind.Utc));
}

internal sealed class MessageViewRow : MessageRow
{
    public string? OverrideValue { get; set; }
    public string? SourceChecksumAtEdit { get; set; }
    public long? OverrideVersion { get; set; }
    public DateTime? OverrideCreatedAt { get; set; }
    public string? OverrideCreatedBy { get; set; }
    public DateTime? OverrideUpdatedAt { get; set; }
    public string? OverrideUpdatedBy { get; set; }
}
