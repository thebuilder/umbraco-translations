using System.Text;
using NPoco;
using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Persistence;

namespace TheBuilder.Translations.Persistence;

/// <summary>
/// Builds the key-centric queries. Paging is over distinct keys, so the locale dimension is folded
/// into aggregates and the statement groups by (SourceId, Namespace, Key).
///
/// Four constraints shape everything here:
///
/// 1. Search and status predicates live in HAVING, never WHERE. A WHERE text predicate would drop
///    rows before aggregation and corrupt every MAX(CASE ...) for that key.
/// 2. HAVING repeats the aggregate expressions instead of referencing the SELECT aliases. SQLite
///    accepts aliases there, SQL Server does not. ORDER BY may use them; both accept that.
/// 3. The statement must start with SELECT. NPoco's paging splitter rejects a leading WITH, which
///    rules out a CTE.
/// 4. Each statement is assembled as a single string with its own parameter list rather than
///    through repeated Sql.Append, because the same parameter is referenced from several clauses
///    and append-based numbering cannot express that.
/// </summary>
internal static class TranslationKeySql
{
    /// <summary>
    /// Caps the parameter count of <see cref="LocaleRows"/>. Each key on a page contributes a key
    /// parameter plus its namespace and source, against SQL Server's limit of 2100 in one command.
    /// Raising this requires chunking that query first.
    /// </summary>
    public const int MaximumPageSize = 200;

    private static readonly string MissingState = TranslationMessageState.Missing.ToString();

    /// <summary>The page of keys. Pass <paramref name="ordered"/> as false when wrapping for a count.</summary>
    public static Sql Keys(MessageKeyQuery query, bool ordered = true)
    {
        var builder = new Statement();
        var aggregates = new Aggregates(builder, query);
        var sql = new StringBuilder();

        sql.AppendLine($"""
            SELECT m.SourceId AS SourceId,
                   m.Namespace AS Namespace,
                   m.[Key] AS [Key],
                   {aggregates.HasTarget} AS HasTarget,
                   {aggregates.TargetRemoved} AS TargetRemoved,
                   {aggregates.TargetOverridden} AS TargetOverridden,
                   {aggregates.TargetNeedsReview} AS TargetNeedsReview,
                   {aggregates.TargetUpdatedAt} AS TargetUpdatedAt,
                   {aggregates.StatusRank} AS StatusRank
            FROM {Constants.Tables.Messages} m
            LEFT JOIN {Constants.Tables.Overrides} o ON o.MessageId = m.Id
            """);

        // The key set is the reference and target locales only. A compare locale adds a read-only
        // column and must not drag in keys that neither main locale has.
        sql.AppendLine($"WHERE m.Locale IN ({builder.List(query.KeySetLocales)})");
        AppendScope(sql, builder, query);
        sql.AppendLine("GROUP BY m.SourceId, m.Namespace, m.[Key]");
        sql.AppendLine($"HAVING {Having(builder, aggregates, query)}");
        if (ordered) sql.AppendLine(OrderBy(query));

        return builder.ToSql(sql.ToString());
    }

    /// <summary>Counts distinct keys. A derived table, because COUNT(*) over a GROUP BY counts groups.</summary>
    public static Sql KeyCount(MessageKeyQuery query)
    {
        var inner = Keys(query, ordered: false);
        return new Sql($"SELECT COUNT(*) FROM ({inner.SQL}) grouped", inner.Arguments);
    }

