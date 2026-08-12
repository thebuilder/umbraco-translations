using System.Text;
using NPoco;
using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Persistence;

namespace TheBuilder.Translations.Persistence;

/// <summary>
/// Builds the key-centric queries. Paging is over distinct keys, so the locale dimension is folded
/// into aggregates and the statement groups by (SourceId, Namespace, Key).
///
/// Parameters are named and passed as a dictionary. NPoco maps every occurrence of a name to one
/// argument and expands a collection into a placeholder list, which is what lets the aggregates
/// below be plain constants shared verbatim between SELECT, HAVING and ORDER BY.
///
/// Four constraints shape the SQL:
///
/// 1. Search and status predicates live in HAVING, never WHERE. A WHERE text predicate would drop
///    rows before aggregation and corrupt every MAX(CASE ...) for that key.
/// 2. HAVING repeats the aggregate expressions instead of referencing the SELECT aliases. SQLite
///    accepts aliases there, SQL Server does not. ORDER BY may use them; both accept that.
/// 3. The statement must start with SELECT. NPoco's paging splitter rejects a leading WITH, which
///    rules out a CTE.
/// 4. Every sort ends with a key tiebreaker, without which offset paging can repeat or skip rows.
/// </summary>
internal static class TranslationKeySql
{
    /// <summary>
    /// Caps the parameter count of <see cref="LocaleRows"/>. Each key on a page contributes a key
    /// parameter plus its namespace and source, against SQL Server's limit of 2100 in one command.
    /// Raising this requires chunking that query first.
    /// </summary>
    public const int MaximumPageSize = 200;

    private const string HasTarget = "MAX(CASE WHEN m.Locale = @target THEN 1 ELSE 0 END)";
    private const string HasLive = "MAX(CASE WHEN m.State <> @missing THEN 1 ELSE 0 END)";
    private const string TargetRemoved = "MAX(CASE WHEN m.Locale = @target AND m.State = @missing THEN 1 ELSE 0 END)";
    private const string TargetOverridden = "MAX(CASE WHEN m.Locale = @target AND o.MessageId IS NOT NULL THEN 1 ELSE 0 END)";
    private const string TargetNeedsReview =
        "MAX(CASE WHEN m.Locale = @target AND o.MessageId IS NOT NULL AND o.SourceChecksumAtEdit <> m.DefaultChecksum THEN 1 ELSE 0 END)";
    private const string TargetUpdatedAt = "MAX(CASE WHEN m.Locale = @target THEN o.UpdatedAt END)";

    /// <summary>
    /// Ranks a key by how much attention its target locale needs, so sorting by status surfaces
    /// untranslated keys first rather than ordering by an enum's declaration order.
    /// </summary>
    private const string StatusRank = $"""
        (CASE WHEN {HasTarget} = 0 THEN 0
              WHEN {TargetRemoved} = 1 THEN 1
              WHEN {TargetNeedsReview} = 1 THEN 2
              WHEN {TargetOverridden} = 1 THEN 3
              ELSE 4 END)
        """;

    private const string SearchMatches = $"""
        MAX(CASE WHEN m.[Key] LIKE @search{SqlLikePattern.EscapeClause}
                   OR m.DefaultValue LIKE @search{SqlLikePattern.EscapeClause}
                   OR o.Value LIKE @search{SqlLikePattern.EscapeClause} THEN 1 ELSE 0 END) = 1
        """;

