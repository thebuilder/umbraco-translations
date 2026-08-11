namespace TheBuilder.Translations.Core.Messages;

public readonly record struct MessageIdentity(Guid SourceId, string Namespace, string Key, string Locale)
{
    public override string ToString() => $"{SourceId:N}:{Namespace}:{Key}:{Locale}";
}