    /// <summary>
    /// Every locale row for the keys on the page. Deliberately unfiltered by locale: that is what
    /// produces coverage for locales the caller did not ask to see. The CASE guards keep the
    /// unbounded text columns from being read for a locale that only needs a state.
    /// </summary>
    public static Sql LocaleRows(
        MessageKeyQuery query,
        IReadOnlyCollection<Guid> sourceIds,
        IReadOnlyCollection<string> namespaces,
        IReadOnlyCollection<string> keys)
    {
        var builder = new Statement();
        var detail = builder.List(query.DetailLocales);
        var sql = new StringBuilder();

        sql.AppendLine($"""
            SELECT m.Id AS Id,
                   m.SourceId AS SourceId,
                   m.Namespace AS Namespace,
                   m.[Key] AS [Key],
                   m.Locale AS Locale,
                   m.State AS State,
                   m.Format AS Format,
                   CASE WHEN m.Locale IN ({detail}) THEN m.DefaultValue END AS DefaultValue,
                   CASE WHEN m.Locale IN ({detail}) THEN m.ArgumentSignature END AS ArgumentSignature,
                   CASE WHEN m.Locale IN ({detail}) THEN o.Value END AS OverrideValue,
                   CASE WHEN o.MessageId IS NULL THEN 0 ELSE 1 END AS HasOverride,
                   CASE WHEN o.MessageId IS NOT NULL AND o.SourceChecksumAtEdit <> m.DefaultChecksum THEN 1 ELSE 0 END AS NeedsReview,
                   o.Version AS Version,
                   o.UpdatedAt AS UpdatedAt,
                   o.UpdatedBy AS UpdatedBy
            FROM {Constants.Tables.Messages} m
            LEFT JOIN {Constants.Tables.Overrides} o ON o.MessageId = m.Id
            """);

        // Three IN lists rather than an OR-chain of triples: this seeks the leading columns of
        // IX_TranslationMessage_Identity, where a long OR-chain degrades to a scan. The cross
        // product can over-fetch, so callers narrow to the exact triples afterwards.
        sql.AppendLine($"WHERE m.SourceId IN ({builder.List(sourceIds)})");
        sql.AppendLine($"AND m.Namespace IN ({builder.List(namespaces)})");
        sql.AppendLine($"AND m.[Key] IN ({builder.List(keys)})");
        sql.AppendLine("ORDER BY m.Namespace, m.[Key], m.Locale");

        return builder.ToSql(sql.ToString());
    }

    private static void AppendScope(StringBuilder sql, Statement builder, MessageKeyQuery query)
    {
        if (query.SourceId is { } sourceId)
            sql.AppendLine($"AND m.SourceId = {builder.Value(sourceId)}");
        if (!string.IsNullOrWhiteSpace(query.Namespace))
            sql.AppendLine($"AND m.Namespace = {builder.Value(query.Namespace)}");
        if (!string.IsNullOrWhiteSpace(query.KeyPrefix))
        {
            // The prefix names a node in the key tree, so it matches that node and everything
            // beneath it, never a sibling that merely starts with the same characters.
            var exact = builder.Value(query.KeyPrefix);
            var beneath = builder.Value(SqlLikePattern.StartsWith($"{query.KeyPrefix}."));
            sql.AppendLine($"AND (m.[Key] = {exact} OR m.[Key] LIKE {beneath}{SqlLikePattern.EscapeClause})");
        }
    }

    private static string Having(Statement builder, Aggregates aggregates, MessageKeyQuery query)
    {
        var clauses = new List<string>();

        if (!string.IsNullOrWhiteSpace(query.Query))
        {
            var pattern = builder.Value(SqlLikePattern.Contains(query.Query));
            var escape = SqlLikePattern.EscapeClause;
            clauses.Add($"""
                MAX(CASE WHEN m.[Key] LIKE {pattern}{escape}
                           OR m.DefaultValue LIKE {pattern}{escape}
                           OR o.Value LIKE {pattern}{escape} THEN 1 ELSE 0 END) = 1
                """);
        }

        clauses.Add(query.Status switch
        {
            // A key whose every row is a tombstone is not part of the working set.
            MessageKeyStatusFilter.Absent => $"{aggregates.HasTarget} = 0 AND {aggregates.HasLive} = 1",
            MessageKeyStatusFilter.Default =>
                $"{aggregates.HasTarget} = 1 AND {aggregates.TargetRemoved} = 0 AND {aggregates.TargetOverridden} = 0",
            MessageKeyStatusFilter.Overridden => $"{aggregates.TargetOverridden} = 1 AND {aggregates.TargetRemoved} = 0",
            // A tombstone whose override predates its removal technically has a stale checksum, but
            // it is removed, not awaiting review.
            MessageKeyStatusFilter.NeedsReview => $"{aggregates.TargetNeedsReview} = 1 AND {aggregates.TargetRemoved} = 0",
            MessageKeyStatusFilter.Removed => $"{aggregates.TargetRemoved} = 1",
            _ => $"{aggregates.HasLive} = 1",
        });

        return string.Join(" AND ", clauses);
    }

