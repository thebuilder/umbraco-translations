using TheBuilder.Translations.ManagementApi;

namespace TheBuilder.Translations.Tests;

public sealed class MessagePreviewTests
{
    [Fact]
    public void Leaves_a_short_message_untouched()
    {
        var (text, truncated) = MessagePreview.Of("Your cart is empty");

        Assert.Equal("Your cart is empty", text);
        Assert.False(truncated);
    }

    [Fact]
    public void Leaves_a_message_at_the_limit_untouched()
    {
        var value = new string('a', MessagePreview.MaximumLength);

        var (text, truncated) = MessagePreview.Of(value);

        Assert.Equal(value, text);
        Assert.False(truncated);
    }

    [Fact]
    public void Cuts_a_longer_message_to_the_limit_and_says_so()
    {
        var (text, truncated) = MessagePreview.Of(new string('a', MessagePreview.MaximumLength + 1));

        Assert.True(truncated);
        Assert.Equal(MessagePreview.MaximumLength, text.Length);
        Assert.EndsWith("...", text, StringComparison.Ordinal);
    }

    [Fact]
    public void A_short_message_ending_in_an_ellipsis_is_not_reported_as_truncated()
    {
        // Sniffing for a trailing "..." would misread this, which is why the flag exists.
        var (text, truncated) = MessagePreview.Of("Loading...");

        Assert.Equal("Loading...", text);
        Assert.False(truncated);
    }
}
