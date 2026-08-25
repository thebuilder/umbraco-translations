namespace TheBuilder.Translations.Core.Sources;

/// <summary>
/// Reads whichever catalogue format the source publishes.
///
/// The sync engine asks for one parser and gets this, so adding a format does not reach
/// the engine, the transport or the store: what changes when a source switches from JSON to PO is
/// how its bytes are read, and nothing after that point can tell the difference.
///
/// A pair rather than a registry keyed by format. Two implementations named in one line can be
/// read at a glance, and a registry would only earn its indirection with more of them than that.
/// </summary>
public sealed class TranslationCatalogParser(NestedJsonParser json, PoParser po) : ITranslationSourceParser
{
    public IAsyncEnumerable<TranslationSourceMessage> ParseAsync(
        TranslationSourcePayload payload,
        TranslationParserOptions options,
        CancellationToken cancellationToken) =>
        For(options.SourceFormat).ParseAsync(payload, options, cancellationToken);

    private ITranslationSourceParser For(SourceFormat format) => format switch
    {
        SourceFormat.Po => po,
        _ => json,
    };
}
