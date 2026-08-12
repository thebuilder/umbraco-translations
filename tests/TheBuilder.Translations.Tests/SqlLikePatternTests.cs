using Microsoft.Data.Sqlite;
using NPoco;
using TheBuilder.Translations.Core.Persistence;
using TheBuilder.Translations.Persistence;

namespace TheBuilder.Translations.Tests;

public sealed class SqlLikePatternTests
{
    [Fact]
    public void Search_escapes_wildcards_and_pairs_every_like_with_an_escape_clause()
    {
        var sql = TranslationSql.Messages(new MessageQuery(Query: "100%"));

        Assert.Contains(sql.Arguments, argument => Equals(argument, @"%100\%%"));
        Assert.Equal(
            CountOccurrences(sql.SQL, "LIKE @0"),
            CountOccurrences(sql.SQL, $"LIKE @0{SqlLikePattern.EscapeClause}"));
    }

    [Theory]
    [InlineData("100%", "100%")]
    [InlineData("a_b", "a_b")]
    [InlineData(@"back\slash", @"back\slash")]
    public void Wildcards_in_the_search_term_match_only_themselves(string search, string expectedMatch)
    {
        using var connection = new SqliteConnection("Data Source=:memory:");
        connection.Open();
        using var database = new Database(connection, DatabaseType.SQLite);
        database.Execute("CREATE TABLE Sample (Value TEXT)");
        foreach (var value in new[] { "100%", "1000", "a_b", "axb", @"back\slash", "backslash" })
            database.Execute("INSERT INTO Sample (Value) VALUES (@0)", value);

        var matches = database.Fetch<string>(
            $"SELECT Value FROM Sample WHERE Value LIKE @0{SqlLikePattern.EscapeClause}",
            SqlLikePattern.Contains(search));

        Assert.Equal([expectedMatch], matches);
    }

    [Fact]
    public void A_bare_wildcard_search_no_longer_matches_every_row()
    {
        using var connection = new SqliteConnection("Data Source=:memory:");
        connection.Open();
        using var database = new Database(connection, DatabaseType.SQLite);
        database.Execute("CREATE TABLE Sample (Value TEXT)");
        foreach (var value in new[] { "alpha", "beta", "50% off" })
            database.Execute("INSERT INTO Sample (Value) VALUES (@0)", value);

        var matches = database.Fetch<string>(
            $"SELECT Value FROM Sample WHERE Value LIKE @0{SqlLikePattern.EscapeClause}",
            SqlLikePattern.Contains("%"));

        Assert.Equal(["50% off"], matches);
    }

    private static int CountOccurrences(string haystack, string needle)
    {
        var count = 0;
        for (var index = haystack.IndexOf(needle, StringComparison.Ordinal); index >= 0;
             index = haystack.IndexOf(needle, index + needle.Length, StringComparison.Ordinal))
            count++;
        return count;
    }
}
