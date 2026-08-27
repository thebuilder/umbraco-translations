using Microsoft.Extensions.Options;
using TheBuilder.Translations.Notifications;
using Umbraco.Cms.Core.Configuration.Models;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Core.Sync;
using Umbraco.Cms.Core.Webhooks;
using UmbracoConstants = Umbraco.Cms.Core.Constants;

namespace TheBuilder.Translations.Webhooks;

/// <summary>
/// Offers "Translations updated" alongside Umbraco's own events when a webhook is created in the
/// backoffice, so a site can be told to rebuild without this package inventing its own subscription
/// UI, delivery retries or request log.
/// </summary>
[WebhookEvent("Translations updated", UmbracoConstants.WebhookEvents.Types.Other)]
public sealed class TranslationsUpdatedWebhookEvent(
    IWebhookFiringService webhookFiringService,
    IWebhookService webhookService,
    IOptionsMonitor<WebhookSettings> webhookSettings,
    IServerRoleAccessor serverRoleAccessor)
    : WebhookEventBase<TranslationsUpdatedNotification>(
        webhookFiringService,
        webhookService,
        webhookSettings,
        serverRoleAccessor)
{
    /// <summary>
    /// The alias stored against every webhook subscribed to this event. Renaming it would leave
    /// those subscriptions pointing at an event that no longer exists, silently, so it does not
    /// change once shipped.
    /// </summary>
    public const string EventAlias = "TheBuilder.TranslationsUpdated";

    public override string Alias => EventAlias;

    public override object? ConvertNotificationToRequestPayload(TranslationsUpdatedNotification notification) =>
        TranslationsUpdatedPayload.From(notification);
}
