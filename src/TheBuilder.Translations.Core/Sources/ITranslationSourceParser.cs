namespace TheBuilder.Translations.Core.Sources;

public interface ITranslationSourceParser
{
    IAsyncEnumerable<TranslationSourceMessage> ParseAsync(
        TranslationSourcePayload payload,
        NestedJsonParserOptions options,
        CancellationToken cancellationToken);
}
