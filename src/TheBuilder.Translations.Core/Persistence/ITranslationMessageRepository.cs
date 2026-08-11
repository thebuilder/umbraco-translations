using TheBuilder.Translations.Core.Output;

namespace TheBuilder.Translations.Core.Persistence;

public interface ITranslationMessageRepository
{
    Task<Page<TranslationMessageView>> QueryMessagesAsync(MessageQuery query, CancellationToken cancellationToken);
    Task<TranslationFacetData> GetFacetDataAsync(CancellationToken cancellationToken);
    Task<TranslationMessageView?> GetMessageAsync(Guid messageId, CancellationToken cancellationToken);
    Task<TranslationOverride> SaveOverrideAsync(Guid messageId, string value, long? expectedVersion, string userId, CancellationToken cancellationToken);
    Task DeleteOverrideAsync(Guid messageId, long? expectedVersion, CancellationToken cancellationToken);
    Task<IReadOnlyList<TranslationMessageView>> GetOutputMessagesAsync(string locale, string messageNamespace, CancellationToken cancellationToken);
}

public sealed class TranslationConcurrencyException(string message) : Exception(message);
