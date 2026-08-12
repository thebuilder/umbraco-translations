namespace TheBuilder.Translations.Persistence;

/// <summary>
/// Builds LIKE patterns from user supplied text. Without escaping, a search for "%" matches every
/// row and forces a full scan of every text column, and "_" silently matches any character.
/// </summary>
internal static class SqlLikePattern
{
    /// <summary>
    /// Appended to every LIKE that consumes a pattern from <see cref="Contains"/> or
    /// <see cref="StartsWith"/>. The escape character is doubled because NPoco passes the SQL
    /// through <see cref="string"/> formatting untouched, so a single backslash is preserved.
    /// </summary>
    public const string EscapeClause = @" ESCAPE '\'";

    public static string Contains(string value) => $"%{Escape(value)}%";

    public static string StartsWith(string value) => $"{Escape(value)}%";

    // Only the escape character and the two wildcards SQLite documents for ESCAPE are escaped.
    // SQL Server also treats '[' as a wildcard, but escaping it is undefined behaviour on SQLite,
    // and a stray character class on a parameterised value is a cosmetic search quirk rather than
    // the full-scan hazard that '%' is.
    private static string Escape(string value) => value
        .Replace(@"\", @"\\", StringComparison.Ordinal)
        .Replace("%", @"\%", StringComparison.Ordinal)
        .Replace("_", @"\_", StringComparison.Ordinal);
}
