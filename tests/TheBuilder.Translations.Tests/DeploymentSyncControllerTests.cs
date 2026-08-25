using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Logging.Abstractions;
using TheBuilder.Translations.Authorization;
using TheBuilder.Translations.AutomationApi;
using TheBuilder.Translations.Configuration;
using TheBuilder.Translations.Core.Messages;
using TheBuilder.Translations.Core.Persistence;
using TheBuilder.Translations.Core.Sources;
using TheBuilder.Translations.Core.Synchronization;
using TheBuilder.Translations.Core.Validation;

namespace TheBuilder.Translations.Tests;

public sealed class DeploymentSyncControllerTests
{
    private const string ApiKey = "test-deployment-sync-key-32-characters";

    [Fact]
    public async Task Rejects_requests_when_deployment_sync_is_not_configured()
    {
        var controller = CreateController(apiKey: null);

        var response = await controller.SyncSource("sample", CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(response.Result);
        Assert.Equal(StatusCodes.Status503ServiceUnavailable, problem.StatusCode);
    }

    [Fact]
    public async Task Rejects_an_invalid_bearer_token()
    {
        var controller = CreateController();
        controller.Request.Headers.Authorization = "Bearer incorrect";

        var response = await controller.SyncSource("sample", CancellationToken.None);

        Assert.IsType<UnauthorizedResult>(response.Result);
        Assert.Equal("Bearer", controller.Response.Headers.WWWAuthenticate);
    }

    [Fact]
    public async Task Synchronizes_an_enabled_source_selected_by_alias()
    {
        var source = Source(enabled: true);
        var store = new FakeStore(source);
        var controller = CreateController(source: source, store: store);
        controller.Request.Headers.Authorization = $"Bearer {ApiKey}";

        var response = await controller.SyncSource(source.Alias, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(response.Result);
        var result = Assert.IsType<TranslationSyncResult>(ok.Value);
        Assert.Equal(TranslationSyncStatus.Succeeded, result.Status);
        Assert.Single(store.SynchronizedMessages);
    }

    [Fact]
    public async Task Does_not_synchronize_a_disabled_source()
    {
        var source = Source(enabled: false);
        var controller = CreateController(source: source);
        controller.Request.Headers.Authorization = $"Bearer {ApiKey}";

        var response = await controller.SyncSource(source.Alias, CancellationToken.None);

        Assert.IsType<ConflictObjectResult>(response.Result);
    }

    [Fact]
    public async Task Rejects_an_alias_that_is_not_one_route_safe_segment()
    {
        var controller = CreateController();
        controller.Request.Headers.Authorization = $"Bearer {ApiKey}";

        var response = await controller.SyncSource("sample/messages", CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(response.Result);
    }

    [Fact]
    public async Task Does_not_expose_internal_failure_details_to_automation_clients()
    {
        var source = Source(enabled: true);
        var store = new FakeStore(source) { ApplyFailure = new InvalidOperationException("Translations:PrivateApiKey was missing") };
        var controller = CreateController(source: source, store: store);
        controller.Request.Headers.Authorization = $"Bearer {ApiKey}";

        var response = await controller.SyncSource(source.Alias, CancellationToken.None);

        var problem = Assert.IsType<ObjectResult>(response.Result);
        var details = Assert.IsType<ProblemDetails>(problem.Value);
        Assert.Equal(StatusCodes.Status502BadGateway, details.Status);
        Assert.DoesNotContain("PrivateApiKey", details.Detail, StringComparison.Ordinal);
    }

    private static DeploymentSyncController CreateController(
        string? apiKey = ApiKey,
        TranslationSourceDefinition? source = null,
        FakeStore? store = null)
    {
        store ??= new FakeStore(source);
        var engine = new TranslationSyncEngine(
            new FakeTransport(),
            new NestedJsonParser(new MessageFormatValidator()),
            store,
            TimeProvider.System);
        var authenticator = new DeploymentSyncApiKeyAuthenticator(Options.Create(new DeploymentSyncOptions { ApiKey = apiKey }));
        return new DeploymentSyncController(store, engine, authenticator, NullLogger<DeploymentSyncController>.Instance)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() },
        };
    }

    private static TranslationSourceDefinition Source(bool enabled) => new(
        Guid.NewGuid(),
        "sample",
        "Sample",
        enabled,
        new HttpTranslationTransportOptions("https://translations.example/{locale}.json"),
        new TranslationParserOptions(["en"], "website", NamespaceMode.Fixed));

    private sealed class FakeTransport : ITranslationSourceTransport
    {
        public string Kind => "http";

        public Task<TranslationSourcePayload> FetchAsync(
            TranslationSourceDefinition source,
            TranslationFetchContext context,
            CancellationToken cancellationToken) =>
            Task.FromResult(new TranslationSourcePayload(
                new MemoryStream(Encoding.UTF8.GetBytes("{\"greeting\":\"Hello\"}")),
                context.Locale,
                "application/json",
                null,
                null,
                "revision-1"));
    }

    private sealed class FakeStore(TranslationSourceDefinition? source) : ITranslationSourceRepository, ITranslationSynchronizationStore
    {
        public IReadOnlyCollection<TranslationSourceMessage> SynchronizedMessages { get; private set; } = [];
        public Exception? ApplyFailure { get; init; }

        public Task<IReadOnlyList<TranslationSourceDefinition>> GetSourcesAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<TranslationSourceDefinition>>(source is null ? [] : [source]);

        public Task<TranslationSourceDefinition?> GetSourceAsync(Guid sourceId, CancellationToken cancellationToken) =>
            Task.FromResult(source?.Id == sourceId ? source : null);

        public Task<TranslationSourceDefinition?> GetSourceByAliasAsync(string alias, CancellationToken cancellationToken) =>
            Task.FromResult(source?.Alias == alias ? source : null);

        public Task SaveSourceAsync(TranslationSourceDefinition definition, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task DeleteSourceAsync(Guid sourceId, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task<IReadOnlyList<TranslationSyncResult>> GetSyncHistoryAsync(Guid sourceId, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<TranslationSyncResult>>([]);

        public Task<IReadOnlyList<TranslationSourceStatus>> GetSourceStatusesAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<TranslationSourceStatus>>([]);

        public Task<TranslationSyncResult> ApplySynchronizationAsync(
            TranslationSourceDefinition definition,
            TranslationSynchronizationLease lease,
            IReadOnlyCollection<TranslationSourceMessage> messages,
            string revision,
            DateTimeOffset startedAt,
            CancellationToken cancellationToken)
        {
            if (ApplyFailure is not null) throw ApplyFailure;
            SynchronizedMessages = messages;
            return Task.FromResult(new TranslationSyncResult(
                Guid.NewGuid(), definition.Id, revision, startedAt, TimeProvider.System.GetUtcNow(),
                TranslationSyncStatus.Succeeded, messages.Count, 0, 0, 0));
        }

        public Task RecordFailedSynchronizationAsync(TranslationSyncResult result, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task<TranslationSynchronizationLease?> TryAcquireSynchronizationLeaseAsync(TranslationSourceDefinition definition, TimeSpan duration, CancellationToken cancellationToken) =>
            Task.FromResult<TranslationSynchronizationLease?>(new(definition.Id, Guid.NewGuid()));

        public Task<TranslationSourceDefinition?> GetSynchronizationSourceAsync(TranslationSynchronizationLease lease, CancellationToken cancellationToken) =>
            Task.FromResult(source?.Id == lease.SourceId ? source : null);

        public Task ReleaseSynchronizationLeaseAsync(TranslationSynchronizationLease lease, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task<bool> RenewSynchronizationLeaseAsync(TranslationSynchronizationLease lease, TimeSpan duration, CancellationToken cancellationToken) => Task.FromResult(true);
    }
}
