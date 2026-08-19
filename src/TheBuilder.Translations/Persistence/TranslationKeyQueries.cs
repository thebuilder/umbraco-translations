using NPoco;
using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Persistence;

// NPoco also defines Page<T>; the domain one is the return type here.
using Page = TheBuilder.Translations.Core.Persistence.Page<TheBuilder.Translations.Core.Persistence.TranslationMessageKeyView>;

namespace TheBuilder.Translations.Persistence;

/// <summary>
/// Runs the key-centric reads. Kept out of the store so the whole thing can be exercised against a
/// real SQLite database without an Umbraco scope.
/// </summary>
internal static class TranslationKeyQueries
{
    public static Page QueryKeys(IDatabase database, MessageKeyQuery query)
    {
        var total = database.ExecuteScalar<int>(TranslationKeySql.KeyCount(query));
        if (total == 0)
            return new Page([], query.Page, query.PageSize, 0);

        // SkipTake rather than Page: NPoco has no overload that takes explicit count SQL, so Page
        // would derive COUNT(*) from a GROUP BY statement and silently report the size of the first
        // group as the total.
        var skip = (query.Page - 1) * query.PageSize;
        var keys = database.SkipTake<MessageKeyRow>(skip, query.PageSize, TranslationKeySql.Keys(query));
        if (keys.Count == 0)
            return new Page([], query.Page, query.PageSize, total);

        var locales = FetchLocaleRows(database, query, keys);
        var items = keys
            .Select(key => Compose(key, locales.GetValueOrDefault(Triple.Of(key), []), query))
            .ToArray();
        return new Page(items, query.Page, query.PageSize, total);
    }

    public static IReadOnlyList<MessageKeyReference> QueryKeyReferences(
        IDatabase database,
        MessageKeyQuery query,
        int limit)
    {
        // Walks the same filter in page-sized batches so selection and display can never disagree
        // about which keys match.
        var references = new List<MessageKeyReference>();
        for (var page = 1; references.Count < limit; page++)
        {
            var batch = QueryKeys(database, query with { Page = page, PageSize = TranslationKeySql.MaximumPageSize });
            if (batch.Items.Count == 0) break;

            foreach (var item in batch.Items)
            {
                if (!item.Locales.TryGetValue(query.TargetLocale, out var target)) continue;
                references.Add(new MessageKeyReference(target.Id, target.Version));
                if (references.Count == limit) return references;
            }

            if (page * TranslationKeySql.MaximumPageSize >= batch.Total) break;
        }
        return references;
    }

    private static Dictionary<Triple, List<MessageLocaleRow>> FetchLocaleRows(
        IDatabase database,
        MessageKeyQuery query,
        IReadOnlyCollection<MessageKeyRow> keys)
    {
        var sql = TranslationKeySql.LocaleRows(
            query,
            keys.Select(key => key.SourceId).Distinct().ToArray(),
            keys.Select(key => key.Namespace).Distinct(StringComparer.Ordinal).ToArray(),
            keys.Select(key => key.Key).Distinct(StringComparer.Ordinal).ToArray());

        // The three IN lists form a cross product, so rows for combinations that were not on the
        // page can come back. Narrowing to the exact triples here is what makes that safe.
        var wanted = keys.Select(Triple.Of).ToHashSet();
        var byKey = new Dictionary<Triple, List<MessageLocaleRow>>();
        foreach (var row in database.Fetch<MessageLocaleRow>(sql))
        {
            var triple = new Triple(row.SourceId, row.Namespace, row.Key);
            if (!wanted.Contains(triple)) continue;
            if (!byKey.TryGetValue(triple, out var rows)) byKey[triple] = rows = [];
            rows.Add(row);
        }
        return byKey;
    }

