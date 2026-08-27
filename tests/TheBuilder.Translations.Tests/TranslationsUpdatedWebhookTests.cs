using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.DependencyInjection;
using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Sources;
using TheBuilder.Translations.Core.Synchronization;
using TheBuilder.Translations.Notifications;
using TheBuilder.Translations.Webhooks;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Webhooks;
using UmbracoConstants = Umbraco.Cms.Core.Constants;

namespace TheBuilder.Translations.Tests;

public sealed class TranslationsUpdatedWebhookTests
{
    private static readonly Guid SourceId = Guid.Parse("6f2f5d3e-1f4a-4a1e-9a5b-2c7d8e9f0a1b");
    private static readonly DateTimeOffset OccurredAt = new(2026, 8, 26, 9, 30, 0, TimeSpan.Zero);

    [Fact]
    public void The_alias_and_the_listed_name_are_the_configuration_contract()
    {
        var attribute = typeof(TranslationsUpdatedWebhookEvent).GetCustomAttribute<WebhookEventAttribute>();

        Assert.NotNull(attribute);
        Assert.Equal("Translations updated", attribute.Name);
        Assert.Equal(UmbracoConstants.WebhookEvents.Types.Other, attribute.EventType);
        // Stored against every webhook someone subscribes; renaming it unsubscribes them silently.
        Assert.Equal("TheBuilder.TranslationsUpdated", TranslationsUpdatedWebhookEvent.EventAlias);
    }

    /// <summary>
    /// Adding the event to Umbraco's collection has to be enough to make it fire. The builder reads
    /// the handled notification back off the type, so an event that declared the wrong one, or that
    /// Umbraco could not construct, would be listed in the backoffice and then stay silent.
    /// </summary>
    [Fact]
    public void Registering_the_event_subscribes_it_to_the_notification_the_store_raises()
    {
        var services = new ServiceCollection();
        var events = new WebhookEventCollectionBuilder();
        events.Add<TranslationsUpdatedWebhookEvent>();

        events.RegisterWith(services);

        Assert.Contains(services, service =>
            service.ServiceType == typeof(INotificationAsyncHandler<TranslationsUpdatedNotification>) &&
            service.ImplementationType == typeof(TranslationsUpdatedWebhookEvent));
    }

    [Fact]
    public void A_synchronization_that_changed_nothing_is_not_announced() =>
        Assert.Null(TranslationsUpdatedNotification.ForSynchronization(Source(), Sync(0, 0, 0), OccurredAt));

    [Theory]
    [InlineData(1, 0, 0)]
    [InlineData(0, 1, 0)]
    [InlineData(0, 0, 1)]
    public void A_synchronization_reports_what_moved_and_the_revision_it_moved_to(int added, int changed, int missing)
    {
        var result = Sync(added, changed, missing);

        var announcement = TranslationsUpdatedNotification.ForSynchronization(Source(), result, OccurredAt);

        Assert.NotNull(announcement);
        var payload = TranslationsUpdatedPayload.From(announcement);
        Assert.Equal(SourceId, payload.SourceId);
        Assert.Equal("website", payload.SourceAlias);
        Assert.Equal(TranslationChange.Synchronized, payload.Change);
        Assert.Equal(OccurredAt, payload.OccurredAt);
        Assert.Equal(new TranslationsUpdatedSynchronization("e3b0c442", added, changed, missing), payload.Synchronization);
        // A synchronization moves whole locales at once, so there is no single message to name.
        Assert.Null(payload.Message);
    }

    [Theory]
    [InlineData(TranslationChange.OverrideSaved)]
    [InlineData(TranslationChange.OverrideRemoved)]
    public void An_edited_message_is_named_by_the_locale_and_namespace_the_delivery_endpoints_use(
        TranslationChange change)
    {
        var payload = TranslationsUpdatedPayload.From(new TranslationsUpdatedNotification(
            SourceId, "website", change, OccurredAt,
            new MessageIdentity(SourceId, "website", "cart.title", "da-DK")));

        Assert.Equal(change, payload.Change);
        Assert.Equal(new TranslationsUpdatedMessage("website", "cart.title", "da-DK"), payload.Message);
        Assert.Null(payload.Synchronization);
    }

    [Fact]
    public void A_deleted_source_still_names_itself()
    {
        var payload = TranslationsUpdatedPayload.From(new TranslationsUpdatedNotification(
            SourceId, "website", TranslationChange.SourceDeleted, OccurredAt));

        Assert.Equal("website", payload.SourceAlias);
        Assert.Equal(TranslationChange.SourceDeleted, payload.Change);
        Assert.Null(payload.Message);
        Assert.Null(payload.Synchronization);
    }

    /// <summary>
    /// Umbraco serializes webhook bodies with camelCase property names and enums written out by
    /// name. The documented contract is only worth anything if it matches, so the options here are
    /// the ones <c>SystemTextWebhookJsonSerializer</c> uses.
    /// </summary>
    [Fact]
    public void The_body_is_camel_cased_and_names_its_change_rather_than_numbering_it()
    {
        var options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            Converters = { new JsonStringEnumConverter() },
        };

        var json = JsonSerializer.Serialize(
            TranslationsUpdatedPayload.From(new TranslationsUpdatedNotification(
                SourceId, "website", TranslationChange.OverrideSaved, OccurredAt,
                new MessageIdentity(SourceId, "website", "cart.title", "da-DK"))),
            options);

        Assert.Contains("\"change\":\"OverrideSaved\"", json, StringComparison.Ordinal);
        Assert.Contains("\"sourceAlias\":\"website\"", json, StringComparison.Ordinal);
        Assert.Contains("\"message\":{\"namespace\":\"website\",\"key\":\"cart.title\",\"locale\":\"da-DK\"}", json, StringComparison.Ordinal);
        Assert.Contains("\"synchronization\":null", json, StringComparison.Ordinal);
    }

    private static TranslationSourceDefinition Source() => new(
        SourceId,
        "website",
        "Website",
        Enabled: true,
        new HttpTranslationTransportOptions("https://translations.example/{locale}.json"),
        new TranslationParserOptions(["en-US"], "website", NamespaceMode.Fixed, MessageFormat.Icu));

    private static TranslationSyncResult Sync(int added, int changed, int missing) => new(
        Guid.NewGuid(), SourceId, "e3b0c442", OccurredAt, OccurredAt,
        TranslationSyncStatus.Succeeded, added, changed, missing, InvalidCount: 0);
}
