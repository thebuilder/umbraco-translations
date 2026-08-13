using NPoco;
using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Output;
using TheBuilder.Translations.Core.Persistence;

namespace TheBuilder.Translations.Persistence;

internal static class TranslationSql
{
    public const string MessageSelect = $"""
        SELECT m.*,
               o.Value AS OverrideValue,
               o.SourceChecksumAtEdit,
               o.Version AS OverrideVersion,
               o.CreatedAt AS OverrideCreatedAt,
               o.CreatedBy AS OverrideCreatedBy,
               o.UpdatedAt AS OverrideUpdatedAt,
               o.UpdatedBy AS OverrideUpdatedBy
        FROM {Constants.Tables.Messages} m
        LEFT JOIN {Constants.Tables.Overrides} o ON o.MessageId = m.Id
        """;

    public static Sql Messages(MessageQuery query)
    {
        var sql = new Sql(MessageSelect + " WHERE 1 = 1");
        if (!string.IsNullOrWhiteSpace(query.Locale)) sql.Append("AND m.Locale = @0", query.Locale);
        if (!string.IsNullOrWhiteSpace(query.Namespace)) sql.Append("AND m.Namespace = @0", query.Namespace);
        if (!string.IsNullOrWhiteSpace(query.Query))
            sql.Append(
                $"AND (m.[Key] LIKE @0{SqlLikePattern.EscapeClause} OR m.DefaultValue LIKE @0{SqlLikePattern.EscapeClause} OR o.Value LIKE @0{SqlLikePattern.EscapeClause})",
                SqlLikePattern.Contains(query.Query));
        if (query.Status is not MessageStatusFilter.Missing)
            sql.Append("AND m.State <> @0", TranslationMessageState.Missing.ToString());
        switch (query.Status)
        {
            case MessageStatusFilter.Default: sql.Append("AND o.MessageId IS NULL"); break;
            case MessageStatusFilter.Overridden: sql.Append("AND o.MessageId IS NOT NULL"); break;
            case MessageStatusFilter.NeedsReview: sql.Append("AND o.MessageId IS NOT NULL AND o.SourceChecksumAtEdit <> m.DefaultChecksum"); break;
            case MessageStatusFilter.Missing: sql.Append("AND m.State = @0 AND o.MessageId IS NOT NULL", TranslationMessageState.Missing.ToString()); break;
        }
        return sql.Append("ORDER BY m.Namespace, m.[Key], m.Locale");
    }

    public static Sql OutputMessages(string locale, string messageNamespace)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(locale);
        ArgumentException.ThrowIfNullOrWhiteSpace(messageNamespace);

        var sql = new Sql(MessageSelect + " WHERE m.Locale = @0 AND m.Namespace = @1 AND m.State <> @2", locale, messageNamespace, TranslationMessageState.Missing.ToString());
        return sql.Append("ORDER BY m.Namespace, m.[Key]");
    }
}