    private static TranslationMessageKeyView Compose(
        MessageKeyRow key,
        IReadOnlyList<MessageLocaleRow> rows,
        MessageKeyQuery query)
    {
        var detail = query.DetailLocales.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var locales = new Dictionary<string, TranslationMessageLocaleView>(StringComparer.OrdinalIgnoreCase);
        var coverage = new Dictionary<string, MessageLocaleState>(StringComparer.OrdinalIgnoreCase);
        // Every locale row is tested against the search, including the ones that contribute nothing
        // but a state, so this can name a language whose text the response never carries.
        var matched = new List<string>();

        foreach (var row in rows)
        {
            coverage[row.Locale] = StateOf(row);
            if (row.Matched == 1) matched.Add(row.Locale);
            if (!detail.Contains(row.Locale)) continue;
            locales[row.Locale] = new TranslationMessageLocaleView(
                row.Id,
                row.Locale,
                row.DefaultValue ?? string.Empty,
                row.OverrideValue,
                row.NeedsReview == 1,
                Enum.Parse<TranslationMessageState>(row.State),
                row.Version,
                row.UpdatedAt is { } updatedAt ? new DateTimeOffset(updatedAt, TimeSpan.Zero) : null,
                row.UpdatedBy);
        }

        // A locale the caller asked about but which has no row is absent, not missing from the
        // response. Making that explicit saves every consumer from distinguishing the two.
        foreach (var locale in query.DetailLocales)
            coverage.TryAdd(locale, MessageLocaleState.Absent);

        var shape = ShapeOf(rows, query.ReferenceLocale);
        return new TranslationMessageKeyView(
            key.SourceId,
            key.Namespace,
            key.Key,
            shape is null ? MessageFormat.PlainText : Enum.Parse<MessageFormat>(shape.Format),
            shape is null ? new Dictionary<string, string>() : TranslationRowMapper.DeserializeArguments(shape.ArgumentSignature!),
            locales,
            coverage,
            matched);
    }

    private static MessageLocaleState StateOf(MessageLocaleRow row)
    {
        if (row.State == TranslationMessageState.Missing.ToString()) return MessageLocaleState.Removed;
        if (row.HasOverride == 0) return MessageLocaleState.Default;
        return row.NeedsReview == 1 ? MessageLocaleState.NeedsReview : MessageLocaleState.Overridden;
    }

    /// <summary>
    /// The row that defines the key's shape. Format and arguments must come from the same row or
    /// they can describe different messages: Format is selected for every locale, while the
    /// argument signature is nulled for locales that only contribute a coverage state.
    ///
    /// The reference locale is authoritative, falling back to any locale carrying a signature,
    /// because the reference may have no row for this key at all.
    /// </summary>
    private static MessageLocaleRow? ShapeOf(IReadOnlyList<MessageLocaleRow> rows, string referenceLocale)
    {
        var reference = rows.FirstOrDefault(row =>
            string.Equals(row.Locale, referenceLocale, StringComparison.OrdinalIgnoreCase));
        return reference?.ArgumentSignature is { Length: > 0 }
            ? reference
            : rows.FirstOrDefault(row => row.ArgumentSignature is { Length: > 0 });
    }

    /// <summary>
    /// Message identity includes the source, so two sources may legitimately define the same
    /// namespace and key. Comparison is case-insensitive because SQL Server's default collation is,
    /// and its GROUP BY would otherwise collapse rows an ordinal comparer then failed to match.
    /// </summary>
    private readonly record struct Triple(Guid SourceId, string Namespace, string Key)
    {
        public static Triple Of(MessageKeyRow row) => new(row.SourceId, row.Namespace, row.Key);

        public bool Equals(Triple other) =>
            SourceId == other.SourceId &&
            string.Equals(Namespace, other.Namespace, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(Key, other.Key, StringComparison.OrdinalIgnoreCase);

        public override int GetHashCode() => HashCode.Combine(
            SourceId,
            StringComparer.OrdinalIgnoreCase.GetHashCode(Namespace),
            StringComparer.OrdinalIgnoreCase.GetHashCode(Key));
    }
}
