using TheBuilder.Translations.Core.Persistence;
using TheBuilder.Translations.Core.Output;
using TheBuilder.Translations.Persistence;

namespace TheBuilder.Translations.Tests;

public sealed class TranslationSqlTests
{
    [Theory]
    [InlineData(MessageStatusFilter.All)]
    [InlineData(MessageStatusFilter.Default)]
    [InlineData(MessageStatusFilter.Overridden)]
    [InlineData(MessageStatusFilter.NeedsReview)]
    public void Normal_views_exclude_missing_messages(MessageStatusFilter status)
    {
        var sql = TranslationSql.Messages(new MessageQuery(Status: status));

        Assert.Contains("m.State <>", sql.SQL, StringComparison.Ordinal);
        Assert.Contains(sql.Arguments, argument => Equals(argument, "Missing"));
    }

    [Fact]
    public void Missing_view_includes_only_missing_messages()
    {
        var sql = TranslationSql.Messages(new MessageQuery(Status: MessageStatusFilter.Missing));

        Assert.DoesNotContain("m.State <>", sql.SQL, StringComparison.Ordinal);
        Assert.Contains("m.State =", sql.SQL, StringComparison.Ordinal);
        Assert.Contains("o.MessageId IS NOT NULL", sql.SQL, StringComparison.Ordinal);
        Assert.Contains(sql.Arguments, argument => Equals(argument, "Missing"));
    }

    [Fact]
    public void Output_snapshot_includes_overridden_and_inherited_messages_but_excludes_missing_messages()
    {
        var sql = TranslationSql.OutputMessages("da", "website");

        Assert.DoesNotContain("o.MessageId IS NOT NULL", sql.SQL, StringComparison.Ordinal);
        Assert.Contains("m.State <>", sql.SQL, StringComparison.Ordinal);
        Assert.Contains(sql.Arguments, argument => Equals(argument, "Missing"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Output_requires_a_namespace(string? messageNamespace)
    {
        Assert.ThrowsAny<ArgumentException>(() =>
            TranslationSql.OutputMessages("da", messageNamespace!));
    }
}
