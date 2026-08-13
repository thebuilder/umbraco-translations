namespace TheBuilder.Translations.Core.Persistence;

/// <summary>
/// Shared paging rules. Controllers call <see cref="Describe"/> to turn a violation into a 400;
/// the repository keeps throwing so a bad query cannot reach the database through another path.
/// </summary>
public static class MessageQueryValidation
{
    public static readonly IReadOnlyList<int> AllowedPageSizes = [50, 100, 200];

    /// <summary>
    /// Paging past this point is a client bug rather than navigation, and an unbounded page number
    /// turns into an unbounded OFFSET.
    /// </summary>
    public const int MaximumPage = 10_000;

    /// <summary>Returns a message describing the first violation, or <c>null</c> when valid.</summary>
    public static string? Describe(int page, int pageSize)
    {
        if (page < 1)
            return "Page must be at least 1.";
        if (page > MaximumPage)
            return $"Page must be at most {MaximumPage}. Narrow the filters instead of paging further.";
        if (!AllowedPageSizes.Contains(pageSize))
            return $"Page size must be one of {string.Join(", ", AllowedPageSizes)}.";
        return null;
    }

    public static string? Describe(MessageQuery query) => Describe(query.Page, query.PageSize);

    public static void Ensure(MessageQuery query)
    {
        if (Describe(query) is { } error)
            throw new ArgumentOutOfRangeException(nameof(query), error);
    }
}
