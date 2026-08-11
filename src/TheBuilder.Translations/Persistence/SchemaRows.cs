using NPoco;
using Umbraco.Cms.Infrastructure.Persistence.DatabaseAnnotations;

namespace TheBuilder.Translations.Persistence;

[TableName(Constants.Tables.Sources), PrimaryKey(nameof(Id), AutoIncrement = false), ExplicitColumns]
internal sealed class SourceRow
{
    [Column(nameof(Id)), PrimaryKeyColumn(AutoIncrement = false)] public Guid Id { get; set; }
    [Column(nameof(Alias)), Length(100)] public string Alias { get; set; } = string.Empty;
    [Column(nameof(DisplayName)), Length(200)] public string DisplayName { get; set; } = string.Empty;
    [Column(nameof(TransportKind)), Length(50)] public string TransportKind { get; set; } = string.Empty;
    [Column(nameof(TransportConfiguration)), SpecialDbType(SpecialDbTypes.NVARCHARMAX)] public string TransportConfiguration { get; set; } = string.Empty;
    [Column(nameof(ParserKind)), Length(50)] public string ParserKind { get; set; } = string.Empty;
    [Column(nameof(ParserConfiguration)), SpecialDbType(SpecialDbTypes.NVARCHARMAX)] public string ParserConfiguration { get; set; } = string.Empty;
    [Column(nameof(Enabled))] public bool Enabled { get; set; }
    [Column(nameof(LastSuccessfulRevision)), NullSetting(NullSetting = NullSettings.Null)] public string? LastSuccessfulRevision { get; set; }
    [Column(nameof(LastSuccessfulSync)), NullSetting(NullSetting = NullSettings.Null)] public DateTime? LastSuccessfulSync { get; set; }
    [Column(nameof(CreatedAt))] public DateTime CreatedAt { get; set; }
    [Column(nameof(UpdatedAt))] public DateTime UpdatedAt { get; set; }
    [Column(nameof(SyncLeaseId)), NullSetting(NullSetting = NullSettings.Null)] public Guid? SyncLeaseId { get; set; }
    [Column(nameof(SyncLeaseExpiresAt)), NullSetting(NullSetting = NullSettings.Null)] public DateTime? SyncLeaseExpiresAt { get; set; }
}

[TableName(Constants.Tables.Messages), PrimaryKey(nameof(Id), AutoIncrement = false), ExplicitColumns]
internal class MessageRow
{
    [Column(nameof(Id)), PrimaryKeyColumn(AutoIncrement = false)] public Guid Id { get; set; }
    [Column(nameof(SourceId))] public Guid SourceId { get; set; }
    [Column(nameof(Namespace)), Length(200)] public string Namespace { get; set; } = string.Empty;
    [Column(nameof(Key)), Length(500)] public string Key { get; set; } = string.Empty;
    [Column(nameof(Locale)), Length(30)] public string Locale { get; set; } = string.Empty;
    [Column(nameof(DefaultValue)), SpecialDbType(SpecialDbTypes.NVARCHARMAX)] public string DefaultValue { get; set; } = string.Empty;
    [Column(nameof(Format)), Length(30)] public string Format { get; set; } = string.Empty;
    [Column(nameof(ArgumentSignature)), SpecialDbType(SpecialDbTypes.NVARCHARMAX)] public string ArgumentSignature { get; set; } = "{}";
    [Column(nameof(Description)), SpecialDbType(SpecialDbTypes.NVARCHARMAX), NullSetting(NullSetting = NullSettings.Null)] public string? Description { get; set; }
    [Column(nameof(SourceRevision)), Length(128)] public string SourceRevision { get; set; } = string.Empty;
    [Column(nameof(DefaultChecksum)), Length(64)] public string DefaultChecksum { get; set; } = string.Empty;
    [Column(nameof(PreviousDefaultChecksum)), Length(64), NullSetting(NullSetting = NullSettings.Null)] public string? PreviousDefaultChecksum { get; set; }
    [Column(nameof(FirstSeenAt))] public DateTime FirstSeenAt { get; set; }
    [Column(nameof(LastSeenAt))] public DateTime LastSeenAt { get; set; }
    [Column(nameof(State)), Length(30)] public string State { get; set; } = string.Empty;
}

internal sealed class OutputEndpointRow
{
    public string Locale { get; set; } = string.Empty;
    public string Namespace { get; set; } = string.Empty;
    public string Format { get; set; } = string.Empty;
}

internal sealed class FacetCountRow
{
    public int DefaultCount { get; set; }
    public int OverriddenCount { get; set; }
    public int NeedsReviewCount { get; set; }
    public int MissingCount { get; set; }
}

[TableName(Constants.Tables.Overrides), PrimaryKey(nameof(MessageId), AutoIncrement = false), ExplicitColumns]
internal sealed class OverrideRow
{
    [Column(nameof(MessageId)), PrimaryKeyColumn(AutoIncrement = false)] public Guid MessageId { get; set; }
    [Column(nameof(Value)), SpecialDbType(SpecialDbTypes.NVARCHARMAX)] public string Value { get; set; } = string.Empty;
    [Column(nameof(SourceChecksumAtEdit)), Length(64)] public string SourceChecksumAtEdit { get; set; } = string.Empty;
    [Column(nameof(Version))] public long Version { get; set; }
    [Column(nameof(CreatedAt))] public DateTime CreatedAt { get; set; }
    [Column(nameof(CreatedBy)), Length(200)] public string CreatedBy { get; set; } = string.Empty;
    [Column(nameof(UpdatedAt))] public DateTime UpdatedAt { get; set; }
    [Column(nameof(UpdatedBy)), Length(200)] public string UpdatedBy { get; set; } = string.Empty;
}

[TableName(Constants.Tables.Syncs), PrimaryKey(nameof(Id), AutoIncrement = false), ExplicitColumns]
internal sealed class SyncRow
{
    [Column(nameof(Id)), PrimaryKeyColumn(AutoIncrement = false)] public Guid Id { get; set; }
    [Column(nameof(SourceId))] public Guid SourceId { get; set; }
    [Column(nameof(Revision)), Length(128)] public string Revision { get; set; } = string.Empty;
    [Column(nameof(StartedAt))] public DateTime StartedAt { get; set; }
    [Column(nameof(CompletedAt))] public DateTime CompletedAt { get; set; }
    [Column(nameof(Status)), Length(30)] public string Status { get; set; } = string.Empty;
    [Column(nameof(AddedCount))] public int AddedCount { get; set; }
    [Column(nameof(ChangedCount))] public int ChangedCount { get; set; }
    [Column(nameof(MissingCount))] public int MissingCount { get; set; }
    [Column(nameof(InvalidCount))] public int InvalidCount { get; set; }
    [Column(nameof(Error)), SpecialDbType(SpecialDbTypes.NVARCHARMAX), NullSetting(NullSetting = NullSettings.Null)] public string? Error { get; set; }
}
