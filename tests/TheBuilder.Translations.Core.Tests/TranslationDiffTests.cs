using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Sources;
using TheBuilder.Translations.Core.Synchronization;

namespace TheBuilder.Translations.Core.Tests;

public sealed class TranslationDiffTests
{
    [Fact]
    public void Identical_snapshot_has_no_writes()
    {
        var sourceId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        var current = new TranslationMessage(Guid.NewGuid(), new(sourceId, "website", "navigation.home", "en"), "Home",
            MessageFormat.Icu, new Dictionary<string, string>(), null, "r1", "checksum", null, now, now, TranslationMessageState.Active);
        var incoming = new TranslationSourceMessage("website", "navigation.home", "en", "Home", MessageFormat.Icu,
            new Dictionary<string, string>(), "checksum");

        var diff = TranslationDiff.Between(sourceId, [current], [incoming]);

        Assert.Empty(diff.Added);
        Assert.Empty(diff.Changed);
        Assert.Empty(diff.Missing);
    }

    [Fact]
    public void Classifies_added_changed_and_missing_messages()
    {
        var sourceId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        TranslationMessage Current(string key, string checksum) => new(Guid.NewGuid(), new(sourceId, "website", key, "en"), key,
            MessageFormat.Icu, new Dictionary<string, string>(), null, "r1", checksum, null, now, now, TranslationMessageState.Active);
        TranslationSourceMessage Incoming(string key, string checksum) => new("website", key, "en", key, MessageFormat.Icu,
            new Dictionary<string, string>(), checksum);

        var diff = TranslationDiff.Between(sourceId,
            [Current("changed", "old"), Current("missing", "same")],
            [Incoming("changed", "new"), Incoming("added", "new")]);

        Assert.Equal("added", Assert.Single(diff.Added).Key);
        Assert.Equal("changed", Assert.Single(diff.Changed).Key);
        Assert.Equal("missing", Assert.Single(diff.Missing).Identity.Key);
    }

    [Fact]
    public void Changing_only_message_syntax_is_a_semantic_change()
    {
        var sourceId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        var value = "Hello";
        var current = new TranslationMessage(Guid.NewGuid(), new(sourceId, "website", "greeting", "en"), value,
            MessageFormat.PlainText, new Dictionary<string, string>(), null, "r1",
            TranslationMessageFingerprint.Compute(value, MessageFormat.PlainText, new Dictionary<string, string>()), null,
            now, now, TranslationMessageState.Active);
        var incoming = new TranslationSourceMessage("website", "greeting", "en", value, MessageFormat.I18NextV4,
            new Dictionary<string, string>(), TranslationMessageFingerprint.Compute(value, MessageFormat.I18NextV4, new Dictionary<string, string>()));

        var changed = Assert.Single(TranslationDiff.Between(sourceId, [current], [incoming]).Changed);

        Assert.Equal(MessageFormat.I18NextV4, changed.Format);
    }

    [Fact]
    public void Legacy_value_checksum_remains_unchanged_when_syntax_and_arguments_match()
    {
        var sourceId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        var value = "Hello {name}";
        var arguments = new Dictionary<string, string> { ["name"] = "string" };
        var current = new TranslationMessage(Guid.NewGuid(), new(sourceId, "website", "greeting", "en"), value,
            MessageFormat.Icu, arguments, null, "r1", TranslationMessageFingerprint.LegacyValueOnly(value), null,
            now, now, TranslationMessageState.Active);
        var incoming = new TranslationSourceMessage("website", "greeting", "en", value, MessageFormat.Icu, arguments,
            TranslationMessageFingerprint.Compute(value, MessageFormat.Icu, arguments));

        Assert.Empty(TranslationDiff.Between(sourceId, [current], [incoming]).Changed);
    }
}
