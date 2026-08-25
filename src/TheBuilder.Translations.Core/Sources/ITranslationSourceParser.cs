namespace TheBuilder.Translations.Core.Sources;

public interface ITranslationSourceParser
{
    IAsyncEnumerable<TranslationSourceMessage> ParseAsync(
        TranslationSourcePayload payload,
        TranslationParserOptions options,
        CancellationToken cancellationToken);
}
