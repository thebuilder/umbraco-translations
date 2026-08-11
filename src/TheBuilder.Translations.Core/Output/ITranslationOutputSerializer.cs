using TheBuilder.Translations.Core.Persistence;

namespace TheBuilder.Translations.Core.Output;

public interface ITranslationOutputSerializer
{
    string Serialize(IReadOnlyCollection<TranslationMessageView> messages, TranslationOutputMode mode);
}

public enum TranslationOutputMode
{
    Overrides,
    All,
}
