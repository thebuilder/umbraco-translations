using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Sources;
using TheBuilder.Translations.Core.Synchronization;

namespace TheBuilder.Translations.Core.Tests;

/// <summary>
/// A site can have more languages than its applications ship. Text an editor writes for one of
/// those locales exists only in Umbraco, so synchronisation has to leave it alone: the source will
/// never mention it, and the ordinary "not in the incoming set" rule would remove it.
/// </summary>
public sealed class AuthoredLocaleTests
{
    private static readonly Guid Source = Guid.Parse("11111111-1111-1111-1111-111111111111");

    [Fact]
    public void Synchronisation_does_not_remove_a_locale_the_source_never_ships()
    {
        var shipped = Message("en-US", TranslationMessageState.Active);
        var authored = Message("de-DE", TranslationMessageState.Authored);

        var diff = TranslationDiff.Between(Source, [shipped, authored], [Incoming("en-US")]);

        Assert.Empty(diff.Missing);
    }

    [Fact]
    public void Synchronisation_still_removes_a_shipped_locale_that_disappears()
    {
        var kept = Message("en-US", TranslationMessageState.Active);
        var dropped = Message("da-DK", TranslationMessageState.Active);

        var diff = TranslationDiff.Between(Source, [kept, dropped], [Incoming("en-US")]);

        Assert.Equal([dropped], diff.Missing);
    }

    [Fact]
    public void An_authored_locale_is_not_reported_as_added_when_the_source_starts_shipping_it()
    {
        var authored = Message("de-DE", TranslationMessageState.Authored);

        var diff = TranslationDiff.Between(Source, [authored], [Incoming("de-DE")]);

        // The row already exists for that identity, so the source shipping it later is a change to
        // the existing row rather than a second row for the same locale.
        Assert.Empty(diff.Added);
        Assert.Single(diff.Changed);
    }

    private static TranslationMessage Message(string locale, TranslationMessageState state) => new(
        Guid.NewGuid(),
        new MessageIdentity(Source, "website", "cart.empty", locale),
        state is TranslationMessageState.Authored ? string.Empty : "Your cart is empty",
        MessageFormat.Icu,
        new Dictionary<string, string>(),
        null,
        "revision",
        TranslationMessageFingerprint.Compute(
            state is TranslationMessageState.Authored ? string.Empty : "Your cart is empty",
            MessageFormat.Icu,
            new Dictionary<string, string>()),
        null,
        DateTimeOffset.UnixEpoch,
        DateTimeOffset.UnixEpoch,
        state);

    private static TranslationSourceMessage Incoming(string locale) => new(
        "website", "cart.empty", locale, "Your cart is empty", MessageFormat.Icu,
        new Dictionary<string, string>(),
        TranslationMessageFingerprint.Compute("Your cart is empty", MessageFormat.Icu, new Dictionary<string, string>()));
}