    /// <summary>The page of keys. Pass <paramref name="ordered"/> as false when wrapping for a count.</summary>
    public static Sql Keys(MessageKeyQuery query, bool ordered = true)
    {
        var arguments = new Dictionary<string, object>
        {
            ["target"] = query.TargetLocale,
            ["missing"] = TranslationMessageState.Missing.ToString(),
            // The key set is the reference and target locales only. A compare locale adds a
            // read-only column and must not drag in keys neither main locale has.
            ["keySetLocales"] = query.KeySetLocales,
        };

        var sql = new StringBuilder($"""
            SELECT m.SourceId AS SourceId,
                   m.Namespace AS Namespace,
                   m.[Key] AS [Key],
                   {HasTarget} AS HasTarget,
                   {TargetRemoved} AS TargetRemoved,
                   {TargetOverridden} AS TargetOverridden,
                   {TargetNeedsReview} AS TargetNeedsReview,
                   {TargetUpdatedAt} AS TargetUpdatedAt,
                   {StatusRank} AS StatusRank
            FROM {Constants.Tables.Messages} m
            LEFT JOIN {Constants.Tables.Overrides} o ON o.MessageId = m.Id
            WHERE m.Locale IN (@keySetLocales)
            """);

        AppendScope(sql, arguments, query);
        sql.AppendLine().Append("GROUP BY m.SourceId, m.Namespace, m.[Key]");
        sql.AppendLine().Append($"HAVING {Having(arguments, query)}");
        if (ordered) sql.AppendLine().Append(OrderBy(query));

        return new Sql(sql.ToString(), arguments);
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
    ///
    /// Three IN lists rather than an OR-chain of triples, because that seeks the leading columns of
    /// IX_TranslationMessage_Identity where a long OR-chain degrades to a scan. The cross product
    /// can over-fetch, so callers narrow to the exact triples afterwards.
    /// </summary>
    public static Sql LocaleRows(
        MessageKeyQuery query,
        IReadOnlyCollection<Guid> sourceIds,
        IReadOnlyCollection<string> namespaces,
        IReadOnlyCollection<string> keys)
    {
        ArgumentOutOfRangeException.ThrowIfZero(keys.Count);

        const string detail = "m.Locale IN (@detailLocales)";
        return new Sql($"""
            SELECT m.Id AS Id,
                   m.SourceId AS SourceId,
                   m.Namespace AS Namespace,
                   m.[Key] AS [Key],
                   m.Locale AS Locale,
                   m.State AS State,
                   m.Format AS Format,
                   CASE WHEN {detail} THEN m.DefaultValue END AS DefaultValue,
                   CASE WHEN {detail} THEN m.ArgumentSignature END AS ArgumentSignature,
                   CASE WHEN {detail} THEN o.Value END AS OverrideValue,
                   CASE WHEN o.MessageId IS NULL THEN 0 ELSE 1 END AS HasOverride,
                   CASE WHEN o.MessageId IS NOT NULL AND o.SourceChecksumAtEdit <> m.DefaultChecksum THEN 1 ELSE 0 END AS NeedsReview,
                   o.Version AS Version,
                   o.UpdatedAt AS UpdatedAt,
                   o.UpdatedBy AS UpdatedBy
            FROM {Constants.Tables.Messages} m
            LEFT JOIN {Constants.Tables.Overrides} o ON o.MessageId = m.Id
            WHERE m.SourceId IN (@sourceIds)
              AND m.Namespace IN (@namespaces)
              AND m.[Key] IN (@keys)
            ORDER BY m.Namespace, m.[Key], m.Locale
            """,
            new Dictionary<string, object>
            {
                ["detailLocales"] = query.DetailLocales,
                ["sourceIds"] = sourceIds,
                ["namespaces"] = namespaces,
                ["keys"] = keys,
            });
    }

    private static void AppendScope(StringBuilder sql, Dictionary<string, object> arguments, MessageKeyQuery query)
    {
        if (query.SourceId is { } sourceId)
        {
            sql.AppendLine().Append("AND m.SourceId = @sourceId");
            arguments["sourceId"] = sourceId;
        }

        if (!string.IsNullOrWhiteSpace(query.Namespace))
        {
            sql.AppendLine().Append("AND m.Namespace = @namespace");
            arguments["namespace"] = query.Namespace;
        }

        if (!string.IsNullOrWhiteSpace(query.KeyPrefix))
        {
            // The prefix names a node in the key tree, so it matches that node and everything
            // beneath it, never a sibling that merely starts with the same characters.
            sql.AppendLine().Append($"AND (m.[Key] = @keyPrefix OR m.[Key] LIKE @keyPrefixLike{SqlLikePattern.EscapeClause})");
            arguments["keyPrefix"] = query.KeyPrefix;
            arguments["keyPrefixLike"] = SqlLikePattern.StartsWith($"{query.KeyPrefix}.");
        }
    }

    private static string Having(Dictionary<string, object> arguments, MessageKeyQuery query)
    {
        var clauses = new List<string>();

        if (!string.IsNullOrWhiteSpace(query.Query))
        {
            clauses.Add(SearchMatches);
            arguments["search"] = SqlLikePattern.Contains(query.Query);
        }

        clauses.Add(query.Status switch
        {
            MessageKeyStatusFilter.Absent => $"{HasTarget} = 0 AND {HasLive} = 1",
            MessageKeyStatusFilter.Default => $"{HasTarget} = 1 AND {TargetRemoved} = 0 AND {TargetOverridden} = 0",
            MessageKeyStatusFilter.Overridden => $"{TargetOverridden} = 1 AND {TargetRemoved} = 0",
            // A tombstone whose override predates its removal has a stale checksum, but it is
            // removed rather than awaiting review.
            MessageKeyStatusFilter.NeedsReview => $"{TargetNeedsReview} = 1 AND {TargetRemoved} = 0",
            MessageKeyStatusFilter.Removed => $"{TargetRemoved} = 1",
            // A key whose every row is a tombstone is not part of the working set.
            _ => $"{HasLive} = 1",
        });

        return string.Join(" AND ", clauses);
    }

    private static string OrderBy(MessageKeyQuery query)
    {
        var direction = query.Direction is SortDirection.Descending ? " DESC" : string.Empty;
        return query.Sort switch
        {
            MessageKeySort.UpdatedAt => $"ORDER BY TargetUpdatedAt{direction}, m.Namespace, m.[Key]",
            MessageKeySort.Status => $"ORDER BY StatusRank{direction}, m.Namespace, m.[Key]",
            _ => $"ORDER BY m.Namespace{direction}, m.[Key]{direction}",
        };
    }
}
