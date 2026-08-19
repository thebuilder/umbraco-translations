namespace TheBuilder.Translations.Persistence;

/// <summary>One grouped key from the paged key query. The flags describe the target locale only.</summary>
internal sealed class MessageKeyRow
{
    public Guid SourceId { get; set; }
    public string Namespace { get; set; } = string.Empty;
    public string Key { get; set; } = string.Empty;
    public int HasTarget { get; set; }
    public int TargetRemoved { get; set; }
    public int TargetOverridden { get; set; }
    public int TargetNeedsReview { get; set; }
    public DateTime? TargetUpdatedAt { get; set; }
    public int StatusRank { get; set; }
}

/// <summary>
/// One locale row for a key on the page.
///
/// Deliberately not <see cref="MessageRow"/>: the query nulls the text columns for locales that
/// only contribute a coverage state, and <c>TranslationRowMapper.ToDomain</c> treats
/// <c>DefaultValue</c> and <c>ArgumentSignature</c> as non-null.
/// </summary>
internal sealed class MessageLocaleRow
{
    public Guid Id { get; set; }
    public Guid SourceId { get; set; }
    public string Namespace { get; set; } = string.Empty;
    public string Key { get; set; } = string.Empty;
    public string Locale { get; set; } = string.Empty;
    public string State { get; set; } = string.Empty;
    public string Format { get; set; } = string.Empty;
    public string? DefaultValue { get; set; }
    public string? ArgumentSignature { get; set; }
    public string? OverrideValue { get; set; }

    /// <summary>Whether this locale's own text is where the search term was found.</summary>
    public int Matched { get; set; }

    public int HasOverride { get; set; }
    public int NeedsReview { get; set; }
    public long? Version { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public string? UpdatedBy { get; set; }
}
