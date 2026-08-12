namespace TheBuilder.Translations.Core.Persistence;

/// <summary>
/// Key-centric reads for the backoffice editor.
///
/// Separate from <see cref="ITranslationMessageRepository"/> on purpose: that interface is public
/// API of a shipped package and describes single messages, while these queries are a distinct
/// concern that would break any external implementer if bolted on.
/// </summary>
public interface ITranslationEditorRepository
{
    /// <summary>
    /// The locales that actually have messages, ordered. Separate from the facet data because
    /// resolving which locale to show is a per-request question and the facets carry four
    /// aggregates the answer does not need.
    /// </summary>
    Task<IReadOnlyList<string>> GetLocalesAsync(CancellationToken cancellationToken);

    Task<Page<TranslationMessageKeyView>> QueryKeysAsync(MessageKeyQuery query, CancellationToken cancellationToken);

    /// <summary>
    /// The target-locale message ids matching a query, without any text. Backs "select all N
    /// matching": bulk writes take explicit id and version pairs, which is what makes a concurrent
    /// edit visible, so a filter-scoped selection has to be materialised before it can be applied.
    /// Capped, because a selection larger than the cap is a migration script rather than an edit.
    /// </summary>
    Task<IReadOnlyList<MessageKeyReference>> QueryKeyReferencesAsync(
        MessageKeyQuery query,
        int limit,
        CancellationToken cancellationToken);
}
