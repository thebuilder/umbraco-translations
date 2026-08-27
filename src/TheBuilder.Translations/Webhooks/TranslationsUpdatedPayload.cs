using TheBuilder.Translations.Notifications;

namespace TheBuilder.Translations.Webhooks;

/// <summary>
/// The JSON body posted to every webhook subscribed to <c>TheBuilder.TranslationsUpdated</c>.
///
/// Kept separate from <see cref="TranslationsUpdatedNotification"/> because this is a wire contract
/// that other people's deployments parse, and the notification is not. The notification carries a
/// whole <c>TranslationSyncResult</c> and a message identity that repeats the source id; posting
/// either verbatim would ship internal detail and make every later field added to the notification
/// a silent addition to the contract.
/// </summary>
public sealed record TranslationsUpdatedPayload(
    Guid SourceId,
    string SourceAlias,
    TranslationChange Change,
    DateTimeOffset OccurredAt,
    TranslationsUpdatedMessage? Message,
    TranslationsUpdatedSynchronization? Synchronization)
{
    public static TranslationsUpdatedPayload From(TranslationsUpdatedNotification notification) => new(
        notification.SourceId,
        notification.SourceAlias,
        notification.Change,
        notification.OccurredAt,
        notification.Message is { } message
            ? new TranslationsUpdatedMessage(message.Namespace, message.Key, message.Locale)
            : null,
        notification.Synchronization is { } synchronization
            ? new TranslationsUpdatedSynchronization(
                synchronization.Revision,
                synchronization.AddedCount,
                synchronization.ChangedCount,
                synchronization.MissingCount)
            : null);
}

/// <summary>
/// The one message an editor changed. The delivery endpoints are addressed by locale and namespace,
/// so these three fields are what a subscriber needs to purge exactly the dictionary that moved
/// instead of everything the source serves.
/// </summary>
public sealed record TranslationsUpdatedMessage(string Namespace, string Key, string Locale);

/// <summary>
/// What a synchronization run changed. <c>Removed</c> counts messages the application stopped
/// shipping, which the delivery endpoints omit from that point on.
/// </summary>
public sealed record TranslationsUpdatedSynchronization(string Revision, int Added, int Changed, int Removed);
