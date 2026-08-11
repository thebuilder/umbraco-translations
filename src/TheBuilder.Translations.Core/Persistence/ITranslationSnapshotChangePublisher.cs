namespace TheBuilder.Translations.Core.Persistence;

public interface ITranslationSnapshotChangePublisher
{
    void Publish(Guid sourceId);
}

public sealed class NullTranslationSnapshotChangePublisher : ITranslationSnapshotChangePublisher
{
    public void Publish(Guid sourceId) { }
}
