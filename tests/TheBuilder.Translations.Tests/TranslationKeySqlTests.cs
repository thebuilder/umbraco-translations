using TheBuilder.Translations.Core.Persistence;
using TheBuilder.Translations.Persistence;

namespace TheBuilder.Translations.Tests;

/// <summary>
/// Guards the shape constraints that a real database cannot catch here, because the SQLite suite
/// would happily run SQL that SQL Server rejects.
/// </summary>
public sealed class TranslationKeySqlTests
{
    private static MessageKeyQuery Query() => new("en-US", "da-DK");

    [Fact]
    public void Having_repeats_the_aggregates_instead_of_referencing_select_aliases()
    {
        var sql = TranslationKeySql.Keys(Query()).SQL;
        var having = sql[sql.IndexOf("HAVING", StringComparison.Ordinal)..];

        // SQLite tolerates an alias in HAVING; SQL Server does not. Referencing one here would pass
        // every test in this suite and fail against SQL Server in production.
        foreach (var alias in new[] { "HasTarget", "HasLive", "TargetRemoved", "TargetOverridden", "TargetNeedsReview" })
            Assert.DoesNotContain($" {alias} ", having, StringComparison.Ordinal);
        Assert.Contains("MAX(CASE WHEN", having, StringComparison.Ordinal);
    }

    [Fact]
    public void The_statement_starts_with_select_so_npoco_can_page_it()
    {
        // PagingHelper.SplitSQL rejects a leading WITH, which is why no CTE is used.
        Assert.StartsWith("SELECT", TranslationKeySql.Keys(Query()).SQL.TrimStart(), StringComparison.Ordinal);
    }

    [Fact]
    public void The_count_wraps_the_grouped_query_in_a_derived_table()
    {
        var sql = TranslationKeySql.KeyCount(Query()).SQL;

        // COUNT(*) applied directly to a GROUP BY counts rows per group, not groups.
        Assert.Contains("SELECT COUNT(*) FROM (", sql, StringComparison.Ordinal);
        Assert.Contains("GROUP BY", sql, StringComparison.Ordinal);
        Assert.DoesNotContain("ORDER BY", sql, StringComparison.Ordinal);
    }

