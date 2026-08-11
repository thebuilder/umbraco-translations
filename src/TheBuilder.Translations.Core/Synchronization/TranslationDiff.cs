using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Sources;

namespace TheBuilder.Translations.Core.Synchronization;

public sealed record TranslationDiff(
    IReadOnlyList<TranslationSourceMessage> Added,
    IReadOnlyList<TranslationSourceMessage> Changed,
    IReadOnlyList<TranslationMessage> Missing)
{
    public static TranslationDiff Between(
        Guid sourceId,
        IReadOnlyCollection<TranslationMessage> current,
        IReadOnlyCollection<TranslationSourceMessage> incoming)
    {
        var currentByIdentity = current.ToDictionary(message => message.Identity);
        var incomingByIdentity = incoming.ToDictionary(message =>
            new MessageIdentity(sourceId, message.Namespace, message.Key, message.Locale));

        var added = new List<TranslationSourceMessage>();
        var changed = new List<TranslationSourceMessage>();
        foreach (var message in incoming)
        {
            var identity = new MessageIdentity(sourceId, message.Namespace, message.Key, message.Locale);
            if (!currentByIdentity.TryGetValue(identity, out var existing))
                added.Add(message);
            else if (!SameSemanticMessage(existing, message))
                changed.Add(message);
        }

        var missing = current
            .Where(message => !incomingByIdentity.ContainsKey(message.Identity))
            .ToArray();
        return new TranslationDiff(added, changed, missing);
    }

    private static bool SameSemanticMessage(TranslationMessage existing, TranslationSourceMessage incoming)
    {
        if (string.Equals(existing.DefaultChecksum, incoming.Checksum, StringComparison.Ordinal))
            return true;

        return string.Equals(existing.DefaultChecksum, TranslationMessageFingerprint.LegacyValueOnly(incoming.Value), StringComparison.Ordinal) &&
               existing.Format == incoming.Format &&
               existing.Arguments.Count == incoming.Arguments.Count &&
               existing.Arguments.All(argument => incoming.Arguments.TryGetValue(argument.Key, out var kind) && kind == argument.Value);
    }
}
