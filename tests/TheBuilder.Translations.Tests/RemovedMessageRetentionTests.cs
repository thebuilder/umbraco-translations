using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Persistence;

namespace TheBuilder.Translations.Tests;

public sealed class RemovedMessageRetentionTests
{
    [Theory]
    [InlineData(TranslationMessageState.Active, false, "Delete")]
    [InlineData(TranslationMessageState.Missing, false, "Delete")]
    [InlineData(TranslationMessageState.Active, true, "Tombstone")]
    [InlineData(TranslationMessageState.Missing, true, "None")]
    public void Removed_messages_are_retained_only_when_overridden(
        TranslationMessageState state,
        bool hasOverride,
        string expected)
    {
        Assert.Equal(expected, RemovedMessageRetention.Decide(state, hasOverride).ToString());
    }

    [Theory]
    [InlineData(TranslationMessageState.Active, false)]
    [InlineData(TranslationMessageState.Missing, true)]
    public void Reset_deletes_only_removed_tombstones(TranslationMessageState state, bool expected)
    {
        Assert.Equal(expected, RemovedMessageRetention.DeleteAfterOverrideReset(state));
    }

    [Fact]
    public void Resetting_an_authored_override_deletes_the_row()
    {
        // An authored row exists only because someone wrote text for a locale nothing ships, so
        // removing that text leaves a row with an empty default and no reason to exist.
        Assert.True(RemovedMessageRetention.DeleteAfterOverrideReset(TranslationMessageState.Authored));
    }

    [Fact]
    public void Resetting_an_ordinary_override_keeps_the_row()
    {
        Assert.False(RemovedMessageRetention.DeleteAfterOverrideReset(TranslationMessageState.Active));
    }
}
