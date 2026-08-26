using System.Text.Json.Serialization;
using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Sources;
using TheBuilder.Translations.Core.Synchronization;
using Umbraco.Cms.Core.Notifications;

namespace TheBuilder.Translations.Notifications;

/// <summary>
/// One committed change to the translations a source serves.
///
/// An Umbraco notification rather than a direct call into the webhook machinery, because that is
/// what makes it configurable: the backoffice Webhooks section subscribes to it by alias, and
/// anything else in the site can handle it without going through HTTP.
///
/// <see cref="Message"/> is set when a single message changed and <see cref="Synchronization"/>
/// when a whole source did; both are absent when the source itself went.
/// </summary>
public sealed record TranslationsUpdatedNotification(
    Guid SourceId,
    string SourceAlias,
    TranslationChange Change,
    DateTimeOffset OccurredAt,
    MessageIdentity? Message = null,
    TranslationSyncResult? Synchronization = null) : INotification
{
    /// <summary>
    /// What to announce after a synchronization, or null when there is nothing to announce.
    ///
    /// A source is polled on a schedule and most runs find the application's messages exactly as
    /// they were left. Announcing those would train every subscriber to re-fetch an unchanged
    /// dictionary on a timer, which is the cost of a webhook without any of the value.
    /// </summary>
    public static TranslationsUpdatedNotification? ForSynchronization(
        TranslationSourceDefinition source,
        TranslationSyncResult result,
        DateTimeOffset occurredAt) =>
        result.AddedCount + result.ChangedCount + result.MissingCount == 0
            ? null
            : new TranslationsUpdatedNotification(
                source.Id, source.Alias, TranslationChange.Synchronized, occurredAt, Synchronization: result);
}

[JsonConverter(typeof(JsonStringEnumConverter<TranslationChange>))]
public enum TranslationChange
{
    /// <summary>A synchronization run brought the source's own messages up to date.</summary>
    Synchronized,

    /// <summary>An editor wrote an override over one message.</summary>
    OverrideSaved,

    /// <summary>An editor reset one message back to the value its application ships.</summary>
    OverrideRemoved,

    /// <summary>The source was deleted, taking every message it had contributed with it.</summary>
    SourceDeleted,
}