    [Fact]
    public void Search_and_status_predicates_stay_out_of_the_where_clause()
    {
        var query = Query() with { Query = "cart", Status = MessageKeyStatusFilter.Overridden };
        var sql = TranslationKeySql.Keys(query).SQL;
        var where = sql[sql.IndexOf("WHERE", StringComparison.Ordinal)..sql.IndexOf("GROUP BY", StringComparison.Ordinal)];

        // A text predicate in WHERE would drop rows before aggregation and corrupt every MAX(CASE).
        Assert.DoesNotContain("LIKE", where, StringComparison.Ordinal);
        Assert.DoesNotContain("MAX(", where, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(MessageKeySort.Key)]
    [InlineData(MessageKeySort.UpdatedAt)]
    [InlineData(MessageKeySort.Status)]
    public void Every_sort_ends_with_a_key_tiebreaker(MessageKeySort sort)
    {
        var sql = TranslationKeySql.Keys(Query() with { Sort = sort }).SQL;
        var orderBy = sql[sql.IndexOf("ORDER BY", StringComparison.Ordinal)..].TrimEnd();

        // Without a total order, offset paging can repeat or skip rows between pages.
        Assert.EndsWith("m.[Key]", orderBy, StringComparison.Ordinal);
    }

    [Fact]
    public void User_supplied_values_are_parameterised_rather_than_interpolated()
    {
        var query = Query() with
        {
            Namespace = "web'site",
            KeyPrefix = "cart",
            Query = "O'Brien",
            CompareLocales = ["de-DE"],
        };

        var sql = TranslationKeySql.Keys(query).SQL;

        Assert.DoesNotContain("O'Brien", sql, StringComparison.Ordinal);
        Assert.DoesNotContain("web'site", sql, StringComparison.Ordinal);
        Assert.Contains(TranslationKeySql.Keys(query).Arguments, argument => Equals(argument, "web'site"));
    }

    [Fact]
    public void A_compare_locale_is_parameterised_in_the_locale_row_query()
    {
        var query = Query() with { CompareLocales = ["de-DE"] };

        var sql = TranslationKeySql.LocaleRows(query, [Guid.NewGuid()], ["website"], ["cart.empty"]);

        Assert.DoesNotContain("'de-DE'", sql.SQL, StringComparison.Ordinal);
        Assert.Contains(sql.Arguments, argument => Equals(argument, "de-DE"));
    }

    [Fact]
    public void The_search_predicate_looks_outside_the_key_set()
    {
        var sql = TranslationKeySql.Keys(Query() with { Query = "Warenkorb" }).SQL;
        var having = sql[sql.IndexOf("HAVING", StringComparison.Ordinal)..];

        // An aggregate would only ever see the locales the key-set WHERE let through, so the
        // predicate has to reach the key's own rows again through a correlated subquery.
        Assert.Contains("EXISTS (SELECT 1", having, StringComparison.Ordinal);
        Assert.Contains("sm.SourceId = m.SourceId", having, StringComparison.Ordinal);
        Assert.Contains("sm.Namespace = m.Namespace", having, StringComparison.Ordinal);
        Assert.Contains("sm.[Key] = m.[Key]", having, StringComparison.Ordinal);
        // Correlated on identity and nothing else. A locale restriction here would be the aggregate
        // again with more words, and a third language's sentence would still find nothing.
        Assert.DoesNotContain("sm.Locale", having, StringComparison.Ordinal);
        Assert.DoesNotContain("MAX(CASE WHEN sm", having, StringComparison.Ordinal);
    }

    [Fact]
    public void The_key_set_is_still_the_reference_and_target_locales_when_searching()
    {
        var sql = TranslationKeySql.Keys(Query() with { Query = "Warenkorb" });
        var where = sql.SQL[sql.SQL.IndexOf("WHERE", StringComparison.Ordinal)..sql.SQL.IndexOf("GROUP BY", StringComparison.Ordinal)];

        // Searching widens what is looked at, never what is listed: a key only a third language
        // has is still a key this view has no column to show it in and no message to open.
        Assert.Matches(@"m\.Locale IN \(@\d+,@\d+\)", where);
        Assert.Contains(sql.Arguments, argument => Equals(argument, "en-US"));
        Assert.Contains(sql.Arguments, argument => Equals(argument, "da-DK"));
    }

    [Fact]
    public void The_locale_row_query_reports_which_locales_matched()
    {
        var sql = TranslationKeySql.LocaleRows(
            Query() with { Query = "Warenkorb" }, [Guid.NewGuid()], ["website"], ["cart.empty"]);

        // Computed from the raw columns rather than the CASE-guarded ones, so a locale whose text
        // is never returned can still be named as the place the term was found.
        Assert.Matches(@"m\.DefaultValue LIKE @\d+", sql.SQL);
        Assert.Matches(@"o\.Value LIKE @\d+", sql.SQL);
        Assert.Contains("END AS Matched", sql.SQL, StringComparison.Ordinal);
        Assert.DoesNotContain("Warenkorb", sql.SQL, StringComparison.Ordinal);
        Assert.Contains(sql.Arguments, argument => Equals(argument, "%Warenkorb%"));

        // The key reads the same on every row of a key, so a hit in it names no language.
        Assert.DoesNotContain("m.[Key] LIKE", sql.SQL, StringComparison.Ordinal);
    }

    [Fact]
    public void The_locale_row_query_carries_no_search_parameter_when_nothing_was_searched_for()
    {
        var sql = TranslationKeySql.LocaleRows(Query(), [Guid.NewGuid()], ["website"], ["cart.empty"]);

        // A bound parameter the statement never names is an argument-count mismatch waiting to
        // happen, so the column collapses to a constant instead.
        Assert.Contains("0 AS Matched", sql.SQL, StringComparison.Ordinal);
        Assert.DoesNotContain("LIKE", sql.SQL, StringComparison.Ordinal);
        // Two detail locales, a source, a namespace and a key.
        Assert.Equal(5, sql.Arguments.Length);
    }

    [Fact]
    public void The_locale_row_query_is_not_filtered_by_locale()
    {
        var sql = TranslationKeySql.LocaleRows(Query(), [Guid.NewGuid()], ["website"], ["cart.empty"]).SQL;
        var where = sql[sql.IndexOf("WHERE", StringComparison.Ordinal)..];

        // Filtering by locale here would remove exactly the rows that produce whole-locale coverage.
        Assert.DoesNotContain("m.Locale IN", where, StringComparison.Ordinal);
        Assert.DoesNotContain("m.Locale =", where, StringComparison.Ordinal);
    }

    [Fact]
    public void The_page_size_cap_keeps_the_locale_query_inside_the_parameter_limit()
    {
        // Each key contributes a key, a namespace and a source parameter at worst, against SQL
        // Server's limit of 2100 parameters in one command.
        Assert.True(TranslationKeySql.MaximumPageSize * 3 < 2_000);
        Assert.Contains(TranslationKeySql.MaximumPageSize, MessageQueryValidation.AllowedPageSizes);
    }

    [Fact]
    public void Every_like_is_paired_with_an_escape_clause()
    {
        var query = Query() with { Query = "100%", KeyPrefix = "cart" };
        var sql = TranslationKeySql.Keys(query).SQL;

        Assert.Equal(
            Occurrences(sql, "LIKE "),
            Occurrences(sql, SqlLikePattern.EscapeClause.TrimStart()));
    }

    private static int Occurrences(string haystack, string needle)
    {
        var count = 0;
        for (var index = haystack.IndexOf(needle, StringComparison.Ordinal); index >= 0;
             index = haystack.IndexOf(needle, index + needle.Length, StringComparison.Ordinal))
            count++;
        return count;
    }
}
