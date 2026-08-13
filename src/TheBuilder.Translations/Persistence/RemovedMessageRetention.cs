using TheBuilder.Translations.Core.Messages;

namespace TheBuilder.Translations.Persistence;

internal enum RemovedMessageAction
{
    Delete,
    Tombstone,
    None,
}

internal static class RemovedMessageRetention
{
    public static RemovedMessageAction Decide(TranslationMessageState state, bool hasOverride) =>
        !hasOverride
            ? RemovedMessageAction.Delete
            : state is TranslationMessageState.Missing
                ? RemovedMessageAction.None
                : RemovedMessageAction.Tombstone;

    // A tombstone survives only for its override, and an authored row exists only because of one,
    // so resetting either leaves nothing worth keeping.
    public static bool DeleteAfterOverrideReset(TranslationMessageState state) =>
        state is TranslationMessageState.Missing or TranslationMessageState.Authored;
}