    private static string OrderBy(MessageKeyQuery query)
    {
        var direction = query.Direction is SortDirection.Descending ? " DESC" : string.Empty;
        // The trailing key tiebreaker is mandatory: without a total order, offset paging can repeat
        // or skip rows between pages.
        return query.Sort switch
        {
            MessageKeySort.UpdatedAt => $"ORDER BY TargetUpdatedAt{direction}, m.Namespace, m.[Key]",
            MessageKeySort.Status => $"ORDER BY StatusRank{direction}, m.Namespace, m.[Key]",
            _ => $"ORDER BY m.Namespace{direction}, m.[Key]{direction}",
        };
    }

    /// <summary>
    /// The aggregate expressions, bound to one statement's parameters. They are built once and
    /// reused verbatim across SELECT, HAVING and the status rank, which is what keeps the filter
    /// and the reported state from drifting apart.
    /// </summary>
    private sealed class Aggregates
    {
        public Aggregates(Statement builder, MessageKeyQuery query)
        {
            var target = builder.Value(query.TargetLocale);
            var missing = builder.Value(MissingState);

            HasTarget = $"MAX(CASE WHEN m.Locale = {target} THEN 1 ELSE 0 END)";
            HasLive = $"MAX(CASE WHEN m.State <> {missing} THEN 1 ELSE 0 END)";
            TargetRemoved = $"MAX(CASE WHEN m.Locale = {target} AND m.State = {missing} THEN 1 ELSE 0 END)";
            TargetOverridden = $"MAX(CASE WHEN m.Locale = {target} AND o.MessageId IS NOT NULL THEN 1 ELSE 0 END)";
            TargetNeedsReview =
                $"MAX(CASE WHEN m.Locale = {target} AND o.MessageId IS NOT NULL AND o.SourceChecksumAtEdit <> m.DefaultChecksum THEN 1 ELSE 0 END)";
            TargetUpdatedAt = $"MAX(CASE WHEN m.Locale = {target} THEN o.UpdatedAt END)";
            StatusRank = $"""
                (CASE WHEN {HasTarget} = 0 THEN 0
                      WHEN {TargetRemoved} = 1 THEN 1
                      WHEN {TargetNeedsReview} = 1 THEN 2
                      WHEN {TargetOverridden} = 1 THEN 3
                      ELSE 4 END)
                """;
        }

        public string HasTarget { get; }
        public string HasLive { get; }
        public string TargetRemoved { get; }
        public string TargetOverridden { get; }
        public string TargetNeedsReview { get; }
        public string TargetUpdatedAt { get; }
        public string StatusRank { get; }
    }

    /// <summary>Collects parameters so a placeholder can be referenced from several clauses.</summary>
    private sealed class Statement
    {
        private readonly List<object> _arguments = [];

        public string Value(object value)
        {
            _arguments.Add(value);
            return $"@{_arguments.Count - 1}";
        }

        public string List<T>(IReadOnlyCollection<T> values) where T : notnull =>
            values.Count == 0 ? "SELECT NULL WHERE 1 = 0" : string.Join(", ", values.Select(value => Value(value)));

        public Sql ToSql(string sql) => new(sql, [.. _arguments]);
    }
}
