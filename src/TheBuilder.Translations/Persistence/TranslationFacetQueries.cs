using NPoco;
using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Persistence;

namespace TheBuilder.Translations.Persistence;

internal static class TranslationFacetQueries
{
    internal static TranslationFacetData Read(IDatabase database)
    {
        var missingState = TranslationMessageState.Missing.ToString();
        var outputRows = database.Fetch<OutputEndpointRow>(
            $"SELECT DISTINCT Locale, Namespace, Format FROM {Constants.Tables.Messages} WHERE State <> @0 ORDER BY Locale, Namespace, Format",
            missingState);
        var countRow = database.Single<FacetCountRow>($"""
            SELECT
                COALESCE(SUM(CASE WHEN o.MessageId IS NULL AND m.State <> @0 THEN 1 ELSE 0 END), 0) AS DefaultCount,
                COALESCE(SUM(CASE WHEN o.MessageId IS NOT NULL AND m.State <> @0 THEN 1 ELSE 0 END), 0) AS OverriddenCount,
                COALESCE(SUM(CASE WHEN o.MessageId IS NOT NULL AND o.SourceChecksumAtEdit <> m.DefaultChecksum AND m.State <> @0 THEN 1 ELSE 0 END), 0) AS NeedsReviewCount,
                COALESCE(SUM(CASE WHEN o.MessageId IS NOT NULL AND m.State = @0 THEN 1 ELSE 0 END), 0) AS MissingCount
            FROM {Constants.Tables.Messages} m
            LEFT JOIN {Constants.Tables.Overrides} o ON o.MessageId = m.Id
            """, missingState);
        var localeRows = database.Fetch<LocaleUsageRow>($"""
            SELECT m.Locale AS Locale,
                   COUNT(*) AS MessageCount,
                   COALESCE(SUM(CASE WHEN o.MessageId IS NOT NULL THEN 1 ELSE 0 END), 0) AS OverriddenCount,
                   COALESCE(SUM(CASE WHEN o.MessageId IS NOT NULL AND o.SourceChecksumAtEdit <> m.DefaultChecksum THEN 1 ELSE 0 END), 0) AS NeedsReviewCount
            FROM {Constants.Tables.Messages} m
            LEFT JOIN {Constants.Tables.Overrides} o ON o.MessageId = m.Id
            WHERE m.State <> @0
            GROUP BY m.Locale
            ORDER BY m.Locale
            """, missingState);
        // Distinct keys across every locale. A locale's own message count is already its distinct
        // key count, so this is the only extra aggregate the "absent in this locale" figure needs.
        var totalKeys = database.ExecuteScalar<int>($"""
            SELECT COUNT(*) FROM (
                SELECT m.SourceId, m.Namespace, m.[Key]
                FROM {Constants.Tables.Messages} m
                WHERE m.State <> @0
                GROUP BY m.SourceId, m.Namespace, m.[Key]
            ) keys
            """, missingState);
        var outputGroups = outputRows
            .GroupBy(row => (row.Locale, row.Namespace))
            .Select(group => new TranslationOutputGroup(
                group.Key.Locale,
                group.Key.Namespace,
                group.Select(row => Enum.Parse<MessageFormat>(row.Format)).Distinct().Order().ToArray()))
            .ToArray();
        IReadOnlyDictionary<MessageStatusFilter, int> counts = new Dictionary<MessageStatusFilter, int>
        {
            [MessageStatusFilter.Default] = countRow.DefaultCount,
            [MessageStatusFilter.Overridden] = countRow.OverriddenCount,
            [MessageStatusFilter.NeedsReview] = countRow.NeedsReviewCount,
            [MessageStatusFilter.Missing] = countRow.MissingCount,
        };
        var locales = localeRows
            .Select(row => new TranslationLocaleUsage(row.Locale, row.MessageCount, row.OverriddenCount, row.NeedsReviewCount))
            .ToArray();
        return new(outputGroups, counts, locales, totalKeys);
    }
}
