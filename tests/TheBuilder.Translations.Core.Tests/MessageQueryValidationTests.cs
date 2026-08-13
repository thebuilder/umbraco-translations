using TheBuilder.Translations.Core.Persistence;

namespace TheBuilder.Translations.Core.Tests;

public sealed class MessageQueryValidationTests
{
    [Theory]
    [InlineData(50)]
    [InlineData(100)]
    [InlineData(200)]
    public void Accepts_the_supported_page_sizes(int pageSize)
    {
        Assert.Null(MessageQueryValidation.Describe(1, pageSize));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(25)]
    [InlineData(201)]
    [InlineData(int.MaxValue)]
    public void Rejects_unsupported_page_sizes(int pageSize)
    {
        Assert.NotNull(MessageQueryValidation.Describe(1, pageSize));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(MessageQueryValidation.MaximumPage + 1)]
    public void Rejects_out_of_range_pages(int page)
    {
        Assert.NotNull(MessageQueryValidation.Describe(page, 100));
    }

    [Fact]
    public void Accepts_the_last_page_within_range()
    {
        Assert.Null(MessageQueryValidation.Describe(MessageQueryValidation.MaximumPage, 100));
    }

    [Fact]
    public void Ensure_throws_for_an_invalid_query()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            MessageQueryValidation.Ensure(new MessageQuery(PageSize: 25)));
    }
}
