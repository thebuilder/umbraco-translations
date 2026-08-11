using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http;
using TheBuilder.Translations.Core.Output;
using TheBuilder.Translations.Core.Persistence;
using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.DeliveryApi;

namespace TheBuilder.Translations.Tests;

public sealed class TranslationOutputControllerTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task All_output_requires_a_namespace(string? messageNamespace)
    {
        var controller = new TranslationOutputController(new UnusedRepository(), new NestedJsonOutputSerializer());

        var result = await controller.GetAll("da", messageNamespace, cancellationToken: CancellationToken.None);

        var badRequest = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal("The namespace query parameter is required.", badRequest.Value);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task All_output_requires_a_locale(string? locale)
    {
        var controller = new TranslationOutputController(new UnusedRepository(), new NestedJsonOutputSerializer());

        var result = await controller.GetAll(locale, "website", cancellationToken: CancellationToken.None);

        var badRequest = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal("The locale query parameter is required.", badRequest.Value);
    }

    [Fact]
    public async Task All_output_accepts_i18next_v4_json_format()
    {
        var controller = new TranslationOutputController(new EmptyRepository(), new NestedJsonOutputSerializer())
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };

        var result = await controller.GetAll("en", "website", "i18next-v4", CancellationToken.None);

        var content = Assert.IsType<ContentResult>(result);
        Assert.Equal("{}", content.Content);
        Assert.Equal("application/json; charset=utf-8", content.ContentType);
    }

    [Fact]
    public async Task I18next_output_rejects_an_icu_namespace()
    {
        var controller = new TranslationOutputController(new IcuRepository(), new NestedJsonOutputSerializer())
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };

        var result = await controller.GetAll("en", "website", "i18next-v4", CancellationToken.None);

        var conflict = Assert.IsType<ConflictObjectResult>(result);
        Assert.Contains("Icu messages", Assert.IsType<string>(conflict.Value), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Override_output_validates_the_full_namespace_syntax()
    {
        var controller = new TranslationOutputController(new MixedRepository(), new NestedJsonOutputSerializer())
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };

        var result = await controller.GetOverrides("en", "website", "i18next-v4", CancellationToken.None);

        Assert.IsType<ConflictObjectResult>(result);
    }

    private class UnusedRepository : ITranslationMessageRepository
    {
        public Task<Page<TranslationMessageView>> QueryMessagesAsync(MessageQuery query, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<TranslationFacetData> GetFacetDataAsync(CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<TranslationMessageView?> GetMessageAsync(Guid messageId, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task<TranslationOverride> SaveOverrideAsync(Guid messageId, string value, long? expectedVersion, string userId, CancellationToken cancellationToken) => throw new NotSupportedException();
        public Task DeleteOverrideAsync(Guid messageId, long? expectedVersion, CancellationToken cancellationToken) => throw new NotSupportedException();
        public virtual Task<IReadOnlyList<TranslationMessageView>> GetOutputMessagesAsync(string locale, string messageNamespace, CancellationToken cancellationToken) => throw new NotSupportedException();
    }

    private sealed class EmptyRepository : UnusedRepository
    {
        public override Task<IReadOnlyList<TranslationMessageView>> GetOutputMessagesAsync(string locale, string messageNamespace, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<TranslationMessageView>>([]);
    }

    private sealed class IcuRepository : UnusedRepository
    {
        public override Task<IReadOnlyList<TranslationMessageView>> GetOutputMessagesAsync(string locale, string messageNamespace, CancellationToken cancellationToken)
        {
            var now = DateTimeOffset.UtcNow;
            var message = new TranslationMessage(Guid.NewGuid(), new(Guid.NewGuid(), messageNamespace, "greeting", locale),
                "Hello {name}", MessageFormat.Icu, new Dictionary<string, string> { ["name"] = "string" }, null,
                "revision", "checksum", null, now, now, TranslationMessageState.Active);
            return Task.FromResult<IReadOnlyList<TranslationMessageView>>([new(message, null)]);
        }
    }

    private sealed class MixedRepository : UnusedRepository
    {
        public override Task<IReadOnlyList<TranslationMessageView>> GetOutputMessagesAsync(string locale, string messageNamespace, CancellationToken cancellationToken)
        {
            var now = DateTimeOffset.UtcNow;
            TranslationMessageView View(string key, string value, MessageFormat format, bool hasOverride)
            {
                var message = new TranslationMessage(Guid.NewGuid(), new(Guid.NewGuid(), messageNamespace, key, locale),
                    value, format, new Dictionary<string, string>(), null, "revision", "checksum", null,
                    now, now, TranslationMessageState.Active);
                var translationOverride = hasOverride
                    ? new TranslationOverride(message.Id, value, "checksum", 1, now, "user", now, "user")
                    : null;
                return new(message, translationOverride);
            }

            IReadOnlyList<TranslationMessageView> all =
            [
                View("icu", "Hello {name}", MessageFormat.Icu, false),
                View("i18next", "Hello {{name}}", MessageFormat.I18NextV4, true),
            ];
            return Task.FromResult(all);
        }
    }
}
